import 'reflect-metadata';
import { REQUIRED_ROLES_KEY } from './auth.constants';
import { TimetableController } from '../timetable/timetable.controller';
import { LessonPlanController } from '../lesson-plan/lesson-plan.controller';
import { FacultyAccessController } from '../faculty-access/faculty-access.controller';
import { TopicScheduleController } from '../topic-schedule/topic-schedule.controller';
const roles = (handler: Function) =>
  Reflect.getMetadata(REQUIRED_ROLES_KEY, handler) as string[];
it('keeps program managers out of operational editing endpoints', () => {
  for (const method of [
    TimetableController.prototype.create,
    TimetableController.prototype.update,
    TimetableController.prototype.archive,
    TimetableController.prototype.generate,
    LessonPlanController.prototype.execute,
    LessonPlanController.prototype.updateTopic,
    LessonPlanController.prototype.activate,
    FacultyAccessController.prototype.createFaculty,
    FacultyAccessController.prototype.updateAccount,
    FacultyAccessController.prototype.createAdministrator,
    TopicScheduleController.prototype.move,
  ]) {
    expect(roles(method)).not.toContain('PROGRAM_MANAGER');
  }
});
it('lets campus managers manage timetables and faculty, but not faculty lesson plans or administrators', () => {
  expect(roles(TimetableController.prototype.create)).toContain(
    'CAMPUS_MANAGER',
  );
  expect(roles(FacultyAccessController.prototype.createFaculty)).toContain(
    'CAMPUS_MANAGER',
  );
  expect(roles(LessonPlanController.prototype.execute)).not.toContain(
    'CAMPUS_MANAGER',
  );
  expect(
    roles(FacultyAccessController.prototype.createAdministrator),
  ).not.toContain('CAMPUS_MANAGER');
});
it('keeps faculty logging workflow editing available to faculty', () => {
  expect(roles(LessonPlanController.prototype.execute)).toContain('FACULTY');
  expect(roles(TopicScheduleController.prototype.move)).toContain('FACULTY');
  expect(roles(TopicScheduleController.prototype.setCancellation)).toContain(
    'FACULTY',
  );
  expect(roles(TimetableController.prototype.create)).not.toContain('FACULTY');
});

// Exercise the same effective controller/method permissions used for HTTP requests.
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { SemesterImportController } from '../semester-import/semester-import.controller';
import { AiInsightsController } from '../ai-insights/ai-insights.controller';
import { MissedLogAlertController } from '../missed-log-alert/missed-log-alert.controller';
const guard = new RolesGuard(new Reflector());
it.each([
  [SemesterImportController, 'importProgress', [false, false, false]],
  [SemesterImportController, 'previewProgress', [false, false, false]],
  [SemesterImportController, 'inspectProgress', [false, false, false]],
  [SemesterImportController, 'calendarCommit', [true, false, false]],
  [TopicScheduleController, 'move', [false, false, true]],
  [TopicScheduleController, 'setCancellation', [false, false, true]],
  [TimetableController, 'create', [false, true, false]],
  [LessonPlanController, 'execute', [false, false, true]],
  [AiInsightsController, 'report', [true, true, true]],
  [MissedLogAlertController, 'testEmail', [false, false, false]],
] as const)(
  'enforces PDF boundaries on %p.%s',
  (controller, method, expected) => {
    ['PROGRAM_MANAGER', 'CAMPUS_MANAGER', 'FACULTY'].forEach((role, index) => {
      const context = {
        getClass: () => controller,
        getHandler: () => (controller.prototype as any)[method],
        switchToHttp: () => ({
          getRequest: () => ({ user: { roles: [{ role }] } }),
        }),
      } as unknown as ExecutionContext;
      expect(guard.canActivate(context)).toBe(expected[index]);
    });
  },
);

it('keeps administrators out of teaching-operation writes', () => {
  for (const method of [
    TimetableController.prototype.create,
    TimetableController.prototype.update,
    TimetableController.prototype.archive,
    TimetableController.prototype.generate,
    LessonPlanController.prototype.execute,
    LessonPlanController.prototype.activate,
    LessonPlanController.prototype.updateTopic,
    TopicScheduleController.prototype.move,
    TopicScheduleController.prototype.setCancellation,
  ]) {
    expect(roles(method)).not.toContain('ADMIN');
  }
});

it('keeps campus managers out of faculty plan and individual class operations', () => {
  for (const method of [
    LessonPlanController.prototype.execute,
    LessonPlanController.prototype.activate,
    TopicScheduleController.prototype.calculate,
    TopicScheduleController.prototype.move,
    TopicScheduleController.prototype.setCancellation,
  ]) {
    expect(roles(method)).not.toContain('CAMPUS_MANAGER');
  }
});

import { AcademicCalendarController } from '../academic-calendar/academic-calendar.controller';
it.each([
  ['ADMIN', true],
  ['CAMPUS_MANAGER', true],
  ['PROGRAM_MANAGER', false],
  ['FACULTY', false],
  ['STUDENT', false],
])('checks %s teacher-assignment access', (role, allowed) => {
  const context = {
    getClass: () => AcademicCalendarController,
    getHandler: () => AcademicCalendarController.prototype.assignTeacher,
    switchToHttp: () => ({
      getRequest: () => ({ user: { roles: [{ role }] } }),
    }),
  } as unknown as ExecutionContext;
  expect(guard.canActivate(context)).toBe(allowed);
});
