import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { RedisService } from '../redis/redis.service';
import { AuthService } from './auth.service';

const COOKIE_NAME = 'mirai_google_state';
const TTL = 600;

@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly redis: RedisService,
    private readonly auth: AuthService,
  ) {}

  get enabled() {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  private client() {
    if (!this.enabled)
      throw new ServiceUnavailableException(
        'Google sign-in is not configured yet. Use email to sign in.',
      );
    return new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  cookie(state: string, maxAge = TTL) {
    return `${COOKIE_NAME}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
  }

  async start() {
    this.client();
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    await this.redis.setWithExpiry(
      `auth:google:${state}`,
      JSON.stringify({ nonce, verifier }),
      TTL,
    );
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      prompt: 'select_account',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      cookie: this.cookie(state),
    };
  }

  async finish(code: string, state: string, cookieHeader: string | undefined) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4096) {
      throw new UnauthorizedException('Invalid Google sign-in response.');
    }
    const cookie = cookieHeader
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE_NAME}=`))
      ?.slice(COOKIE_NAME.length + 1);
    if (
      !cookie ||
      cookie.length !== state.length ||
      !timingSafeEqual(Buffer.from(cookie), Buffer.from(state))
    ) {
      throw new UnauthorizedException(
        'Google sign-in must finish in the same browser.',
      );
    }
    const key = `auth:google:${state}`;
    const raw = await this.redis.get(key);
    if (!raw || !(await this.redis.consumeIfValue(key, raw)))
      throw new UnauthorizedException('Google sign-in has expired.');
    const { nonce, verifier } = JSON.parse(raw) as {
      nonce: string;
      verifier: string;
    };
    const client = this.client();
    const { tokens } = await client.getToken({ code, codeVerifier: verifier });
    if (!tokens.id_token)
      throw new UnauthorizedException(
        'Google did not return an identity token.',
      );
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (
      !payload?.sub ||
      payload.nonce !== nonce ||
      !payload.email_verified ||
      !payload.email
    ) {
      throw new UnauthorizedException('Google identity could not be verified.');
    }
    // Google is authoritative for Gmail and verified Workspace domains only.
    // Other email providers must use the existing password/email-OTP flow.
    if (!payload.email.toLowerCase().endsWith('@gmail.com') && !payload.hd) {
      throw new UnauthorizedException('Use email sign-in for this account.');
    }
    return this.auth.loginWithGoogle(payload.email);
  }
}
