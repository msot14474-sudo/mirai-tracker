import {
  CalendarDayType,
  ExamType,
  SemesterStatus,
  UserRole,
  WorkingSaturdayRule,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { AcademicCalendarService } from './academic-calendar.service';

const programManager: AuthenticatedUser = {
  id: 'manager-a',
  name: 'Program Manager',
  email: 'admin@mirai.local',
  roles: [{ role: UserRole.PROGRAM_MANAGER, campusId: null }],
  staffProfileId: null,
  studentProfile: null,
};

const semester = {
  id: 'semester-a',
  campusId: 'campus-a',
  name: 'Semester 2026',
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2026-03-31T00:00:00.000Z'),
  workingSaturdayRule: WorkingSaturdayRule.SECOND_AND_FOURTH,
  defaultOnTrackThreshold: 1.15,
  defaultTightThreshold: 1,
  status: SemesterStatus.DRAFT,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AcademicCalendarService', () => {
  const prisma = {
    campus: { findUnique: jest.fn(), findMany: jest.fn() },
    semester: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    calendarDayOverride: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    examWindow: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    subject: { findMany: jest.fn(), create: jest.fn() },
  };
  const access = {
    isGlobalManager: jest.fn().mockReturnValue(true),
    assertGlobalManager: jest.fn(),
    assertCanViewCampus: jest.fn(),
  };
  const timetable = {
    regenerateSemester: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AcademicCalendarService(
    prisma as never,
    access as never,
    timetable as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    access.isGlobalManager.mockReturnValue(true);
    prisma.campus.findUnique.mockResolvedValue({ id: 'campus-a' });
    prisma.semester.findUnique.mockResolvedValue(semester);
    prisma.examWindow.findFirst.mockResolvedValue(null);
  });

  it('regenerates the semester after holiday creation, editing and deletion', async () => {
    const day = {
      id: 'day-a',
      semesterId: semester.id,
      semester,
      date: new Date('2026-01-05'),
      type: CalendarDayType.HOLIDAY,
      teachingAllowed: false,
    };
    prisma.calendarDayOverride.create.mockResolvedValue(day);
    prisma.calendarDayOverride.findUnique.mockResolvedValue(day);
    prisma.calendarDayOverride.update.mockResolvedValue(day);
    prisma.calendarDayOverride.deleteMany.mockResolvedValue({ count: 1 });
    await service.createCalendarDay(
      semester.id,
      {
        date: '2026-01-05',
        type: CalendarDayType.HOLIDAY,
        title: 'Holiday',
        teachingAllowed: false,
      },
      programManager,
    );
    await service.updateCalendarDay(
      day.id,
      { teachingAllowed: true, type: CalendarDayType.EVENT },
      programManager,
    );
    await service.deleteCalendarDay(day.id, programManager);
    expect(timetable.regenerateSemester).toHaveBeenCalledTimes(3);
    expect(timetable.regenerateSemester).toHaveBeenLastCalledWith(
      semester.id,
      programManager,
    );
  });

  it('regenerates when semester dates or Saturday rules change', async () => {
    prisma.calendarDayOverride.findFirst.mockResolvedValue(null);
    prisma.semester.update.mockResolvedValue(semester);
    await service.updateSemester(
      semester.id,
      { workingSaturdayRule: WorkingSaturdayRule.ALL, endDate: '2026-04-30' },
      programManager,
    );
    expect(timetable.regenerateSemester).toHaveBeenCalledWith(
      semester.id,
      programManager,
    );
  });

  it('rejects a semester whose end date precedes its start date', async () => {
    await expect(
      service.createSemester(
        'campus-a',
        {
          name: 'Invalid semester',
          startDate: '2026-03-31',
          endDate: '2026-01-01',
          workingSaturdayRule: WorkingSaturdayRule.NONE,
          defaultOnTrackThreshold: 1.15,
          defaultTightThreshold: 1,
          status: SemesterStatus.DRAFT,
        },
        programManager,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.semester.create).not.toHaveBeenCalled();
  });

  it('lists active subjects for a global manager', async () => {
    prisma.subject.findMany.mockResolvedValueOnce([
      {
        id: 'subject-a',
        code: 'CS-DSA',
        name: 'Data Structures and Algorithms',
        description: null,
        active: true,
      },
    ]);

    await expect(service.listSubjects(programManager)).resolves.toHaveLength(1);
    expect(access.assertGlobalManager).toHaveBeenCalledWith(programManager);
    expect(prisma.subject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
  });

  it('creates a subject in the shared catalog', async () => {
    const created = {
      id: 'subject-a',
      code: 'CS-DSA',
      name: 'Data Structures and Algorithms',
      description: 'Core subject',
      active: true,
    };
    prisma.subject.create.mockResolvedValueOnce(created);

    await expect(
      service.createSubject(
        {
          code: created.code,
          name: created.name,
          description: created.description,
        },
        programManager,
      ),
    ).resolves.toEqual(created);
    expect(access.assertGlobalManager).toHaveBeenCalledWith(programManager);
    expect(prisma.subject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          code: created.code,
          name: created.name,
          description: created.description,
        },
      }),
    );
  });

  it('normalizes an extra working day to teaching allowed', async () => {
    prisma.calendarDayOverride.create.mockResolvedValue({ id: 'day-a' });
    await service.createCalendarDay(
      'semester-a',
      {
        date: '2026-01-04',
        type: CalendarDayType.EXTRA_WORKING_DAY,
        title: 'Recovery class',
        teachingAllowed: false,
      },
      programManager,
    );

    expect(prisma.calendarDayOverride.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ teachingAllowed: true }),
    });
  });

  it('rejects a calendar override outside the semester', async () => {
    await expect(
      service.createCalendarDay(
        'semester-a',
        {
          date: '2026-04-01',
          type: CalendarDayType.HOLIDAY,
          title: 'Outside date',
          teachingAllowed: false,
        },
        programManager,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a syllabus deadline after the exam starts', async () => {
    await expect(
      service.createExamWindow(
        'semester-a',
        {
          name: 'Mid-term',
          type: ExamType.MID_TERM,
          startDate: '2026-02-10',
          endDate: '2026-02-15',
          syllabusDeadline: '2026-02-11',
        },
        programManager,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects overlapping exam windows', async () => {
    prisma.examWindow.findFirst.mockResolvedValueOnce({
      id: 'exam-existing',
      name: 'Sessional',
    });

    await expect(
      service.createExamWindow(
        'semester-a',
        {
          name: 'Mid-term',
          type: ExamType.MID_TERM,
          startDate: '2026-02-10',
          endDate: '2026-02-15',
          syllabusDeadline: '2026-02-09',
        },
        programManager,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('propagates the global-manager permission boundary', async () => {
    access.assertGlobalManager.mockImplementationOnce(() => {
      throw new ForbiddenException();
    });

    await expect(
      service.createCalendarDay(
        'semester-a',
        {
          date: '2026-01-05',
          type: CalendarDayType.HOLIDAY,
          title: 'Restricted change',
          teachingAllowed: false,
        },
        programManager,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.semester.findUnique).not.toHaveBeenCalled();
  });
});
