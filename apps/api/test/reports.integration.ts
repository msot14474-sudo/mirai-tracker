import { PrismaService } from '../src/database/prisma.service';
import { ReportsService } from '../src/reports/reports.service';
import { reportQuerySchema } from '../src/reports/reports.schemas';
import { AuthenticatedUser } from '../src/auth/auth.types';
import { UserRole } from '@prisma/client';

it('keeps reports, selectors and exports inside campus/subject access and calculates from real saved records', async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.includes('reports_test')
  )
    throw new Error('Dedicated local reports_test database required');
  const db = new PrismaService();
  try {
    const campuses = await Promise.all(
      ['A', 'B'].map((code) =>
        db.campus.create({
          data: { code, name: `Campus ${code}`, timezone: 'Asia/Kolkata' },
        }),
      ),
    );
    const track = await db.track.create({
      data: { code: 'CS', name: 'Computer science' },
    });
    const semesters = await Promise.all(
      campuses.map((c) =>
        db.semester.create({
          data: {
            campusId: c.id,
            name: 'Semester',
            startDate: new Date('2000-01-01'),
            endDate: new Date('2100-12-31'),
          },
        }),
      ),
    );
    const batches = await Promise.all(
      semesters.map((s) =>
        db.batch.create({
          data: {
            semesterId: s.id,
            trackId: track.id,
            code: 'A',
            name: 'Batch A',
          },
        }),
      ),
    );
    async function user(
      name: string,
      role: UserRole,
      campusId: string | null,
    ): Promise<AuthenticatedUser> {
      const u = await db.user.create({
        data: {
          name,
          email: `${name}@test.invalid`,
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
        ...u,
        roles: u.roleAssignments,
        staffProfileId: u.staffProfile?.id ?? null,
        studentProfile: null,
      };
    }
    const admin = await user('admin', 'ADMIN', null),
      manager = await user('manager', 'CAMPUS_MANAGER', campuses[0]!.id),
      otherManager = await user(
        'othermanager',
        'CAMPUS_MANAGER',
        campuses[1]!.id,
      ),
      faculty = await user('teacher', 'FACULTY', campuses[0]!.id),
      otherFaculty = await user('otherteacher', 'FACULTY', campuses[0]!.id),
      unassigned = await user('unassigned', 'FACULTY', campuses[0]!.id),
      student = await user('student', 'STUDENT', campuses[0]!.id);
    const offerings = [];
    for (const [i, name] of [
      'Web',
      'DSA',
      '=Private campus subject',
    ].entries()) {
      const index = i === 2 ? 1 : 0;
      const subject = await db.subject.create({
        data: { campusId: campuses[index]!.id, code: `SUB${i}`, name },
      });
      offerings.push(
        await db.subjectOffering.create({
          data: {
            subjectId: subject.id,
            academicTrack: i === 1 ? 'UNIVERSITY' : 'MIRAI',
            batchId: batches[index]!.id,
            targetFinishDate: semesters[index]!.endDate,
            status: 'ACTIVE',
          },
        }),
      );
    }
    const web = offerings[0]!,
      dsa = offerings[1]!,
      privateSubject = offerings[2]!;
    await db.facultyAssignment.create({
      data: {
        offeringId: web.id,
        staffProfileId: faculty.staffProfileId!,
        startDate: semesters[0]!.startDate,
      },
    });
    await db.facultyAssignment.create({
      data: {
        offeringId: dsa.id,
        staffProfileId: otherFaculty.staffProfileId!,
        startDate: semesters[0]!.startDate,
      },
    });
    const exam = await db.examWindow.create({
      data: {
        semesterId: semesters[0]!.id,
        name: 'Mid term',
        type: 'MID_TERM',
        startDate: new Date('2100-06-01'),
        endDate: new Date('2100-06-03'),
        syllabusDeadline: new Date('2100-05-31'),
      },
    });
    for (const [i, o] of [web, dsa].entries()) {
      const author = i === 0 ? faculty : otherFaculty;
      const plan = await db.lessonPlan.create({
        data: {
          offeringId: o.id,
          version: 1,
          status: 'ACTIVE',
          uploadedById: author.id,
          units: {
            create: {
              sequence: 1,
              title: 'Basics',
              topics: {
                create: {
                  sequence: 1,
                  title: 'Algorithms',
                  plannedMinutes: 120,
                  status: i === 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
                  currentCompletionPercentage: i === 0 ? 50 : 0,
                  examScopes: { create: { examWindowId: exam.id } },
                },
              },
            },
          },
        },
        include: { units: { include: { topics: true } } },
      });
      const topic = plan.units[0]!.topics[0]!;
      await db.topicScheduleVersion.create({
        data: {
          offeringId: o.id,
          version: 1,
          reason: 'INITIAL',
          entries: {
            create: {
              topicId: topic.id,
              plannedStartDate: new Date('2000-01-10'),
              plannedFinishDate: new Date('2000-01-10'),
              allocatedMinutes: 120,
            },
          },
        },
      });
      for (const [j, date] of [
        '2000-01-10',
        '2000-01-11',
        '2100-05-01',
        '2100-05-02',
      ].entries()) {
        const session = await db.scheduledSession.create({
          data: {
            offeringId: o.id,
            sourceKey: `${i}:${j}`,
            sessionDate: new Date(date),
            startsAt: new Date(`${date}T04:00:00Z`),
            endsAt: new Date(`${date}T05:00:00Z`),
            status: j === 3 ? 'CANCELLED' : 'SCHEDULED',
          },
        });
        if (j === 0 && i === 0) {
          await db.sessionLog.create({
            data: {
              scheduledSessionId: session.id,
              revision: 1,
              status: 'COMPLETED',
              coveredSummary: 'Old revision',
              loggedById: faculty.id,
              loggedAt: new Date('2001-01-01T00:00:00Z'),
            },
          });
          await db.sessionLog.create({
            data: {
              scheduledSessionId: session.id,
              revision: 2,
              status: 'IN_PROGRESS',
              coveredSummary: 'Arrays',
              leftOverSummary: 'Trees',
              loggedById: faculty.id,
              loggedAt: new Date('2001-01-02T00:00:00Z'),
              topicUpdates: {
                create: {
                  topicId: topic.id,
                  completionBeforePercentage: 0,
                  completionAfterPercentage: 50,
                  minutesUsed: 45,
                },
              },
            },
          });
        }
      }
    }
    // An archived version must still count as a real faculty upload.
    await db.lessonPlan.create({
      data: {
        offeringId: web.id,
        version: 2,
        status: 'ARCHIVED',
        uploadedById: faculty.id,
      },
    });
    const service = new ReportsService(db),
      q = reportQuerySchema.parse({});
    const data = await service.read(admin, q);
    expect(data.subjects).toHaveLength(3);
    expect(data.subjects.find((r) => r.id === privateSubject.id)).toMatchObject(
      { status: 'NEEDS_DATA', metrics: null },
    );
    expect(data.delivery).toHaveLength(1);
    expect(data.delivery[0]).toMatchObject({
      revision: 2,
      covered: 'Arrays',
      leftOver: 'Trees',
      recordedTopicHours: 0.75,
      scheduledHours: 1,
    });
    const webReport = data.subjects.find((r) => r.id === web.id)!;
    expect(webReport).toMatchObject({
      status: 'TIGHT',
      logged: 1,
      unlogged: 1,
      upcoming: 1,
    });
    expect(webReport.metrics).toMatchObject({
      hoursInScope: 2,
      coveredHours: 1,
      coveragePercentage: 50,
      remainingHours: 1,
      availableHours: 1,
      bufferRatio: 1,
    });
    expect(
      data.exams.find((r) => r.subject.id === web.subjectId),
    ).toMatchObject({
      status: 'TIGHT',
      coverage: 50,
      remainingHours: 1,
      teachingHours: 1,
      bufferRatio: 1,
      scopeMode: 'Assessed',
    });
    expect(data.groups.filter((g) => g.kind === 'track')).toHaveLength(3); // Two tracks share Campus A's batch; Mirai also exists in Campus B.
    expect(
      data.groups.find((g) => g.kind === 'campus' && g.id === campuses[0]!.id)
        ?.status,
    ).toBe('DANGER');
    expect(data.faculty.find((f) => f.id === faculty.id)).toMatchObject({
      sessionsLogged: 1,
      classesTaught: 1,
      plansUploaded: 2,
    });
    expect((await service.read(manager, q)).subjects).toHaveLength(2);
    expect((await service.read(otherManager, q)).subjects).toHaveLength(1);
    await db.facultyAssignment.create({
      data: {
        offeringId: privateSubject.id,
        staffProfileId: faculty.staffProfileId!,
        startDate: semesters[1]!.startDate,
      },
    });
    const own = await service.read(faculty, q);
    expect(own.subjects.map((s) => s.id)).toEqual([web.id]);
    expect(own.options.map((s) => s.id)).toEqual([web.id]);
    expect(own.faculty.map((f) => f.id)).toEqual([faculty.id]);
    expect(own.groups).toEqual([]);
    expect(own.activeCampusId).toBe(campuses[0]!.id);
    expect(data.subjects.find((s) => s.id === dsa.id)?.track.name).toBe(
      'University',
    );
    expect(data.subjects.find((s) => s.id === web.id)?.batch.id).toBe(
      data.subjects.find((s) => s.id === dsa.id)?.batch.id,
    );
    expect(
      (
        await service.read(manager, { ...q, trackId: 'UNIVERSITY' })
      ).subjects.map((s) => s.id),
    ).toEqual([dsa.id]);
    await expect(
      service.csv(faculty, { ...q, campusId: campuses[1]!.id }),
    ).rejects.toThrow('assigned campus');
    await expect(service.csv(faculty, { ...q, tab: 'campus' })).rejects.toThrow(
      'Campus-wide',
    );
    expect((await service.csv(faculty, q)).content.toString()).not.toContain(
      'Private campus',
    );
    expect((await service.read(unassigned, q)).subjects).toEqual([]);
    await expect(service.read(student, q)).rejects.toThrow();
    const forbiddenFilters = {
      ...q,
      campusId: campuses[1]!.id,
      subjectId: privateSubject.subjectId,
    };
    expect((await service.read(manager, forbiddenFilters)).subjects).toEqual(
      [],
    );
    expect(
      (await service.read(faculty, { ...q, subjectId: dsa.subjectId }))
        .subjects,
    ).toEqual([]);
    expect(
      (await service.csv(manager, forbiddenFilters)).content.toString(),
    ).not.toContain('Private campus');
    expect((await service.csv(faculty, q)).content.toString()).not.toContain(
      'DSA',
    );
    expect((await service.csv(admin, q)).content.toString()).toContain(
      "'=Private campus subject",
    );
    expect(
      (
        await service.read(admin, {
          ...q,
          from: '2000-01-11',
          to: '2000-01-11',
        })
      ).delivery,
    ).toEqual([]);
    expect(
      (
        await service.read(admin, {
          ...q,
          from: '2001-01-02',
          to: '2001-01-02',
        })
      ).faculty.find((f) => f.id === faculty.id)?.sessionsLogged,
    ).toBe(1);
    expect(
      (await service.csv(admin, { ...q, tab: 'exams' })).content.toString(),
    ).toContain('Scope mode');
    await db.facultyAssignment.updateMany({
      where: { staffProfileId: faculty.staffProfileId! },
      data: { active: false },
    });
    expect((await service.read(faculty, q)).options).toEqual([]);
  } finally {
    await db.$disconnect();
  }
}, 120000);

