import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

const target = (process.env.MIRAI_LOAD_URL ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);
const levels = numbers(process.env.MIRAI_LOAD_LEVELS ?? '50,100,200');
const iterations = positiveInteger(process.env.MIRAI_LOAD_ITERATIONS ?? '3');
const timeoutMs = positiveInteger(process.env.MIRAI_LOAD_TIMEOUT_MS ?? '10000');
const asOf = process.env.MIRAI_LOAD_AS_OF ?? '2026-10-08';
const cookie = process.env.MIRAI_LOAD_COOKIE ?? '';
const sessionIds = (process.env.MIRAI_LOAD_SESSION_IDS ?? 'session-20')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const output =
  process.env.MIRAI_LOAD_OUTPUT ?? 'docs/evidence/m16-load-test-results.json';

if (!levels.length || !sessionIds.length) {
  throw new Error('Load levels and session IDs cannot be empty.');
}

const commonHeaders = cookie ? { Cookie: cookie } : {};
const scenarios = {
  dashboard: {
    thresholdMs: 2_000,
    request: () => ({
      url: `${target}/progress/dashboard?asOf=${encodeURIComponent(asOf)}`,
      init: { headers: commonHeaders },
    }),
  },
  logging: {
    thresholdMs: 1_000,
    request: (virtualUser) => ({
      url: `${target}/session-logs/sessions/${encodeURIComponent(
        sessionIds[virtualUser % sessionIds.length],
      )}/logs`,
      init: {
        method: 'POST',
        headers: {
          ...commonHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'COMPLETED',
          overallCompletionPercentage: 100,
          coveredSummary: 'M16 end-of-day load test',
          leftOverSummary: null,
          carryForwardTopicId: null,
          classworkStatus: 'NOT_ASSIGNED',
          homeworkStatus: 'NOT_ASSIGNED',
          notes: 'Automated performance evidence; no topic progress changed.',
          mergedIntoSessionId: null,
          cancellationReason: null,
          clientElapsedSeconds: 1,
          topicUpdates: [],
        }),
      },
    }),
  },
};

await warmUp();
const results = [];
for (const concurrency of levels) {
  for (const [scenario, configuration] of Object.entries(scenarios)) {
    process.stdout.write(
      `M16 ${scenario}: ${concurrency} concurrent users × ${iterations} iterations… `,
    );
    const result = await runWave({
      scenario,
      concurrency,
      iterations,
      thresholdMs: configuration.thresholdMs,
      request: configuration.request,
    });
    results.push(result);
    console.log(
      `p95 ${result.p95Ms.toFixed(2)} ms, errors ${result.errorRatePercentage.toFixed(2)}%`,
    );
  }
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  target,
  environment: {
    kind: process.env.MIRAI_LOAD_ENVIRONMENT ?? 'local-demo',
    node: process.version,
    platform: `${os.platform()}-${os.arch()}`,
    logicalCpuCount: os.cpus().length,
  },
  configuration: {
    levels,
    iterationsPerVirtualUser: iterations,
    timeoutMs,
    asOf,
    sessionCount: sessionIds.length,
    authentication: cookie ? 'cookie supplied through environment' : 'none',
    measuredDashboardProfile: {
      campuses: Number(process.env.MIRAI_LOAD_CAMPUS_COUNT ?? 4),
      subjects: Number(process.env.MIRAI_LOAD_SUBJECT_COUNT ?? 30),
    },
    deploymentCapacityTarget: {
      campuses: 4,
      faculty: 60,
      subjects: 30,
      students: 1_000,
    },
  },
  thresholds: {
    dashboardP95Ms: 2_000,
    loggingP95Ms: 1_000,
    maximumErrorRatePercentage: 1,
  },
  results,
  passed: results.every((result) => result.passed),
};

