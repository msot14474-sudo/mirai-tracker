import {
  AlertStatus,
  AlertType,
  NotificationChannel,
  NotificationStatus,
  Prisma,
  ScheduledSessionStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { MissedLogAlertService } from './missed-log-alert.service';

describe('MissedLogAlertService', () => {
  it('sends a faculty reminder at the campus end of day', async () => {
    const { service, prisma, email } = setup();
    prisma.scheduledSession.findMany.mockResolvedValue([session()]);

    const result = await service.processDue(
      AlertType.FACULTY_MISSED_LOG,
      new Date('2026-10-08T18:30:00.000Z'),
    );

    expect(result).toMatchObject({ due: 1, sent: 1, skipped: 0, failed: 0 });
    expect(prisma.missedLogAlert.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deduplicationKey: 'FACULTY_MISSED_LOG:session-a:faculty-user',
        },
        create: expect.objectContaining({
          dueAt: new Date('2026-10-08T18:29:59.999Z'),
          recipientUserId: 'faculty-user',
        }),
      }),
    );
    expect(email.sendMissedLog).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'faculty@mirai.local',
        kind: 'faculty-reminder',
        subjectCode: 'CS-DSA',
      }),
    );
  });

  it('does not create a faculty reminder before end of day', async () => {
    const { service, prisma, email } = setup();
    prisma.scheduledSession.findMany.mockResolvedValue([session()]);

    const result = await service.processDue(
      AlertType.FACULTY_MISSED_LOG,
      new Date('2026-10-08T18:29:59.998Z'),
    );

    expect(result).toMatchObject({ due: 0, sent: 0 });
    expect(prisma.missedLogAlert.upsert).not.toHaveBeenCalled();
    expect(email.sendMissedLog).not.toHaveBeenCalled();
  });

  it('notifies the campus manager once the class is 48 hours overdue', async () => {
    const { service, prisma, email } = setup();
    prisma.scheduledSession.findMany.mockResolvedValue([session()]);
    prisma.roleAssignment.findMany.mockResolvedValue([
      {
        user: {
          id: 'manager-user',
          name: 'Campus Manager',
          email: 'manager@mirai.local',
        },
      },
    ]);

    const result = await service.processDue(
      AlertType.CAMPUS_MANAGER_ESCALATION,
      new Date('2026-10-10T10:00:00.000Z'),
    );

    expect(result).toMatchObject({ due: 1, sent: 1 });
    expect(prisma.roleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          campusId: 'campus-a',
          role: UserRole.CAMPUS_MANAGER,
        }),
      }),
    );
    expect(email.sendMissedLog).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'manager@mirai.local',
        kind: 'manager-escalation',
      }),
    );
  });

  it('skips a delivery already recorded as sent', async () => {
    const { service, prisma, email } = setup({
      alert: alert({
        status: AlertStatus.SENT,
        deliveries: [
          {
            channel: NotificationChannel.EMAIL,
            status: NotificationStatus.SENT,
          },
        ],
      }),
    });
    prisma.scheduledSession.findMany.mockResolvedValue([session()]);

    const result = await service.processDue(
      AlertType.FACULTY_MISSED_LOG,
      new Date('2026-10-08T18:30:00.000Z'),
    );

    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(email.sendMissedLog).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.upsert).not.toHaveBeenCalled();
  });

  it('records SMTP failures without creating duplicate attempts', async () => {
    const { service, prisma, email } = setup();
    prisma.scheduledSession.findMany.mockResolvedValue([session()]);
    email.sendMissedLog.mockRejectedValue(new Error('SMTP unavailable'));

    const result = await service.processDue(
      AlertType.FACULTY_MISSED_LOG,
      new Date('2026-10-08T18:30:00.000Z'),
    );

    expect(result.failed).toBe(1);
    expect(prisma.missedLogAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AlertStatus.FAILED,
          lastError: 'SMTP unavailable',
        }),
      }),
    );
  });

  it('retries a failed email after the retry delay', async () => {
    const { service, prisma, email } = setup({
      alert: alert({
        status: AlertStatus.FAILED,
        deliveries: [
          {
            channel: NotificationChannel.EMAIL,
            status: NotificationStatus.FAILED,
            attemptNumber: 1,
            scheduledAt: new Date('2026-10-08T18:30:00Z'),
          },
        ],
      }),
    });
    prisma.scheduledSession.findMany.mockResolvedValue([session()]);
    const result = await service.processDue(
      AlertType.FACULTY_MISSED_LOG,
      new Date('2026-10-08T18:36:00Z'),
    );
    expect(result.sent).toBe(1);
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attemptNumber: 2 }),
      }),
    );
    expect(email.sendMissedLog).toHaveBeenCalledTimes(1);
  });

  it('stops retrying after three attempts', async () => {
    const { service, prisma, email } = setup({
      alert: alert({
        status: AlertStatus.FAILED,
        deliveries: [
          {
            channel: NotificationChannel.EMAIL,
            status: NotificationStatus.FAILED,
            attemptNumber: 3,
            scheduledAt: new Date('2026-10-08T18:30:00Z'),
          },
        ],
      }),
    });
    prisma.scheduledSession.findMany.mockResolvedValue([session()]);
    await service.processDue(
      AlertType.FACULTY_MISSED_LOG,
      new Date('2026-10-08T18:36:00Z'),
    );
    expect(email.sendMissedLog).not.toHaveBeenCalled();
  });

  it('does not send when the faculty has logged since the scan', async () => {
    const { service, prisma, email } = setup();
    prisma.scheduledSession.findMany.mockResolvedValue([session()]);
    prisma.scheduledSession.findFirst.mockResolvedValue(null);
    await service.processDue(
      AlertType.FACULTY_MISSED_LOG,
      new Date('2026-10-08T18:36:00Z'),
    );
    expect(email.sendMissedLog).not.toHaveBeenCalled();
  });

  it('does not send a duplicate when another scan claims the same attempt', async () => {
    const { service, prisma, email } = setup();
    prisma.scheduledSession.findMany.mockResolvedValue([session()]);
    prisma.notificationDelivery.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique attempt', {
        code: 'P2002',
        clientVersion: '6',
      }),
    );
    const result = await service.processDue(
      AlertType.FACULTY_MISSED_LOG,
      new Date('2026-10-08T18:36:00Z'),
    );
    expect(result.skipped).toBe(1);
    expect(email.sendMissedLog).not.toHaveBeenCalled();
  });

  it('scans beyond the first 500 sessions so newer reminders are not starved', async () => {
    const { service, prisma } = setup({
      alert: alert({ status: AlertStatus.SENT }),
    });
    prisma.scheduledSession.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 500 }, (_, i) => ({
          ...session(),
          id: `session-${i}`,
        })),
      )
      .mockResolvedValueOnce([{ ...session(), id: 'session-500' }]);
    const result = await service.processDue(
      AlertType.FACULTY_MISSED_LOG,
      new Date('2026-10-08T18:36:00Z'),
    );
    expect(result.scanned).toBe(501);
    expect(prisma.scheduledSession.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: { id: 'session-499' }, skip: 1 }),
    );
  });

  it('queries only scheduled sessions with no log', async () => {
    const { service, prisma } = setup();
    prisma.scheduledSession.findMany.mockResolvedValue([]);

    await service.processDue(
      AlertType.FACULTY_MISSED_LOG,
      new Date('2026-10-08T18:30:00.000Z'),
    );

    expect(prisma.scheduledSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: ScheduledSessionStatus.SCHEDULED,
          endsAt: { lte: new Date('2026-10-08T18:30:00.000Z') },
          logs: { none: {} },
        },
      }),
    );
  });

  it('rejects a missing or incorrect worker secret', () => {
    const { service } = setup();
    const original = process.env.INTERNAL_JOB_SECRET;
    process.env.INTERNAL_JOB_SECRET = 'expected-secret';
    expect(() => service.assertInternalSecret(undefined)).toThrow(
      UnauthorizedException,
    );
    expect(() => service.assertInternalSecret('wrong-secret')).toThrow(
      UnauthorizedException,
    );
    expect(() => service.assertInternalSecret('expected-secret')).not.toThrow();
    if (original === undefined) delete process.env.INTERNAL_JOB_SECRET;
    else process.env.INTERNAL_JOB_SECRET = original;
  });

  it('returns only the authenticated recipient alert history', async () => {
    const { service, prisma } = setup();
    prisma.missedLogAlert.findMany.mockResolvedValue([
      {
        ...alert({ status: AlertStatus.SENT }),
        dueAt: new Date('2026-10-08T18:29:59.999Z'),
        sentAt: new Date('2026-10-08T18:30:00.000Z'),
        deliveries: [
          {
            channel: NotificationChannel.EMAIL,
            status: NotificationStatus.SENT,
            sentAt: new Date('2026-10-08T18:30:00.000Z'),
            deliveredAt: null,
            createdAt: new Date('2026-10-08T18:30:00.000Z'),
          },
        ],
        scheduledSession: session(),
      },
    ]);

    const result = await service.listMine({
      id: 'faculty-user',
      name: 'Faculty',
      email: 'faculty@mirai.local',
      roles: [{ role: UserRole.FACULTY, campusId: 'campus-a' }],
      staffProfileId: 'staff-a',
      studentProfile: null,
    });

    expect(prisma.missedLogAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientUserId: 'faculty-user' } }),
    );
    expect(result.summary).toMatchObject({ total: 1, facultyReminders: 1 });
    expect(result.alerts[0]).toMatchObject({
      subject: { code: 'CS-DSA' },
      batch: { code: 'MIRAI-A' },
      session: { date: '2026-10-08' },
    });
  });
});

