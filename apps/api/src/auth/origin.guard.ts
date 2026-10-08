import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class RequestOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      method: string;
      headers: { origin?: string };
    }>();

    if (safeMethods.has(request.method.toUpperCase())) return true;

    const origin = request.headers.origin;
    if (!origin) return true;

    const expectedOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
    if (origin !== expectedOrigin) {
      throw new ForbiddenException('The request origin is not allowed.');
    }

    return true;
  }
}
