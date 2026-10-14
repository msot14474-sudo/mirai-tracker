import { Body, Param, Put, ParseUUIDPipe } from '@nestjs/common';
import { StudentLecturesService } from './student-lectures.service';
import {
  lectureReviewSchema,
  lectureListSchema,
} from './lecture-review.schemas';
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
  constructor(
    private readonly studentView: StudentViewService,
    private readonly lectures: StudentLecturesService,
  ) {}

  @Get('lectures')
  listLectures(
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = parse(lectureListSchema, query);
    return this.lectures.lectures(user, input.review, input.page);
  }

  @Put('lectures/:id/review')
  reviewLecture(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lectures.review(user, id, parse(lectureReviewSchema, body));
  }

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
