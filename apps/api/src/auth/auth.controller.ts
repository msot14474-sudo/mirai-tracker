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

type HeaderResponse = {
  setHeader(name: string, value: string): void;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const parsed = loginInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Enter a valid email and password.');
    }

    const result = await this.auth.login(
      parsed.data.email,
      parsed.data.password,
    );
    response.setHeader(
      'Set-Cookie',
      createSessionCookie(result.token, this.auth.sessionTtlSeconds),
    );
    return { user: result.user };
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