it('migrates the approved track without replacing batches, offerings or their history', async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.includes('reports_test')
  )
    throw new Error('Dedicated local reports_test database required');
  const db = new PrismaService();
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(
    'prisma/migrations/20261020170000_subject_tracks/migration.sql',
    'utf8',
  );
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('CREATE SCHEMA track_migration_test');
      await tx.$executeRawUnsafe(
        'SET LOCAL search_path TO track_migration_test',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "Track" (id TEXT PRIMARY KEY, code TEXT, name TEXT)',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "Batch" (id TEXT PRIMARY KEY, name TEXT, "trackId" TEXT)',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "SubjectOffering" (id TEXT PRIMARY KEY, "batchId" TEXT)',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE "History" ("offeringId" TEXT REFERENCES "SubjectOffering"(id), notes TEXT)',
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Track" VALUES ('cs','CS','Computer Science'),('uni','UNIVERSITY','University'),('unknown','OTHER','Other')`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Batch" VALUES ('a','First Year A','cs'),('b','First Year B','uni'),('c','Legacy','unknown')`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "SubjectOffering" VALUES ('web','a'),('dsa','a'),('uni-subject','b'),('unknown-subject','c')`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "History" VALUES ('web','Saved lecture and lesson plan')`,
      );
      for (const statement of sql
        .replace(/--[^\n]*/g, '')
        .split(';')
        .filter((s) => s.trim()))
        await tx.$executeRawUnsafe(statement);
      const rows = await tx.$queryRawUnsafe<any[]>(
        'SELECT * FROM "SubjectOffering" ORDER BY id',
      );
      expect(rows.find((o) => o.id === 'web')).toMatchObject({
        batchId: 'a',
        academicTrack: 'MIRAI',
      });
      expect(rows.find((o) => o.id === 'dsa')?.academicTrack).toBe('MIRAI');
      expect(rows.find((o) => o.id === 'uni-subject')?.academicTrack).toBe(
        'UNIVERSITY',
      );
      expect(
        rows.find((o) => o.id === 'unknown-subject')?.academicTrack,
      ).toBeNull();
      expect(await tx.$queryRawUnsafe('SELECT * FROM "History"')).toEqual([
        { offeringId: 'web', notes: 'Saved lecture and lesson plan' },
      ]);
      expect(
        await tx.$queryRawUnsafe(`SELECT name FROM "Batch" WHERE id = 'a'`),
      ).toEqual([{ name: 'First Year A' }]);
      await tx.$executeRawUnsafe('DROP SCHEMA track_migration_test CASCADE');
    });
  } finally {
    await db.$disconnect();
  }
}, 120000);
