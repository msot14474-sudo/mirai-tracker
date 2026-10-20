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
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/auth.decorators';
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

  @Get('semesters/:semesterId/subjects')
  @Roles(UserRole.ADMIN, UserRole.PROGRAM_MANAGER, UserRole.CAMPUS_MANAGER)
  semesterCourses(
    @Param('semesterId') semesterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendar.semesterCourses(id(semesterId), user);
  }

  @Post('semesters/:semesterId/subjects')
  @Roles(UserRole.ADMIN, UserRole.PROGRAM_MANAGER, UserRole.CAMPUS_MANAGER)
  connectSubjects(
    @Param('semesterId') semesterId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendar.connectSemesterSubjects(
      id(semesterId),
      parse(
        z
          .object({
            batchId: z.string().uuid().optional(),
            batchName: z.string().trim().min(1).max(160).optional(),
            batchCode: z.string().trim().min(1).max(64).optional(),
            trackName: z.string().trim().min(1).max(160).optional(),
            trackCode: z.string().trim().min(1).max(32).optional(),
            subjectIds: z.array(z.string().uuid()).min(1).max(200),
          })
          .strict(),
        body,
      ),
      user,
    );
  }

  @Get('my-subjects')
  @Roles(UserRole.FACULTY)
  mySubjects(@CurrentUser() user: AuthenticatedUser) {
    return this.calendar.listFacultySubjects(user);
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

  @Get('campuses/:campusId/subject-faculty')
  subjectFaculty(
    @Param('campusId') campusId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendar.subjectFaculty(id(campusId), user);
  }

  @Post('subjects/:subjectId/teacher')
  @Roles(UserRole.ADMIN, UserRole.CAMPUS_MANAGER)
  assignTeacher(
    @Param('subjectId') subjectId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.calendar.assignSubjectTeacher(
      id(subjectId),
      parse(
        z.object({
          campusId: uuidSchema,
          staffProfileId: uuidSchema,
          offeringId: uuidSchema.optional(),
        }),
        body,
      ),
      user,
    );
  }

  @Post('subjects')
  @Roles(UserRole.ADMIN, UserRole.PROGRAM_MANAGER, UserRole.CAMPUS_MANAGER)
  createSubject(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.calendar.createSubject(parse(createSubjectSchema, body), user);
  }

  @Delete('subjects/:subjectId')
  @HttpCode(204)
  async deleteSubject(
    @Param('subjectId') subjectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.calendar.deleteSubject(id(subjectId), user);
  }

  @Delete('semesters/:semesterId')
  @HttpCode(204)
  async deleteSemester(
    @Param('semesterId') semesterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.calendar.deleteSemester(id(semesterId), user);
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
