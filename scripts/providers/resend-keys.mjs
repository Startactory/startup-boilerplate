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

const RESEND_HOST = 'https://api.resend.com';
const MASTER_KEY_FIELD = 'RESEND_FULL_ACCESS_API_KEY';
const KEY_FIELD = 'RESEND_API_KEY';
const ENVIRONMENTS = ['local', 'production'];

function assertValidEnvValue(name, value, environment) {
  const { errors } = validateEnvValue(name, value, { environment });
  if (errors.length > 0) {
    throw new Error(`${name} is invalid: ${errors.join('; ')}`);
  }
}

export async function provisionResend({
  op,
  fetch = globalThis.fetch,
  slug,
  domain,
  fullAccessKey,
  syncEnv = syncEnvFile,
}) {
  if (!domain) {
    throw new Error(
      'no domain in startup.config.json — Resend needs one (roadmap item 4); use SMTP for now',
    );
  }
  const fromEmail = `noreply@${domain}`;
  assertValidEnvValue('RESEND_FROM_EMAIL', fromEmail, 'production');

  const vault = startupVault(slug);
  const call = (options) =>
    requestJson({
      provider: 'resend',
      fetch,
      token: fullAccessKey,
      ...options,
    });

  const domains = await call({ method: 'GET', url: `${RESEND_HOST}/domains` });
  const resendDomain = (domains.json?.data ?? []).find(
    (candidate) => candidate.name === domain,
  );
  if (!resendDomain) {
    throw new Error(
      `domain ${domain} is not in Resend — add and verify it first`,
    );
  }

  const remote = await call({ method: 'GET', url: `${RESEND_HOST}/api-keys` });
  const remoteKeys = remote.json?.data ?? [];

  async function ensureKey(environment) {
    const item = ITEM_FOR_ENVIRONMENT[environment];
    const stored = op.readFields({ vault, item });
    if (stored?.get(KEY_FIELD)) return { state: 'reused' };

    const keyName = `${slug}-${environment}`;
    let state = 'created';
    for (const stale of remoteKeys.filter((key) => key.name === keyName)) {
      await call({
        method: 'DELETE',
        url: `${RESEND_HOST}/api-keys/${stale.id}`,
      });
      state = 'rotated';
    }
    const created = await call({
      method: 'POST',
      url: `${RESEND_HOST}/api-keys`,
      body: {
        name: keyName,
        permission: 'sending_access',
        domain_id: resendDomain.id,
      },
    });
    const token = created.json?.token;
    if (!token) throw new Error(`Resend returned no key for ${keyName}`);
    assertValidEnvValue(KEY_FIELD, token, environment);
    return { state, token };
  }

  const keys = {};
  for (const environment of ENVIRONMENTS) {
    keys[environment] = await ensureKey(environment);
  }

  for (const environment of ENVIRONMENTS) {
    const fields = new Map([
      ['EMAIL_PROVIDER', 'resend'],
      ['RESEND_FROM_EMAIL', fromEmail],
    ]);
    if (keys[environment].token) {
      fields.set(KEY_FIELD, keys[environment].token);
    }
    op.writeFields({
      vault,
      item: ITEM_FOR_ENVIRONMENT[environment],
      fields,
    });
  }
  for (const environment of ENVIRONMENTS) {
    syncEnv({ op, vault, environment });
  }
  return { local: keys.local.state, production: keys.production.state };
}

async function main() {
  try {
    const { slug, domain } = readStartupConfig();
    const op = createOp();
    const keys = readMasterKeys({ op, fields: [MASTER_KEY_FIELD] });
    const { local, production } = await provisionResend({
      op,
      slug,
      domain,
      fullAccessKey: keys.get(MASTER_KEY_FIELD),
    });
    const vault = startupVault(slug);
    console.log(
      `OK  Resend local ${local}, production ${production}, scoped to ${domain}, stored in ${vault}/local and ${vault}/production`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('resend-keys.mjs')) {
  await main();
}
