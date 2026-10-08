import {
  CalendarDayType,
  ImportType,
  JobStatus,
  PrismaClient,
  ProgressStatus,
  ScheduleCalculationReason,
  SessionLogStatus,
  UserRole,
  UserStatus,
  WorkStatus,
} from '@prisma/client';

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

describe('PostgreSQL domain constraints', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a semester whose end date precedes its start date', async () => {
    const campus = await prisma.campus.create({
      data: {
        code: `DB-${runId}`.slice(0, 32),
        name: `Database test campus ${runId}`,
      },
    });

    await expect(
      prisma.semester.create({
        data: {
          campusId: campus.id,
          name: `Invalid dates ${runId}`,
          startDate: new Date('2026-12-15T00:00:00.000Z'),
          endDate: new Date('2026-07-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow();

    await prisma.campus.delete({ where: { id: campus.id } });
  });

  it('rejects a campus-scoped role without a campus', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Database Test Faculty',
        email: `database-test-${runId}@mirai.local`,
        status: UserStatus.ACTIVE,
      },
    });

    await expect(
      prisma.roleAssignment.create({
        data: {
          userId: user.id,
          role: UserRole.FACULTY,
          scopeKey: 'GLOBAL',
        },
      }),
    ).rejects.toThrow();

    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects duplicate calendar overrides for one semester date', async () => {
    const campus = await prisma.campus.create({
      data: {
        code: `CAL-${runId}`.slice(0, 32),
        name: `Calendar test campus ${runId}`,
      },
    });
    const semester = await prisma.semester.create({
      data: {
        campusId: campus.id,
        name: `Calendar test semester ${runId}`,
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-12-15T00:00:00.000Z'),
      },
    });
    const date = new Date('2026-08-15T00:00:00.000Z');

    await prisma.calendarDayOverride.create({
      data: {
        semesterId: semester.id,
        date,
        type: CalendarDayType.HOLIDAY,
        title: 'First override',
      },
    });
    await expect(
      prisma.calendarDayOverride.create({
        data: {
          semesterId: semester.id,
          date,
          type: CalendarDayType.EVENT,
          title: 'Duplicate override',
        },
      }),
    ).rejects.toThrow();

    await prisma.semester.delete({ where: { id: semester.id } });
    await prisma.campus.delete({ where: { id: campus.id } });
  });

  it('rejects impossible import row totals', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Database Import Manager',
        email: `database-import-${runId}@mirai.local`,
        status: UserStatus.ACTIVE,
      },
    });

    await expect(
      prisma.importJob.create({
        data: {
          type: ImportType.FULL_SEMESTER,
          status: JobStatus.COMPLETED,
          uploadedById: user.id,
          fileName: 'invalid-counts.csv',
          totalRows: 1,
          successfulRows: 2,
          failedRows: 0,
        },
      }),
    ).rejects.toThrow();

    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects a timetable slot whose end time precedes its start time', async () => {
    const fixture = await createTimetableFixture('slot');

    await expect(
      prisma.timetableEntry.create({
        data: {
          offeringId: fixture.offering.id,
          weekday: 1,
          startTime: new Date('1970-01-01T11:00:00.000Z'),
          endTime: new Date('1970-01-01T10:00:00.000Z'),
          effectiveFrom: fixture.semester.startDate,
          effectiveTo: fixture.semester.endDate,
        },
      }),
    ).rejects.toThrow();

    await removeTimetableFixture(fixture);
  });

  it('rejects a scheduled session whose end precedes its start', async () => {
    const fixture = await createTimetableFixture('session');

    await expect(
      prisma.scheduledSession.create({
        data: {
          sourceKey: `database-test:${runId}:invalid-session`,
          offeringId: fixture.offering.id,
          sessionDate: new Date('2026-08-03T00:00:00.000Z'),
          startsAt: new Date('2026-08-03T05:30:00.000Z'),
          endsAt: new Date('2026-08-03T04:30:00.000Z'),
        },
      }),
    ).rejects.toThrow();

    await removeTimetableFixture(fixture);
  });

  it('rejects a lesson-plan topic with non-positive planned minutes', async () => {
    const fixture = await createTimetableFixture('topic-minutes');
    const plan = await prisma.lessonPlan.create({
      data: {
        offeringId: fixture.offering.id,
        version: 1,
        uploadedById: fixture.user.id,
      },
    });
    const unit = await prisma.unit.create({
      data: {
        lessonPlanId: plan.id,
        sequence: 1,
        title: 'Database test unit',
      },
    });

    await expect(
      prisma.topic.create({
        data: {
          unitId: unit.id,
          sequence: 1,
          title: 'Invalid duration',
          plannedMinutes: 0,
        },
      }),
    ).rejects.toThrow();

    await removeTimetableFixture(fixture);
  });

  it('rejects duplicate unit sequences inside one lesson-plan version', async () => {
    const fixture = await createTimetableFixture('unit-sequence');
    const plan = await prisma.lessonPlan.create({
      data: {
        offeringId: fixture.offering.id,
        version: 1,
        uploadedById: fixture.user.id,
      },
    });
    await prisma.unit.create({
      data: { lessonPlanId: plan.id, sequence: 1, title: 'First unit' },
    });

    await expect(
      prisma.unit.create({
        data: { lessonPlanId: plan.id, sequence: 1, title: 'Duplicate unit' },
      }),
    ).rejects.toThrow();

    await removeTimetableFixture(fixture);
  });

  it('rejects a topic schedule with zero allocated minutes', async () => {
    const fixture = await createTopicScheduleFixture('schedule-minutes');

    await expect(
      prisma.topicSchedule.create({
        data: {
          scheduleVersionId: fixture.scheduleVersion.id,
          topicId: fixture.topic.id,
          plannedStartDate: new Date('2026-08-03T00:00:00.000Z'),
          plannedFinishDate: new Date('2026-08-03T00:00:00.000Z'),
          allocatedMinutes: 0,
        },
      }),
    ).rejects.toThrow();

    await removeTimetableFixture(fixture);
  });

  it('rejects a duplicate topic inside one schedule version', async () => {
    const fixture = await createTopicScheduleFixture('schedule-topic');
    const data = {
      scheduleVersionId: fixture.scheduleVersion.id,
      topicId: fixture.topic.id,
      plannedStartDate: new Date('2026-08-03T00:00:00.000Z'),
      plannedFinishDate: new Date('2026-08-05T00:00:00.000Z'),
      allocatedMinutes: 90,
    };
    await prisma.topicSchedule.create({ data });

    await expect(prisma.topicSchedule.create({ data })).rejects.toThrow();

    await removeTimetableFixture(fixture);
  });

  it('rejects a session log completion percentage above 100', async () => {
    const fixture = await createSessionLogFixture('log-percentage');

    await expect(
      prisma.sessionLog.create({
        data: {
          scheduledSessionId: fixture.session.id,
          revision: 1,
          status: SessionLogStatus.COMPLETED,
          overallCompletionPercentage: 101,
          coveredSummary: 'Invalid completion',
          classworkStatus: WorkStatus.NOT_ASSIGNED,
          homeworkStatus: WorkStatus.NOT_ASSIGNED,
          loggedById: fixture.user.id,
        },
      }),
    ).rejects.toThrow();

    await removeTimetableFixture(fixture);
  });

  it('rejects duplicate revisions for one scheduled session', async () => {
    const fixture = await createSessionLogFixture('log-revision');
    const data = {
      scheduledSessionId: fixture.session.id,
      revision: 1,
      status: SessionLogStatus.COMPLETED,
      overallCompletionPercentage: 100,
      coveredSummary: 'Arrays',
      classworkStatus: WorkStatus.NOT_ASSIGNED,
      homeworkStatus: WorkStatus.NOT_ASSIGNED,
      loggedById: fixture.user.id,
    };
    await prisma.sessionLog.create({ data });

    await expect(prisma.sessionLog.create({ data })).rejects.toThrow();

    await removeTimetableFixture(fixture);
  });

  it('rejects a topic progress update that moves backwards', async () => {
    const fixture = await createSessionLogFixture('topic-direction');
    const log = await prisma.sessionLog.create({
      data: {
        scheduledSessionId: fixture.session.id,
        revision: 1,
        status: SessionLogStatus.IN_PROGRESS,
        overallCompletionPercentage: 50,
        coveredSummary: 'Arrays in progress',
        classworkStatus: WorkStatus.NOT_ASSIGNED,
        homeworkStatus: WorkStatus.NOT_ASSIGNED,
        loggedById: fixture.user.id,
      },
    });

    await expect(
      prisma.sessionTopicUpdate.create({
        data: {
          sessionLogId: log.id,
          topicId: fixture.topic.id,
          completionBeforePercentage: 60,
          completionAfterPercentage: 50,
          minutesUsed: 30,
        },
      }),
    ).rejects.toThrow();

    await removeTimetableFixture(fixture);
  });

  it('stores a negative pace when a subject is behind plan', async () => {
    const fixture = await createTimetableFixture('negative-pace');

    const snapshot = await prisma.progressSnapshot.create({
      data: {
        offeringId: fixture.offering.id,
        asOfDate: new Date('2026-10-08T00:00:00.000Z'),
        calculationVersion: 1,
        hoursInScopeMinutes: 360,
        coveredMinutes: 210,
        remainingMinutes: 150,
        availableMinutes: 180,
        coveragePercentage: 58.33,
        bufferRatio: 1.2,
        paceMinutes: -30,
        status: ProgressStatus.ON_TRACK,
      },
    });

    expect(Number(snapshot.paceMinutes)).toBe(-30);
    await removeTimetableFixture(fixture);
  });

  it('rejects inconsistent progress snapshot totals', async () => {
    const fixture = await createTimetableFixture('progress-totals');

    await expect(
      prisma.progressSnapshot.create({
        data: {
          offeringId: fixture.offering.id,
          asOfDate: new Date('2026-10-08T00:00:00.000Z'),
          calculationVersion: 1,
          hoursInScopeMinutes: 300,
          coveredMinutes: 240,
          remainingMinutes: 120,
          availableMinutes: 180,
          coveragePercentage: 80,
          bufferRatio: 1.5,
          paceMinutes: 0,
          status: ProgressStatus.ON_TRACK,
        },
      }),
    ).rejects.toThrow();

    await removeTimetableFixture(fixture);
  });

  it('rejects duplicate progress calculation versions for one date', async () => {
    const fixture = await createTimetableFixture('progress-version');
    const data = {
      offeringId: fixture.offering.id,
      asOfDate: new Date('2026-10-08T00:00:00.000Z'),
      calculationVersion: 1,
      hoursInScopeMinutes: 300,
      coveredMinutes: 180,
      remainingMinutes: 120,
      availableMinutes: 180,
      coveragePercentage: 60,
      bufferRatio: 1.5,
      paceMinutes: 0,
      status: ProgressStatus.ON_TRACK,
    };
    await prisma.progressSnapshot.create({ data });

    await expect(prisma.progressSnapshot.create({ data })).rejects.toThrow();

    await removeTimetableFixture(fixture);
  });
});

