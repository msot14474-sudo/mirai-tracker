import { TopicScheduleService } from '../src/topic-schedule/topic-schedule.service';
import { SessionLogService } from '../src/session-log/session-log.service';
import { lessonPlanColumns } from '../src/lesson-plan/lesson-plan.types';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AcademicCalendarService } from '../src/academic-calendar/academic-calendar.service';
import { AccessPolicyService } from '../src/auth/access-policy.service';
import { TimetableService } from '../src/timetable/timetable.service';
import { LessonPlanService } from '../src/lesson-plan/lesson-plan.service';

it('connects a manually created semester to manager scheduling and faculty subjects without crossing campuses', async () => {
  if (
    !['localhost', '127.0.0.1'].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    throw new Error('This rollback-only test requires a local database.');
  const prisma = new PrismaClient();
  const rollback = new Error('ROLLBACK_TEST');
  try {
    await prisma.$transaction(
      async (tx) => {
        const tag = randomUUID().slice(0, 8);
        const campus = await tx.campus.create({
          data: { code: tag, name: `Workflow ${tag}` },
        });
        const other = await tx.campus.create({
          data: { code: `x${tag}`, name: `Other ${tag}` },
        });
        const adminUser = await tx.user.create({
          data: {
            name: 'Setup',
            email: `${tag}-admin@example.test`,
            status: 'ACTIVE',
          },
        });
        const facultyUser = await tx.user.create({
          data: {
            name: 'Teacher',
            email: `${tag}-faculty@example.test`,
            status: 'ACTIVE',
            staffProfile: { create: { employeeCode: tag } },
            roleAssignments: {
              create: {
                role: 'FACULTY',
                campusId: campus.id,
                scopeKey: campus.id,
              },
            },
          },
          include: { staffProfile: true, roleAssignments: true },
        });
        const admin: any = { id: adminUser.id, roles: [{ role: 'ADMIN' }] };
        const manager: any = {
          id: adminUser.id,
          roles: [{ role: 'CAMPUS_MANAGER', campusId: campus.id }],
        };
        const faculty: any = {
          id: facultyUser.id,
          staffProfileId: facultyUser.staffProfile!.id,
          roles: facultyUser.roleAssignments,
        };
        const db: any = new Proxy(tx, {
          get(target, key) {
            return key === '$transaction'
              ? (fn: any) => fn(tx)
              : (target as any)[key];
          },
        });
        const access = new AccessPolicyService(db);
        const calendar = new AcademicCalendarService(db, access, {} as any);
        const semester = await calendar.createSemester(
          campus.id,
          {
            name: 'Semester 1',
            startDate: '2026-07-01',
            endDate: '2026-12-31',
            workingSaturdayRule: 'SECOND_AND_FOURTH',
            defaultOnTrackThreshold: 1.15,
            defaultTightThreshold: 1,
            status: 'ACTIVE',
          },
          admin,
        );
        const subject = await calendar.createSubject(
          {
            campusId: campus.id,
            code: tag,
            name: 'Web Development',
            description: null,
          },
          admin,
        );
        const input = {
          batchName: 'Batch A',
          batchCode: 'A',
          trackName: `Track ${tag}`,
          trackCode: tag,
          subjectIds: [subject.id],
        };
        const linked = await calendar.connectSemesterSubjects(
          semester.id,
          input,
          admin,
        );
        await calendar.connectSemesterSubjects(
          semester.id,
          { batchId: linked.batchId, subjectIds: [subject.id] },
          admin,
        );
        const courses = await calendar.semesterCourses(semester.id, manager);
        expect(courses).toHaveLength(1);
        expect(courses[0]!.subjectOfferings).toHaveLength(1);
        const offeringId = courses[0]!.subjectOfferings[0]!.id;
        await calendar.assignSubjectTeacher(
          subject.id,
          {
            campusId: campus.id,
            staffProfileId: faculty.staffProfileId,
            offeringId,
          },
          manager,
        );
        expect(
          (await calendar.listSemesters(campus.id, faculty)).map((s) => s.id),
        ).toContain(semester.id);
        expect(
          (await calendar.listFacultySubjects(faculty))[0]!.offerings[0]!.id,
        ).toBe(offeringId);
        // New subject creation must save its semester/batch connection atomically.
        const linkedNew = await calendar.createSubject(
          {
            campusId: campus.id,
            semesterId: semester.id,
            batchId: linked.batchId,
            code: `n${tag}`,
            name: 'New linked subject',
            description: null,
          },
          admin,
        );
        expect(
          await tx.subjectOffering.count({
            where: { subjectId: linkedNew.id, batchId: linked.batchId },
          }),
        ).toBe(1);
        await expect(
          calendar.createSubject(
            {
              campusId: other.id,
              semesterId: semester.id,
              batchId: linked.batchId,
              code: `bad${tag}`,
              name: 'Invalid campus',
              description: null,
            },
            admin,
          ),
        ).rejects.toThrow('this campus');
        expect(await tx.subject.count({ where: { code: `bad${tag}` } })).toBe(
          0,
        );
        // Existing catalog/default assignments are repaired by linking, without replacing the teacher.
        const legacy = await tx.subject.create({
          data: {
            campusId: campus.id,
            code: `l${tag}`,
            name: 'Legacy subject',
          },
        });
        await tx.subjectTeacher.create({
          data: {
            subjectId: legacy.id,
            campusId: campus.id,
            staffProfileId: faculty.staffProfileId,
          },
        });
        await calendar.connectSemesterSubjects(
          semester.id,
          { batchId: linked.batchId, subjectIds: [legacy.id] },
          admin,
        );
        const legacyOffering = await tx.subjectOffering.findFirstOrThrow({
          where: { subjectId: legacy.id },
        });
        expect(
          await tx.facultyAssignment.count({
            where: {
              offeringId: legacyOffering.id,
              staffProfileId: faculty.staffProfileId,
              active: true,
            },
          }),
        ).toBe(1);
        expect(
          (await calendar.listFacultySubjects(faculty)).some(
            (s) => s.id === legacy.id && s.offerings.length === 1,
          ),
        ).toBe(true);
        // Re-linking preserves co-teachers; inactive defaults can be reactivated,
        // and an out-of-campus default never gains teaching access.
        await tx.subjectTeacher.create({
          data: {
            subjectId: subject.id,
            campusId: campus.id,
            staffProfileId: faculty.staffProfileId,
          },
        });
        await tx.facultyAssignment.updateMany({
          where: { offeringId: legacyOffering.id },
          data: { active: false },
        });
        const invalidDefault = await tx.subject.create({
          data: {
            campusId: campus.id,
            code: `i${tag}`,
            name: 'Invalid default',
          },
        });
        const outsider = await tx.user.create({
          data: {
            name: 'Other campus teacher',
            email: `${tag}-other@example.test`,
            status: 'ACTIVE',
            staffProfile: { create: { employeeCode: `x${tag}` } },
            roleAssignments: {
              create: {
                role: 'FACULTY',
                campusId: other.id,
                scopeKey: other.id,
              },
            },
          },
          include: { staffProfile: true },
        });
        await tx.subjectTeacher.create({
          data: {
            subjectId: invalidDefault.id,
            campusId: campus.id,
            staffProfileId: outsider.staffProfile!.id,
          },
        });
        await calendar.connectSemesterSubjects(
          semester.id,
          {
            batchId: linked.batchId,
            subjectIds: [subject.id, legacy.id, invalidDefault.id],
          },
          admin,
        );
        expect(
          await tx.facultyAssignment.count({
            where: { offeringId, active: true },
          }),
        ).toBe(1);
        expect(
          await tx.facultyAssignment.count({
            where: { offeringId: legacyOffering.id, active: true },
          }),
        ).toBe(1);
        expect(
          await tx.facultyAssignment.count({
            where: { offering: { subjectId: invalidDefault.id } },
          }),
        ).toBe(0);
        const schedules = new TopicScheduleService(db, access);
        const timetable = new TimetableService(db, access, schedules);
        expect(
          (
            await timetable.listSemesterOfferings(semester.id, manager)
          ).offerings.map((o) => o.id),
        ).toContain(offeringId);
        const plans = new LessonPlanService(db, access, schedules);
        expect((await plans.listOfferings(faculty)).map((o) => o.id)).toContain(
          offeringId,
        );
        await tx.calendarDayOverride.create({
          data: {
            semesterId: semester.id,
            date: new Date('2026-07-06'),
            title: 'Holiday',
            type: 'HOLIDAY',
            teachingAllowed: false,
          },
        });
        const assignment = await tx.facultyAssignment.findFirstOrThrow({
          where: { offeringId },
        });
        await timetable.createEntry(
          offeringId,
          {
            weekday: 1,
            startTime: '09:00',
            endTime: '10:00',
            effectiveFrom: '2026-07-01',
            effectiveTo: '2026-12-31',
            facultyAssignmentId: assignment.id,
          },
          manager,
        );
        expect(
          await tx.scheduledSession.count({
            where: {
              offeringId,
              sessionDate: new Date('2026-07-06'),
              status: 'SCHEDULED',
            },
          }),
        ).toBe(0);
        const csv =
          lessonPlanColumns.join(',') + '\n1,Web basics,,1,HTML,,60,\n';
        const imported = await plans.import(
          offeringId,
          {
            originalname: 'plan.csv',
            mimetype: 'text/csv',
            buffer: Buffer.from(csv),
            size: Buffer.byteLength(csv),
          },
          faculty,
        );
        await plans.activate(imported.planId, faculty);
        const topic = await tx.topic.findFirstOrThrow({
          where: { unit: { lessonPlanId: imported.planId } },
        });
        const session = await tx.scheduledSession.findFirstOrThrow({
          where: { offeringId, sessionDate: new Date('2026-07-13') },
        });
        const logging = new SessionLogService(db, schedules);
        await logging.create(
          session.id,
          {
            status: 'COMPLETED',
            overallCompletionPercentage: 100,
            coveredSummary: 'HTML completed',
            classworkStatus: 'COMPLETED',
            homeworkStatus: 'NOT_ASSIGNED',
            topicUpdates: [
              {
                topicId: topic.id,
                completionAfterPercentage: 100,
                minutesUsed: 60,
              },
            ],
          },
          faculty,
        );
        expect(
          await tx.sessionLog.count({
            where: { scheduledSessionId: session.id },
          }),
        ).toBe(1);
        await expect(
          calendar.listSemesters(other.id, faculty),
        ).rejects.toThrow();
        await expect(
          calendar.connectSemesterSubjects(semester.id, input, manager),
        ).rejects.toThrow();
        const foreign = await tx.subject.create({
          data: {
            campusId: other.id,
            code: `x${tag}`,
            name: 'Foreign subject',
          },
        });
        await expect(
          calendar.connectSemesterSubjects(
            semester.id,
            { batchId: linked.batchId, subjectIds: [foreign.id] },
            admin,
          ),
        ).rejects.toThrow('this campus');
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await prisma.$disconnect();
  }
}, 40000);
