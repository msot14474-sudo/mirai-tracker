import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentSessionToken, CurrentUser, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';
import { clearSessionCookie, createSessionCookie } from './session-cookie';

const loginInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(256),
});

const verifyOtpInputSchema = z.object({
  challengeId: z.string().min(20).max(100),
  code: z.string().regex(/^\d{6}$/),
});

const forgotPasswordInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
});

const resetPasswordInputSchema = z.object({
  challengeId: z.string().min(20).max(100),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(12).max(256),
});

type HeaderResponse = {
  setHeader(name: string, value: string): void;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown) {
    const parsed = loginInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Enter a valid email and password.');
    }

    return this.auth.login(parsed.data.email, parsed.data.password);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(200)
  async verifyOtp(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const parsed = verifyOtpInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Enter a valid six-digit code.');
    }
    const result = await this.auth.verifyOtp(
      parsed.data.challengeId,
      parsed.data.code,
    );
    response.setHeader(
      'Set-Cookie',
      createSessionCookie(result.token, this.auth.sessionTtlSeconds),
    );
    return { user: result.user };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: unknown) {
    const parsed = forgotPasswordInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Enter a valid email address.');
    }
    return this.auth.requestPasswordReset(parsed.data.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: unknown) {
    const parsed = resetPasswordInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'Enter a valid code and a password with at least 12 characters.',
      );
    }
    await this.auth.resetPassword(parsed.data);
    return { changed: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentSessionToken() token: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    await this.auth.logout(token);
    response.setHeader('Set-Cookie', clearSessionCookie());
  }
}
