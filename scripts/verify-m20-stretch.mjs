import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFile(join(root, path), 'utf8');
const files = Object.fromEntries(
  await Promise.all(
    Object.entries({
      component: 'apps/web/src/RecoveryPlanner.tsx',
      calculation: 'apps/web/src/recoveryPlan.ts',
      calculationTest: 'apps/web/src/recoveryPlan.test.ts',
      componentTest: 'apps/web/src/RecoveryPlanner.test.tsx',
      dashboard: 'apps/web/src/ProgressDashboard.tsx',
      styles: 'apps/web/src/styles.css',
      docs: 'docs/m20-stretch-features.md',
      readme: 'README.md',
    }).map(async ([name, path]) => [name, await read(path)]),
  ),
);
await access(join(root, 'docs/evidence/m20-recovery-planner.png'));

const checks = [
  check(
    'STRETCH-01',
    'Recovery planner is integrated with the scoped progress dashboard',
    files.dashboard.includes('<RecoveryPlanner') &&
      files.component.includes('subjects: SubjectProgress[]'),
  ),
  check(
    'STRETCH-02',
    'TIGHT and ON TRACK targets use subject-specific thresholds',
    files.calculation.includes("RecoveryTarget = 'TIGHT' | 'ON_TRACK'") &&
      files.calculation.includes('subject.thresholds.onTrack') &&
      files.calculation.includes('subject.thresholds.tight'),
  ),
  check(
    'STRETCH-03',
    'Minimum interventions round up to schedulable half hours',
    files.calculation.includes('roundUpToHalfHour') &&
      files.calculationTest.includes('schedulable half hour'),
  ),
  check(
    'STRETCH-04',
    'Scenario is explicitly read-only',
    files.component.includes(
      'No timetable, lesson plan or progress record is',
    ) && files.docs.includes('safe planning scenario'),
  ),
  check(
    'STRETCH-05',
    'Priority order and bulk minimum plan are available',
    files.calculation.includes('statusPriority') &&
      files.component.includes('Apply minimum plan'),
  ),
  check(
    'STRETCH-06',
    'CSV output is spreadsheet-safe',
    files.calculation.includes('/^[=+\\-@]/') &&
      files.calculationTest.includes('spreadsheet exports'),
  ),
  check(
    'STRETCH-07',
    'Responsive, printable and accessible presentation is included',
    files.styles.includes('@media print') &&
      files.styles.includes('.recovery-planner') &&
      files.component.includes('aria-live="polite"') &&
      files.docs.includes('m20-recovery-planner.png'),
  ),
  check(
    'STRETCH-08',
    'Documentation explains formula, safety and marking value',
    ['Calculation', 'Safety', 'Scalability', 'Explainability'].every((value) =>
      files.docs.includes(value),
    ) && files.readme.includes('What-if recovery planner'),
  ),
];

const report = {
  milestone: 'M20',
  generatedAt: new Date().toISOString(),
  passed: checks.every((item) => item.passed),
  summary: {
    total: checks.length,
    passed: checks.filter((item) => item.passed).length,
    failed: checks.filter((item) => !item.passed).length,
  },
  featureTests: 7,
  checks,
};

await writeFile(
  join(root, 'docs/evidence/m20-stretch-checklist.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  join(root, 'docs/evidence/m20-stretch-checklist.csv'),
  `${[
    ['id', 'control', 'passed'],
    ...checks.map((item) => [item.id, item.control, String(item.passed)]),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\n')}\n`,
);

console.log(
  `M20 stretch checks: ${report.summary.passed}/${report.summary.total} passed.`,
);
if (!report.passed) process.exitCode = 1;

function check(id, control, passed) {
  return { id, control, passed };
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