await mkdir(new URL('../docs/evidence/', import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(output.replace(/\.json$/i, '.csv'), csvReport(results), 'utf8');
console.log(`Wrote ${output} and ${output.replace(/\.json$/i, '.csv')}`);
if (!report.passed) process.exitCode = 1;

async function warmUp() {
  for (const configuration of Object.values(scenarios)) {
    const request = configuration.request(0);
    const response = await fetch(request.url, {
      ...request.init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.arrayBuffer();
    if (!response.ok) {
      throw new Error(
        `Warm-up failed for ${request.url} with HTTP ${response.status}. ` +
          'Set MIRAI_LOAD_COOKIE and MIRAI_LOAD_SESSION_IDS for the real API.',
      );
    }
  }
}

async function runWave({
  scenario,
  concurrency,
  iterations,
  thresholdMs,
  request,
}) {
  const startedAt = performance.now();
  const virtualUsers = Array.from({ length: concurrency }, (_, virtualUser) =>
    runVirtualUser(virtualUser, iterations, request),
  );
  const samples = (await Promise.all(virtualUsers)).flat();
  const durationMs = performance.now() - startedAt;
  const latencies = samples.map((sample) => sample.durationMs).sort(numberSort);
  const errors = samples.filter((sample) => !sample.ok);
  const errorRatePercentage = (errors.length / samples.length) * 100;
  const p95Ms = percentile(latencies, 95);
  const passed = p95Ms < thresholdMs && errorRatePercentage <= 1;

  return {
    scenario,
    concurrency,
    requests: samples.length,
    successes: samples.length - errors.length,
    errors: errors.length,
    errorRatePercentage: round(errorRatePercentage),
    durationMs: round(durationMs),
    requestsPerSecond: round(samples.length / (durationMs / 1_000)),
    p50Ms: round(percentile(latencies, 50)),
    p95Ms: round(p95Ms),
    p99Ms: round(percentile(latencies, 99)),
    maxMs: round(latencies.at(-1) ?? 0),
    thresholdMs,
    passed,
    statusCounts: counts(samples.map((sample) => sample.status)),
    errorExamples: [
      ...new Set(errors.map((sample) => sample.error).filter(Boolean)),
    ].slice(0, 5),
  };
}

async function runVirtualUser(virtualUser, iterationCount, requestFor) {
  const samples = [];
  for (let iteration = 0; iteration < iterationCount; iteration += 1) {
    const request = requestFor(virtualUser, iteration);
    const startedAt = performance.now();
    try {
      const response = await fetch(request.url, {
        ...request.init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      await response.arrayBuffer();
      samples.push({
        ok: response.ok,
        status: response.status,
        durationMs: performance.now() - startedAt,
        error: response.ok ? null : `HTTP ${response.status}`,
      });
    } catch (error) {
      samples.push({
        ok: false,
        status: 'NETWORK_ERROR',
        durationMs: performance.now() - startedAt,
        error: error instanceof Error ? error.message : 'Network error',
      });
    }
  }
  return samples;
}

function percentile(sortedValues, percentileValue) {
  if (!sortedValues.length) return 0;
  const index = Math.max(
    0,
    Math.ceil((percentileValue / 100) * sortedValues.length) - 1,
  );
  return sortedValues[index];
}

function counts(values) {
  return Object.fromEntries(
    [...new Set(values)].map((value) => [
      String(value),
      values.filter((candidate) => candidate === value).length,
    ]),
  );
}

function csvReport(rows) {
  const headers = [
    'scenario',
    'concurrent_users',
    'requests',
    'successes',
    'errors',
    'error_rate_percentage',
    'requests_per_second',
    'p50_ms',
    'p95_ms',
    'p99_ms',
    'max_ms',
    'threshold_ms',
    'passed',
  ];
  return `${[
    headers.join(','),
    ...rows.map((row) =>
      [
        row.scenario,
        row.concurrency,
        row.requests,
        row.successes,
        row.errors,
        row.errorRatePercentage,
        row.requestsPerSecond,
        row.p50Ms,
        row.p95Ms,
        row.p99Ms,
        row.maxMs,
        row.thresholdMs,
        row.passed,
      ].join(','),
    ),
  ].join('\r\n')}\r\n`;
}

function numbers(value) {
  return [...new Set(value.split(',').map(Number))].filter(
    (candidate) => Number.isInteger(candidate) && candidate > 0,
  );
}

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Expected a positive integer, received ${value}.`);
  }
  return number;
}

function numberSort(left, right) {
  return left - right;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
