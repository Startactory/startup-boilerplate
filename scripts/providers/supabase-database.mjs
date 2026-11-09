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

export async function defaultConnect(url) {
  const client = postgres(url, { ssl: 'require', max: 1 });
  try {
    await client`select 1`;
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function canConnect({ connect, url }) {
  try {
    await connect(url);
    return true;
  } catch {
    return false;
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

export async function provisionSupabaseDatabase({
  op,
  fetch = globalThis.fetch,
  connect = defaultConnect,
  ref,
  slug,
  rotate = false,
  token,
  syncEnv = syncEnvFile,
}) {
  const vault = startupVault(slug);
  const stored = op.readFields({ vault, item: PRODUCTION_ITEM });
  const storedUrl = stored?.get('DATABASE_URL');
  if (storedUrl && !rotate && (await canConnect({ connect, url: storedUrl }))) {
    return 'reused';
  }

  const password = randomBytes(24).toString('base64url');
  await requestJson({
    provider: 'supabase',
    fetch,
    method: 'PATCH',
    url: `${API_HOST}/v1/projects/${ref}/database/password`,
    token,
    body: { password },
  });
  const pooler = await requestJson({
    provider: 'supabase',
    fetch,
    method: 'GET',
    url: `${API_HOST}/v1/projects/${ref}/config/database/pooler`,
    token,
  });
  const host = pickPoolerHost(pooler.json);
  const url = `postgresql://postgres.${ref}:${password}@${host}:5432/postgres`;

  const { errors } = validateEnvValue('DATABASE_URL', url, {
    environment: 'production',
  });
  if (errors.length > 0) {
    throw new Error(`DATABASE_URL is invalid: ${errors.join('; ')}`);
  }

  op.writeFields({
    vault,
    item: PRODUCTION_ITEM,
    fields: new Map([
      ['DATABASE_URL', url],
      ['DATABASE_SSL', 'require'],
    ]),
  });

  try {
    await connect(url);
  } catch (error) {
    throw new Error(
      `database password set but connection failed: ${error?.code ?? 'unknown'}`,
    );
  }

  syncEnv({ op, vault, environment: 'production' });
  return 'created';
}

function parseArgs(argv) {
  const index = argv.indexOf('--ref');
  const ref = index === -1 ? undefined : argv[index + 1];
  if (!ref) {
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
