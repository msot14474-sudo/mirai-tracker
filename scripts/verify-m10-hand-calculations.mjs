import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import calculations from '../packages/calculations/dist/index.js';

const { calculateSubjectProgress } = calculations;
const evidencePath = fileURLToPath(
  new URL('../docs/evidence/m10-hand-calculations.csv', import.meta.url),
);
const [headerLine, ...dataLines] = readFileSync(evidencePath, 'utf8')
  .trim()
  .split(/\r?\n/);
const headers = headerLine.split(',');
const rows = dataLines.map((line) =>
  Object.fromEntries(
    headers.map((header, index) => [header, line.split(',')[index]]),
  ),
);

const results = rows.map((row) => {
  const topics = [
    topic(
      `${row.subject_code}-completed`,
      row.completed_minutes,
      'COMPLETED',
      100,
    ),
    topic(
      `${row.subject_code}-progress`,
      row.in_progress_minutes,
      'IN_PROGRESS',
      row.in_progress_percent,
    ),
    topic(
      `${row.subject_code}-remaining`,
      row.not_started_minutes,
      'NOT_STARTED',
      0,
    ),
  ];
  if (Number(row.skipped_minutes) > 0) {
    topics.push(
      topic(`${row.subject_code}-skipped`, row.skipped_minutes, 'SKIPPED', 0),
    );
  }
  const result = calculateSubjectProgress({
    asOfDate: '2026-10-08',
    targetFinishDate: '2026-11-30',
    topics,
    sessions: [
      ...minutes(row.past_session_minutes).map((plannedMinutes, index) => ({
        sessionDate: `2026-10-0${index + 1}`,
        plannedMinutes,
        status: 'COMPLETED',
      })),
      ...minutes(row.future_session_minutes).map((plannedMinutes, index) => ({
        sessionDate: `2026-10-${String(index + 12).padStart(2, '0')}`,
        plannedMinutes,
        status: 'SCHEDULED',
      })),
    ],
  });
  const expected = {
    hoursInScope: Number(row.expected_hours_in_scope),
    coveredHours: Number(row.expected_covered_hours),
    coveragePercentage: Number(row.expected_coverage_percent),
    remainingHours: Number(row.expected_remaining_hours),
    availableHours: Number(row.expected_available_hours),
    plannedHoursByToday: Number(row.expected_planned_hours_by_today),
    paceVsPlanHours: Number(row.expected_pace_hours),
    bufferRatio: Number(row.expected_buffer_ratio),
    status: row.expected_status,
  };
  const mismatches = Object.entries(expected).filter(
    ([key, value]) => result[key] !== value,
  );
  return {
    subject: row.subject_code,
    status: result.status,
    coverage: result.coveragePercentage,
    buffer: result.bufferRatio,
    pace: result.paceVsPlanHours,
    verified: mismatches.length === 0,
    mismatches,
  };
});

console.table(results.map(({ mismatches: _mismatches, ...result }) => result));
const failed = results.filter((result) => !result.verified);
if (failed.length) {
  for (const result of failed) {
    console.error(`${result.subject}: ${JSON.stringify(result.mismatches)}`);
  }
  process.exitCode = 1;
} else {
  console.info('M10 verified: 3 of 3 hand calculations match to two decimals.');
}

function topic(id, plannedMinutes, status, completionPercentage) {
  return {
    id,
    title: id,
    plannedMinutes: Number(plannedMinutes),
    status,
    completionPercentage: Number(completionPercentage),
    plannedFinishDate: '2026-11-01',
  };
}

function minutes(value) {
  return value ? value.split(';').map(Number) : [];
}
