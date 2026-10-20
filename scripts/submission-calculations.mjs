import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {PrismaClient}=require('@prisma/client');
const [envPath,accountPath,sessionPath]=process.argv.slice(2);
const env=JSON.parse(await fs.readFile(envPath,'utf8'));
if(!['localhost','127.0.0.1'].includes(new URL(env.DATABASE_URL).hostname))throw new Error('Use the isolated local test database.');
process.env.DATABASE_URL=env.DATABASE_URL;
const db=new PrismaClient();
const accounts=JSON.parse(await fs.readFile(accountPath,'utf8'));
const cookies=JSON.parse(await fs.readFile(sessionPath,'utf8'));
const admin=accounts.accounts.find(a=>a.role==='ADMIN');
const round=x=>Math.round((x+Number.EPSILON)*100)/100;
try{
 const response=await fetch(`http://127.0.0.1:${env.API_PORT}/progress/dashboard?asOf=2026-10-20`,{headers:{Cookie:cookies[admin.id]}});
 if(!response.ok)throw new Error(`Dashboard HTTP ${response.status}`);
 const dashboard=await response.json(), rows=[];
 for(const offering of accounts.campuses[0].subjects.slice(0,3)){
   const topics=await db.topic.findMany({where:{unit:{lessonPlan:{offeringId:offering.offeringId,status:'ACTIVE'}}}});
   const sessions=await db.scheduledSession.findMany({where:{offeringId:offering.offeringId,sessionDate:{gt:new Date('2026-10-20'),lte:new Date('2026-12-11')},status:{in:['SCHEDULED','IN_PROGRESS','COMPLETED']}}});
   const included=topics.filter(t=>t.status!=='SKIPPED');
   const scopeMinutes=included.reduce((n,t)=>n+t.plannedMinutes,0);
   const coveredMinutes=included.reduce((n,t)=>n+t.plannedMinutes*(t.status==='COMPLETED'?1:t.status==='IN_PROGRESS'?Number(t.currentCompletionPercentage)/100:0),0);
   const availableMinutes=sessions.reduce((n,s)=>n+(s.endsAt-s.startsAt)/60000,0);
   const remaining=scopeMinutes-coveredMinutes;
   const expected={hoursInScope:round(scopeMinutes/60),coveredHours:round(coveredMinutes/60),coveragePercentage:round(coveredMinutes/scopeMinutes*100),remainingHours:round(remaining/60),availableHours:round(availableMinutes/60),bufferRatio:round(availableMinutes/remaining)};
   const actual=dashboard.subjects.find(s=>s.id===offering.offeringId);
   const comparisons=Object.entries(expected).map(([metric,value])=>({metric,expected:value,actual:actual[metric],pass:Math.abs(value-actual[metric])<0.005}));
   rows.push({subject:offering.subject,asOf:'2026-10-20',target:'2026-12-11',topicCount:topics.length,scopeMinutes,coveredMinutes,availableMinutes,expected,actual:Object.fromEntries(Object.keys(expected).map(k=>[k,actual[k]])),status:actual.status,comparisons,pass:comparisons.every(c=>c.pass)});
 }
 await fs.writeFile(new URL('../docs/evidence/2026-10-20/calculation-reconciliation.json',import.meta.url),JSON.stringify({method:'Independent database sums compared with authenticated HTTP dashboard; no shared calculation helper used in expected values.',rows},null,2));
 console.log(JSON.stringify(rows.map(r=>({subject:r.subject,pass:r.pass,comparisons:r.comparisons})),null,2));
 if(rows.some(r=>!r.pass))process.exitCode=1;
}finally{await db.$disconnect()}
