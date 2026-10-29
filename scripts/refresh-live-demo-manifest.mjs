import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const path = resolve(
  process.argv[2] ?? 'outputs/submission-20261020/live-demo-accounts.json',
);
const api = (process.env.MIRAI_LIVE_API_URL ??
  'https://mirai-tracker.vercel.app/api').replace(/\/$/, '');
const manifest = JSON.parse(await readFile(path, 'utf8'));
const originalCampusIds = new Map(manifest.campuses.map((c) => [c.id, c.code]));
const sessions = new Map();

async function request(route, options = {}, cookie) {
  const response = await fetch(`${api}${route}`, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${route} returned HTTP ${response.status}`);
  }
  return { body, cookie: response.headers.get('set-cookie') ?? cookie };
}

for (const account of manifest.accounts) {
  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: account.email, password: manifest.password }),
  });
  if (!login.body?.user || !login.cookie) {
    throw new Error(`${account.email} requires an OTP or did not create a session`);
  }
  account.id = login.body.user.id;
  sessions.set(account.email, login.cookie);
}

for (const campus of manifest.campuses) {
  const oldCampusId = campus.id;
  const manager = manifest.accounts.find(
    (account) =>
      account.role === 'CAMPUS_MANAGER' && account.campusId === oldCampusId,
  );
  if (!manager) throw new Error(`No campus manager found for ${campus.code}`);
  const cookie = sessions.get(manager.email);
  const accessible = await request('/academic/campuses', {}, cookie);
  const currentCampus = accessible.body.find((row) => row.code === campus.code);
  if (!currentCampus) throw new Error(`Campus ${campus.code} is not accessible`);
  campus.id = currentCampus.id;
  campus.managerId = manager.id;

  const semesters = await request(
    `/academic/campuses/${currentCampus.id}/semesters`,
    {},
    cookie,
  );
  const semester = semesters.body.find((row) => row.name === campus.semester);
  if (!semester) throw new Error(`Semester not found for ${campus.code}`);
  campus.semesterId = semester.id;

  const summary = await request(
    `/reports/summary?campusId=${currentCampus.id}&semesterId=${semester.id}`,
    {},
    cookie,
  );
  const rows = summary.body.subjects ?? [];
  for (const subject of campus.subjects) {
    const current = rows.find((row) => row.subject.name === subject.subject);
    if (!current) throw new Error(`Subject ${subject.subject} was not found`);
    subject.offeringId = current.id;
    subject.facultyId = current.teachers[0]?.id ?? null;
    subject.sessions = current.scheduled;
    subject.logs = current.logged;
    subject.metrics = current.metrics;
  }
  campus.batchId = rows[0]?.batch?.id ?? campus.batchId;
}

const currentCampusIds = new Map(manifest.campuses.map((c) => [c.code, c.id]));
for (const account of manifest.accounts) {
  const code = originalCampusIds.get(account.campusId);
  if (code) account.campusId = currentCampusIds.get(code);
}
manifest.generatedAt = new Date().toISOString();
manifest.profile = `${manifest.profile ?? 'live-demo'}; identifiers refreshed from live authorized APIs`;

const temporary = `${path}.tmp`;
await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
  mode: 0o600,
});
await rename(temporary, path);
console.log(
  `Refreshed ${manifest.accounts.length} accounts and ${manifest.campuses.length} campuses without printing credentials.`,
);
