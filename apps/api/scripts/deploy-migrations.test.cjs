const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrationEnvironment, migrationsAlreadyApplied } = require('./deploy-migrations.cjs');
const committed = [{name:'first',checksum:'abc'}];
const applied = {migration_name:'first', checksum:'abc', finished_at:new Date(),rolled_back_at:null};
test('skips only completed unchanged migrations', () => {
  assert.equal(migrationsAlreadyApplied(committed,[applied]),true);
  assert.equal(migrationsAlreadyApplied([...committed,{name:'second',checksum:'def'}],[applied]),false);
  assert.equal(migrationsAlreadyApplied(committed,[{...applied,checksum:'changed'}]),false);
  assert.equal(migrationsAlreadyApplied(committed,[{...applied,finished_at:null}]),false);
  assert.equal(migrationsAlreadyApplied(committed,[{...applied,rolled_back_at:new Date()}]),false);
  assert.equal(migrationsAlreadyApplied(committed,[applied,{migration_name:'pending',finished_at:null,rolled_back_at:null}]),false);
  assert.equal(migrationsAlreadyApplied(committed,[]),false);
});

test('uses the direct connection only for Prisma migration deploy', () => {
  const runtime = { DATABASE_URL: 'postgresql://runtime', OTHER: 'preserved' };
  assert.equal(migrationEnvironment(runtime), runtime);

  const migration = migrationEnvironment({
    ...runtime,
    DIRECT_URL: 'postgresql://migration',
  });
  assert.equal(migration.DATABASE_URL, 'postgresql://migration');
  assert.equal(migration.DIRECT_URL, 'postgresql://migration');
  assert.equal(migration.OTHER, 'preserved');
});
