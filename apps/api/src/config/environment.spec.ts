import { validateEnvironment } from './environment';

const valid = {
  NODE_ENV: 'production',
  SESSION_SECRET: 's'.repeat(40),
  INTERNAL_JOB_SECRET: 'j'.repeat(40),
  DATABASE_URL: 'postgresql://user:password@database:5432/mirai',
  REDIS_URL: 'rediss://redis.example:6379',
  WEB_ORIGIN: 'https://tracker.example.edu',
};

describe('production environment validation', () => {
  it('accepts independent production secrets and encrypted browser origin', () => {
    expect(validateEnvironment(valid)).toMatchObject({
      NODE_ENV: 'production',
    });
  });

  it.each([
    ['placeholder session secret', { SESSION_SECRET: 'replace-this-secret' }],
    ['short worker secret', { INTERNAL_JOB_SECRET: 'too-short' }],
    ['non-HTTPS browser origin', { WEB_ORIGIN: 'http://tracker.example.edu' }],
    ['deployed demo password', { DEMO_USER_PASSWORD: 'should-not-deploy' }],
  ])('rejects %s', (_label, replacement) => {
    expect(() => validateEnvironment({ ...valid, ...replacement })).toThrow(
      'Invalid Mirai environment configuration',
    );
  });

  it('requires SMTP credentials as a pair', () => {
    expect(() =>
      validateEnvironment({ ...valid, SMTP_USERNAME: 'mailer' }),
    ).toThrow('configured together');
  });
});
