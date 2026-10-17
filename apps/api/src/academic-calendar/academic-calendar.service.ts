import { TimetableService } from '../timetable/timetable.service';
import { CalendarDayType, Prisma } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessPolicyService } from '../auth/access-policy.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  CreateCalendarDayInput,
  CreateExamWindowInput,
  CreateSemesterInput,
  CreateSubjectInput,
  UpdateCalendarDayInput,
  UpdateExamWindowInput,
  UpdateSemesterInput,
} from './academic-calendar.schemas';
import {
  buildAcademicCalendar,
  formatIsoDate,
  parseIsoDate,
} from './calendar-engine';

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class AcademicCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
    private readonly timetable: TimetableService,
  ) {}

  listAccessibleCampuses(user: AuthenticatedUser) {
    const campusIds = [
      ...new Set(
        user.roles
          .map((assignment) => assignment.campusId)
          .filter((campusId): campusId is string => Boolean(campusId)),
      ),
    ];

    return this.prisma.campus.findMany({
      where: this.access.isGlobalManager(user)
        ? { active: true }
        : { active: true, id: { in: campusIds } },
      select: { id: true, code: true, name: true, timezone: true },
      orderBy: { name: 'asc' },
    });
  }

  listSubjects(user: AuthenticatedUser, campusId?: string) {
    this.access.assertGlobalManager(user);
    return this.prisma.subject.findMany({
      where: {
        active: true,
        ...(campusId
          ? {
              OR: [
                { campusId },
                { offerings: { some: { batch: { semester: { campusId } } } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        active: true,
      },
      orderBy: { code: 'asc' },
    });
  }

  async createSubject(input: CreateSubjectInput, user: AuthenticatedUser) {
    this.access.assertGlobalManager(user);
    try {
      return await this.prisma.subject.create({
        data: {
          ...(input.campusId ? { campusId: input.campusId } : {}),
          code: input.code,
          name: input.name,
          description: input.description,
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          active: true,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('A subject with this code already exists.');
      }
      throw error;
    }
  }

  async deleteSemester(semesterId: string, user: AuthenticatedUser) {
    this.access.assertGlobalManager(user);
    try {
      await this.prisma.semester.delete({ where: { id: semesterId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') throw new NotFoundException('Semester not found.');
        if (error.code === 'P2003') throw new ConflictException(
          'This semester has linked batches or teaching records. Move or remove those records before deleting it.',
        );
      }
      throw error;
    }
  }

  async deleteSubject(subjectId: string, user: AuthenticatedUser) {
    this.access.assertGlobalManager(user);
    try {
      await this.prisma.subject.delete({ where: { id: subjectId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') throw new NotFoundException('Subject not found.');
        if (error.code === 'P2003') throw new ConflictException(
          'This subject is assigned to a batch. Remove its teaching assignments and records before deleting it.',
        );
      }
      throw error;
    }
  }

  async listSemesters(campusId: string, user: AuthenticatedUser) {
    this.access.assertCanViewCampus(user, campusId);
    return this.prisma.semester.findMany({
      where: { campusId },
      include: {
        _count: { select: { calendarDays: true, examWindows: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async createSemester(
    campusId: string,
    input: CreateSemesterInput,
    user: AuthenticatedUser,
  ) {
    this.access.assertGlobalManager(user);
    const campus = await this.prisma.campus.findUnique({
      where: { id: campusId },
      select: { id: true },
    });
    if (!campus) throw new NotFoundException('Campus not found.');

    this.assertDateRange(input.startDate, input.endDate, 'semester');
    this.assertThresholds(
      input.defaultOnTrackThreshold,
      input.defaultTightThreshold,
    );

    try {
      return await this.prisma.semester.create({
        data: {
          campusId,
          name: input.name,
          startDate: parseIsoDate(input.startDate),
          endDate: parseIsoDate(input.endDate),
          workingSaturdayRule: input.workingSaturdayRule,
          defaultOnTrackThreshold: input.defaultOnTrackThreshold,
          defaultTightThreshold: input.defaultTightThreshold,
          status: input.status,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A semester with this name already exists for the campus.',
        );
      }
      throw error;
    }
  }

  async getSemester(semesterId: string, user: AuthenticatedUser) {
    const semester = await this.prisma.semester.findUnique({
      where: { id: semesterId },
      include: {
        campus: {
          select: { id: true, code: true, name: true, timezone: true },
        },
        calendarDays: { orderBy: { date: 'asc' } },
        examWindows: { orderBy: { startDate: 'asc' } },
      },
    });
    if (!semester) throw new NotFoundException('Semester not found.');
    this.access.assertCanViewCampus(user, semester.campusId);
    return semester;
  }

  async updateSemester(
    semesterId: string,
    input: UpdateSemesterInput,
    user: AuthenticatedUser,
  ) {
    this.access.assertGlobalManager(user);
    const current = await this.prisma.semester.findUnique({
      where: { id: semesterId },
    });
    if (!current) throw new NotFoundException('Semester not found.');

    const startDate = input.startDate ?? formatIsoDate(current.startDate);
    const endDate = input.endDate ?? formatIsoDate(current.endDate);
    const onTrack =
      input.defaultOnTrackThreshold ?? Number(current.defaultOnTrackThreshold);
    const tight =
      input.defaultTightThreshold ?? Number(current.defaultTightThreshold);
    this.assertDateRange(startDate, endDate, 'semester');
    this.assertThresholds(onTrack, tight);

    const [outsideCalendarDay, outsideExam] = await Promise.all([
      this.prisma.calendarDayOverride.findFirst({
        where: {
          semesterId,
          OR: [
            { date: { lt: parseIsoDate(startDate) } },
            { date: { gt: parseIsoDate(endDate) } },
          ],
        },
        select: { id: true },
      }),
      this.prisma.examWindow.findFirst({
        where: {
          semesterId,
          OR: [
            { startDate: { lt: parseIsoDate(startDate) } },
            { endDate: { gt: parseIsoDate(endDate) } },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (outsideCalendarDay || outsideExam) {
      throw new ConflictException(
        'Move or remove calendar entries outside the new semester dates first.',
      );
    }

    try {
      const saved = await this.prisma.semester.update({
        where: { id: semesterId },
        data: {
          name: input.name,
          startDate: input.startDate
            ? parseIsoDate(input.startDate)
            : undefined,
          endDate: input.endDate ? parseIsoDate(input.endDate) : undefined,
          workingSaturdayRule: input.workingSaturdayRule,
          defaultOnTrackThreshold: input.defaultOnTrackThreshold,
          defaultTightThreshold: input.defaultTightThreshold,
          status: input.status,
        },
      });
      if (
        input.startDate !== undefined ||
        input.endDate !== undefined ||
        input.workingSaturdayRule !== undefined
      ) {
        await this.timetable.regenerateSemester(semesterId, user);
      }
      return saved;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A semester with this name already exists for the campus.',
        );
      }
      throw error;
    }
  }

  async calendar(
    semesterId: string,
    range: { from?: string; to?: string },
    user: AuthenticatedUser,
  ) {
    const semester = await this.getSemester(semesterId, user);
    try {
      return {
        semester: {
          id: semester.id,
          name: semester.name,
          campus: semester.campus,
          startDate: formatIsoDate(semester.startDate),
          endDate: formatIsoDate(semester.endDate),
          workingSaturdayRule: semester.workingSaturdayRule,
          status: semester.status,
        },
        exams: semester.examWindows,
        ...buildAcademicCalendar({
          semesterStart: formatIsoDate(semester.startDate),
          semesterEnd: formatIsoDate(semester.endDate),
          from: range.from,
          to: range.to,
          saturdayRule: semester.workingSaturdayRule,
          overrides: semester.calendarDays.map((day) => ({
            id: day.id,
            date: formatIsoDate(day.date),
            type: day.type,
            title: day.title,
            teachingAllowed: day.teachingAllowed,
            notes: day.notes,
          })),
        }),
      };
    } catch (error) {
      if (error instanceof RangeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async createCalendarDay(
    semesterId: string,
    input: CreateCalendarDayInput,
    user: AuthenticatedUser,
  ) {
    this.access.assertGlobalManager(user);
    const semester = await this.requireSemester(semesterId);
    this.assertInsideSemester(input.date, semester);
    const teachingAllowed = this.normalizedTeachingAllowed(
      input.type,
      input.teachingAllowed,
    );

    try {
      const saved = await this.prisma.calendarDayOverride.create({
        data: {
          semesterId,
          date: parseIsoDate(input.date),
          type: input.type,
          title: input.title,
          teachingAllowed,
          notes: input.notes,
        },
      });
      await this.timetable.regenerateSemester(semesterId, user);
      return saved;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'This date already has a calendar override.',
        );
      }
      throw error;
    }
  }

  async updateCalendarDay(
    calendarDayId: string,
    input: UpdateCalendarDayInput,
    user: AuthenticatedUser,
  ) {
    this.access.assertGlobalManager(user);
    const current = await this.prisma.calendarDayOverride.findUnique({
      where: { id: calendarDayId },
      include: { semester: true },
    });
    if (!current) throw new NotFoundException('Calendar day not found.');

    const date = input.date ?? formatIsoDate(current.date);
    const type = input.type ?? current.type;
    this.assertInsideSemester(date, current.semester);

    try {
      const saved = await this.prisma.calendarDayOverride.update({
        where: { id: calendarDayId },
        data: {
          date: input.date ? parseIsoDate(input.date) : undefined,
          type: input.type,
          title: input.title,
          teachingAllowed: this.normalizedTeachingAllowed(
            type,
            input.teachingAllowed ?? current.teachingAllowed,
          ),
          notes: input.notes,
        },
      });
      await this.timetable.regenerateSemester(current.semesterId, user);
      return saved;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'This date already has a calendar override.',
        );
      }
      throw error;
    }
  }

  async deleteCalendarDay(calendarDayId: string, user: AuthenticatedUser) {
    this.access.assertGlobalManager(user);
    const current = await this.prisma.calendarDayOverride.findUnique({
      where: { id: calendarDayId },
    });
    if (!current) throw new NotFoundException('Calendar day not found.');
    const result = await this.prisma.calendarDayOverride.deleteMany({
      where: { id: calendarDayId },
    });
    if (result.count === 0)
      throw new NotFoundException('Calendar day not found.');
    await this.timetable.regenerateSemester(current.semesterId, user);
  }

  async createExamWindow(
    semesterId: string,
    input: CreateExamWindowInput,
    user: AuthenticatedUser,
  ) {
    this.access.assertGlobalManager(user);
    const semester = await this.requireSemester(semesterId);
    this.assertExamDates(input, semester);
    await this.assertNoExamOverlap(semesterId, input.startDate, input.endDate);

    try {
      return await this.prisma.examWindow.create({
        data: {
          semesterId,
          name: input.name,
          type: input.type,
          startDate: parseIsoDate(input.startDate),
          endDate: parseIsoDate(input.endDate),
          syllabusDeadline: parseIsoDate(input.syllabusDeadline),
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'An exam window with this name already exists in the semester.',
        );
      }
      throw error;
    }
  }

  async updateExamWindow(
    examWindowId: string,
    input: UpdateExamWindowInput,
    user: AuthenticatedUser,
  ) {
    this.access.assertGlobalManager(user);
    const current = await this.prisma.examWindow.findUnique({
      where: { id: examWindowId },
      include: { semester: true },
    });
    if (!current) throw new NotFoundException('Exam window not found.');

    const dates = {
      startDate: input.startDate ?? formatIsoDate(current.startDate),
      endDate: input.endDate ?? formatIsoDate(current.endDate),
      syllabusDeadline:
        input.syllabusDeadline ?? formatIsoDate(current.syllabusDeadline),
    };
    this.assertExamDates(dates, current.semester);
    await this.assertNoExamOverlap(
      current.semesterId,
      dates.startDate,
      dates.endDate,
      current.id,
    );

    try {
      return await this.prisma.examWindow.update({
        where: { id: examWindowId },
        data: {
          name: input.name,
          type: input.type,
          startDate: input.startDate
            ? parseIsoDate(input.startDate)
            : undefined,
          endDate: input.endDate ? parseIsoDate(input.endDate) : undefined,
          syllabusDeadline: input.syllabusDeadline
            ? parseIsoDate(input.syllabusDeadline)
            : undefined,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'An exam window with this name already exists in the semester.',
        );
      }
      throw error;
    }
  }

  async deleteExamWindow(examWindowId: string, user: AuthenticatedUser) {
    this.access.assertGlobalManager(user);
    const result = await this.prisma.examWindow.deleteMany({
      where: { id: examWindowId },
    });
    if (result.count === 0)
      throw new NotFoundException('Exam window not found.');
  }

  private async requireSemester(semesterId: string) {
    const semester = await this.prisma.semester.findUnique({
      where: { id: semesterId },
    });
    if (!semester) throw new NotFoundException('Semester not found.');
    return semester;
  }

  private assertDateRange(startDate: string, endDate: string, label: string) {
    if (parseIsoDate(endDate) < parseIsoDate(startDate)) {
      throw new BadRequestException(
        `${label[0]!.toUpperCase()}${label.slice(1)} end date must be on or after its start date.`,
      );
    }
  }

  private assertThresholds(onTrack: number, tight: number) {
    if (onTrack <= 0 || tight <= 0 || onTrack < tight) {
      throw new BadRequestException(
        'Progress thresholds must be positive and on-track cannot be below tight.',
      );
    }
  }

  private assertInsideSemester(
    dateText: string,
    semester: { startDate: Date; endDate: Date },
  ) {
    const date = parseIsoDate(dateText);
    if (date < semester.startDate || date > semester.endDate) {
      throw new BadRequestException('Date must be inside the semester.');
    }
  }

  private normalizedTeachingAllowed(type: CalendarDayType, requested: boolean) {
    if (type === CalendarDayType.EXTRA_WORKING_DAY) return true;
    if (
      type === CalendarDayType.HOLIDAY ||
      type === CalendarDayType.CAMPUS_CLOSED
    ) {
      return false;
    }
    return requested;
  }

  private assertExamDates(
    input: {
      startDate: string;
      endDate: string;
      syllabusDeadline: string;
    },
    semester: { startDate: Date; endDate: Date },
  ) {
    this.assertDateRange(input.startDate, input.endDate, 'exam');
    this.assertInsideSemester(input.startDate, semester);
    this.assertInsideSemester(input.endDate, semester);
    this.assertInsideSemester(input.syllabusDeadline, semester);
    if (parseIsoDate(input.syllabusDeadline) > parseIsoDate(input.startDate)) {
      throw new BadRequestException(
        'Syllabus deadline must be on or before the exam start date.',
      );
    }
  }

  private async assertNoExamOverlap(
    semesterId: string,
    startDate: string,
    endDate: string,
    excludeId?: string,
  ) {
    const overlap = await this.prisma.examWindow.findFirst({
      where: {
        semesterId,
        id: excludeId ? { not: excludeId } : undefined,
        startDate: { lte: parseIsoDate(endDate) },
        endDate: { gte: parseIsoDate(startDate) },
      },
      select: { id: true, name: true },
    });
    if (overlap) {
      throw new ConflictException(`Exam window overlaps with ${overlap.name}.`);
    }
  }
}
