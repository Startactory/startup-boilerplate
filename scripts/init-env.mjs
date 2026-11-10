#!/usr/bin/env node
// Bootstrap the startup's 1Password vault with everything that needs no external
// account: cryptographically random secrets and instance constants. Idempotent —
// a field that already holds a real value is never overwritten. With --apply the
// env file is then regenerated from the vault.
//
//   node scripts/init-env.mjs                                  # dry run
//   node scripts/init-env.mjs --apply
//   node scripts/init-env.mjs --apply --file .env.prod
//   node scripts/init-env.mjs --apply --app-url https://acme.com
//
// Secret values are generated in-process and written straight to the vault. They
// are never printed.

import crypto from 'node:crypto';
import {
  environmentForFile,
  ITEM_FOR_ENVIRONMENT,
  readStartupConfig,
  startupVault,
} from './vault/names.mjs';
import { createOp } from './vault/op.mjs';
import { syncEnvFile } from './vault-sync.mjs';

const SECRETS = {
  BETTER_AUTH_SECRET: () => crypto.randomBytes(32).toString('base64'),
  EARLY_ACCESS_PEPPER: () => crypto.randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: () => crypto.randomBytes(32).toString('hex'),
};

const CONSTANTS = {
  NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '465',
};

const DEFAULT_APP_URL = 'http://localhost:3000';

const POSTHOG_HOST_BY_REGION = {
  eu: 'https://eu.i.posthog.com',
  us: 'https://us.i.posthog.com',
};

function isUnset(value) {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    /^\[.*\]$/.test(value) ||
    /^<.*>$/.test(value)
  );
}

export function planInitialValues({ existing, appUrl = '', config }) {
  const urlConstants = {
    NEXT_PUBLIC_APP_URL: DEFAULT_APP_URL,
    BETTER_AUTH_URL: DEFAULT_APP_URL,
  };
  const derived = {
    ...(appUrl ? { NEXT_PUBLIC_APP_URL: appUrl, BETTER_AUTH_URL: appUrl } : {}),
    OTEL_SERVICE_NAME: config.slug,
    NEXT_PUBLIC_POSTHOG_HOST: POSTHOG_HOST_BY_REGION[config.dataRegion],
  };
  const plan = [];
  for (const [key, make] of Object.entries(SECRETS)) {
    if (isUnset(existing.get(key))) {
      plan.push({ key, next: make(), note: 'generated' });
    } else {
      plan.push({ key, next: null, note: 'kept (already set)' });
    }
  }
  for (const [key, constant] of Object.entries({
    ...CONSTANTS,
    ...urlConstants,
    ...derived,
  })) {
    const value = existing.get(key) ?? null;
    const isDerived = Object.hasOwn(derived, key);
    const next = isDerived ? derived[key] : constant;
    // Derived values are authoritative: an explicit --app-url overrides a stale URL.
    if (isUnset(value) || (isDerived && value !== next)) {
      plan.push({ key, next, note: `set to ${next}` });
    } else {
      plan.push({ key, next: null, note: `kept (${value})` });
    }
  }
  return plan;
}

export function applyPlan({ op, vault, environment, plan, fs }) {
  op.ensureVault(vault);
  const fields = new Map(
    plan
      .filter(({ next }) => next !== null)
      .map(({ key, next }) => [key, next]),
  );
  op.writeFields({ vault, item: ITEM_FOR_ENVIRONMENT[environment], fields });
  return syncEnvFile({ op, vault, environment, ...(fs ? { fs } : {}) });
}

function optionValue(args, flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  try {
    const environment = environmentForFile(optionValue(args, '--file', '.env'));
    const appUrl = optionValue(args, '--app-url', undefined);
    const config = readStartupConfig();
    const vault = startupVault(config.slug);
    const item = ITEM_FOR_ENVIRONMENT[environment];
    const op = apply ? createOp() : null;
    const existing = op
      ? (op.readFields({ vault, item }) ?? new Map())
      : new Map();
    const plan = planInitialValues({ existing, appUrl, config });
    for (const { key, note } of plan) {
      console.log(`  ${key.padEnd(26)} ${note}`);
    }
    if (!op) {
      console.log('\n[dry run] nothing written. Re-run with --apply');
      return;
    }
    const { path, keys } = applyPlan({ op, vault, environment, plan });
    console.log(
      `\n${vault}/${item} updated; ${path} regenerated (${keys} keys). Secret values were generated locally and never printed.`,
    );
    console.log('Remaining variables need an account — see step 4.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('init-env.mjs')) {
  main();
}
