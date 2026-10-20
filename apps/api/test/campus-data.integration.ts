import ExcelJS from 'exceljs';
import { PrismaService } from '../src/database/prisma.service';
import { AccessPolicyService } from '../src/auth/access-policy.service';
import { TopicScheduleService } from '../src/topic-schedule/topic-schedule.service';
import { TimetableService } from '../src/timetable/timetable.service';
import { VisitingFacultyService } from '../src/campus-data/visiting-faculty.service';
import { SemesterBundleService } from '../src/campus-data/semester-bundle.service';
import { bundleColumns } from '../src/campus-data/semester-bundle.parser';

it('imports all semester relationships atomically, isolates campuses and calculates per-class balances from actual logs', async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.includes('campus_data_test')
  )
    throw new Error('Requires a dedicated local campus_data_test database.');
  const db = new PrismaService();
  try {
    const campus = await db.campus.create({
      data: { code: 'TEST', name: 'Campus import test' },
    });
    const other = await db.campus.create({
      data: { code: 'OTHER', name: 'Other campus' },
    });
    const semester = await db.semester.create({
      data: {
        campusId: campus.id,
        name: 'Semester 1',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-06-30'),
        workingSaturdayRule: 'SECOND_AND_FOURTH',
      },
    });
    const owner = await db.user.create({
      data: { name: 'Manager', email: 'manager@campus.test', status: 'ACTIVE' },
    });
    const teacher = await db.user.create({
      data: {
        name: 'Visiting teacher',
        email: 'teacher@campus.test',
        status: 'ACTIVE',
        staffProfile: {
          create: { employeeCode: 'VT1', staffType: 'VISITING' },
        },
        roleAssignments: {
          create: { role: 'FACULTY', scopeKey: campus.id, campusId: campus.id },
        },
      },
      include: { staffProfile: true },
    });
    const manager: any = {
      id: owner.id,
      name: owner.name,
      roles: [{ role: 'CAMPUS_MANAGER', campusId: campus.id }],
    };
    const outsider: any = {
      ...manager,
      roles: [{ role: 'CAMPUS_MANAGER', campusId: other.id }],
    };
    const faculty: any = {
      id: teacher.id,
      roles: [{ role: 'FACULTY', campusId: campus.id }],
      staffProfileId: teacher.staffProfile!.id,
    };
    const access = new AccessPolicyService(db),
      schedules = new TopicScheduleService(db, access),
      timetable = new TimetableService(db, access, schedules);
    const visiting = new VisitingFacultyService(db, access),
      bundle = new SemesterBundleService(db, visiting, timetable, schedules);
    const book = new ExcelJS.Workbook();
    const add = (name: keyof typeof bundleColumns, rows: unknown[][]) => {
      const s = book.addWorksheet(name);
      s.addRow(bundleColumns[name]);
      rows.forEach((r) => s.addRow(r));
    };
    book.addWorksheet('Read Me').addRow(['Do not import documentation']);
    add('Subjects', [
      [
        'A',
        'First Year A',
        'MIRAI',
        'Mirai',
        'WEB',
        'Web Development',
        'Foundations',
        '2025-06-30',
      ],
    ]);
    add('Faculty', [
      ['A', 'WEB', teacher.email, 'VISITING', '2025-01-01', '2025-06-30'],
    ]);
    add('Calendar', [['2025-01-13', '', 'Holiday', 'HOLIDAY', 'false', '']]);
    add('Exams', [
      ['Mid term', 'MID_TERM', '2025-03-10', '2025-03-12', '2025-03-09'],
    ]);
    add('Timetable', [
      [
        'A',
        'WEB',
        teacher.email,
        'Monday',
        '09:00',
        '10:00',
        '2025-01-01',
        '2025-06-30',
      ],
    ]);
    add('Lessons', [
      ['A', 'WEB', 1, 'Basics', 1, 'HTML', 2, 0, 'Mid term', 'First topic'],
    ]);
    add('Sessions', [
      [
        'A',
        'WEB',
        teacher.email,
        '2025-01-06',
        '09:00',
        '10:00',
        'COMPLETED',
        100,
        'HTML elements',
        '',
        'COMPLETED',
        'ASSIGNED',
        '',
        1,
        1,
        50,
      ],
      [
        'A',
        'WEB',
        teacher.email,
        '2025-01-08',
        '09:00',
        '10:00',
        'IN_PROGRESS',
        80,
        'HTML forms',
        'Validation',
        'PARTIAL',
        'ASSIGNED',
        '',
        1,
        1,
        100,
      ],
    ]);
    add('Rates', [
      [teacher.email, '2025-01-01', 1500],
      [teacher.email, '2025-01-07', 2000],
    ]);
    add('Expenses', [
      ['TAXI1', teacher.email, '2025-01-08', 'Travel', 200, 'Taxi receipt'],
    ]);
    add('Payments', [
      ['PAY1', teacher.email, '2025-01-09', 1000, 'Bank transfer'],
    ]);
    const buf = Buffer.from(await book.xlsx.writeBuffer());
    const files = [
      {
        originalname: 'Campus.xlsx',
        buffer: buf,
        mimetype: 'application/octet-stream',
        size: buf.length,
      },
    ];
    const preview = await bundle.inspect(semester.id, files, manager);
    expect(preview.issues).toEqual([]);
    expect(preview.valid).toBe(true);
    expect(preview.counts.Sessions).toBe(2);
    expect(await db.subject.count()).toBe(0);
    expect(await db.semesterDataImport.count()).toBe(0);
    await expect(bundle.inspect(semester.id, files, outsider)).rejects.toThrow(
      'cannot manage',
    );
    await expect(visiting.dashboard(semester.id, faculty)).rejects.toThrow(
      'cannot manage',
    );
    await expect(
      bundle.inspect(semester.id, files, manager, true, 'changed'),
    ).rejects.toThrow('Files changed');
    const saved = await bundle.inspect(
      semester.id,
      files,
      manager,
      true,
      preview.fingerprint,
    );
    expect(saved.issues).toEqual([]);
    expect(saved.warnings).toEqual([]);
    expect(saved.importId).toBeTruthy();
    const offering = await db.subjectOffering.findFirstOrThrow();
    expect(await access.canViewOffering(faculty, offering.id)).toBe(true);
    expect(await access.canViewOffering(outsider, offering.id)).toBe(false);
    expect(
      await db.scheduledSession.count({
        where: {
          sessionDate: new Date('2025-01-13'),
          status: { not: 'CANCELLED' },
        },
      }),
    ).toBe(0);
    expect(await db.examScope.count()).toBe(1);
    expect(await db.topic.findFirst()).toMatchObject({ status: 'COMPLETED' });
    const beforeCount = await db.scheduledSession.count();
    const duplicate = await bundle.inspect(
      semester.id,
      files,
      manager,
      true,
      preview.fingerprint,
    );
    expect(duplicate.alreadyImported).toBe(true);
    expect(await db.sessionLog.count()).toBe(2);
    expect(await db.scheduledSession.count()).toBe(beforeCount);
    const dashboard = await visiting.dashboard(semester.id, manager);
    expect(dashboard.summary).toMatchObject({
      faculty: 1,
      takenClasses: 2,
      honorarium: 3500,
      expenses: 200,
      paid: 1000,
      balance: 2700,
      unpricedClasses: 0,
    });
    const payment = dashboard.ledger.find((e) => e.kind === 'PAYMENT')!;
    await expect(
      visiting.voidLedger(semester.id, payment.id, outsider),
    ).rejects.toThrow('cannot manage');
    await visiting.voidLedger(semester.id, payment.id, manager);
    expect(
      (await visiting.dashboard(semester.id, manager)).summary.balance,
    ).toBe(3700);
    // A later log correction counts the session once and removes cancelled teaching from earnings.
    const completed = await db.sessionLog.findFirstOrThrow({
      where: { status: 'COMPLETED' },
    });
    await db.sessionLog.create({
      data: {
        scheduledSessionId: completed.scheduledSessionId,
        revision: 2,
        status: 'CANCELLED',
        overallCompletionPercentage: 0,
        coveredSummary: 'Corrected record',
        loggedById: owner.id,
      },
    });
    expect(
      (await visiting.dashboard(semester.id, manager)).summary,
    ).toMatchObject({ takenClasses: 1, honorarium: 2000 });
    await db.visitingFacultyRate.deleteMany();
    expect(
      (await visiting.dashboard(semester.id, manager)).summary,
    ).toMatchObject({ unpricedClasses: 1, honorarium: 0 });
    const bad = Buffer.from(
      'dataset,batch_code,batch_name,track_code,track_name,subject_code,subject_name,faculty_email\nSubjects,A,First Year A,CS,Computer Science,NEW,New subject,\nFaculty,A,,,,NEW,,missing@campus.test',
    );
    const failed = await bundle.inspect(
      semester.id,
      [
        {
          originalname: 'Mixed.csv',
          buffer: bad,
          mimetype: 'text/csv',
          size: bad.length,
        },
      ],
      manager,
    );
    expect(failed.valid).toBe(false);
    expect(await db.subject.count({ where: { code: 'NEW' } })).toBe(0);
    expect(await db.semesterDataImport.count()).toBe(1);
    expect(
      (await bundle.source(semester.id, saved.importId!, manager)).sourceData,
    ).toBeTruthy();
  } finally {
    await db.$disconnect();
  }
}, 120000);

