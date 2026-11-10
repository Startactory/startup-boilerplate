import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { validateEnvValue } from '../env/rules.mjs';
import {
  ITEM_FOR_ENVIRONMENT,
  readStartupConfig,
  startupVault,
} from '../vault/names.mjs';
import { createOp } from '../vault/op.mjs';
import { syncEnvFile } from '../vault-sync.mjs';
import { requestJson } from './http.mjs';
import { readMasterKeys } from './master-keys.mjs';

const API_HOST = 'https://api.supabase.com';
const PRODUCTION_ITEM = ITEM_FOR_ENVIRONMENT.production;
const CONNECT_ATTEMPTS = 6;
const CONNECT_WAIT_MS = 10_000;
const AUTH_FAILURE_CODES = new Set(['28P01', '28000']);

export async function defaultConnect(url) {
  const client = postgres(url, { ssl: 'require', max: 1 });
  try {
    await client`select 1`;
  } finally {
    await client.end({ timeout: 5 });
  }
}

function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWhilePasswordPropagates({ connect, url, wait }) {
  for (let attempt = 1; ; attempt++) {
    try {
      await connect(url);
      return;
    } catch (error) {
      const retryable =
        AUTH_FAILURE_CODES.has(error?.code) && attempt < CONNECT_ATTEMPTS;
      if (!retryable) {
        throw new Error(
          `database password set but connection failed: ${error?.code ?? 'unknown'}`,
        );
      }
      await wait(CONNECT_WAIT_MS);
    }
  }
}

async function storedUrlStillWorks({ connect, url }) {
  try {
    await connect(url);
    return true;
  } catch (error) {
    if (AUTH_FAILURE_CODES.has(error?.code)) return false;
    throw new Error(
      `stored DATABASE_URL could not be checked: ${error?.code ?? 'unknown'} — re-run when online, or pass --rotate`,
    );
  }
}

function pickPoolerHost(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const entry = list.find((e) => e.pool_mode === 'session') ?? list[0];
  if (!entry?.db_host) {
    throw new Error('Supabase returned no pooler host for this project');
  }
  return entry.db_host;
}

function throwIfNotFound({ response, ref }) {
  if (response.status === 404) {
    throw new Error(`Supabase project ${ref} not found`);
  }
}

export async function provisionSupabaseDatabase({
  op,
  fetch = globalThis.fetch,
  connect = defaultConnect,
  ref,
  slug,
  rotate = false,
  token,
  syncEnv = syncEnvFile,
  wait = defaultWait,
}) {
  const vault = startupVault(slug);
  const stored = op.readFields({ vault, item: PRODUCTION_ITEM });
  const storedUrl = stored?.get('DATABASE_URL');
  if (
    storedUrl &&
    !rotate &&
    (await storedUrlStillWorks({ connect, url: storedUrl }))
  ) {
    syncEnv({ op, vault, environment: 'production' });
    return 'reused';
  }

  const pooler = await requestJson({
    provider: 'supabase',
    fetch,
    method: 'GET',
    url: `${API_HOST}/v1/projects/${ref}/config/database/pooler`,
    token,
  });
  throwIfNotFound({ response: pooler, ref });
  const host = pickPoolerHost(pooler.json);
  const password = randomBytes(24).toString('base64url');
  const url = `postgresql://postgres.${ref}:${password}@${host}:5432/postgres`;

  const { errors } = validateEnvValue('DATABASE_URL', url, {
    environment: 'production',
  });
  if (errors.length > 0) {
    throw new Error(`DATABASE_URL is invalid: ${errors.join('; ')}`);
  }

  const patch = await requestJson({
    provider: 'supabase',
    fetch,
    method: 'PATCH',
    url: `${API_HOST}/v1/projects/${ref}/database/password`,
    token,
    body: { password },
  });
  throwIfNotFound({ response: patch, ref });

  op.writeFields({
    vault,
    item: PRODUCTION_ITEM,
    fields: new Map([
      ['DATABASE_URL', url],
      ['DATABASE_SSL', 'require'],
    ]),
  });

  await connectWhilePasswordPropagates({ connect, url, wait });

  syncEnv({ op, vault, environment: 'production' });
  return 'created';
}

function parseArgs(argv) {
  const index = argv.indexOf('--ref');
  const ref = index === -1 ? undefined : argv[index + 1];
  if (!ref || ref.startsWith('--')) {
    throw new Error(
      'usage: node scripts/providers/supabase-database.mjs --ref <ref> [--rotate]',
    );
  }
  return { ref, rotate: argv.includes('--rotate') };
}

async function main() {
  try {
    const { ref, rotate } = parseArgs(process.argv.slice(2));
    const { slug } = readStartupConfig();
    const op = createOp();
    const token = readMasterKeys({ op, fields: ['SUPABASE_ACCESS_TOKEN'] }).get(
      'SUPABASE_ACCESS_TOKEN',
    );
    const outcome = await provisionSupabaseDatabase({
      op,
      ref,
      slug,
      rotate,
      token,
    });
    console.log(
      `OK  database password ${outcome}, DATABASE_URL stored in ${startupVault(slug)}/${PRODUCTION_ITEM}`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('supabase-database.mjs')) {
  await main();
}
