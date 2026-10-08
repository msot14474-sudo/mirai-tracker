import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { Observable, tap } from 'rxjs';

type HeaderResponse = {
  setHeader(name: string, value: string): void;
};

@Injectable()
export class RequestTimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = performance.now();
    const response = context.switchToHttp().getResponse<HeaderResponse>();
    let recorded = false;

    const record = () => {
      if (recorded) return;
      recorded = true;
      const duration = Math.max(0, performance.now() - startedAt).toFixed(2);
      response.setHeader('Server-Timing', `app;dur=${duration}`);
      response.setHeader('X-Response-Time', `${duration}ms`);
    };

    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
