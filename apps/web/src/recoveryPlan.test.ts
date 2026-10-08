import { describe, expect, it } from 'vitest';
import { SubjectProgress } from './progress';
import {
  buildRecoveryPlan,
  buildRecoveryPlanCsv,
  calculateRecoveryScenario,
} from './recoveryPlan';

describe('M20 recovery calculations', () => {
  it('calculates the exact on-track capacity without changing source data', () => {
    const source = {
      remainingHours: 20,
      availableHours: 18,
      thresholds: { onTrack: 1.15, tight: 1 },
    };

    expect(calculateRecoveryScenario(source, 'ON_TRACK', 5)).toMatchObject({
      targetBufferRatio: 1.15,
      exactExtraHoursNeeded: 5,
      recommendedExtraHours: 5,
      projectedAvailableHours: 23,
      projectedBufferRatio: 1.15,
      projectedStatus: 'ON_TRACK',
      shortfallHours: 0,
      meetsTarget: true,
    });
    expect(source.availableHours).toBe(18);
  });

  it('rounds the recommendation up to a schedulable half hour', () => {
    expect(
      calculateRecoveryScenario(
        {
          remainingHours: 7,
          availableHours: 7.4,
          thresholds: { onTrack: 1.15, tight: 1 },
        },
        'ON_TRACK',
      ),
    ).toMatchObject({
      exactExtraHoursNeeded: 0.65,
      recommendedExtraHours: 1,
      shortfallHours: 0.65,
      meetsTarget: false,
    });
  });

  it('uses the selected target and ranks danger before tight', () => {
    const plan = buildRecoveryPlan(
      [subject('tight', 'TIGHT', 12, 12), subject('danger', 'DANGER', 12, 8)],
      'ON_TRACK',
      {},
    );

    expect(plan.map((row) => row.subject.id)).toEqual(['danger', 'tight']);
    expect(
      calculateRecoveryScenario(plan[0]!.subject, 'TIGHT', 4),
    ).toMatchObject({ projectedStatus: 'TIGHT', meetsTarget: true });
  });

  it('rejects invalid capacity and protects spreadsheet exports', () => {
    expect(() =>
      calculateRecoveryScenario(subject('x', 'DANGER', 10, 2), 'TIGHT', -1),
    ).toThrow(/Proposed extra hours/);
    const risky = subject('x', 'DANGER', 10, 2);
    risky.subject.code = '=CMD';
    const csv = buildRecoveryPlanCsv(
      buildRecoveryPlan([risky], 'ON_TRACK', {}),
    );
    expect(csv).toContain('"\'=CMD"');
    expect(csv).toContain('"minimum_extra_hours"');
  });
});

function subject(
  id: string,
  status: SubjectProgress['status'],
  remainingHours: number,
  availableHours: number,
): SubjectProgress {
  const bufferRatio = remainingHours ? availableHours / remainingHours : null;
  return {
    id,
    targetFinishDate: '2026-11-30',
    subject: { id: `subject-${id}`, code: `SUB-${id}`, name: `${id} subject` },
    batch: { id: 'batch-a', code: 'A', name: 'Batch A' },
    track: { id: 'track-a', code: 'TRK', name: 'Mirai Track' },
    campus: { id: 'campus-a', code: 'MAIN', name: 'Main Campus' },
    semester: { id: 'semester-a', name: 'Semester 2026' },
    lessonPlan: { id: 'plan-a', version: 1, status: 'ACTIVE' },
    scheduleVersion: 1,
    thresholds: { onTrack: 1.15, tight: 1 },
    hoursInScope: 30,
    coveredHours: 30 - remainingHours,
    coveragePercentage: ((30 - remainingHours) / 30) * 100,
    remainingHours,
    availableHours,
    plannedHoursByToday: 10,
    paceVsPlanHours: 0,
    bufferRatio,
    status,
    overdueTopics: [],
  };
}
