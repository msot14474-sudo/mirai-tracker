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
  expect(roles(TimetableController.prototype.create)).not.toContain('FACULTY');
});
