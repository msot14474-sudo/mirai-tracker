import {
  CalendarDayType,
  ExamType,
  FacultyAssignmentType,
  LessonPlanStatus,
  PrismaClient,
  ProgressStatus,
  ScheduleCalculationReason,
  ScheduledSessionStatus,
  SessionLogStatus,
  StaffType,
  SubjectOfferingStatus,
  TopicStatus,
  UserRole,
  UserStatus,
  WorkStatus,
  WorkingSaturdayRule,
} from '@prisma/client';
import { calculateSubjectProgress } from '@mirai/calculations';
import { hashPassword } from '../src/auth/password';
import {
  buildTimetableSessions,
  timetableTime,
} from '../src/timetable/timetable-engine';
import { sampleLessonPlanRows } from '../src/lesson-plan/lesson-plan.template';
import { calculateTopicSchedule } from '../src/topic-schedule/topic-schedule.engine';

const prisma = new PrismaClient();

async function setDemoPassword(userId: string, password: string) {
  const credential = await hashPassword(password);

  await prisma.passwordCredential.upsert({
    where: { userId },
    update: credential,
    create: { userId, ...credential },
  });
}

async function main() {
  const demoPassword = process.env.DEMO_USER_PASSWORD;
  if (!demoPassword || demoPassword.length < 12) {
    throw new Error('DEMO_USER_PASSWORD must contain at least 12 characters.');
  }

  const campus = await prisma.campus.upsert({
    where: { code: 'HI-TECH' },
    update: {},
    create: { code: 'HI-TECH', name: 'HI-Tech' },
  });

  const track = await prisma.track.upsert({
    where: { code: 'MIRAI' },
    update: {},
    create: { code: 'MIRAI', name: 'Mirai Track' },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@mirai.local' },
    update: {},
    create: {
      name: 'Local Program Manager',
      email: 'admin@mirai.local',
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.roleAssignment.upsert({
    where: {
      userId_role_scopeKey: {
        userId: admin.id,
        role: UserRole.PROGRAM_MANAGER,
        scopeKey: 'GLOBAL',
      },
    },
    update: {},
    create: {
      userId: admin.id,
      role: UserRole.PROGRAM_MANAGER,
      scopeKey: 'GLOBAL',
    },
  });

  await setDemoPassword(admin.id, demoPassword);

  const campusManager = await prisma.user.upsert({
    where: { email: 'campus.manager@mirai.local' },
    update: {},
    create: {
      name: 'Local Campus Manager',
      email: 'campus.manager@mirai.local',
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.roleAssignment.upsert({
    where: {
      userId_role_scopeKey: {
        userId: campusManager.id,
        role: UserRole.CAMPUS_MANAGER,
        scopeKey: campus.id,
      },
    },
    update: {},
    create: {
      userId: campusManager.id,
      role: UserRole.CAMPUS_MANAGER,
      campusId: campus.id,
      scopeKey: campus.id,
    },
  });

  await setDemoPassword(campusManager.id, demoPassword);

  const semester = await prisma.semester.upsert({
    where: {
      campusId_name: { campusId: campus.id, name: 'Sample Semester 2026' },
    },
    update: {},
    create: {
      campusId: campus.id,
      name: 'Sample Semester 2026',
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-12-15T00:00:00.000Z'),
      workingSaturdayRule: WorkingSaturdayRule.SECOND_AND_FOURTH,
    },
  });

  const calendarDays = [
    {
      date: '2026-08-15',
      type: CalendarDayType.HOLIDAY,
      title: 'Independence Day',
      teachingAllowed: false,
    },
    {
      date: '2026-09-05',
      type: CalendarDayType.EVENT,
      title: 'Teachers Day Programme',
      teachingAllowed: false,
    },
    {
      date: '2026-10-02',
      type: CalendarDayType.HOLIDAY,
      title: 'Gandhi Jayanti',
      teachingAllowed: false,
    },
    {
      date: '2026-11-08',
      type: CalendarDayType.EXTRA_WORKING_DAY,
      title: 'Academic Recovery Day',
      teachingAllowed: true,
    },
  ];

  for (const day of calendarDays) {
    const { date: dateText, ...values } = day;
    const date = new Date(`${dateText}T00:00:00.000Z`);
    await prisma.calendarDayOverride.upsert({
      where: { semesterId_date: { semesterId: semester.id, date } },
      update: {
        type: values.type,
        title: values.title,
        teachingAllowed: values.teachingAllowed,
      },
      create: { semesterId: semester.id, date, ...values },
    });
  }

  const examWindows = [
    {
      name: 'Sample Mid-term 2026',
      type: ExamType.MID_TERM,
      startDate: '2026-10-12',
      endDate: '2026-10-16',
      syllabusDeadline: '2026-10-09',
    },
    {
      name: 'Sample End-term 2026',
      type: ExamType.END_TERM,
      startDate: '2026-12-07',
      endDate: '2026-12-12',
      syllabusDeadline: '2026-12-04',
    },
  ];

  const examWindowIds = new Map<string, string>();
  for (const exam of examWindows) {
    const savedExam = await prisma.examWindow.upsert({
      where: {
        semesterId_name: { semesterId: semester.id, name: exam.name },
      },
      update: {},
      create: {
        semesterId: semester.id,
        name: exam.name,
        type: exam.type,
        startDate: new Date(`${exam.startDate}T00:00:00.000Z`),
        endDate: new Date(`${exam.endDate}T00:00:00.000Z`),
        syllabusDeadline: new Date(`${exam.syllabusDeadline}T00:00:00.000Z`),
      },
    });
    examWindowIds.set(savedExam.name, savedExam.id);
  }

  const batch = await prisma.batch.upsert({
    where: {
      semesterId_code: { semesterId: semester.id, code: 'MIRAI-A' },
    },
    update: {},
    create: {
      semesterId: semester.id,
      trackId: track.id,
      code: 'MIRAI-A',
      name: 'Mirai Sample Batch A',
    },
  });

  const subject = await prisma.subject.upsert({
    where: { code: 'CS-DSA' },
    update: {},
    create: { code: 'CS-DSA', name: 'Data Structures and Algorithms' },
  });

  const offering = await prisma.subjectOffering.upsert({
    where: {
      batchId_subjectId: { batchId: batch.id, subjectId: subject.id },
    },
    update: {},
    create: {
      batchId: batch.id,
      subjectId: subject.id,
      targetFinishDate: new Date('2026-11-30T00:00:00.000Z'),
      status: SubjectOfferingStatus.ACTIVE,
    },
  });

  const studentUser = await prisma.user.upsert({
    where: { email: 'student@mirai.local' },
    update: {},
    create: {
      name: 'Sample Student',
      email: 'student@mirai.local',
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.studentProfile.upsert({
    where: { userId: studentUser.id },
    update: { batchId: batch.id },
    create: {
      userId: studentUser.id,
      studentCode: 'STU-SAMPLE-001',
      batchId: batch.id,
    },
  });

  await prisma.roleAssignment.upsert({
    where: {
      userId_role_scopeKey: {
        userId: studentUser.id,
        role: UserRole.STUDENT,
        scopeKey: campus.id,
      },
    },
    update: {},
    create: {
      userId: studentUser.id,
      role: UserRole.STUDENT,
      campusId: campus.id,
      scopeKey: campus.id,
    },
  });

  await setDemoPassword(studentUser.id, demoPassword);

  const facultyUser = await prisma.user.upsert({
    where: { email: 'faculty@mirai.local' },
    update: {},
    create: {
      name: 'Sample Faculty',
      email: 'faculty@mirai.local',
      status: UserStatus.ACTIVE,
    },
  });

  const faculty = await prisma.staffProfile.upsert({
    where: { userId: facultyUser.id },
    update: {},
    create: {
      userId: facultyUser.id,
      employeeCode: 'FAC-SAMPLE-001',
      staffType: StaffType.REGULAR,
    },
  });

  await prisma.roleAssignment.upsert({
    where: {
      userId_role_scopeKey: {
        userId: facultyUser.id,
        role: UserRole.FACULTY,
        scopeKey: campus.id,
      },
    },
    update: {},
    create: {
      userId: facultyUser.id,
      role: UserRole.FACULTY,
      campusId: campus.id,
      scopeKey: campus.id,
    },
  });

  await setDemoPassword(facultyUser.id, demoPassword);

  const facultyAssignment = await prisma.facultyAssignment.upsert({
    where: {
      offeringId_staffProfileId_startDate: {
        offeringId: offering.id,
        staffProfileId: faculty.id,
        startDate: semester.startDate,
      },
    },
    update: {},
    create: {
      offeringId: offering.id,
      staffProfileId: faculty.id,
      type: FacultyAssignmentType.PRIMARY,
      startDate: semester.startDate,
    },
  });

  const timetablePatterns = [
    { weekday: 1, startTime: '09:00', endTime: '10:00' },
    { weekday: 4, startTime: '14:00', endTime: '15:30' },
  ];
  const timetableEntries = [];

  for (const pattern of timetablePatterns) {
    const startTime = timetableTime(pattern.startTime);
    const entry = await prisma.timetableEntry.upsert({
      where: {
        offeringId_weekday_startTime_effectiveFrom: {
          offeringId: offering.id,
          weekday: pattern.weekday,
          startTime,
          effectiveFrom: semester.startDate,
        },
      },
      update: {
        endTime: timetableTime(pattern.endTime),
        effectiveTo: semester.endDate,
        facultyAssignmentId: facultyAssignment.id,
        active: true,
      },
      create: {
        offeringId: offering.id,
        facultyAssignmentId: facultyAssignment.id,
        weekday: pattern.weekday,
        startTime,
        endTime: timetableTime(pattern.endTime),
        effectiveFrom: semester.startDate,
        effectiveTo: semester.endDate,
      },
    });
    timetableEntries.push({
      id: entry.id,
      weekday: entry.weekday,
      startTime: pattern.startTime,
      endTime: pattern.endTime,
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-12-15',
      facultyAssignmentId: entry.facultyAssignmentId,
    });
  }

  const sessions = buildTimetableSessions({
    offeringId: offering.id,
    timezone: campus.timezone,
    semesterStart: '2026-07-01',
    semesterEnd: '2026-12-15',
    saturdayRule: semester.workingSaturdayRule,
    overrides: calendarDays.map((day) => ({
      date: day.date,
      type: day.type,
      title: day.title,
      teachingAllowed: day.teachingAllowed,
    })),
    entries: timetableEntries,
  });

  const seededSessions = [];
  for (const session of sessions) {
    const savedSession = await prisma.scheduledSession.upsert({
      where: { sourceKey: session.sourceKey },
      update: {
        timetableEntryId: session.timetableEntryId,
        facultyAssignmentId: session.facultyAssignmentId,
        sessionDate: new Date(`${session.sessionDate}T00:00:00.000Z`),
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        status: ScheduledSessionStatus.SCHEDULED,
        cancellationReason: null,
      },
      create: {
        sourceKey: session.sourceKey,
        offeringId: offering.id,
        timetableEntryId: session.timetableEntryId,
        facultyAssignmentId: session.facultyAssignmentId,
        sessionDate: new Date(`${session.sessionDate}T00:00:00.000Z`),
        startsAt: session.startsAt,
        endsAt: session.endsAt,
      },
    });
    seededSessions.push(savedSession);
  }

  const lessonPlan = await prisma.lessonPlan.upsert({
    where: { offeringId_version: { offeringId: offering.id, version: 1 } },
    update: {
      status: LessonPlanStatus.ACTIVE,
      approvedById: admin.id,
      approvedAt: new Date(),
      fileName: 'sample-m07-lesson-plan.xlsx',
    },
    create: {
      offeringId: offering.id,
      version: 1,
      status: LessonPlanStatus.ACTIVE,
      uploadedById: facultyUser.id,
      approvedById: admin.id,
      approvedAt: new Date(),
      fileName: 'sample-m07-lesson-plan.xlsx',
    },
  });

  const seededTopics = [];
  for (const row of sampleLessonPlanRows) {
    const [
      unitSequenceText,
      unitTitle,
      unitDescription,
      topicSequenceText,
      topicTitle,
      topicDescription,
      plannedMinutesText,
      examNamesText,
    ] = row;
    const unitSequence = Number(unitSequenceText);
    const topicSequence = Number(topicSequenceText);
    const unit = await prisma.unit.upsert({
      where: {
        lessonPlanId_sequence: {
          lessonPlanId: lessonPlan.id,
          sequence: unitSequence,
        },
      },
      update: { title: unitTitle, description: unitDescription || null },
      create: {
        lessonPlanId: lessonPlan.id,
        sequence: unitSequence,
        title: unitTitle,
        description: unitDescription || null,
      },
    });
    const topic = await prisma.topic.upsert({
      where: { unitId_sequence: { unitId: unit.id, sequence: topicSequence } },
      update: {
        title: topicTitle,
        description: topicDescription || null,
        plannedMinutes: Number(plannedMinutesText),
        status: TopicStatus.NOT_STARTED,
        currentCompletionPercentage: 0,
      },
      create: {
        unitId: unit.id,
        sequence: topicSequence,
        title: topicTitle,
        description: topicDescription || null,
        plannedMinutes: Number(plannedMinutesText),
      },
    });
    seededTopics.push({
      id: topic.id,
      unitSequence,
      topicSequence,
      unitTitle,
      title: topicTitle,
      requiredMinutes: Number(plannedMinutesText),
    });
    for (const examName of examNamesText.split('|')) {
      const examWindowId = examWindowIds.get(examName);
      if (!examWindowId)
        throw new Error(`Seed exam window not found: ${examName}`);
      await prisma.examScope.upsert({
        where: { examWindowId_topicId: { examWindowId, topicId: topic.id } },
        update: {},
        create: { examWindowId, topicId: topic.id },
      });
    }
  }

  const calculation = calculateTopicSchedule(
    seededTopics,
    seededSessions.map((session) => ({
      id: session.id,
      sessionDate: session.sessionDate,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      status: session.status,
    })),
  );
  const scheduleVersion = await prisma.topicScheduleVersion.upsert({
    where: { offeringId_version: { offeringId: offering.id, version: 1 } },
    update: { reason: ScheduleCalculationReason.INITIAL },
    create: {
      offeringId: offering.id,
      version: 1,
      reason: ScheduleCalculationReason.INITIAL,
    },
  });
  await prisma.$transaction([
    prisma.topicSchedule.deleteMany({
      where: { scheduleVersionId: scheduleVersion.id },
    }),
    prisma.topicSchedule.createMany({
      data: calculation.allocations.map((entry) => ({
        scheduleVersionId: scheduleVersion.id,
        topicId: entry.id,
        plannedStartDate: new Date(`${entry.plannedStartDate}T00:00:00.000Z`),
        plannedFinishDate: new Date(`${entry.plannedFinishDate}T00:00:00.000Z`),
        allocatedMinutes: entry.allocatedMinutes,
      })),
    }),
  ]);

  const sampleSession = seededSessions[0];
  const sampleTopic = seededTopics[0];
  if (!sampleSession || !sampleTopic) {
    throw new Error('Seed requires at least one session and one topic.');
  }
  const sampleMinutes = Math.round(
    (sampleSession.endsAt.getTime() - sampleSession.startsAt.getTime()) /
      60_000,
  );
  const sampleCompletion = Math.min(
    100,
    Math.round((sampleMinutes / sampleTopic.requiredMinutes) * 10_000) / 100,
  );
  const sessionLog = await prisma.sessionLog.upsert({
    where: {
      scheduledSessionId_revision: {
        scheduledSessionId: sampleSession.id,
        revision: 1,
      },
    },
    update: {
      status: SessionLogStatus.COMPLETED,
      overallCompletionPercentage: 100,
      coveredSummary: sampleTopic.title,
      leftOverSummary:
        sampleCompletion < 100 ? `Continue ${sampleTopic.title}` : null,
      carryForwardTopicId: sampleCompletion < 100 ? sampleTopic.id : null,
      classworkStatus: WorkStatus.ASSIGNED,
      homeworkStatus: WorkStatus.ASSIGNED,
      notes: 'Fictional M09 sample log.',
      loggedById: facultyUser.id,
    },
    create: {
      scheduledSessionId: sampleSession.id,
      revision: 1,
      status: SessionLogStatus.COMPLETED,
      overallCompletionPercentage: 100,
      coveredSummary: sampleTopic.title,
      leftOverSummary:
        sampleCompletion < 100 ? `Continue ${sampleTopic.title}` : null,
      carryForwardTopicId: sampleCompletion < 100 ? sampleTopic.id : null,
      classworkStatus: WorkStatus.ASSIGNED,
      homeworkStatus: WorkStatus.ASSIGNED,
      notes: 'Fictional M09 sample log.',
      loggedById: facultyUser.id,
    },
  });
  await prisma.sessionTopicUpdate.upsert({
    where: {
      sessionLogId_topicId: {
        sessionLogId: sessionLog.id,
        topicId: sampleTopic.id,
      },
    },
    update: {
      completionBeforePercentage: 0,
      completionAfterPercentage: sampleCompletion,
      minutesUsed: sampleMinutes,
    },
    create: {
      sessionLogId: sessionLog.id,
      topicId: sampleTopic.id,
      completionBeforePercentage: 0,
      completionAfterPercentage: sampleCompletion,
      minutesUsed: sampleMinutes,
    },
  });
  await prisma.topic.update({
    where: { id: sampleTopic.id },
    data: {
      currentCompletionPercentage: sampleCompletion,
      status:
        sampleCompletion >= 100
          ? TopicStatus.COMPLETED
          : TopicStatus.IN_PROGRESS,
    },
  });
  await prisma.scheduledSession.update({
    where: { id: sampleSession.id },
    data: { status: ScheduledSessionStatus.COMPLETED },
  });

  const progressAsOfDate = '2026-10-08';
  const progress = calculateSubjectProgress({
    asOfDate: progressAsOfDate,
    targetFinishDate: '2026-11-30',
    thresholds: {
      onTrack: Number(semester.defaultOnTrackThreshold),
      tight: Number(semester.defaultTightThreshold),
    },
    topics: seededTopics.map((topic, index) => {
      const planned = calculation.allocations.find(
        (entry) => entry.id === topic.id,
      );
      return {
        id: topic.id,
        title: topic.title,
        plannedMinutes: topic.requiredMinutes,
        status:
          index === 0
            ? sampleCompletion >= 100
              ? TopicStatus.COMPLETED
              : TopicStatus.IN_PROGRESS
            : TopicStatus.NOT_STARTED,
        completionPercentage: index === 0 ? sampleCompletion : 0,
        plannedFinishDate: planned?.plannedFinishDate ?? null,
      };
    }),
    sessions: seededSessions.map((session) => ({
      sessionDate: session.sessionDate.toISOString().slice(0, 10),
      plannedMinutes: Math.round(
        (session.endsAt.getTime() - session.startsAt.getTime()) / 60_000,
      ),
      status:
        session.id === sampleSession.id
          ? ScheduledSessionStatus.COMPLETED
          : session.status,
    })),
  });
  await prisma.progressSnapshot.upsert({
    where: {
      offeringId_asOfDate_calculationVersion: {
        offeringId: offering.id,
        asOfDate: new Date(`${progressAsOfDate}T00:00:00.000Z`),
        calculationVersion: 1,
      },
    },
    update: {
      hoursInScopeMinutes: progress.minutes.hoursInScope,
      coveredMinutes: progress.minutes.covered,
      remainingMinutes: progress.minutes.remaining,
      availableMinutes: progress.minutes.available,
      coveragePercentage: progress.coveragePercentage,
      bufferRatio: progress.bufferRatio,
      paceMinutes: progress.minutes.paceVsPlan,
      status: progress.status as ProgressStatus,
    },
    create: {
      offeringId: offering.id,
      asOfDate: new Date(`${progressAsOfDate}T00:00:00.000Z`),
      calculationVersion: 1,
      hoursInScopeMinutes: progress.minutes.hoursInScope,
      coveredMinutes: progress.minutes.covered,
      remainingMinutes: progress.minutes.remaining,
      availableMinutes: progress.minutes.available,
      coveragePercentage: progress.coveragePercentage,
      bufferRatio: progress.bufferRatio,
      paceMinutes: progress.minutes.paceVsPlan,
      status: progress.status as ProgressStatus,
    },
  });

  console.info(
    `Seeded fictional foundations through M10: ${sessions.length} teaching sessions, ${sampleLessonPlanRows.length} scoped topics, ${calculation.allocations.length} planned dates, one revisioned session log and one progress snapshot.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
