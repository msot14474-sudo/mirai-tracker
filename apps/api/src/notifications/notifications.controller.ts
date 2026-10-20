import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import { ActivityService } from './activity.service';
import { WeeklySummaryService } from './weekly-summary.service';
const filter = z.object({
  campusId: z.string().uuid().optional(),
  before: z.string().datetime().optional(),
});
function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException('Invalid notification request.');
  return parsed.data;
}
@Controller('notifications')
@Roles('ADMIN', 'PROGRAM_MANAGER', 'CAMPUS_MANAGER', 'FACULTY')
export class NotificationsController {
  constructor(
    private readonly activity: ActivityService,
    private readonly weekly: WeeklySummaryService,
  ) {}
  @Get() feed(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const q = parse(filter, query);
    return this.activity.feed(user, q.campusId, q.before);
  }
  @Post('read') read(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    return this.activity.markRead(
      user,
      parse(z.object({ ids: z.array(z.string().uuid()).min(1).max(60) }), body)
        .ids,
    );
  }
  @Get('weekly-summaries') summaries(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ) {
    return this.weekly.list(user, parse(filter, query).campusId);
  }
  @Post('weekly-summaries/process')
  @Public()
  @Roles()
  async process(
    @Headers('x-internal-job-secret') secret: string | undefined,
    @Body() body: unknown,
  ) {
    this.weekly.assertSecret(secret);
    const input = parse(
      z.object({ enqueue: z.boolean().default(false) }),
      body ?? {},
    );
    if (input.enqueue) await this.weekly.enqueue();
    return this.weekly.processOne();
  }
}
