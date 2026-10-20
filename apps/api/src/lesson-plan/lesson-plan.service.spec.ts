import {
  LessonPlanStatus,
  SubjectOfferingStatus,
  UserRole,
} from '@prisma/client';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { LessonPlanService } from './lesson-plan.service';

const faculty: AuthenticatedUser = {
  id: 'user-faculty',
  name: 'Faculty',
  email: 'faculty@mirai.local',
  roles: [{ role: UserRole.FACULTY, campusId: 'campus-a' }],
  staffProfileId: 'staff-a',
  studentProfile: null,
};

describe('LessonPlanService', () => {
  it('limits the offering list to an assigned faculty profile', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findMany.mockResolvedValue([]);

    await service.listOfferings(faculty);

    expect(prisma.subjectOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            {
              faculty: {
                some: { staffProfileId: 'staff-a', active: true },
              },
            },
          ],
        },
      }),
    );
  });

  it('marks a preview invalid when an exam name is not in the semester', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(offering());

    const preview = await service.preview(
      'offering-a',
      csv('Unknown Exam'),
      faculty,
    );

    expect(preview.valid).toBe(false);
    expect(preview.issues[0]?.errorMessage).toContain('does not match');
  });

  it('imports a new version with topics, exam scopes, a job and an audit event', async () => {
    const { service, prisma, transaction } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(offering());
    transaction.lessonPlan.aggregate.mockResolvedValue({
      _max: { version: 2 },
    });
    transaction.lessonPlan.create.mockResolvedValue({
      id: 'plan-new',
      version: 3,
      units: [
        {
          sequence: 1,
          topics: [{ id: 'topic-new', sequence: 1 }],
        },
      ],
    });
    transaction.importJob.create.mockResolvedValue({ id: 'job-a' });
    prisma.$transaction.mockImplementation(
      async (callback: (client: unknown) => unknown) => callback(transaction),
    );

    const result = await service.import(
      'offering-a',
      csv('Sample Mid-term 2026'),
      faculty,
    );

    expect(result).toMatchObject({ planId: 'plan-new', version: 3 });
    expect(transaction.examScope.createMany).toHaveBeenCalledWith({
      data: [{ examWindowId: 'exam-mid', topicId: 'topic-new' }],
      skipDuplicates: true,
    });
    expect(transaction.importJob.create).toHaveBeenCalled();
    expect(transaction.auditEvent.create).toHaveBeenCalled();
  });

  it('updates a draft topic and records the change', async () => {
    const { service, prisma } = setup();
    prisma.topic.findUnique.mockResolvedValue(topic());
    prisma.topic.update.mockResolvedValue({
      ...topic(),
      title: 'Updated arrays',
      plannedMinutes: 90,
      currentCompletionPercentage: 0,
    });

    const result = await service.updateTopic(
      'topic-a',
      { title: 'Updated arrays', plannedMinutes: 90 },
      faculty,
    );

    expect(result.plannedMinutes).toBe(90);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityType: 'Topic' }),
      }),
    );
  });

  it('keeps active and superseded plans immutable', async () => {
    const { service, prisma } = setup();
    prisma.topic.findUnique.mockResolvedValue(
      topic({ lessonPlanStatus: LessonPlanStatus.ACTIVE }),
    );

    await expect(
      service.updateTopic('topic-a', { plannedMinutes: 90 }, faculty),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.topic.update).not.toHaveBeenCalled();
  });

  it('rejects exam-scope topics from another lesson plan', async () => {
    const { service, prisma } = setup();
    prisma.lessonPlan.findUnique.mockResolvedValue(plan());
    prisma.topic.count.mockResolvedValue(1);

    await expect(
      service.setExamScope(
        'plan-a',
        'exam-mid',
        { topicIds: ['topic-a', 'topic-foreign'] },
        faculty,
      ),
    ).rejects.toThrow('Every exam-scope topic');
  });

  it('replaces one exam scope atomically', async () => {
    const { service, prisma, transaction } = setup();
    prisma.lessonPlan.findUnique.mockResolvedValue(plan());
    prisma.topic.count.mockResolvedValue(2);
    prisma.examScope.findMany.mockResolvedValue([{ topicId: 'topic-old' }]);
    prisma.$transaction.mockImplementation(
      async (callback: (client: unknown) => unknown) => callback(transaction),
    );

    const result = await service.setExamScope(
      'plan-a',
      'exam-mid',
      { topicIds: ['topic-a', 'topic-b'] },
      faculty,
    );

    expect(result.topicIds).toEqual(['topic-a', 'topic-b']);
    expect(transaction.examScope.deleteMany).toHaveBeenCalled();
    expect(transaction.examScope.createMany).toHaveBeenCalledWith({
      data: [
        { examWindowId: 'exam-mid', topicId: 'topic-a' },
        { examWindowId: 'exam-mid', topicId: 'topic-b' },
      ],
    });
  });

  it('activates a draft and supersedes the previous active version', async () => {
    const { service, prisma, transaction } = setup();
    prisma.lessonPlan.findUnique.mockResolvedValue(plan());
    transaction.lessonPlan.update.mockResolvedValue({
      id: 'plan-a',
      status: LessonPlanStatus.ACTIVE,
    });
    prisma.$transaction.mockImplementation(
      async (callback: (client: unknown) => unknown) => callback(transaction),
    );

    const result = await service.activate('plan-a', faculty);

    expect(result.status).toBe(LessonPlanStatus.ACTIVE);
    expect(transaction.lessonPlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: LessonPlanStatus.SUPERSEDED },
      }),
    );
    expect(transaction.subjectOffering.update).toHaveBeenCalledWith({
      where: { id: 'offering-a' },
      data: { status: SubjectOfferingStatus.ACTIVE },
    });
  });

  it('enforces offering permissions before returning plan details', async () => {
    const { service, prisma, access } = setup();
    access.assertCanManageOffering.mockRejectedValue(new ForbiddenException());

    await expect(
      service.offering('offering-a', faculty),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.subjectOffering.findUnique).not.toHaveBeenCalled();
  });
});

