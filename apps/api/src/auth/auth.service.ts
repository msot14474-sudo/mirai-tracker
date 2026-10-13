import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { AuditAction, UserStatus } from '@prisma/client';
import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthEmailService } from './auth-email.service';
import { DEFAULT_SESSION_TTL_SECONDS } from './auth.constants';
import { AuthenticatedUser } from './auth.types';
import { hashPassword, verifyPassword } from './password';

const OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_REQUESTS = 3;

type OtpChallenge = {
  userId: string;
  codeDigest: string;
};

type PasswordResetInput = {
  resetToken: string;
  password: string;
};

type UpdateOwnAccountInput = {
  name?: string;
  notificationEmail?: string | null;
  currentPassword?: string;
  newPassword?: string;
};

type SessionUser = {
  id: string;
  name: string;
  email: string;
  notificationEmail?: string | null;
  status: UserStatus;
  roleAssignments: Array<{
    role: AuthenticatedUser['roles'][number]['role'];
    campusId: string | null;
  }>;
  staffProfile: { id: string } | null;
  studentProfile: { id: string; batchId: string } | null;
};

@Injectable()
export class AuthService {
  readonly sessionTtlSeconds: number;
  readonly otpTtlSeconds = OTP_TTL_SECONDS;
  private readonly sessionSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly email: AuthEmailService,
  ) {
    const configuredTtl = Number(process.env.SESSION_TTL_SECONDS);
    this.sessionTtlSeconds =
      Number.isInteger(configuredTtl) && configuredTtl > 0
        ? configuredTtl
        : DEFAULT_SESSION_TTL_SECONDS;

    const configuredSecret = process.env.SESSION_SECRET;
    if (!configuredSecret) {
      throw new Error('SESSION_SECRET is required.');
    }
    if (
      process.env.NODE_ENV === 'production' &&
      configuredSecret.startsWith('replace-')
    ) {
      throw new Error('A strong SESSION_SECRET is required in production.');
    }
    this.sessionSecret = configuredSecret;
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const failureKey = this.loginFailureKey(normalizedEmail);
    const failedAttempts = Number((await this.redis.get(failureKey)) ?? 0);
    if (failedAttempts >= 5) {
      throw new HttpException(
        'Too many login attempts. Try again in 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        passwordCredential: true,
        roleAssignments: { select: { role: true, campusId: true } },
        staffProfile: { select: { id: true } },
        studentProfile: { select: { id: true, batchId: true } },
      },
    });

    const validPassword = user?.passwordCredential
      ? await verifyPassword(
          password,
          user.passwordCredential.passwordHash,
          user.passwordCredential.passwordSalt,
        )
      : false;

    if (!user || user.status !== UserStatus.ACTIVE || !validPassword) {
      const attempts = await this.redis.incrementWithExpiry(
        failureKey,
        15 * 60,
      );
      if (attempts >= 5) {
        throw new HttpException(
          'Too many login attempts. Try again in 15 minutes.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException('Invalid email or password.');
    }

    const requestCount = await this.redis.incrementWithExpiry(
      this.otpRequestKey(user.id),
      OTP_TTL_SECONDS,
    );
    if (requestCount > OTP_MAX_REQUESTS) {
      throw new HttpException(
        'Too many verification codes requested. Try again in 10 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const challengeId = randomBytes(24).toString('base64url');
    const code = randomInt(100_000, 1_000_000).toString();
    const challenge: OtpChallenge = {
      userId: user.id,
      codeDigest: this.otpCodeDigest(challengeId, code),
    };
    const challengeKey = this.otpChallengeKey(challengeId);
    await this.redis.setWithExpiry(
      challengeKey,
      JSON.stringify(challenge),
      OTP_TTL_SECONDS,
    );

    const recipientEmail = user.notificationEmail ?? user.email;
    try {
      await this.email.sendLoginOtp({
        recipientEmail,
        recipientName: user.name,
        code,
        expiresInMinutes: OTP_TTL_SECONDS / 60,
      });
    } catch {
      await this.redis.delete(challengeKey);
      throw new ServiceUnavailableException(
        'The verification email could not be sent. Try again shortly.',
      );
    }
    await this.redis.delete(failureKey);

    return {
      challengeId,
      expiresInSeconds: OTP_TTL_SECONDS,
      destination: maskEmail(recipientEmail),
    };
  }

  async loginWithGoogle(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: {
        roleAssignments: { select: { role: true, campusId: true } },
        staffProfile: { select: { id: true } },
        studentProfile: { select: { id: true, batchId: true } },
      },
    });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !user.roleAssignments.length
    ) {
      throw new UnauthorizedException(
        'No active Mirai account is available. Contact your campus administrator.',
      );
    }
    return this.createSession(user, 'google');
  }

  async verifyOtp(challengeId: string, code: string) {
    const challengeKey = this.otpChallengeKey(challengeId);
    const rawChallenge = await this.redis.get(challengeKey);
    if (!rawChallenge) {
      throw new UnauthorizedException('Invalid or expired verification code.');
    }

    let challenge: OtpChallenge;
    try {
      challenge = JSON.parse(rawChallenge) as OtpChallenge;
    } catch {
      await this.redis.delete(challengeKey);
      throw new UnauthorizedException('Invalid or expired verification code.');
    }

    const attemptsKey = this.otpAttemptsKey(challengeId);
    const attempts = await this.redis.incrementWithExpiry(
      attemptsKey,
      OTP_TTL_SECONDS,
    );
    if (attempts > OTP_MAX_ATTEMPTS) {
      await Promise.all([
        this.redis.delete(challengeKey),
        this.redis.delete(attemptsKey),
      ]);
      throw new HttpException(
        'Too many incorrect verification codes. Sign in again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const candidateDigest = this.otpCodeDigest(challengeId, code);
    if (!sameSecret(challenge.codeDigest, candidateDigest)) {
      if (attempts === OTP_MAX_ATTEMPTS) {
        await this.redis.delete(challengeKey);
      }
      throw new UnauthorizedException('Invalid or expired verification code.');
    }

    const consumed = await this.redis.consumeIfValue(
      challengeKey,
      rawChallenge,
    );
    if (!consumed) {
      throw new UnauthorizedException('Invalid or expired verification code.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: challenge.userId },
      include: {
        roleAssignments: { select: { role: true, campusId: true } },
        staffProfile: { select: { id: true } },
        studentProfile: { select: { id: true, batchId: true } },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.redis.delete(challengeKey);
      throw new UnauthorizedException('Invalid or expired verification code.');
    }

    const result = await this.createSession(user, 'password_email_otp');
    await this.redis.delete(attemptsKey);
    return result;
  }

  async requestPasswordReset(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const challengeId = randomBytes(24).toString('base64url');
    const requestCount = await this.redis.incrementWithExpiry(
      this.passwordResetRequestKey(normalizedEmail),
      OTP_TTL_SECONDS,
    );
    if (requestCount > OTP_MAX_REQUESTS) {
      throw new HttpException(
        'Too many reset codes requested. Try again in 10 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        notificationEmail: true,
        status: true,
      },
    });

    if (user?.status === UserStatus.ACTIVE) {
      const code = randomInt(100_000, 1_000_000).toString();
      const challenge: OtpChallenge = {
        userId: user.id,
        codeDigest: this.otpCodeDigest(challengeId, code),
      };
      const challengeKey = this.passwordResetChallengeKey(challengeId);
      await this.redis.setWithExpiry(
        challengeKey,
        JSON.stringify(challenge),
        OTP_TTL_SECONDS,
      );
      try {
        await this.email.sendPasswordResetOtp({
          recipientEmail: user.notificationEmail ?? user.email,
          recipientName: user.name,
          code,
          expiresInMinutes: OTP_TTL_SECONDS / 60,
        });
      } catch {
        await this.redis.delete(challengeKey);
        throw new ServiceUnavailableException(
          'The reset email could not be sent. Try again shortly.',
        );
      }
    }

    return { challengeId, expiresInSeconds: OTP_TTL_SECONDS };
  }

  async verifyPasswordResetOtp(challengeId: string, code: string) {
    const challengeKey = this.passwordResetChallengeKey(challengeId);
    const rawChallenge = await this.redis.get(challengeKey);
    if (!rawChallenge) {
      throw new UnauthorizedException('Invalid or expired reset code.');
    }

    let challenge: OtpChallenge;
    try {
      challenge = JSON.parse(rawChallenge) as OtpChallenge;
    } catch {
      await this.redis.delete(challengeKey);
      throw new UnauthorizedException('Invalid or expired reset code.');
    }

    const attemptsKey = this.passwordResetAttemptsKey(challengeId);
    const attempts = await this.redis.incrementWithExpiry(
      attemptsKey,
      OTP_TTL_SECONDS,
    );
    if (attempts > OTP_MAX_ATTEMPTS) {
      await Promise.all([
        this.redis.delete(challengeKey),
        this.redis.delete(attemptsKey),
      ]);
      throw new HttpException(
        'Too many incorrect reset codes. Start again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const candidateDigest = this.otpCodeDigest(challengeId, code);
    if (!sameSecret(challenge.codeDigest, candidateDigest)) {
      if (attempts === OTP_MAX_ATTEMPTS) await this.redis.delete(challengeKey);
      throw new UnauthorizedException('Invalid or expired reset code.');
    }

    const consumed = await this.redis.consumeIfValue(
      challengeKey,
      rawChallenge,
    );
    if (!consumed) {
      throw new UnauthorizedException('Invalid or expired reset code.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: challenge.userId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid or expired reset code.');
    }

    const resetToken = randomBytes(32).toString('base64url');
    await this.redis.setWithExpiry(
      this.passwordResetAuthorizationKey(resetToken),
      user.id,
      OTP_TTL_SECONDS,
    );
    await this.redis.delete(attemptsKey);
    return { resetToken, expiresInSeconds: OTP_TTL_SECONDS };
  }

  async resetPassword(input: PasswordResetInput) {
    const authorizationKey = this.passwordResetAuthorizationKey(
      input.resetToken,
    );
    const userId = await this.redis.get(authorizationKey);
    if (!userId) {
      throw new UnauthorizedException(
        'Password reset approval is invalid or expired.',
      );
    }
    const consumed = await this.redis.consumeIfValue(authorizationKey, userId);
    if (!consumed) {
      throw new UnauthorizedException(
        'Password reset approval is invalid or expired.',
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Password reset approval is invalid or expired.',
      );
    }

    const credential = await hashPassword(input.password);
    await this.prisma.$transaction([
      this.prisma.passwordCredential.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...credential },
        update: credential,
      }),
      this.prisma.auditEvent.create({
        data: {
          actorId: user.id,
          action: AuditAction.UPDATE,
          entityType: 'PasswordCredential',
          entityId: user.id,
          metadata: { method: 'email_reset_code' },
        },
      }),
    ]);
  }

  async updateOwnAccount(
    actor: AuthenticatedUser,
    input: UpdateOwnAccountInput,
  ) {
    const current = await this.prisma.user.findUnique({
      where: { id: actor.id },
      include: {
        passwordCredential: true,
        roleAssignments: { select: { role: true, campusId: true } },
        staffProfile: { select: { id: true } },
        studentProfile: { select: { id: true, batchId: true } },
      },
    });
    if (!current || current.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Your account is no longer active.');
    }

    const protectedChange =
      input.notificationEmail !== undefined || Boolean(input.newPassword);
    if (protectedChange) {
      const validPassword =
        current.passwordCredential && input.currentPassword
          ? await verifyPassword(
              input.currentPassword,
              current.passwordCredential.passwordHash,
              current.passwordCredential.passwordSalt,
            )
          : false;
      if (!validPassword) {
        throw new UnauthorizedException('The current password is incorrect.');
      }
    }

    const credential = input.newPassword
      ? await hashPassword(input.newPassword)
      : null;
    const updated = await this.prisma.$transaction(async (transaction) => {
      const account = await transaction.user.update({
        where: { id: actor.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.notificationEmail !== undefined
            ? { notificationEmail: input.notificationEmail }
            : {}),
          ...(credential
            ? {
                passwordCredential: {
                  upsert: { create: credential, update: credential },
                },
              }
            : {}),
        },
        include: {
          roleAssignments: { select: { role: true, campusId: true } },
          staffProfile: { select: { id: true } },
          studentProfile: { select: { id: true, batchId: true } },
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: actor.id,
          campusId:
            account.roleAssignments.find((assignment) => assignment.campusId)
              ?.campusId ?? null,
          action: AuditAction.UPDATE,
          entityType: 'OwnAccount',
          entityId: actor.id,
          before: {
            name: current.name,
            notificationEmail: current.notificationEmail,
          },
          after: {
            name: account.name,
            notificationEmail: account.notificationEmail,
            passwordChanged: Boolean(credential),
          },
        },
      });
      return account;
    });

    return this.toAuthenticatedUser(updated);
  }

  async userForSession(token: string): Promise<AuthenticatedUser | null> {
    const key = this.sessionKey(token);
    const userId = await this.redis.get(key);
    if (!userId) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roleAssignments: { select: { role: true, campusId: true } },
        staffProfile: { select: { id: true } },
        studentProfile: { select: { id: true, batchId: true } },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.redis.delete(key);
      return null;
    }

    return this.toAuthenticatedUser(user);
  }

  async logout(token: string) {
    await this.redis.delete(this.sessionKey(token));
  }

  private async createSession(user: SessionUser, authenticationMethod: string) {
    const token = randomBytes(32).toString('base64url');
    const sessionKey = this.sessionKey(token);
    await this.redis.setWithExpiry(sessionKey, user.id, this.sessionTtlSeconds);
    try {
      await this.prisma.auditEvent.create({
        data: {
          actorId: user.id,
          action: AuditAction.LOGIN,
          entityType: 'UserSession',
          entityId: user.id,
          metadata: { authenticationMethod },
        },
      });
    } catch (error) {
      await this.redis.delete(sessionKey);
      throw error;
    }
    return { token, user: this.toAuthenticatedUser(user) };
  }

  private sessionKey(token: string) {
    return `auth:session:${this.digest(token)}`;
  }

  private loginFailureKey(email: string) {
    return `auth:login-failures:${this.digest(email)}`;
  }

  private otpRequestKey(userId: string) {
    return `auth:otp-requests:${this.digest(userId)}`;
  }

  private otpChallengeKey(challengeId: string) {
    return `auth:otp-challenge:${this.digest(challengeId)}`;
  }

  private otpAttemptsKey(challengeId: string) {
    return `auth:otp-attempts:${this.digest(challengeId)}`;
  }

  private passwordResetRequestKey(email: string) {
    return `auth:password-reset-requests:${this.digest(email)}`;
  }

  private passwordResetChallengeKey(challengeId: string) {
    return `auth:password-reset-challenge:${this.digest(challengeId)}`;
  }

  private passwordResetAttemptsKey(challengeId: string) {
    return `auth:password-reset-attempts:${this.digest(challengeId)}`;
  }

  private passwordResetAuthorizationKey(resetToken: string) {
    return `auth:password-reset-authorization:${this.digest(resetToken)}`;
  }

  private otpCodeDigest(challengeId: string, code: string) {
    return this.digest(`${challengeId}:${code}`);
  }

  private digest(value: string) {
    return createHmac('sha256', this.sessionSecret).update(value).digest('hex');
  }

  private toAuthenticatedUser(user: SessionUser): AuthenticatedUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      notificationEmail: user.notificationEmail ?? null,
      roles: user.roleAssignments,
      staffProfileId: user.staffProfile?.id ?? null,
      studentProfile: user.studentProfile,
    };
  }
}

function sameSecret(expected: string, provided: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(3, Math.min(local.length - 1, 6)))}@${domain}`;
}
