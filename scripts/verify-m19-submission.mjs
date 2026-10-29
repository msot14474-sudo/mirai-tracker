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
const reportPdfs = [
  'docs/submission/Test_Report.pdf',
  'docs/submission/Scalability_Report.pdf',
  'docs/submission/Architecture_and_Design.pdf',
];
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
await Promise.all(reportPdfs.map((path) => access(join(root, path))));

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
      reportPdfs.every((path) => files.index.includes(path)),
  ),
  check(
    'DOC-02',
    'Architecture identifies the live and local deployment boundaries',
    ['System architecture', 'Vercel', 'Supabase', 'local Docker'].every(
      (value) => files.architecture.includes(value),
    ),
  ),
  check(
    'DOC-03',
    'Standalone architecture diagram contains the application components',
    ['React / Vite', 'NestJS API', 'PostgreSQL', 'Redis', 'BullMQ'].every(
      (value) => files.architectureSvg.includes(value),
    ),
  ),
  check(
    'DOC-04',
    'Design document covers roles, workflows, data, calculations, security and scaling',
    [
      'Purpose and scope',
      'Deployment',
      'Data and authorization',
      'Calculation and calendar',
      'Security and operations',
    ].every((value) => files.design.includes(value)),
  ),
  check(
    'DOC-05',
    'Test Report records suite counts and mandatory evidence',
    files.tests.includes('615 passed') &&
      files.tests.includes('Mandatory evidence matrix'),
  ),
  check(
    'DOC-06',
    'Test Report states the limits of measured evidence',
    files.tests.includes('Evidence boundaries') &&
      files.tests.includes('not human phone observations'),
  ),
  check(
    'DOC-07',
    'Demo script covers all four roles in a timed walkthrough',
    [
      'Program Manager',
      'Campus Manager',
      'Faculty',
      'Student',
      'Five-minute video outline',
    ].every((value) => files.demo.includes(value)),
  ),
  check(
    'DOC-08',
    'Submission checklist distinguishes measured automated evidence',
    files.checklist.includes('automated account flows') &&
      files.checklist.includes('not establish the original five-human'),
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
  evidenceBoundaries: [
    'Automated faculty timings are not human phone observations',
    'Hosted load capacity requires a production-equivalent staging run',
    'The project owner records the final five-minute video',
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