async function createTopicScheduleFixture(label: string) {
  const fixture = await createTimetableFixture(label);
  const plan = await prisma.lessonPlan.create({
    data: {
      offeringId: fixture.offering.id,
      version: 1,
      uploadedById: fixture.user.id,
    },
  });
  const unit = await prisma.unit.create({
    data: {
      lessonPlanId: plan.id,
      sequence: 1,
      title: 'Database schedule unit',
    },
  });
  const topic = await prisma.topic.create({
    data: {
      unitId: unit.id,
      sequence: 1,
      title: 'Database schedule topic',
      plannedMinutes: 90,
    },
  });
  const scheduleVersion = await prisma.topicScheduleVersion.create({
    data: {
      offeringId: fixture.offering.id,
      version: 1,
      reason: ScheduleCalculationReason.INITIAL,
    },
  });
  return { ...fixture, plan, unit, topic, scheduleVersion };
}

async function createSessionLogFixture(label: string) {
  const fixture = await createTopicScheduleFixture(label);
  const session = await prisma.scheduledSession.create({
    data: {
      sourceKey: `database-test:${runId}:${label}`,
      offeringId: fixture.offering.id,
      sessionDate: new Date('2026-10-08T00:00:00.000Z'),
      startsAt: new Date('2026-10-08T03:30:00.000Z'),
      endsAt: new Date('2026-10-08T04:30:00.000Z'),
    },
  });
  return { ...fixture, session };
}

