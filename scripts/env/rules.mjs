// error: env.ts will reject it. warn: almost certainly wrong, but not fatal.
const RULES = {
  GOOGLE_CLIENT_ID: {
    warnSuffix: '.apps.googleusercontent.com',
    rejectPrefix: [
      'GOCSPX-',
      'looks like the client secret, not the client ID',
    ],
  },
  GOOGLE_CLIENT_SECRET: {
    warnPrefix: 'GOCSPX-',
    rejectSuffix: [
      '.apps.googleusercontent.com',
      'looks like the client ID, not the secret',
    ],
  },
  AUTUMN_SECRET_KEY: { warnPrefix: 'am_sk_' },
  RESEND_API_KEY: { warnPrefix: 're_' },
  RESEND_FROM_EMAIL: { email: true },
  SMTP_USER: { email: true },
  SMTP_FROM_EMAIL: { email: true },
  SMTP_PASS: { minLength: 8 },
  BETTER_AUTH_SECRET: { minLength: 32 },
  EARLY_ACCESS_PEPPER: { minLength: 16 },
  DATABASE_URL: { database: true },
  OTEL_EXPORTER_OTLP_ENDPOINT: { url: true, otlpEndpoint: true },
  OTEL_EXPORTER_OTLP_HEADERS: { otlpHeaders: true },
  OTEL_SERVICE_NAME: { minLength: 1 },
  RESEND_FULL_ACCESS_API_KEY: { warnPrefix: 're_' },
  SUPABASE_ACCESS_TOKEN: { warnPrefix: 'sbp_' },
  POSTHOG_PERSONAL_API_KEY_EU: { warnPrefix: 'phx_' },
  POSTHOG_PERSONAL_API_KEY_US: { warnPrefix: 'phx_' },
  DASH0_AUTH_TOKEN_EU: { warnPrefix: 'auth_' },
  DASH0_AUTH_TOKEN_US: { warnPrefix: 'auth_' },
  DASH0_API_URL_EU: { url: true },
  DASH0_API_URL_US: { url: true },
  DASH0_OTLP_ENDPOINT_EU: { url: true, otlpEndpoint: true },
  DASH0_OTLP_ENDPOINT_US: { url: true, otlpEndpoint: true },
};

function checkOtlpEndpoint(value, errors, warnings) {
  if (value.endsWith('/')) {
    errors.push(
      'remove the trailing slash — the exporters append /v1/<signal> themselves',
    );
  }
  if (/\/v1\/(traces|metrics|logs)\/?$/.test(value)) {
    errors.push(
      'use the base endpoint, without /v1/traces, /v1/metrics or /v1/logs',
    );
  }
  if (value.includes('dash0.com') && !/^https:\/\/ingress\./.test(value)) {
    warnings.push(
      'Dash0 ingestion endpoints look like https://ingress.<region>.aws.dash0.com — this may be the API or UI host',
    );
  }
}

function decodeOrRaw(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseHeaderPairs(value) {
  const pairs = new Map();
  for (const entry of value.split(',')) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = entry.slice(0, separatorIndex).trim().toLowerCase();
    pairs.set(key, decodeOrRaw(entry.slice(separatorIndex + 1).trim()));
  }
  return pairs;
}

function checkOtlpHeaders(value, errors, warnings) {
  const pairs = parseHeaderPairs(value);
  const authorization = pairs.get('authorization');
  if (!authorization) {
    errors.push('must contain Authorization=Bearer <token>');
    return;
  }
  if (!/^Bearer \S+$/.test(authorization)) {
    errors.push('the Authorization value must be "Bearer <token>"');
  } else if (!authorization.startsWith('Bearer auth_')) {
    warnings.push(
      'Dash0 tokens usually start with "auth_" — double-check you copied the right value',
    );
  }
  if (!pairs.get('dash0-dataset')) {
    warnings.push(
      'no Dash0-Dataset header — telemetry will land in the "default" dataset instead of this startup\'s',
    );
  }
}

