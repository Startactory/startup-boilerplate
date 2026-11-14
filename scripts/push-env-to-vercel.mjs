#!/usr/bin/env node
// Push environment variables from a .env file into a Vercel project.
//
//   node scripts/push-env-to-vercel.mjs                 # dry run against .env / production
//   node scripts/push-env-to-vercel.mjs --apply
//   node scripts/push-env-to-vercel.mjs --env production --file .env.prod --apply
//
// op:// references in the file are resolved through `op inject` before anything is
// pushed. Values are streamed to the Vercel CLI over stdin and are never printed,
// so this is safe to run with output attached to a terminal or a log.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from './env/dotenv.mjs';
import { createOp } from './vault/op.mjs';

const REFERENCE_PREFIX = 'op://';

// Vercel injects these itself; pushing them causes confusing overrides.
const VERCEL_MANAGED = new Set([
  'NODE_ENV',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_REGION',
  'VERCEL_DEPLOYMENT_ID',
  'VERCEL_GIT_COMMIT_SHA',
]);

// Mirrors src/shared/env.ts. Keep in sync when the schema changes.
const REQUIRED = [
  'NEXT_PUBLIC_APP_URL',
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
];
const REQUIRED_IN_PRODUCTION = ['AUTUMN_SECRET_KEY'];

function isPlaceholder(v) {
  return /^\[.*\]$/.test(v) || /^<.*>$/.test(v) || v.includes('YOUR-PASSWORD');
}

function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

export function resolveEnvValues({ path, op, fs }) {
  const raw = fs.readFileSync(path, 'utf8');
  const values = parseEnv(raw);
  const referenceLines = [...values]
    .filter(([, value]) => value.startsWith(REFERENCE_PREFIX))
    .map(([key, value]) => `${key}=${value}`);
  if (referenceLines.length > 0) {
    const resolved = parseEnv(op.injectText(`${referenceLines.join('\n')}\n`));
    for (const [key, value] of resolved) values.set(key, value);
  }
  const unresolved = [...values]
    .filter(([, value]) => value.startsWith(REFERENCE_PREFIX))
    .map(([key]) => key);
  if (unresolved.length > 0) {
    throw new Error(
      `Unresolved 1Password references: ${unresolved.sort().join(', ')}`,
    );
  }
  return values;
}

const PUBLIC_PREFIX = 'NEXT_PUBLIC_';

function cliErrorMessage(stderr) {
  const text = (stderr || '').trim();
  const json = text.slice(text.indexOf('{'));
  try {
    const message = JSON.parse(json)?.message;
    if (typeof message === 'string' && message) return message;
  } catch {
    // not a JSON error body; fall back to the last line
  }
  return text.split('\n').pop();
}

export function pushEnv({ values, target, run }) {
  const pushable = [...values.keys()]
    .filter((k) => !VERCEL_MANAGED.has(k))
    .sort();
  let ok = 0;
  let failed = 0;
  for (const key of pushable) {
    // Remove first so re-runs are idempotent; a missing var makes this a no-op.
    run('vercel', ['env', 'rm', key, '--environment', target, '--yes'], {
      stdio: 'ignore',
    });
    // the CLI refuses a NEXT_PUBLIC_ value that looks like a credential unless told it is public
    const typeArgs = key.startsWith(PUBLIC_PREFIX) ? ['--type', 'config'] : [];
    const res = run(
      'vercel',
      ['env', 'add', key, '--environment', target, ...typeArgs],
      { input: values.get(key), encoding: 'utf8' },
    );
    if (res.status === 0) {
      console.log(`  pushed  ${key}`);
      ok += 1;
    } else {
      console.error(`  FAILED  ${key}: ${cliErrorMessage(res.stderr)}`);
      failed += 1;
    }
  }
  return { ok, failed };
}

export function main({ argv, op, run, fs }) {
  const apply = argv.includes('--apply');
  const target = flagValue(argv, '--env') ?? 'production';
  const envFile = flagValue(argv, '--file') ?? '.env';

  if (!fs.existsSync(envFile)) {
    console.error(`${envFile} not found`);
    return 1;
  }
  if (!fs.existsSync('.vercel/project.json')) {
    console.error('Project is not linked to Vercel. Run `vercel link` first.');
    return 1;
  }
  if (run('vercel', ['--version'], { encoding: 'utf8' }).status !== 0) {
    console.error('Vercel CLI not found. Install it: npm i -g vercel@latest');
    return 1;
  }

  let vars;
  try {
    vars = resolveEnvValues({ path: envFile, op, fs });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  // Fail loudly rather than deploying a half-configured app.
  const required = [
    ...REQUIRED,
    ...(target === 'production' ? REQUIRED_IN_PRODUCTION : []),
  ];
  const missing = required.filter((k) => !vars.has(k));
  const placeholders = required.filter(
    (k) => vars.has(k) && isPlaceholder(vars.get(k)),
  );

  if (missing.length > 0) {
    console.error(`Missing required variables in ${envFile}:`);
    for (const k of missing) console.error(`  - ${k}`);
  }
  if (placeholders.length > 0) {
    console.error('Variables still holding a placeholder value:');
    for (const k of placeholders) console.error(`  - ${k}`);
  }
  if (missing.length > 0 || placeholders.length > 0) return 1;

  // Localhost URLs in a production push is nearly always a mistake — warn, don't rewrite.
  if (target === 'production') {
    for (const k of ['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL']) {
      if (vars.get(k)?.includes('localhost')) {
        console.warn(
          `WARNING  ${k} points at localhost — set the production URL first.`,
        );
      }
    }
    if (vars.get('DATABASE_SSL') !== 'require') {
      console.warn(
        'WARNING  DATABASE_SSL is not "require" (hosted Postgres needs SSL).',
      );
    }
  }

  const pushable = [...vars.keys()]
    .filter((k) => !VERCEL_MANAGED.has(k))
    .sort();
  console.log(`${envFile} → Vercel "${target}"`);
  console.log(`  ${pushable.length} variables to push`);
  console.log(
    `  skipped (Vercel-managed): ${[...vars.keys()].filter((k) => VERCEL_MANAGED.has(k)).join(', ') || 'none'}`,
  );

  if (!apply) {
    console.log('\nVariables:');
    for (const k of pushable) console.log(`  ${k}`);
    console.log('\n[dry run] nothing pushed. Re-run with --apply');
    return 0;
  }

  const { ok, failed } = pushEnv({ values: vars, target, run });
  console.log(`\n${ok} pushed, ${failed} failed`);
  console.log(
    'The new values apply from the next production deploy: the next merge into master, or gh run rerun <id> --repo <repository> on the latest production.yml run.',
  );
  console.log(
    'Never deploy from this machine with the Vercel CLI: it skips CI and its migrations.',
  );
  return failed > 0 ? 1 : 0;
}

if (process.argv[1]?.endsWith('push-env-to-vercel.mjs')) {
  const code = main({
    argv: process.argv.slice(2),
    op: createOp(),
    run: (command, args, options) => spawnSync(command, args, options),
    fs: { existsSync, readFileSync },
  });
  process.exit(code);
}
