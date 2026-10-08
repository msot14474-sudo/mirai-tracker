import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFile(join(root, path), 'utf8');
const liveMode = process.argv.includes('--live');

const files = {
  compose: await read('docker-compose.production.yml'),
  dockerfile: await read('docker/Dockerfile.production'),
  caddy: await read('docker/Caddyfile'),
  nginx: await read('docker/nginx.production.conf'),
  environment: await read('.env.production.example'),
  seed: await read('apps/api/prisma/seed.ts'),
  demoVerifier: await read('apps/api/prisma/verify-demo.ts'),
};

const checks = [
  check(
    'DEP-01',
    'PostgreSQL and Redis have persistent volumes and no public host ports',
    files.compose.includes('postgres-data:/var/lib/postgresql/data') &&
      files.compose.includes('redis-data:/data') &&
      !files.compose.includes("'5432:5432'") &&
      !files.compose.includes("'6379:6379'"),
  ),
  check(
    'DEP-02',
    'Caddy terminates HTTPS and is the only public application gateway',
    files.caddy.includes('{$APP_DOMAIN}') &&
      files.compose.includes("'80:80'") &&
      files.compose.includes("'443:443'"),
  ),
  check(
    'DEP-03',
    'API migrations run before the production server starts',
    files.dockerfile.includes('prisma:migrate:deploy') &&
      files.dockerfile.includes('@mirai/api start'),
  ),
  check(
    'DEP-04',
    'API and worker run as an unprivileged user',
    (files.dockerfile.match(/USER node/g) ?? []).length >= 2,
  ),
  check(
    'DEP-05',
    'Web and API use one HTTPS origin with an /api reverse proxy',
    files.caddy.includes('handle_path /api/*') &&
      files.compose.includes('VITE_API_URL: /api'),
  ),
  check(
    'DEP-06',
    'Production services restart automatically and expose health checks',
    (files.compose.match(/restart: unless-stopped/g) ?? []).length >= 6 &&
      (files.compose.match(/healthcheck:/g) ?? []).length >= 4,
  ),
  check(
    'DEP-07',
    'Production environment template requires independent service secrets',
    [
      'POSTGRES_PASSWORD',
      'REDIS_PASSWORD',
      'SESSION_SECRET',
      'INTERNAL_JOB_SECRET',
    ].every((name) => files.environment.includes(`${name}=`)),
  ),
  check(
    'DEP-08',
    'Demo password is excluded from the persistent production environment',
    !files.compose.includes('DEMO_USER_PASSWORD:') &&
      !/^DEMO_USER_PASSWORD=/m.test(files.environment),
  ),
  check(
    'DEP-09',
    'Idempotent seed includes campus, semester, batch, timetable and sessions',
    files.seed.includes("code: 'HI-TECH'") &&
      files.seed.includes("code: 'MIRAI-A'") &&
      files.seed.includes('timetablePatterns') &&
      files.seed.includes('buildTimetableSessions'),
  ),
  check(
    'DEP-10',
    'Database-backed demo readiness verifier checks the deployed dataset',
    files.demoVerifier.includes('evaluateDemoReadiness') &&
      files.demoVerifier.includes('scheduledSession.count'),
  ),
  check(
    'DEP-11',
    'SPA fallback and browser security headers are configured',
    files.nginx.includes('try_files $uri $uri/ /index.html') &&
      files.nginx.includes('X-Content-Type-Options') &&
      files.nginx.includes('X-Frame-Options'),
  ),
];

const live = liveMode ? await verifyLiveDeployment() : null;
const passed =
  checks.every((item) => item.passed) && (!liveMode || live?.passed);
const report = {
  milestone: 'M18',
  generatedAt: new Date().toISOString(),
  status: liveMode && live?.passed ? 'live-verified' : 'configuration-ready',
  passed,
  staticSummary: {
    total: checks.length,
    passed: checks.filter((item) => item.passed).length,
  },
  live,
  checks,
};

await writeFile(
  join(root, 'docs/evidence/m18-deployment-checklist.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  join(root, 'docs/evidence/m18-deployment-checklist.csv'),
  `${[
    ['id', 'control', 'passed'],
    ...checks.map((item) => [item.id, item.control, String(item.passed)]),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\n')}\n`,
);

console.log(
  `M18 deployment checks: ${report.staticSummary.passed}/${report.staticSummary.total} static controls passed; status ${report.status}.`,
);
if (!passed) process.exitCode = 1;

function check(id, control, passed) {
  return { id, control, passed };
}

async function verifyLiveDeployment() {
  const rawUrl = process.env.M18_DEMO_URL;
  const rawApiUrl = process.env.M18_API_URL;
  const email = process.env.M18_DEMO_EMAIL;
  const password = process.env.M18_DEMO_PASSWORD;
  if (!rawUrl || !email || !password) {
    throw new Error(
      'Live verification requires M18_DEMO_URL, M18_DEMO_EMAIL and M18_DEMO_PASSWORD.',
    );
  }
  const baseUrl = new URL(rawUrl);
  const apiBaseUrl = new URL(rawApiUrl || rawUrl);
  if (baseUrl.protocol !== 'https:') {
    throw new Error('M18_DEMO_URL must use HTTPS.');
  }
  if (apiBaseUrl.protocol !== 'https:') {
    throw new Error('M18_API_URL must use HTTPS.');
  }
  const webRequest = (path, init) => fetch(new URL(path, baseUrl), init);
  const apiPrefix = rawApiUrl ? '' : '/api';
  const apiRequest = (path, init) =>
    fetch(new URL(`${apiPrefix}${path}`, apiBaseUrl), init);
  const [webHealth, apiHealth] = await Promise.all([
    webRequest(rawApiUrl ? '/' : '/health.html'),
    apiRequest('/health/ready'),
  ]);
  const login = await apiRequest('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl.origin },
    body: JSON.stringify({ email, password }),
  });
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Live login did not return a session cookie.');
  const authenticatedHeaders = { cookie };
  const [campusesResponse, dashboardResponse] = await Promise.all([
    apiRequest('/academic/campuses', { headers: authenticatedHeaders }),
    apiRequest('/progress/dashboard?asOf=2026-10-08', {
      headers: authenticatedHeaders,
    }),
  ]);
  const campuses = campusesResponse.ok ? await campusesResponse.json() : [];
  const dashboard = dashboardResponse.ok
    ? await dashboardResponse.json()
    : null;
  const liveChecks = [
    check('LIVE-01', 'Web health endpoint responds', webHealth.ok),
    check('LIVE-02', 'API and dependencies are ready', apiHealth.ok),
    check('LIVE-03', 'Demonstration login succeeds', login.ok),
    check(
      'LIVE-04',
      'At least one deployed campus is visible',
      campusesResponse.ok && Array.isArray(campuses) && campuses.length >= 1,
    ),
    check(
      'LIVE-05',
      'Deployed progress dashboard contains subjects',
      dashboardResponse.ok &&
        Array.isArray(dashboard?.subjects) &&
        dashboard.subjects.length >= 1,
    ),
  ];
  return {
    url: baseUrl.origin,
    apiUrl: apiBaseUrl.origin,
    passed: liveChecks.every((item) => item.passed),
    checks: liveChecks,
  };
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
