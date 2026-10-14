// Apply committed migrations before a production deployment can become ready.
// Local and preview builds must never migrate the production database.
if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production') {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    { stdio: 'inherit' },
  );
  if (result.error)
    console.error('Database migration could not start:', result.error.message);
  process.exit(result.status ?? 1);
}