function setup() {
  const transaction = {
    lessonPlan: {
      aggregate: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    topic: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
    unit: { create: jest.fn() },
    examScope: { createMany: jest.fn(), deleteMany: jest.fn() },
    importJob: { create: jest.fn() },
    subjectOffering: { update: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const prisma = {
    subjectOffering: { findMany: jest.fn(), findUnique: jest.fn() },
    lessonPlan: { findUnique: jest.fn() },
    unit: { findUnique: jest.fn(), update: jest.fn() },
    topic: { findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
    examScope: { findMany: jest.fn() },
    auditEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const access = {
    isGlobalManager: jest.fn().mockReturnValue(false),
    assertCanManageOffering: jest.fn().mockResolvedValue(undefined),
  };
  return {
    prisma,
    access,
    transaction,
    service: new LessonPlanService(
      prisma as never,
      access as never,
      { calculate: jest.fn().mockResolvedValue({}) } as never,
    ),
  };
}

function offering() {
  return {
    id: 'offering-a',
    subject: { id: 'subject-a', code: 'CS-DSA', name: 'Data Structures' },
    batch: {
      id: 'batch-a',
      code: 'A',
      name: 'Batch A',
      semester: {
        id: 'semester-a',
        name: 'Semester 2026',
        campus: { id: 'campus-a', code: 'MAIN', name: 'Main Campus' },
        examWindows: [
          {
            id: 'exam-mid',
            name: 'Sample Mid-term 2026',
            type: 'MID_TERM',
            startDate: date('2026-10-12'),
            endDate: date('2026-10-16'),
            syllabusDeadline: date('2026-10-09'),
          },
        ],
      },
    },
    lessonPlans: [],
  };
}

function plan() {
  return {
    id: 'plan-a',
    offeringId: 'offering-a',
    version: 1,
    status: LessonPlanStatus.DRAFT,
    offering: {
      batch: {
        semester: {
          campusId: 'campus-a',
          examWindows: [{ id: 'exam-mid', name: 'Sample Mid-term 2026' }],
        },
      },
    },
  };
}

function topic({
  lessonPlanStatus = LessonPlanStatus.DRAFT,
}: {
  lessonPlanStatus?: LessonPlanStatus;
} = {}) {
  return {
    id: 'topic-a',
    title: 'Arrays',
    plannedMinutes: 60,
    currentCompletionPercentage: 0,
    unit: {
      lessonPlan: {
        offeringId: 'offering-a',
        status: lessonPlanStatus,
        offering: { batch: { semester: { campusId: 'campus-a' } } },
      },
    },
  };
}

function csv(examName: string) {
  const source = [
    'unit_sequence,unit_title,unit_description,topic_sequence,topic_title,topic_description,planned_minutes,exam_names',
    `1,Unit one,,1,Arrays,,60,${examName}`,
  ].join('\n');
  const buffer = Buffer.from(source, 'utf8');
  return {
    originalname: 'plan.csv',
    mimetype: 'text/csv',
    size: buffer.length,
    buffer,
  };
}

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

it('intersects the selected campus with faculty permissions', async () => {
  const { service, prisma } = setup();
  prisma.subjectOffering.findMany.mockResolvedValue([]);
  await service.listOfferings(faculty, 'campus-b');
  expect(prisma.subjectOffering.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        AND: [
          {
            OR: [
              {
                faculty: { some: { staffProfileId: 'staff-a', active: true } },
              },
            ],
          },
          { batch: { semester: { campusId: 'campus-b' } } },
        ],
      },
    }),
  );
});

function activePlan() {
  return {
    id: 'plan-existing',
    version: 1,
    status: 'ACTIVE',
    units: [
      {
        id: 'unit-existing',
        sequence: 1,
        title: 'Unit one',
        description: null,
        topics: [
          {
            id: 'topic-existing',
            sequence: 1,
            title: 'Arrays',
            description: null,
            plannedMinutes: 60,
            currentCompletionPercentage: 75,
            examScopes: [{ examWindow: { name: 'Sample Mid-term 2026' } }],
          },
        ],
      },
    ],
  };
}
function partialFile(rows = '1,Unit one,7,Trees,90') {
  const buffer = Buffer.from(
    'unit_sequence,unit_title,topic_sequence,topic_title,planned_minutes\n' +
      rows,
  );
  return {
    originalname: 'partial.csv',
    mimetype: 'text/csv',
    size: buffer.length,
    buffer,
  };
}
function appendSetup() {
  const context = setup();
  const current = activePlan();
  context.prisma.subjectOffering.findUnique.mockResolvedValue({
    ...offering(),
    lessonPlans: [current],
  });
  context.transaction.lessonPlan.findFirst.mockResolvedValue(current);
  context.transaction.topic.create.mockResolvedValue({ id: 'topic-new' });
  context.prisma.$transaction.mockImplementation(
    async (callback: (client: unknown) => unknown) =>
      callback(context.transaction),
  );
  return { ...context, current };
}
it('adds a later partial upload to an active plan without replacing existing progress or topic IDs', async () => {
  const { service, transaction, current } = appendSetup();
  const result = await service.import('offering-a', partialFile(), faculty, {
    mode: 'APPEND',
    basePlanId: current.id,
  });
  expect(result).toMatchObject({
    planId: current.id,
    version: 1,
    added: 1,
    unchanged: 0,
  });
  expect(transaction.topic.create).toHaveBeenCalledWith({
    data: {
      unitId: 'unit-existing',
      sequence: 7,
      title: 'Trees',
      description: null,
      plannedMinutes: 90,
    },
  });
  expect(transaction.lessonPlan.create).not.toHaveBeenCalled();
  expect(current.units[0]!.topics[0]).toMatchObject({
    id: 'topic-existing',
    currentCompletionPercentage: 75,
  });
});
it('skips identical existing topics when a partial file is uploaded again', async () => {
  const { service, transaction } = appendSetup();
  const result = await service.import(
    'offering-a',
    partialFile('1,Unit one,1,Arrays,60'),
    faculty,
    { mode: 'APPEND' },
  );
  expect(result).toMatchObject({ added: 0, unchanged: 1 });
  expect(transaction.topic.create).not.toHaveBeenCalled();
  expect(transaction.importJob.create).not.toHaveBeenCalled();
});
it('rejects conflicting partial rows before writing any topics', async () => {
  const { service, transaction } = appendSetup();
  await expect(
    service.import(
      'offering-a',
      partialFile('1,Unit one,7,Trees,90\n1,Unit one,1,Changed,60'),
      faculty,
      { mode: 'APPEND' },
    ),
  ).rejects.toThrow('Some rows conflict');
  expect(transaction.topic.create).not.toHaveBeenCalled();
});
it('rejects a stale preview when another plan became current', async () => {
  const { service, transaction } = appendSetup();
  transaction.lessonPlan.findFirst.mockResolvedValue({
    ...activePlan(),
    id: 'newer-plan',
  });
  await expect(
    service.import('offering-a', partialFile(), faculty, {
      mode: 'APPEND',
      basePlanId: 'plan-existing',
    }),
  ).rejects.toThrow('The lesson plan changed');
  expect(transaction.topic.create).not.toHaveBeenCalled();
});
it('blocks replacement and activation that would hide recorded teaching progress', async () => {
  const { service, prisma, transaction } = appendSetup();
  prisma.topic.count.mockResolvedValue(1);
  await expect(
    service.import('offering-a', csv(''), faculty, { mode: 'REPLACE' }),
  ).rejects.toThrow('recorded teaching progress');
  prisma.lessonPlan.findUnique.mockResolvedValue(plan());
  transaction.topic.count.mockResolvedValue(1);
  await expect(service.activate('plan-a', faculty)).rejects.toThrow(
    'recorded teaching progress',
  );
  expect(transaction.lessonPlan.updateMany).not.toHaveBeenCalled();
});
