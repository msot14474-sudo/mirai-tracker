import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFile(join(root, path), 'utf8');
const paths = {
  index: 'SUBMISSION.md',
  readme: 'README.md',
  architecture: 'docs/architecture.md',
  architectureSvg: 'docs/architecture.svg',
  design: 'docs/design-document.md',
  tests: 'docs/test-report.md',
  demo: 'docs/demo-script.md',
  checklist: 'docs/submission-checklist.md',
};
const reportPdf = 'docs/submission/Mirai_Tracker_Submission_Report.pdf';
const files = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([name, path]) => [name, await read(path)]),
  ),
);
const evidencePaths = [
  'docs/evidence/m10-hand-calculations.csv',
  'docs/evidence/m11-progress-dashboard.png',
  'docs/evidence/m12-exam-readiness.png',
  'docs/evidence/m13-student-read-only-view.png',
  'docs/evidence/m14-missed-log-alerts.png',
  'docs/evidence/m16-load-test-results.json',
  'docs/evidence/m17-security-checklist.json',
  'docs/evidence/m18-deployment-checklist.json',
  'docs/evidence/m18-smtp-verification.json',
];
await Promise.all(evidencePaths.map((path) => readFile(join(root, path))));
await access(join(root, reportPdf));

const checks = [
  check(
    'DOC-01',
    'Submission index links every core document',
    [
      'architecture',
      'architectureSvg',
      'design',
      'tests',
      'demo',
      'checklist',
    ].every((name) => files.index.includes(paths[name])) &&
      files.index.includes(reportPdf),
  ),
  check(
    'DOC-02',
    'Architecture covers context, containers, data flow and trust boundaries',
    [
      'System context',
      'Application containers',
      'Core data flow',
      'Trust boundaries',
    ].every((value) => files.architecture.includes(value)),
  ),
  check(
    'DOC-03',
    'Standalone architecture diagram contains all production components',
    [
      'Caddy Gateway',
      'React Web',
      'NestJS API',
      'BullMQ Worker',
      'PostgreSQL',
      'Redis',
    ].every((value) => files.architectureSvg.includes(value)),
  ),
  check(
    'DOC-04',
    'Design document covers roles, workflows, data, calculations, security and scaling',
    [
      'Users and permissions',
      'Functional design',
      'Data design',
      'Security design',
      'Scalability and reliability',
    ].every((value) => files.design.includes(value)),
  ),
  check(
    'DOC-05',
    'Test Report records suite counts and mandatory evidence',
    files.tests.includes('243 automated tests') &&
      files.tests.includes('Mandatory evidence matrix'),
  ),
  check(
    'DOC-06',
    'Test Report labels unavailable evidence as pending',
    files.tests.includes('Pending external study') &&
      files.tests.includes('Hosted M16 load rerun pending'),
  ),
  check(
    'DOC-07',
    'Demo script covers all four roles in a timed walkthrough',
    [
      'Program Manager',
      'Campus Manager',
      'Faculty',
      'Student',
      '10-minute walkthrough',
    ].every((value) => files.demo.includes(value)),
  ),
  check(
    'DOC-08',
    'Submission checklist separates verified and external work',
    files.checklist.includes('Included and verified') &&
      files.checklist.includes(
        'Must be completed before claiming a fully live submission',
      ),
  ),
  check(
    'DOC-09',
    'README links the submission pack',
    files.readme.includes('SUBMISSION.md'),
  ),
  check(
    'DOC-10',
    'Required evidence files are present',
    evidencePaths.length === 9,
  ),
];

const report = {
  milestone: 'M19',
  generatedAt: new Date().toISOString(),
  passed: checks.every((item) => item.passed),
  summary: {
    total: checks.length,
    passed: checks.filter((item) => item.passed).length,
    failed: checks.filter((item) => !item.passed).length,
  },
  externalCloseOut: [
    'Hosted M16 performance rerun and disposable restore drill',
    'Five-faculty phone timing study',
    'College deadline, naming convention and demonstration date',
  ],
  checks,
};
await writeFile(
  join(root, 'docs/evidence/m19-submission-checklist.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  join(root, 'docs/evidence/m19-submission-checklist.csv'),
  `${[
    ['id', 'control', 'passed'],
    ...checks.map((item) => [item.id, item.control, String(item.passed)]),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\n')}\n`,
);
console.log(
  `M19 submission checks: ${report.summary.passed}/${report.summary.total} passed.`,
);
if (!report.passed) process.exitCode = 1;

function check(id, control, passed) {
  return { id, control, passed };
}
function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
