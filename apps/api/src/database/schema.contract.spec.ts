import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { Prisma } from '@prisma/client';

const model = (name: string) =>
  Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === name);

const migrationDirectory = resolve(__dirname, '../../prisma/migrations');
const migrationSql = readdirSync(migrationDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) =>
    readFileSync(
      resolve(migrationDirectory, entry.name, 'migration.sql'),
      'utf8',
    ),
  )
  .join('\n');

describe('Problem 1 database contract', () => {
  it('requires login OTP by default for every new account', () => {
    expect(
      model('User')?.fields.find((field) => field.name === 'loginOtpRequired'),
    ).toMatchObject({
      type: 'Boolean',
      isRequired: true,
      default: true,
    });
  });

  it('contains the complete required domain model', () => {
    const expectedModels = [
      'Campus',
      'PasswordCredential',
      'Semester',
      'CalendarDayOverride',
      'ExamWindow',
      'Track',
      'Batch',
      'Subject',
      'SubjectOffering',
      'FacultyAssignment',
      'TimetableEntry',
      'ScheduledSession',
      'LessonPlan',
      'Unit',
      'Topic',
      'ExamScope',
      'TopicScheduleVersion',
      'TopicSchedule',
      'SessionLog',
      'SessionTopicUpdate',
      'ProgressSnapshot',
      'MissedLogAlert',
      'NotificationDelivery',
      'ImportJob',
      'ImportError',
      'AuditEvent',
    ];

    expect(expectedModels.filter((name) => !model(name))).toEqual([]);
  });

  it('stores planned topic duration in minutes and completion as a decimal', () => {
    const fields = model('Topic')?.fields ?? [];
    expect(fields.find((field) => field.name === 'plannedMinutes')?.type).toBe(
      'Int',
    );
    expect(
      fields.find((field) => field.name === 'currentCompletionPercentage')
        ?.type,
    ).toBe('Decimal');
  });

  it('keeps subject definitions separate from batch-specific offerings', () => {
    const offeringFields = model('SubjectOffering')?.fields ?? [];
    expect(offeringFields.some((field) => field.name === 'subjectId')).toBe(
      true,
    );
    expect(offeringFields.some((field) => field.name === 'batchId')).toBe(true);
  });

  it('supports topic-level exam scopes and session progress updates', () => {
    expect(model('ExamScope')).toBeDefined();
    expect(model('SessionTopicUpdate')).toBeDefined();
    expect(
      model('SessionTopicUpdate')?.fields.some(
        (field) => field.name === 'completionAfterPercentage',
      ),
    ).toBe(true);
  });

  it('contains every required session log status', () => {
    const status = Prisma.dmmf.datamodel.enums.find(
      (candidate) => candidate.name === 'SessionLogStatus',
    );
    expect(status?.values.map((value) => value.name)).toEqual([
      'COMPLETED',
      'IN_PROGRESS',
      'SKIPPED',
      'MERGED',
      'CANCELLED',
    ]);
  });

  it('enforces role scope, percentages and positive teaching durations in PostgreSQL', () => {
    expect(migrationSql).toContain('CREATE TABLE "PasswordCredential"');
    expect(migrationSql).toContain('RoleAssignment_scope_check');
    expect(migrationSql).toContain('Topic_completion_percentage_check');
    expect(migrationSql).toContain('Topic_planned_minutes_check');
    expect(migrationSql).toContain('ScheduledSession_time_range_check');
  });

  it('allows signed pace while protecting progress snapshot totals', () => {
    expect(migrationSql).toContain(
      'DROP CONSTRAINT "ProgressSnapshot_nonnegative_values_check"',
    );
    expect(migrationSql).toContain('ProgressSnapshot_scope_consistency_check');
  });
});
