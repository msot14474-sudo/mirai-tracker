import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
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
  resetToken: z.string().min(32).max(100),
  password: z.string().min(12).max(256),
});

const verifyPasswordResetOtpInputSchema = z.object({
  challengeId: z.string().min(20).max(100),
  code: z.string().regex(/^\d{6}$/),
});

const updateOwnAccountInputSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    notificationEmail: z
      .string()
      .trim()
      .email()
      .max(320)
      .transform((value) => value.toLowerCase())
      .nullable()
      .optional(),
    currentPassword: z.string().min(8).max(256).optional(),
    newPassword: z.string().min(12).max(256).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Provide at least one account change.',
  })
  .refine((value) => !value.newPassword || Boolean(value.currentPassword), {
    message: 'Enter the current password before choosing a new password.',
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
  @Post('verify-reset-otp')
  @HttpCode(200)
  async verifyPasswordResetOtp(@Body() body: unknown) {
    const parsed = verifyPasswordResetOtpInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Enter a valid six-digit reset code.');
    }
    return this.auth.verifyPasswordResetOtp(
      parsed.data.challengeId,
      parsed.data.code,
    );
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: unknown) {
    const parsed = resetPasswordInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'Enter a valid reset approval and a password with at least 12 characters.',
      );
    }
    await this.auth.resetPassword(parsed.data);
    return { changed: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Patch('account')
  async updateAccount(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = updateOwnAccountInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Request validation failed.',
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return { user: await this.auth.updateOwnAccount(user, parsed.data) };
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
