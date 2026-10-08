import { Queue, Worker } from 'bullmq';
import { config } from 'dotenv';
import { Redis } from 'ioredis';
import { resolve } from 'node:path';
import {
  alertJobSchedules,
  describeJob,
  processMiraiJob,
  type MiraiJobName,
} from './jobs.js';

config({ path: resolve(process.cwd(), '../../.env') });

const connection = new Redis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  { maxRetriesPerRequest: null },
);
const queue = new Queue('mirai-jobs', { connection });

async function registerAlertSchedules() {
  await Promise.all(
    alertJobSchedules.map((schedule) =>
      queue.upsertJobScheduler(
        schedule.id,
        { every: schedule.every },
        { name: schedule.name, data: {} },
      ),
    ),
  );
  console.info('[worker] M14 missed-log scans scheduled every 5 minutes');
}

const worker = new Worker(
  'mirai-jobs',
  async (job) => {
    const name = job.name as MiraiJobName;
    console.info(`[worker] ${name}: ${describeJob(name)}`);
    return processMiraiJob(name, {
      apiUrl: process.env.INTERNAL_API_URL ?? 'http://api:3000',
      internalSecret: process.env.INTERNAL_JOB_SECRET,
    });
  },
  { connection },
);

worker.on('ready', () => console.info('[worker] ready'));
worker.on('failed', (job, error) =>
  console.error(`[worker] job ${job?.id ?? 'unknown'} failed`, error),
);

void registerAlertSchedules().catch((error) =>
  console.error('[worker] failed to register M14 schedules', error),
);

async function shutdown() {
  await worker.close();
  await queue.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
