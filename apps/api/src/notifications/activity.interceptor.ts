import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { mergeMap } from 'rxjs';
import { ActivityScope, ActivityService, changeFor } from './activity.service';
import { PrismaService } from '../database/prisma.service';
@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityInterceptor.name);
  constructor(
    private readonly activity: ActivityService,
    private readonly db: PrismaService,
  ) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0],
      change = changeFor(req.method, path);
    if (!change || !req.user) return next.handle();
    const body = {
      ...(req.body ?? {}),
      _semesterId: path.startsWith('/campus-data/semesters/')
        ? req.params.id
        : undefined,
    };
    let prior: ActivityScope = { offeringIds: [] };
    try {
      prior = await this.activity.resolve(req.params, body);
    } catch {
      this.logger.warn('Could not resolve activity before change.');
    }
    return next.handle().pipe(
      mergeMap(async (result) => {
        if (
          result?.valid === false ||
          result?.saved === false ||
          result?.alreadyImported
        )
          return result;
        try {
          const afterParams = {
            ...req.params,
            ...(path === '/academic/subjects' && result?.id
              ? { subjectId: result.id }
              : {}),
            ...(path.endsWith('/semesters') && result?.id
              ? { semesterId: result.id }
              : {}),
          };
          const after = await this.activity.resolve(
            afterParams,
            {
              ...body,
              ...req.body,
              _semesterId: path.startsWith('/campus-data/semesters/')
                ? req.params.id
                : undefined,
            },
            result,
          );
          const scope: ActivityScope = {
            ...prior,
            ...Object.fromEntries(
              Object.entries(after).filter(([, v]) => v !== undefined),
            ),
            offeringIds: after.offeringIds.length
              ? after.offeringIds
              : prior.offeringIds,
          };
          if (path.includes('/calendar/') && req.params.token) {
            const audit = await this.db.auditEvent.findFirst({
              where: {
                actorId: req.user.id,
                entityType: 'Semester',
                metadata: {
                  path: ['calendarImportId'],
                  equals: req.params.token,
                },
              },
              orderBy: { occurredAt: 'desc' },
            });
            if (audit) {
              scope.campusId = audit.campusId ?? undefined;
              scope.semesterId = audit.entityId;
            }
          }
          await this.activity.publish(req.user, change, scope);
        } catch {
          this.logger.error(
            'Change saved, but its activity notification could not be recorded.',
          );
        }
        return result;
      }),
    );
  }
}
