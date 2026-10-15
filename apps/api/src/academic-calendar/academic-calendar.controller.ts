import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  calendarRangeSchema,
  createCalendarDaySchema,
  createExamWindowSchema,
  createSemesterSchema,
  createSubjectSchema,
  updateCalendarDaySchema,
  updateExamWindowSchema,
  updateSemesterSchema,
  uuidSchema,
} from './academic-calendar.schemas';
import { AcademicCalendarService } from './academic-calendar.service';

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

const id = (value: string) => parse(uuidSchema, value);

@Controller('academic')
export class AcademicCalendarController {
  constructor(private readonly calendar: AcademicCalendarService) {}

  @Get('campuses')
  campuses(@CurrentUser() user: AuthenticatedUser) {
    return this.calendar.listAccessibleCampuses(user);
  }

  @Get('subjects')
  subjects(
    @CurrentUser() user: AuthenticatedUser,
    @Query('campusId') campusId?: string,
  ) {
    return this.calendar.listSubjects(
      user,
      campusId ? id(campusId) : undefined,
    );
  }

  @Post('subjects')
  createSubject(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.calendar.createSubject(parse(createSubjectSchema, body), user);
  }

  @Get('campuses/:campusId/semesters')
  semesters(
    @Param('campusId') campusId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendar.listSemesters(id(campusId), user);
  }

  @Post('campuses/:campusId/semesters')
  createSemester(
    @Param('campusId') campusId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendar.createSemester(
      id(campusId),
      parse(createSemesterSchema, body),
      user,
    );
  }

  @Get('semesters/:semesterId')
  semester(
    @Param('semesterId') semesterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendar.getSemester(id(semesterId), user);
  }

  @Patch('semesters/:semesterId')
  updateSemester(
    @Param('semesterId') semesterId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendar.updateSemester(
      id(semesterId),
      parse(updateSemesterSchema, body),
      user,
    );
  }

  @Get('semesters/:semesterId/calendar')
  generatedCalendar(
    @Param('semesterId') semesterId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendar.calendar(
      id(semesterId),
      parse(calendarRangeSchema, query),
      user,
    );
  }

  @Post('semesters/:semesterId/calendar-days')
  createCalendarDay(
    @Param('semesterId') semesterId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendar.createCalendarDay(
      id(semesterId),
      parse(createCalendarDaySchema, body),
      user,
    );
  }

  @Patch('calendar-days/:calendarDayId')
  updateCalendarDay(
    @Param('calendarDayId') calendarDayId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendar.updateCalendarDay(
      id(calendarDayId),
      parse(updateCalendarDaySchema, body),
      user,
    );
  }

  @Delete('calendar-days/:calendarDayId')
  @HttpCode(204)
  async deleteCalendarDay(
    @Param('calendarDayId') calendarDayId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.calendar.deleteCalendarDay(id(calendarDayId), user);
  }

  @Post('semesters/:semesterId/exam-windows')
  createExamWindow(
    @Param('semesterId') semesterId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendar.createExamWindow(
      id(semesterId),
      parse(createExamWindowSchema, body),
      user,
    );
  }

  @Patch('exam-windows/:examWindowId')
  updateExamWindow(
    @Param('examWindowId') examWindowId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendar.updateExamWindow(
      id(examWindowId),
      parse(updateExamWindowSchema, body),
      user,
    );
  }

  @Delete('exam-windows/:examWindowId')
  @HttpCode(204)
  async deleteExamWindow(
    @Param('examWindowId') examWindowId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.calendar.deleteExamWindow(id(examWindowId), user);
  }
}
