import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const inputPath = resolve(
  process.cwd(),
  process.argv[2] ?? 'docs/evidence/m09-logging-speed-study.csv',
);
const source = await readFile(inputPath, 'utf8');
const lines = source
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
const header = lines.shift()?.split(',') ?? [];
const secondsIndex = header.indexOf('seconds');
if (secondsIndex === -1) throw new Error('CSV must contain a seconds column.');

const seconds = lines
  .map((line) => line.split(',')[secondsIndex]?.trim())
  .filter((value) => value)
  .map(Number);
if (
  seconds.length < 5 ||
  seconds.some((value) => !Number.isFinite(value) || value <= 0)
) {
  throw new Error(
    'Record valid completion times for at least five faculty volunteers before evaluating M09.',
  );
}

seconds.sort((left, right) => left - right);
const middle = Math.floor(seconds.length / 2);
const median =
  seconds.length % 2 === 0
    ? (seconds[middle - 1] + seconds[middle]) / 2
    : seconds[middle];
const result = {
  volunteers: seconds.length,
  seconds,
  medianSeconds: Math.round(median * 100) / 100,
  requirement: 'median under 60 seconds',
  pass: median < 60,
};
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
