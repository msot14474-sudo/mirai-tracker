/**
 * Real HTTP / PostgreSQL / Redis workload, restricted to loopback.
 * Usage: node scripts/submission-load-test.mjs <private-env.json> <private-accounts.json>
 * Passwords, OTPs and cookies never enter committed evidence.
 */
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const envPath = process.argv[2], accountPath = process.argv[3];
if (!envPath || !accountPath) throw new Error('Pass private environment and account manifest paths.');
const env = JSON.parse(await fs.readFile(envPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(accountPath, 'utf8'));
const base = `http://127.0.0.1:${env.API_PORT || 4310}`;
if (!['localhost', '127.0.0.1'].includes(new URL(env.DATABASE_URL).hostname))
  throw new Error('Load tests may run only against an isolated local database.');
process.env.DATABASE_URL = env.DATABASE_URL;
const db = new PrismaClient();
const destination = new URL('../docs/evidence/2026-10-20/', import.meta.url);
const sessionPath = new URL('./http-sessions.json', new URL(`file://${accountPath}`));
const headers = { 'Content-Type': 'application/json', Origin: env.WEB_ORIGIN };
const results = { startedAt: new Date().toISOString(), environment: {
  target: 'Loopback HTTP API with real PostgreSQL 16, Redis 7 and Mailpit OTP',
  node: process.version, platform: `${os.platform()} ${os.arch()}`, cpu: os.cpus()[0].model,
  logicalCpus: os.cpus().length, memoryGiB: Math.round(os.totalmem()/2**30), databasePool: 10,
  campuses: 3, faculty: 60, subjects: 30, students: 1020,
}, permissions: [], automatedLoggingFlows: [], load: [] };
let sessions = {};
try { sessions = JSON.parse(await fs.readFile(sessionPath, 'utf8')); } catch {}
async function request(path, account, body) {
  const start = performance.now();
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...headers, ...(account ? { Cookie: sessions[account.id] } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await response.json();
  return { status: response.status, json, milliseconds: performance.now() - start, response };
}
async function login(account) {
  if (sessions[account.id]) {
    const r = await request('/auth/me', account);
    if (r.status === 200) return;
  }
  const before = await (await fetch('http://127.0.0.1:8025/api/v1/messages')).json();
  const ids = new Set((before.messages || []).map(m => m.ID));
  const challenge = await request('/auth/login', null, { email: account.email, password: manifest.password });
  if (challenge.status !== 200) throw new Error(`Login failed for ${account.role}: HTTP ${challenge.status}`);
  let code;
  for (let attempt = 0; attempt < 20 && !code; attempt++) {
    const list = await (await fetch('http://127.0.0.1:8025/api/v1/messages')).json();
    for (const mail of (list.messages || []).filter(m => !ids.has(m.ID))) {
      const message = await (await fetch(`http://127.0.0.1:8025/api/v1/message/${mail.ID}`)).json();
      if (message.Text?.includes(`Hello ${account.name},`))
        code = message.Text.match(/verification code is (\d{6})/)?.[1];
    }
    if (!code) await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!code) throw new Error('Mailpit OTP message did not arrive.');
  const verified = await request('/auth/verify-otp', null, { challengeId: challenge.json.challengeId, code });
  if (verified.status !== 200) throw new Error(`OTP rejected: HTTP ${verified.status}`);
  sessions[account.id] = verified.response.headers.get('set-cookie').split(';')[0];
  await fs.writeFile(sessionPath, JSON.stringify(sessions), { mode: 0o600 });
}
const payload = {
  status: 'COMPLETED', overallCompletionPercentage: 100,
  coveredSummary: 'Automated local load-test revision and practice session.',
  classworkStatus: 'COMPLETED', homeworkStatus: 'NOT_ASSIGNED',
  topicUpdates: [], notes: 'Automated HTTP performance test, not a human timing observation.',
};
function stats(samples) {
  const values = samples.map(s => s.milliseconds).sort((a,b) => a-b);
  const percentile = p => Math.round(values[Math.max(0, Math.ceil(values.length*p)-1)]*100)/100;
  const failures = samples.filter(s => !s.ok);
  return { requests: values.length, errors: failures.length, errorRate: failures.length/values.length,
    p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99),
    maxMs: values.at(-1), statusCounts: samples.reduce((o,s) => ({...o,[s.status]:(o[s.status]||0)+1}), {}),
    failureExamples: failures.slice(0,3).map(s => ({status:s.status,message:s.message})) };
}
async function check(name, role, path, expected, body, validate = () => true) {
  const account = manifest.accounts.find(a => a.role === role);
  const r = await request(path, account, body);
  const pass = r.status === expected && validate(r.json);
  results.permissions.push({ name, role, expectedStatus: expected, actualStatus: r.status, pass });
  if (!pass) console.log('Permission check failed:', name, r.status);
}
try {
  await fs.mkdir(destination, { recursive: true });
  for (const account of manifest.accounts) await login(account);
  console.log(`Authenticated ${manifest.accounts.length} accounts through password and Mailpit OTP.`);
  const admin = manifest.accounts.find(a=>a.role==='ADMIN');
  const faculty = manifest.accounts.filter(a=>a.role==='FACULTY');
  const offerings = manifest.campuses.flatMap(c=>c.subjects);
  const classes = await db.scheduledSession.findMany({
    where: { offeringId: { in: offerings.map(o=>o.offeringId) }, sessionDate: { lt: new Date('2026-10-20') } },
    select: { id: true, offeringId: true, sessionDate: true }, orderBy: { sessionDate: 'desc' },
  });
  const own = offerings[0], other = offerings[1], otherCampus = manifest.campuses[1].subjects[0];
  const ownClass = classes.find(s=>s.offeringId===own.offeringId);
  const otherClass = classes.find(s=>s.offeringId===other.offeringId);
  await check('Administrator sees all 30 subjects', 'ADMIN', '/progress/dashboard?asOf=2026-10-20', 200, null, j=>j.subjects.length===30);
  await check('Program manager sees all 30 subjects', 'PROGRAM_MANAGER', '/progress/dashboard?asOf=2026-10-20', 200, null, j=>j.subjects.length===30);
  await check('Campus manager sees only own 10 subjects', 'CAMPUS_MANAGER', '/progress/dashboard?asOf=2026-10-20', 200, null, j=>j.subjects.length===10 && j.subjects.every(s=>s.campus.id===manifest.campuses[0].id));
  await check('Campus manager cannot read another campus subject', 'CAMPUS_MANAGER', `/progress/subjects/${otherCampus.offeringId}?asOf=2026-10-20`, 403);
  await check('Faculty sees only assigned subject', 'FACULTY', '/progress/dashboard?asOf=2026-10-20', 200, null, j=>j.subjects.length===1 && j.subjects[0].id===own.offeringId);
  await check('Faculty cannot read another faculty subject', 'FACULTY', `/progress/subjects/${other.offeringId}?asOf=2026-10-20`, 403);
  await check('Faculty cannot log another faculty class', 'FACULTY', `/session-logs/sessions/${otherClass.id}/logs`, 403, payload);
  await check('Student can read own overview', 'STUDENT', '/student/overview?asOf=2026-10-20', 200);
  await check('Student cannot log teaching', 'STUDENT', `/session-logs/sessions/${ownClass.id}/logs`, 403, payload);
  await check('Student cannot create progress snapshot', 'STUDENT', `/progress/subjects/${own.offeringId}/snapshots?asOf=2026-10-20`, 403, {});
  await check('Administrator cannot use faculty logging route', 'ADMIN', `/session-logs/sessions/${ownClass.id}/logs`, 403, payload);
  const dashboard = [];
  for (let i=0;i<5;i++) {
    const r=await request('/progress/dashboard?asOf=2026-10-20',admin);
    dashboard.push({ ...r, ok:r.status===200 && r.json.subjects?.length===30 });
  }
  results.fullSemesterDashboard = stats(dashboard);
  const assignments = await db.facultyAssignment.findMany({
    where: { offeringId: { in: offerings.map(o=>o.offeringId) } },
    select: { offeringId:true, type:true, staffProfile:{select:{userId:true}} },
  });
  const burstStart=performance.now();
  const burst=await Promise.all(faculty.map(async account=>{
    const assignment=assignments.find(a=>a.staffProfile.userId===account.id);
    const choices=classes.filter(s=>s.offeringId===assignment.offeringId);
    const session=choices[assignment.type==='CO_FACULTY'?1:0];
    const r=await request(`/session-logs/sessions/${session.id}/logs`,account,payload);
    return {...r,ok:r.status===201&&!!r.json.id};
  }));
  results.endOfDayBurst={distinctFaculty:faculty.length,concurrentUsers:faculty.length,seconds:Math.round((performance.now()-burstStart)/10)/100,logging:stats(burst),method:'All 60 distinct faculty submit once simultaneously, inside a 15-minute window. Not a 15-minute soak.'};
  // Five distinct fictional faculty accounts, actual request times. Not a human phone study.
  for (const [index, account] of faculty.slice(0,5).entries()) {
    const offering=offerings.find(o=>o.facultyId===account.id);
    const session=classes.find(s=>s.offeringId===offering.offeringId);
    const begin=performance.now();
    const list=await request(`/session-logs/sessions?date=${session.sessionDate.toISOString().slice(0,10)}`,account);
    const saved=await request(`/session-logs/sessions/${session.id}/logs`,account,payload);
    results.automatedLoggingFlows.push({account:`Fictional faculty ${index+1}`,method:'Automated HTTP list-and-save flow',seconds:Math.round((performance.now()-begin)/10)/100,pass:list.status===200&&saved.status===201&&!!saved.json.id});
  }
  // Real overlapping virtual-user loops, three read/write pairs per user.
  for (const concurrency of [50,60,100,200]) {
    const reads=[],writes=[],begin=performance.now();
    await Promise.all(Array.from({length:concurrency},async(_,vu)=>{
      for(let iteration=0;iteration<3;iteration++){
        const session=classes[vu*3+iteration];
        const offering=offerings.find(o=>o.offeringId===session.offeringId);
        const owner=faculty.find(a=>a.id===offering.facultyId);
        const reader=vu%10===0?admin:owner;
        const read=await request('/progress/dashboard?asOf=2026-10-20',reader);
        reads.push({status:read.status,milliseconds:read.milliseconds,ok:read.status===200&&Array.isArray(read.json.subjects),message:read.json.message});
        const write=await request(`/session-logs/sessions/${session.id}/logs`,owner,payload);
        writes.push({status:write.status,milliseconds:write.milliseconds,ok:write.status===201&&!!write.json.id,message:write.json.message});
      }
    }));
    results.load.push({concurrentUsers:concurrency,iterationsPerUser:3,seconds:Math.round((performance.now()-begin)/10)/100,dashboard:stats(reads),logging:stats(writes)});
    console.log(JSON.stringify(results.load.at(-1)));
    await fs.writeFile(new URL('load-results.json',destination),JSON.stringify(results,null,2));
  }
  results.finishedAt=new Date().toISOString();
  await fs.writeFile(new URL('load-results.json',destination),JSON.stringify(results,null,2));
} finally { await db.$disconnect(); }