function checkDatabaseUrl(value, isLocal, errors, warnings) {
  if (!/^postgres(ql)?:\/\//.test(value)) {
    errors.push('must start with postgresql://');
    return;
  }
  const match = value.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@]+)$/);
  if (!match) {
    errors.push('could not be parsed as postgresql://user:password@host/db');
    return;
  }
  const [, user, password, hostPart] = match;
  const isLocalHost = /^(localhost|127\.0\.0\.1)(:|\/|$)/.test(hostPart);
  if (isLocal && hostPart.includes('supabase')) {
    errors.push(
      '.env is the local environment and must use local Postgres — the Supabase database belongs in .env.prod',
    );
  }
  if (!isLocal && isLocalHost) {
    warnings.push(
      `the production environment points at localhost — a production file should use the Supabase session pooler`,
    );
  }
  if (/^\[.*\]$/.test(password)) {
    errors.push(
      'the password is still a placeholder — substitute the real one',
    );
  }
  if (/^db\..*\.supabase\.co/.test(hostPart)) {
    warnings.push(
      'this is the DIRECT host, which is IPv6-only and unreachable from IPv4-only CI — use the session pooler',
    );
  }
  if (hostPart.includes(':6543')) {
    warnings.push(
      'port 6543 is the transaction pooler; drizzle-kit migrate needs session mode (5432)',
    );
  }
  if (hostPart.includes('pooler.supabase.com') && !user.includes('.')) {
    warnings.push(
      `the pooler needs a tenant-qualified user (postgres.<project-ref>), got "${user}"`,
    );
  }
  if (/[^%\w\-.~]/.test(password) && !password.includes('%')) {
    warnings.push(
      'the password may need URL-encoding (@ -> %40, # -> %23, ...)',
    );
  }
}

export function validateEnvValue(key, value, options) {
  const errors = [];
  const warnings = [];
  const rule = RULES[key] ?? {};

  if (value.length === 0) errors.push('value is empty');
  if (
    /^\[.*\]$/.test(value) ||
    /^<.*>$/.test(value) ||
    value.includes('YOUR-')
  ) {
    errors.push('value is still a placeholder');
  }
  if (rule.prefix && !value.startsWith(rule.prefix)) {
    errors.push(`must start with "${rule.prefix}"`);
  }
  if (rule.minLength && value.length < rule.minLength) {
    errors.push(
      `must be at least ${rule.minLength} characters (got ${value.length})`,
    );
  }
  if (rule.url && !/^https?:\/\/.+/.test(value)) errors.push('must be a URL');
  if (rule.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    errors.push('must be an email address');
  }
  if (rule.rejectPrefix && value.startsWith(rule.rejectPrefix[0])) {
    errors.push(rule.rejectPrefix[1]);
  }
  if (rule.rejectSuffix && value.endsWith(rule.rejectSuffix[0])) {
    errors.push(rule.rejectSuffix[1]);
  }
  if (rule.warnPrefix && !value.startsWith(rule.warnPrefix)) {
    warnings.push(
      `usually starts with "${rule.warnPrefix}" — double-check you copied the right value`,
    );
  }
  if (rule.warnSuffix && !value.endsWith(rule.warnSuffix)) {
    warnings.push(
      `usually ends with "${rule.warnSuffix}" — double-check you copied the right value`,
    );
  }
  if (rule.database)
    checkDatabaseUrl(value, options.environment === 'local', errors, warnings);
  if (rule.otlpEndpoint) checkOtlpEndpoint(value, errors, warnings);
  if (rule.otlpHeaders) checkOtlpHeaders(value, errors, warnings);

  return { errors, warnings };
}

export const SECRET_KEYS = new Set([
  'BETTER_AUTH_SECRET',
  'EARLY_ACCESS_PEPPER',
  'ENCRYPTION_KEY',
  'DATABASE_URL',
  'GOOGLE_CLIENT_SECRET',
  'MICROSOFT_CLIENT_SECRET',
  'RESEND_API_KEY',
  'SMTP_PASS',
  'AUTUMN_SECRET_KEY',
  'UPSTASH_REDIS_REST_TOKEN',
  'OTEL_EXPORTER_OTLP_HEADERS',
  'VERCEL_DEPLOY_HOOK_URL',
  'RESEND_FULL_ACCESS_API_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'POSTHOG_PERSONAL_API_KEY_EU',
  'POSTHOG_PERSONAL_API_KEY_US',
  'DASH0_AUTH_TOKEN_EU',
  'DASH0_AUTH_TOKEN_US',
]);

export function isSecretKey(key) {
  return SECRET_KEYS.has(key);
}
