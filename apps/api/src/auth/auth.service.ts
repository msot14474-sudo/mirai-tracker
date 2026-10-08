import { createHmac, randomBytes } from 'node:crypto';
import { AuditAction, UserStatus } from '@prisma/client';
import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DEFAULT_SESSION_TTL_SECONDS } from './auth.constants';
import { AuthenticatedUser } from './auth.types';
import { verifyPassword } from './password';

@Injectable()
export class AuthService {
  readonly sessionTtlSeconds: number;
  private readonly sessionSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
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
          metadata: { authenticationMethod: 'password' },
        },
      });
    } catch (error) {
      await this.redis.delete(sessionKey);
      throw error;
    }
    await this.redis.delete(failureKey);

    return { token, user: this.toAuthenticatedUser(user) };
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

  private sessionKey(token: string) {
    const digest = createHmac('sha256', this.sessionSecret)
      .update(token)
      .digest('hex');
    return `auth:session:${digest}`;
  }

  private loginFailureKey(email: string) {
    const digest = createHmac('sha256', this.sessionSecret)
      .update(email)
      .digest('hex');
    return `auth:login-failures:${digest}`;
  }

  private toAuthenticatedUser(user: {
    id: string;
    name: string;
    email: string;
    roleAssignments: Array<{
      role: AuthenticatedUser['roles'][number]['role'];
      campusId: string | null;
    }>;
    staffProfile: { id: string } | null;
    studentProfile: { id: string; batchId: string } | null;
  }): AuthenticatedUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roleAssignments,
      staffProfileId: user.staffProfile?.id ?? null,
      studentProfile: user.studentProfile,
    };
  }
}