async function createTimetableFixture(label: string) {
  const user = await prisma.user.create({
    data: {
      name: `Timetable ${label} user`,
      email: `database-${label}-${runId}@mirai.local`,
      status: UserStatus.ACTIVE,
    },
  });
  const campus = await prisma.campus.create({
    data: {
      code: `TT-${label}-${runId}`.slice(0, 32),
      name: `Timetable ${label} campus ${runId}`,
    },
  });
  const track = await prisma.track.create({
    data: {
      code: `TT-${label}-${runId}`.slice(0, 32),
      name: `Timetable ${label} track ${runId}`,
    },
  });
  const semester = await prisma.semester.create({
    data: {
      campusId: campus.id,
      name: `Timetable ${label} semester ${runId}`,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-12-15T00:00:00.000Z'),
    },
  });
  const batch = await prisma.batch.create({
    data: {
      semesterId: semester.id,
      trackId: track.id,
      code: `B-${label}`,
      name: `Timetable ${label} batch`,
    },
  });
  const subject = await prisma.subject.create({
    data: {
      code: `SUB-${label}-${runId}`.slice(0, 64),
      name: `Timetable ${label} subject`,
    },
  });
  const offering = await prisma.subjectOffering.create({
    data: {
      batchId: batch.id,
      subjectId: subject.id,
      targetFinishDate: new Date('2026-11-30T00:00:00.000Z'),
    },
  });
  return { user, campus, track, semester, batch, subject, offering };
}

async function removeTimetableFixture(
  fixture: Awaited<ReturnType<typeof createTimetableFixture>>,
) {
  await prisma.subjectOffering.delete({ where: { id: fixture.offering.id } });
  await prisma.subject.delete({ where: { id: fixture.subject.id } });
  await prisma.batch.delete({ where: { id: fixture.batch.id } });
  await prisma.semester.delete({ where: { id: fixture.semester.id } });
  await prisma.track.delete({ where: { id: fixture.track.id } });
  await prisma.campus.delete({ where: { id: fixture.campus.id } });
  await prisma.user.delete({ where: { id: fixture.user.id } });
}