import { ActivityService } from '../src/notifications/activity.service';
import { WeeklySummaryService } from '../src/notifications/weekly-summary.service';
it('routes notifications by hierarchy and persists one weekly summary/email per authorized recipient', async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.includes('campus_data_test'))
    throw new Error('Dedicated database required');
  const db = new PrismaService();
  try {
    await db.user.updateMany({ data: { status: 'SUSPENDED' } });
    const campus = await db.campus.create({
      data: { code: 'NEWS', name: 'Notification Campus' },
    });
    const other = await db.campus.create({
      data: { code: 'NEWS2', name: 'Other Notification Campus' },
    });
    const semester = await db.semester.create({
      data: {
        campusId: campus.id,
        name: 'Current semester',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-12-31'),
      },
    });
    const track = await db.track.create({
      data: { code: 'NEWS', name: 'Notifications Track' },
    });
    const batch = await db.batch.create({
      data: {
        semesterId: semester.id,
        trackId: track.id,
        code: 'N',
        name: 'Batch N',
      },
    });
    const subject = await db.subject.create({
      data: { campusId: campus.id, code: 'NEWS', name: 'Networks' },
    });
    const offering = await db.subjectOffering.create({
      data: {
        batchId: batch.id,
        subjectId: subject.id,
        targetFinishDate: semester.endDate,
      },
    });
    async function make(
      name: string,
      role: 'ADMIN' | 'FACULTY' | 'CAMPUS_MANAGER',
      campusId: string | null,
    ) {
      const record = await db.user.create({
        data: {
          name,
          email: `${name.toLowerCase()}@example.org`,
          status: 'ACTIVE',
          roleAssignments: {
            create: { role, campusId, scopeKey: campusId ?? 'GLOBAL' },
          },
          ...(role === 'FACULTY'
            ? { staffProfile: { create: { employeeCode: name } } }
            : {}),
        },
        include: { roleAssignments: true, staffProfile: true },
      });
      return {
        ...record,
        roles: record.roleAssignments,
        staffProfileId: record.staffProfile?.id ?? null,
        studentProfile: null,
      };
    }
    const admin = await make('AdminNotify', 'ADMIN', null),
      manager = await make('ManagerNotify', 'CAMPUS_MANAGER', campus.id),
      faculty = await make('FacultyNotify', 'FACULTY', campus.id),
      unassigned = await make('UnassignedNotify', 'FACULTY', campus.id),
      outsider = await make('OtherNotify', 'CAMPUS_MANAGER', other.id);
    await db.facultyAssignment.create({
      data: {
        offeringId: offering.id,
        staffProfileId: faculty.staffProfileId!,
        startDate: semester.startDate,
        endDate: semester.endDate,
      },
    });
    const activity = new ActivityService(db);
    const event = await activity.publish(
      manager,
      { title: 'Timetable updated', category: 'Timetable', view: 'timetable' },
      {
        campusId: campus.id,
        semesterId: semester.id,
        offeringIds: [offering.id],
        name: 'Networks',
      },
    );
    expect((await activity.feed(admin)).items).toHaveLength(1);
    expect((await activity.feed(manager)).items).toHaveLength(1);
    expect((await activity.feed(faculty)).items).toHaveLength(1);
    expect((await activity.feed(unassigned)).items).toHaveLength(0);
    expect((await activity.feed(outsider)).items).toHaveLength(0);
    await expect(activity.markRead(outsider, [event.id])).rejects.toThrow();
    await activity.markRead(faculty, [event.id]);
    expect((await activity.feed(faculty)).items[0]).toMatchObject({
      read: true,
    });
    await activity.publish(
      manager,
      { title: 'Rate updated', category: 'Expenses', view: 'visiting-faculty' },
      { campusId: campus.id, offeringIds: [] },
    );
    expect((await activity.feed(faculty)).items).toHaveLength(1);
    expect((await activity.feed(manager)).items).toHaveLength(2);
    const sent: string[] = [];
    const ai: any = {
      configuration: () => ({ ready: true }),
      generate: jest.fn(async () => ({
        text: 'A personalized authorized weekly review.',
        incomplete: false,
      })),
    };
    const context: any = {
      snapshot: async (user: any) => ({
        subjects:
          user.id === unassigned.id
            ? []
            : [
                {
                  id: offering.id,
                  code: 'NEWS',
                  name: 'Networks',
                  batch: 'N',
                  completion: 50,
                  nextTopics: ['TCP'],
                  exams: [],
                  monitoring: {
                    status: 'ON_TRACK', remainingHours: 2, availableHours: 3,
                    bufferRatio: 1.5, thresholds: { onTrack: 1.15, tight: 1 },
                  },
                },
              ],
      }),
    };
    const email: any = {
      sendWeeklySummary: jest.fn(async (message: any) => {
        sent.push(message.recipientEmail);
        return { accepted: [message.recipientEmail], rejected: [] };
      }),
    };
    const weekly = new WeeklySummaryService(db, context, ai, email);
    await weekly.enqueue(new Date('2026-10-20T04:00:00Z'));
    const count = await db.weeklySummary.count();
    await weekly.enqueue(new Date('2026-10-20T05:00:00Z'));
    expect(await db.weeklySummary.count()).toBe(count);
    for (let i = 0; i < count + 1; i++) await weekly.processOne();
    expect(sent.filter((e) => e === faculty.email)).toHaveLength(1);
    expect(sent).not.toContain(unassigned.email);
    expect((await weekly.list(faculty)).summaries).toHaveLength(1);
    expect((await weekly.list(faculty, campus.id)).summaries[0]).toMatchObject({
      emailStatus: 'SENT',
      mode: 'ai',
    });
    await weekly.processOne();
    expect(sent.filter((e) => e === faculty.email)).toHaveLength(1);
    await db.facultyAssignment.updateMany({
      where: { staffProfileId: faculty.staffProfileId! },
      data: { active: false },
    });
    expect((await activity.feed(faculty)).items).toHaveLength(0);
    expect((await weekly.list(faculty)).summaries).toHaveLength(0);
    expect(
      ai.generate.mock.calls.every((call: any[]) => call[5] === true),
    ).toBe(true);
  } finally {
    await db.$disconnect();
  }
}, 120000);

it('starts the complete application and protects notification and import HTTP routes', async () => {
  process.env.SESSION_SECRET ??= 'local-integration-test-session-secret';
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.create(AppModule, {
    logger: ['error'],
    abortOnError: false,
  });
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    expect((await fetch(`${url}/notifications`)).status).toBe(401);
    expect((await fetch(`${url}/notifications/weekly-summaries`)).status).toBe(
      401,
    );
    expect(
      (
        await fetch(
          `${url}/campus-data/semesters/11111111-1111-4111-8111-111111111111/visiting-faculty`,
        )
      ).status,
    ).toBe(401);
    const denied = await fetch(
      `${url}/notifications/weekly-summaries/process`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-job-secret': 'incorrect',
        },
        body: JSON.stringify({ enqueue: true }),
      },
    );
    expect(denied.status).toBe(401);
  } finally {
    await app.close();
  }
}, 30000);
