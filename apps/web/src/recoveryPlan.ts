import { ProgressStatus, SubjectProgress } from './progress';

export type RecoveryTarget = 'TIGHT' | 'ON_TRACK';

export type RecoveryScenario = {
  target: RecoveryTarget;
  targetBufferRatio: number;
  proposedExtraHours: number;
  exactExtraHoursNeeded: number;
  recommendedExtraHours: number;
  projectedAvailableHours: number;
  projectedBufferRatio: number | null;
  projectedStatus: ProgressStatus;
  shortfallHours: number;
  meetsTarget: boolean;
};

export type RecoveryPlanRow = {
  subject: SubjectProgress;
  scenario: RecoveryScenario;
};

export function calculateRecoveryScenario(
  subject: Pick<
    SubjectProgress,
    'remainingHours' | 'availableHours' | 'thresholds'
  >,
  target: RecoveryTarget,
  proposedExtraHours = 0,
): RecoveryScenario {
  assertHours(subject.remainingHours, 'Remaining hours');
  assertHours(subject.availableHours, 'Available hours');
  assertHours(proposedExtraHours, 'Proposed extra hours');
  const targetBufferRatio =
    target === 'ON_TRACK'
      ? subject.thresholds.onTrack
      : subject.thresholds.tight;
  const requiredCapacity = subject.remainingHours * targetBufferRatio;
  const exactExtraHoursNeeded = Math.max(
    requiredCapacity - subject.availableHours,
    0,
  );
  const projectedAvailableHours = subject.availableHours + proposedExtraHours;
  const projectedBufferRatio =
    subject.remainingHours === 0
      ? null
      : projectedAvailableHours / subject.remainingHours;
  const projectedStatus = statusFor(
    subject.remainingHours,
    projectedBufferRatio,
    subject.thresholds,
  );
  const shortfallHours = Math.max(
    requiredCapacity - projectedAvailableHours,
    0,
  );

  return {
    target,
    targetBufferRatio,
    proposedExtraHours: round(proposedExtraHours),
    exactExtraHoursNeeded: round(exactExtraHoursNeeded),
    recommendedExtraHours: roundUpToHalfHour(exactExtraHoursNeeded),
    projectedAvailableHours: round(projectedAvailableHours),
    projectedBufferRatio:
      projectedBufferRatio === null ? null : round(projectedBufferRatio),
    projectedStatus,
    shortfallHours: round(shortfallHours),
    meetsTarget:
      subject.remainingHours === 0 ||
      (projectedBufferRatio !== null &&
        projectedBufferRatio + Number.EPSILON >= targetBufferRatio),
  };
}

export function buildRecoveryPlan(
  subjects: SubjectProgress[],
  target: RecoveryTarget,
  proposedHours: Record<string, number>,
): RecoveryPlanRow[] {
  return subjects
    .filter(
      (subject) =>
        subject.status === 'DANGER' ||
        (target === 'ON_TRACK' && subject.status === 'TIGHT'),
    )
    .map((subject) => ({
      subject,
      scenario: calculateRecoveryScenario(
        subject,
        target,
        proposedHours[subject.id] ?? 0,
      ),
    }))
    .sort(
      (left, right) =>
        statusPriority(left.subject.status) -
          statusPriority(right.subject.status) ||
        right.scenario.recommendedExtraHours -
          left.scenario.recommendedExtraHours ||
        left.subject.subject.code.localeCompare(right.subject.subject.code),
    );
}

export function buildRecoveryPlanCsv(rows: RecoveryPlanRow[]): string {
  const data = [
    [
      'subject_code',
      'subject_name',
      'campus',
      'batch',
      'current_status',
      'remaining_hours',
      'available_hours',
      'target',
      'minimum_extra_hours',
      'proposed_extra_hours',
      'projected_buffer_ratio',
      'projected_status',
      'meets_target',
    ],
    ...rows.map(({ subject, scenario }) => [
      subject.subject.code,
      subject.subject.name,
      subject.campus.name,
      subject.batch.name,
      subject.status,
      subject.remainingHours,
      subject.availableHours,
      scenario.target,
      scenario.recommendedExtraHours,
      scenario.proposedExtraHours,
      scenario.projectedBufferRatio ?? 'COMPLETE',
      scenario.projectedStatus,
      scenario.meetsTarget ? 'YES' : 'NO',
    ]),
  ];

  return `${data.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function statusFor(
  remainingHours: number,
  bufferRatio: number | null,
  thresholds: SubjectProgress['thresholds'],
): ProgressStatus {
  if (remainingHours === 0) return 'COMPLETE';
  if (bufferRatio !== null && bufferRatio >= thresholds.onTrack) {
    return 'ON_TRACK';
  }
  if (bufferRatio !== null && bufferRatio >= thresholds.tight) return 'TIGHT';
  return 'DANGER';
}

function statusPriority(status: ProgressStatus) {
  return { DANGER: 0, TIGHT: 1, ON_TRACK: 2, COMPLETE: 3 }[status];
}

function roundUpToHalfHour(value: number) {
  if (value <= Number.EPSILON) return 0;
  return Math.ceil((value - Number.EPSILON) * 2) / 2;
}

function round(value: number) {
  const result = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(result, -0) ? 0 : result;
}

function assertHours(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number.`);
  }
}

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
