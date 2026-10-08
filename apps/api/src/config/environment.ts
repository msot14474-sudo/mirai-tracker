import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required.'),
    INTERNAL_JOB_SECRET: z.string().min(1, 'INTERNAL_JOB_SECRET is required.'),
    DATABASE_URL: z
      .string()
      .refine(
        (value) =>
          value.startsWith('postgresql://') || value.startsWith('postgres://'),
        'DATABASE_URL must be a PostgreSQL URL.',
      ),
    REDIS_URL: z
      .string()
      .refine(
        (value) =>
          value.startsWith('redis://') || value.startsWith('rediss://'),
        'REDIS_URL must be a Redis URL.',
      ),
    WEB_ORIGIN: z.string().url(),
    SMTP_USERNAME: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    DEMO_USER_PASSWORD: z.string().optional(),
  })
  .superRefine((environment, context) => {
    if (
      Boolean(environment.SMTP_USERNAME) !== Boolean(environment.SMTP_PASSWORD)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_USERNAME'],
        message: 'SMTP_USERNAME and SMTP_PASSWORD must be configured together.',
      });
    }

    if (environment.NODE_ENV !== 'production') return;
    for (const key of ['SESSION_SECRET', 'INTERNAL_JOB_SECRET'] as const) {
      const value = environment[key];
      if (value.length < 32 || value.startsWith('replace-')) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must be an independent random value of at least 32 characters in production.`,
        });
      }
    }
    if (!environment.WEB_ORIGIN.startsWith('https://')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WEB_ORIGIN'],
        message: 'WEB_ORIGIN must use HTTPS in production.',
      });
    }
    if (environment.DEMO_USER_PASSWORD) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEMO_USER_PASSWORD'],
        message: 'DEMO_USER_PASSWORD must not be configured in production.',
      });
    }
  });

export function validateEnvironment(environment: NodeJS.ProcessEnv) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid Mirai environment configuration:\n${details}`);
  }
  return result.data;
}
