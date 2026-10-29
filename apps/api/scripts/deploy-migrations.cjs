// Local and preview builds must never migrate the production database.
const { createHash } = require('node:crypto');
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

function migrationsAlreadyApplied(committed, recorded) {
  if (!committed.length) return false;
  if (recorded.some((row) => !row.finished_at && !row.rolled_back_at)) return false;
  return committed.every((migration) => recorded.some((row) =>
    row.migration_name === migration.name && row.checksum === migration.checksum &&
    row.finished_at && !row.rolled_back_at));
}

function migrationEnvironment(environment) {
  if (!environment.DIRECT_URL) return environment;
  return { ...environment, DATABASE_URL: environment.DIRECT_URL };
}

async function deploy() {
  if (process.env.VERCEL !== '1' || process.env.VERCEL_ENV !== 'production') return;
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  let applied = false;
  try {
    const root = join(__dirname, '../prisma/migrations');
    const committed = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, checksum: createHash('sha256')
        .update(readFileSync(join(root, entry.name, 'migration.sql'))).digest('hex') }));
    const recorded = await prisma.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"');
    applied = migrationsAlreadyApplied(committed, recorded);
  } catch {
    // An uninitialized or unavailable database must go through normal migration checks.
    console.log('Migration preflight unavailable; running Prisma migration checks.');
  } finally {
    await prisma.$disconnect();
  }
  if (applied) {
    console.log('All committed database migrations are already applied with matching checksums.');
    return;
  }
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
      stdio: 'inherit',
      env: migrationEnvironment(process.env),
    });
  if (result.error) console.error('Database migration could not start:', result.error.message);
  process.exitCode = result.status ?? 1;
}

module.exports = { migrationEnvironment, migrationsAlreadyApplied };
if (require.main === module) deploy().catch(() => {
  console.error('Database migration verification failed.');
  process.exitCode = 1;
});
