import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './auth.constants';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './auth.types';
import { readSessionCookie } from './session-cookie';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionCookie(request.headers.cookie);
    if (!token) throw new UnauthorizedException('Authentication required.');

    const user = await this.auth.userForSession(token);
    if (!user)
      throw new UnauthorizedException('Session is invalid or expired.');

    request.user = user;
    request.sessionToken = token;
    return true;
  }
}
