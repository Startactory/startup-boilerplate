#!/usr/bin/env node
// Set ONE environment variable in .env, validating it before writing.
//
//   printf "Paste GOOGLE_CLIENT_SECRET: "; read -rs V; echo
//   printf %s "$V" | node scripts/set-env-var.mjs GOOGLE_CLIENT_SECRET
//   unset V
//
// Reading from stdin keeps the value out of argv (visible in `ps`) and out of
// shell history. The value is never echoed — only a masked confirmation.
//
// Validation mirrors src/shared/env.ts, so a wrong paste fails here rather than
// surfacing later as a confusing build or runtime error.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const KEY = process.argv[2];
const ENV_PATH = process.argv[3] ?? '.env';

if (!KEY) {
  console.error('Usage: node scripts/set-env-var.mjs <KEY> [envFile]');
  process.exit(1);
}

// error: env.ts will reject it. warn: almost certainly wrong, but not fatal.
const RULES = {
  GOOGLE_CLIENT_ID: { warnSuffix: '.apps.googleusercontent.com' },
  GOOGLE_CLIENT_SECRET: { warnPrefix: 'GOCSPX-' },
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

function checkDatabaseUrl(value, errors, warnings) {
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

function validate(key, value) {
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
  if (rule.database) checkDatabaseUrl(value, errors, warnings);
  if (rule.otlpEndpoint) checkOtlpEndpoint(value, errors, warnings);
  if (rule.otlpHeaders) checkOtlpHeaders(value, errors, warnings);

  return { errors, warnings };
}

function mask(value) {
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 8, 24))}${value.slice(-4)}`;
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
});
process.stdin.on('end', () => {
  const value = buffer.replace(/\r?\n$/, '').trim();
  const { errors, warnings } = validate(KEY, value);

  for (const w of warnings) console.warn(`WARNING  ${KEY}: ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`ERROR    ${KEY}: ${e}`);
    console.error('\nNothing was written. Fix the value and try again.');
    process.exit(1);
  }

  if (!existsSync(ENV_PATH)) {
    console.error(`${ENV_PATH} not found — run scripts/init-env.mjs first`);
    process.exit(1);
  }

  const lines = readFileSync(ENV_PATH, 'utf8').split('\n');
  const index = lines.findIndex((l) => new RegExp(`^\\s*${KEY}\\s*=`).test(l));
  const line = `${KEY}=${value}`;
  if (index === -1) lines.push(line);
  else lines[index] = line;
  writeFileSync(ENV_PATH, lines.join('\n'));

  console.log(`OK  ${KEY} set to ${mask(value)} (${value.length} chars)`);
});
