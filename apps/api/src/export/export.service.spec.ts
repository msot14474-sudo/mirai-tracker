import { ExportType, JobStatus, SessionLogStatus } from '@prisma/client';
import { ExportService } from './export.service';

const user = {
  id: 'user-manager',
  name: 'Program Manager',
  email: 'manager@mirai.local',
  roles: [{ role: 'PROGRAM_MANAGER', campusId: null }],
  staffProfileId: null,
  studentProfile: null,
} as never;

describe('ExportService', () => {
  const access = { assertGlobalManager: jest.fn() };
  const progress = {
    dashboard: jest.fn(),
    list: jest.fn(),
  };
  const prisma = {
    exportJob: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
    scheduledSession: { findMany: jest.fn() },
    $transaction: jest.fn(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
  };
  let service: ExportService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.exportJob.create.mockResolvedValue({ id: 'export-1' });
    prisma.exportJob.update.mockResolvedValue({});
    prisma.auditEvent.create.mockResolvedValue({});
    service = new ExportService(
      prisma as never,
      access as never,
      progress as never,
    );
  });

  it('exports campus roll-ups and completes an audited export job', async () => {
    progress.dashboard.mockResolvedValue({
      campuses: [
        {
          code: 'HI-TECH',
          name: 'HI-Tech Campus',
          subjectCount: 3,
          hoursInScope: 20,
          coveredHours: 12,
          coveragePercentage: 60,
          remainingHours: 8,
          availableHours: 10,
          plannedHoursByToday: 13,
          paceVsPlanHours: -1,
          bufferRatio: 1.25,
          overdueTopics: 2,
          statusCounts: { ON_TRACK: 1, TIGHT: 1, DANGER: 1, COMPLETE: 0 },
          status: 'DANGER',
        },
      ],
    });

    const result = await service.generate(
      { type: ExportType.CAMPUS_PROGRESS, asOf: '2026-10-08' },
      user,
    );

    expect(result.filename).toBe('mirai-campus-progress-2026-10-08.csv');
    expect(result.content.toString('utf8')).toContain('HI-TECH,HI-Tech Campus');
    expect(prisma.exportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'export-1' },
        data: expect.objectContaining({ status: JobStatus.COMPLETED }),
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'EXPORT',
          entityId: 'export-1',
        }),
      }),
    );
  });

  it('counts only logged teaching as taken visiting-faculty lectures', async () => {
    const base = {
      offeringId: 'offering-1',
      startsAt: new Date('2026-09-01T03:30:00.000Z'),
      endsAt: new Date('2026-09-01T04:30:00.000Z'),
      facultyAssignment: {
        staffProfile: {
          id: 'staff-1',
          employeeCode: 'VF-7',
          user: { name: 'Visiting Faculty', email: 'visitor@example.edu' },
        },
      },
      offering: {
        subject: { code: 'CS-101', name: 'Computing' },
        batch: {
          code: 'B-1',
          track: { code: 'CSE', name: 'Computer Science' },
          semester: { campus: { code: 'HI-TECH', name: 'HI-Tech Campus' } },
        },
      },
    };
    prisma.scheduledSession.findMany.mockResolvedValue([
      { ...base, logs: [{ status: SessionLogStatus.COMPLETED }] },
      {
        ...base,
        startsAt: new Date('2026-09-08T03:30:00.000Z'),
        endsAt: new Date('2026-09-08T05:00:00.000Z'),
        logs: [],
      },
    ]);

    const result = await service.generate(
      {
        type: ExportType.VISITING_FACULTY_HONORARIUM,
        month: '2026-09',
        ratePerLecture: 1800,
      },
      user,
    );
    const csv = result.content.toString('utf8');

    expect(csv).toContain('planned_lectures,taken_lectures,taken_minutes');
    expect(csv).toContain('VF-7,2,1,60,1800,1800');
  });

  it('checks global-manager access before reading export history', async () => {
    access.assertGlobalManager.mockImplementationOnce(() => {
      throw new Error('forbidden');
    });
    await expect(service.history(user)).rejects.toThrow('forbidden');
    expect(prisma.exportJob.findMany).not.toHaveBeenCalled();
  });
});
