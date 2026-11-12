import * as v from 'valibot';

const NodeEnv = v.picklist(['development', 'test', 'production']);
const VercelEnv = v.picklist(['development', 'preview', 'production']);

const EnvSchema = v.object({
  NODE_ENV: v.optional(NodeEnv, 'development'),
  VERCEL_ENV: v.optional(VercelEnv, 'development'),
  VERCEL_DEPLOYMENT_ID: v.optional(v.pipe(v.string(), v.minLength(1))),
  VERCEL_GIT_COMMIT_SHA: v.optional(v.pipe(v.string(), v.minLength(1))),
  LOG_LEVEL: v.optional(
    v.picklist(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
    'debug',
  ),
  NEXT_PUBLIC_APP_URL: v.pipe(v.string(), v.url()),

  NEXT_PUBLIC_POSTHOG_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
  NEXT_PUBLIC_POSTHOG_HOST: v.optional(
    v.pipe(v.string(), v.url()),
    'https://eu.i.posthog.com',
  ),

  DATABASE_URL: v.pipe(v.string(), v.minLength(1)),
  DATABASE_SSL: v.optional(v.picklist(['allow', 'require']), 'allow'),

  BETTER_AUTH_SECRET: v.pipe(v.string(), v.minLength(32)),
  BETTER_AUTH_URL: v.pipe(v.string(), v.url()),

  GOOGLE_CLIENT_ID: v.pipe(v.string(), v.minLength(1)),
  GOOGLE_CLIENT_SECRET: v.pipe(v.string(), v.minLength(1)),

  MICROSOFT_CLIENT_ID: v.optional(v.pipe(v.string(), v.minLength(1))),
  MICROSOFT_CLIENT_SECRET: v.optional(v.pipe(v.string(), v.minLength(1))),
  MICROSOFT_TENANT_ID: v.optional(v.pipe(v.string(), v.minLength(1)), 'common'),

  ENCRYPTION_KEY: v.optional(v.string()),

  EMAIL_PROVIDER: v.optional(v.picklist(['resend', 'smtp']), 'smtp'),

  RESEND_API_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
  RESEND_FROM_EMAIL: v.optional(v.pipe(v.string(), v.email())),

  SMTP_HOST: v.optional(v.pipe(v.string(), v.minLength(1))),
  SMTP_PORT: v.optional(
    v.pipe(
      v.string(),
      v.transform((s) => Number.parseInt(s, 10)),
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(65535),
    ),
    '465',
  ),
  SMTP_USER: v.optional(v.pipe(v.string(), v.minLength(1))),
  SMTP_PASS: v.optional(v.pipe(v.string(), v.minLength(1))),
  SMTP_FROM_EMAIL: v.optional(v.pipe(v.string(), v.email())),
  SMTP_FROM_NAME: v.optional(v.pipe(v.string(), v.minLength(1))),

  UPSTASH_REDIS_REST_URL: v.optional(v.pipe(v.string(), v.url())),
  UPSTASH_REDIS_REST_TOKEN: v.optional(v.pipe(v.string(), v.minLength(1))),

  // Payments (Autumn). Optional locally (use the dev paywall-skip); required in
  // production — enforced by assertBillingConfigured below.
  AUTUMN_SECRET_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
});

export type Env = v.InferOutput<typeof EnvSchema>;

let cached: Env | null = null;

function assertEmailProviderConfigured(parsed: Env): void {
  if (parsed.EMAIL_PROVIDER === 'resend') {
    const missing: string[] = [];
    if (!parsed.RESEND_API_KEY) missing.push('RESEND_API_KEY');
    if (!parsed.RESEND_FROM_EMAIL) missing.push('RESEND_FROM_EMAIL');
    if (missing.length > 0) {
      throw new Error(`EMAIL_PROVIDER=resend requires: ${missing.join(', ')}`);
    }
    return;
  }
  const missing: string[] = [];
  if (!parsed.SMTP_HOST) missing.push('SMTP_HOST');
  if (!parsed.SMTP_USER) missing.push('SMTP_USER');
  if (!parsed.SMTP_PASS) missing.push('SMTP_PASS');
  if (!parsed.SMTP_FROM_EMAIL) missing.push('SMTP_FROM_EMAIL');
  if (missing.length > 0) {
    throw new Error(`EMAIL_PROVIDER=smtp requires: ${missing.join(', ')}`);
  }
}

function assertBillingConfigured(parsed: Env): void {
  if (parsed.VERCEL_ENV === 'production' && !parsed.AUTUMN_SECRET_KEY) {
    throw new Error(
      'AUTUMN_SECRET_KEY is required in production (payments / paywall).',
    );
  }
}

type EnvSource = Record<string, string | undefined>;

// .env.template keeps optional keys as `KEY=`; an empty value means "unset", not "invalid".
function withoutEmptyValues(source: EnvSource): EnvSource {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ''),
  );
}

export function parseEnv(source: EnvSource): Env {
  const result = v.safeParse(EnvSchema, withoutEmptyValues(source));
  if (!result.success) {
    const issues = result.issues
      .map(
        (i) =>
          `  - ${i.path?.map((p) => p.key).join('.') ?? '<root>'}: ${i.message}`,
      )
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  assertEmailProviderConfigured(result.output);
  assertBillingConfigured(result.output);
  return result.output;
}

export function env(): Env {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}
