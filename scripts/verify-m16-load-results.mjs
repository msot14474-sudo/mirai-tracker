import { readFile } from 'node:fs/promises';
import process from 'node:process';

const path =
  process.env.MIRAI_LOAD_OUTPUT ?? 'docs/evidence/m16-load-test-results.json';
const report = JSON.parse(await readFile(path, 'utf8'));
const expectedLevels = [50, 100, 200];
const expectedScenarios = ['dashboard', 'logging'];
const failures = [];

for (const scenario of expectedScenarios) {
  for (const concurrency of expectedLevels) {
    const result = report.results.find(
      (candidate) =>
        candidate.scenario === scenario &&
        candidate.concurrency === concurrency,
    );
    if (!result) {
      failures.push(`Missing ${scenario} result at ${concurrency} users.`);
      continue;
    }
    if (!result.passed) {
      failures.push(
        `${scenario} at ${concurrency}: p95=${result.p95Ms}ms, errors=${result.errorRatePercentage}%.`,
      );
    }
    if (
      result.requests !==
      concurrency * report.configuration.iterationsPerVirtualUser
    ) {
      failures.push(`${scenario} at ${concurrency}: unexpected request count.`);
    }
  }
}

if (failures.length) {
  console.error('M16 verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `M16 verified: ${report.results.length} scenario/level results pass with 0–1% errors, dashboard p95 <2s and logging p95 <1s.`,
  );
}
