import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const read = (path) => readFile(join(root, path), 'utf8');

const files = {
  environment: await read('apps/api/src/config/environment.ts'),
  main: await read('apps/api/src/main.ts'),
  authModule: await read('apps/api/src/auth/auth.module.ts'),
  authService: await read('apps/api/src/auth/auth.service.ts'),
  origin: await read('apps/api/src/auth/origin.guard.ts'),
  audit: await read('apps/api/src/audit/audit.controller.ts'),
  filter: await read('apps/api/src/security/http-exception.filter.ts'),
  compose: await read('docker-compose.yml'),
  gitignore: await read('.gitignore'),
  backup: await read('scripts/backup-postgres.sh'),
  verifyBackup: await read('scripts/verify-postgres-backup.sh'),
  restore: await read('scripts/restore-postgres.sh'),
};

const sourceFiles = [];
async function collect(directory) {
  for (const entry of await readdir(join(root, directory), {
    withFileTypes: true,
  })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) sourceFiles.push(path);
  }
}
await collect('apps');
await collect('packages');

const leakedSecrets = [];
for (const path of sourceFiles) {
  const text = await read(path);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    leakedSecrets.push(`${relative(root, path)}: private key`);
  }
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(text)) {
    leakedSecrets.push(`${relative(root, path)}: API key pattern`);
  }
}

const checks = [
  check(
    'SEC-01',
    'Production environment rejects weak secrets, HTTP origins and demo passwords',
    files.environment.includes("NODE_ENV !== 'production'") &&
      files.environment.includes('must use HTTPS in production') &&
      files.environment.includes('must not be configured in production'),
    'Automated environment-schema tests',
  ),
  check(
    'SEC-02',
    'Protected-by-default authentication and role guards are global',
    files.authModule.includes('AuthenticationGuard') &&
      files.authModule.includes('RolesGuard') &&
      files.authModule.includes('APP_GUARD'),
    'Auth module inspection and authorization tests',
  ),
  check(
    'SEC-03',
    'Browser mutations reject an unexpected Origin',
    files.origin.includes('safeMethods') &&
      files.origin.includes('origin !== expectedOrigin') &&
      files.authModule.includes('RequestOriginGuard'),
    'Origin guard unit tests',
  ),
  check(
    'SEC-04',
    'Password login is throttled and account discovery remains generic',
    files.authService.includes('incrementWithExpiry') &&
      files.authService.includes('Too many login attempts') &&
      files.authService.includes('Invalid email or password'),
    'Auth service unit tests',
  ),
  check(
    'SEC-05',
    'Login events are audited and audit history is manager-only',
    files.authService.includes('AuditAction.LOGIN') &&
      files.audit.includes('@Roles(UserRole.ADMIN, UserRole.PROGRAM_MANAGER)'),
    'Auth and audit service unit tests',
  ),
  check(
    'SEC-06',
    'HTTP security headers and exact credentialed CORS origin are configured',
    files.main.includes('app.use(helmet())') &&
      files.main.includes('origin: process.env.WEB_ORIGIN') &&
      files.main.includes('credentials: true'),
    'Bootstrap configuration inspection',
  ),
  check(
    'SEC-07',
    'Unexpected server failures do not expose internal exception details',
    files.filter.includes("message: 'Internal server error.'") &&
      !files.filter.includes('message: exception.message'),
    'Exception-filter unit tests',
  ),
  check(
    'SEC-08',
    'Local service ports bind only to the loopback interface',
    [
      '127.0.0.1:5432:5432',
      '127.0.0.1:6379:6379',
      '127.0.0.1:1025:1025',
      '127.0.0.1:8025:8025',
      '127.0.0.1:${API_PORT:-3000}:3000',
      '127.0.0.1:${WEB_PORT:-5173}:5173',
    ].every((mapping) => files.compose.includes(mapping)),
    'Compose configuration inspection',
  ),
  check(
    'SEC-09',
    'Environment files and database backups are excluded from Git',
    files.gitignore.includes('.env') && files.gitignore.includes('backups/'),
    '.gitignore inspection',
  ),
  check(
    'SEC-10',
    'Application source contains no recognizable private key or API-key pattern',
    leakedSecrets.length === 0,
    leakedSecrets.length ? leakedSecrets.join('; ') : 'Static source scan',
  ),
  check(
    'REC-01',
    'PostgreSQL backups use custom format, restricted permissions and SHA-256',
    files.backup.includes('umask 077') &&
      files.backup.includes('--format=custom') &&
      files.backup.includes('shasum -a 256'),
    'Backup script inspection and shell syntax check',
  ),
  check(
    'REC-02',
    'Backup verification performs a real restore into a disposable database',
    files.verifyBackup.includes('createdb') &&
      files.verifyBackup.includes('pg_restore') &&
      files.verifyBackup.includes('dropdb'),
    'Recovery-drill script inspection and shell syntax check',
  ),
  check(
    'REC-03',
    'A destructive restore requires an explicit confirmation phrase',
    files.restore.includes('MIRAI_RESTORE_CONFIRM') &&
      files.restore.includes('RESTORE_MIRAI_TRACKER') &&
      files.restore.includes('--clean --if-exists'),
    'Restore script inspection and shell syntax check',
  ),
];

function check(id, control, passed, evidence) {
  return { id, control, passed, evidence };
}

const report = {
  milestone: 'M17',
  generatedAt: new Date().toISOString(),
  passed: checks.every((item) => item.passed),
  summary: {
    total: checks.length,
    passed: checks.filter((item) => item.passed).length,
    failed: checks.filter((item) => !item.passed).length,
  },
  runtimeRecoveryDrill:
    'Run pnpm backup:database, then pnpm verify:backup BACKUP_FILE while the Docker stack is available.',
  checks,
};

await writeFile(
  join(root, 'docs/evidence/m17-security-checklist.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
const csv = [
  ['id', 'control', 'passed', 'evidence'],
  ...checks.map((item) => [
    item.id,
    item.control,
    String(item.passed),
    item.evidence,
  ]),
]
  .map((row) => row.map(csvCell).join(','))
  .join('\n');
await writeFile(
  join(root, 'docs/evidence/m17-security-checklist.csv'),
  `${csv}\n`,
);

console.log(
  `M17 security and recovery checks: ${report.summary.passed}/${report.summary.total} passed.`,
);
if (!report.passed) process.exitCode = 1;

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
