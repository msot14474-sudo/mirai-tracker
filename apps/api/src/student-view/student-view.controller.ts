import { UserRole } from '@prisma/client';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import { progressDateQuerySchema } from '../progress/progress.schemas';
import { StudentViewService } from './student-view.service';

@Controller('student')
@Roles(UserRole.STUDENT)
export class StudentViewController {
  constructor(private readonly studentView: StudentViewService) {}

  @Get('overview')
  overview(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const { asOf } = parse(progressDateQuerySchema, query);
    return this.studentView.overview(asOf, user);
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Request validation failed.',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}
