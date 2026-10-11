import { UserRole } from '@prisma/client';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { uuidSchema } from '../academic-calendar/academic-calendar.schemas';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  createAccessAccountSchema,
  createFacultySchema,
} from './faculty-access.schemas';
import { FacultyAccessService } from './faculty-access.service';

const managers = [
  UserRole.ADMIN,
  UserRole.PROGRAM_MANAGER,
  UserRole.CAMPUS_MANAGER,
] as const;

@Controller('faculty-access')
@Roles(...managers)
export class FacultyAccessController {
  constructor(private readonly facultyAccess: FacultyAccessService) {}

  @Get('campuses/:campusId')
  campus(
    @Param('campusId') campusId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.facultyAccess.campus(parse(uuidSchema, campusId), user);
  }

  @Post('campuses/:campusId/faculty')
  createFaculty(
    @Param('campusId') campusId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.facultyAccess.createFaculty(
      parse(uuidSchema, campusId),
      parse(createFacultySchema, body),
      user,
    );
  }

  @Post('campuses/:campusId/managers')
  @Roles(UserRole.ADMIN, UserRole.PROGRAM_MANAGER)
  createCampusManager(
    @Param('campusId') campusId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.facultyAccess.createCampusManager(
      parse(uuidSchema, campusId),
      parse(createAccessAccountSchema, body),
      user,
    );
  }

  @Post('administrators')
  @Roles(UserRole.ADMIN, UserRole.PROGRAM_MANAGER)
  createAdministrator(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.facultyAccess.createAdministrator(
      parse(createAccessAccountSchema, body),
      user,
    );
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