function setup(options: { alert?: ReturnType<typeof alert> } = {}) {
  const prisma = {
    scheduledSession: {
      findMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({ id: 'session-a' }),
    },
    roleAssignment: { findMany: jest.fn() },
    missedLogAlert: {
      upsert: jest.fn().mockResolvedValue(options.alert ?? alert()),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn(),
    },
    notificationDelivery: {
      create: jest.fn().mockResolvedValue({ id: 'delivery-email' }),
      upsert: jest
        .fn()
        .mockResolvedValueOnce({ id: 'delivery-in-app' })
        .mockResolvedValueOnce({ id: 'delivery-email' }),
      update: jest.fn().mockResolvedValue({}),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest
      .fn()
      .mockImplementation(async (operations) => Promise.all(operations)),
  };
  const email = {
    sendMissedLog: jest.fn().mockResolvedValue({ messageId: 'mail-a' }),
  };
  return {
    prisma,
    email,
    service: new MissedLogAlertService(prisma as never, email as never),
  };
}

function alert(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-a',
    type: AlertType.FACULTY_MISSED_LOG,
    status: AlertStatus.PENDING,
    recipientUserId: 'faculty-user',
    deliveries: [],
    ...overrides,
  };
}

function session() {
  const facultyUser = {
    id: 'faculty-user',
    name: 'Sample Faculty',
    email: 'faculty@mirai.local',
    status: UserStatus.ACTIVE,
  };
  return {
    id: 'session-a',
    sessionDate: new Date('2026-10-08T00:00:00.000Z'),
    startsAt: new Date('2026-10-08T08:30:00.000Z'),
    endsAt: new Date('2026-10-08T10:00:00.000Z'),
    status: ScheduledSessionStatus.SCHEDULED,
    logs: [],
    facultyAssignment: {
      staffProfile: { user: facultyUser },
    },
    offering: {
      subject: { id: 'subject-a', code: 'CS-DSA', name: 'Data Structures' },
      batch: {
        id: 'batch-a',
        code: 'MIRAI-A',
        name: 'Mirai Batch A',
        semester: {
          campus: {
            id: 'campus-a',
            code: 'HI-TECH',
            name: 'HI-Tech Campus',
            timezone: 'Asia/Kolkata',
          },
        },
      },
      faculty: [
        {
          active: true,
          startDate: new Date('2026-07-01T00:00:00.000Z'),
          endDate: null,
          staffProfile: { user: facultyUser },
        },
      ],
    },
  };
}
