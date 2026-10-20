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
    expect(data.groups.filter((g) => g.kind === 'track')).toHaveLength(2); // Same track, distinct campuses.
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
    const own = await service.read(faculty, q);
    expect(own.subjects.map((s) => s.id)).toEqual([web.id]);
    expect(own.options.map((s) => s.id)).toEqual([web.id]);
    expect(own.faculty.map((f) => f.id)).toEqual([faculty.id]);
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
