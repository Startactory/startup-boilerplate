import nodeFs from 'node:fs';
import { parseEnv } from './env/dotenv.mjs';
import { validateEnvValue } from './env/rules.mjs';
import {
  ENV_FILE_FOR_ENVIRONMENT,
  ITEM_FOR_ENVIRONMENT,
  readStartupConfig,
  startupVault,
} from './vault/names.mjs';
import { createOp } from './vault/op.mjs';
import { ValidationError } from './vault-put.mjs';
import { syncEnvFile } from './vault-sync.mjs';

const FIELD = 'AUTUMN_SECRET_KEY';
const SANDBOX_VARIABLE = 'AUTUMN_SECRET_KEY';
const PRODUCTION_VARIABLE = 'AUTUMN_PROD_SECRET_KEY';
const LIVE_KEY_PREFIX = 'am_sk_live_';

function validateKey({ variable, value, environment }) {
  const result = validateEnvValue(FIELD, value, { environment });
  if (result.errors.length > 0) {
    throw new ValidationError(
      result.errors.map((message) => `${variable}: ${message}`),
    );
  }
}

/**
 * @param {{ fs?: { readFileSync: (path: string, encoding: 'utf8') => string, writeFileSync: (path: string, data: string) => void }, syncEnv?: (options: any) => unknown, [key: string]: any }} options
 */
export function importAutumnKeys({
  op,
  fs = nodeFs,
  vault,
  syncEnv = syncEnvFile,
}) {
  const env = parseEnv(fs.readFileSync(ENV_FILE_FOR_ENVIRONMENT.local, 'utf8'));
  const sandboxKey = env.get(SANDBOX_VARIABLE) || undefined;
  const productionKey = env.get(PRODUCTION_VARIABLE) || undefined;
  if (!sandboxKey && !productionKey) {
    throw new Error('no Autumn keys in .env — run pnpm dlx atmn login first');
  }
  if (sandboxKey?.startsWith(LIVE_KEY_PREFIX)) {
    throw new Error(
      `${SANDBOX_VARIABLE} in .env is a live key — run atmn login again and pick the sandbox`,
    );
  }
  if (sandboxKey) {
    validateKey({
      variable: SANDBOX_VARIABLE,
      value: sandboxKey,
      environment: 'local',
    });
  }
  if (productionKey) {
    validateKey({
      variable: PRODUCTION_VARIABLE,
      value: productionKey,
      environment: 'production',
    });
  }

  for (const environment of ['local', 'production']) {
    const item = ITEM_FOR_ENVIRONMENT[environment];
    if (!op.readFields({ vault, item })) {
      const suffix = environment === 'production' ? ' --file .env.prod' : '';
      throw new Error(
        `no 1Password item ${vault}/${item} — run node scripts/init-env.mjs --apply${suffix} first`,
      );
    }
  }

  const keys = {
    local: sandboxKey,
    production: productionKey,
  };
  for (const [environment, value] of Object.entries(keys)) {
    if (!value) continue;
    op.writeFields({
      vault,
      item: ITEM_FOR_ENVIRONMENT[environment],
      fields: new Map([[FIELD, value]]),
    });
  }
  for (const environment of ['local', 'production']) {
    syncEnv({ op, vault, environment, fs });
  }
  return { local: Boolean(sandboxKey), production: Boolean(productionKey) };
}

function status(found) {
  return found ? 'stored' : 'not found';
}

function main() {
  try {
    const vault = startupVault(readStartupConfig().slug);
    const result = importAutumnKeys({ op: createOp(), vault });
    console.log(
      `OK  Autumn sandbox key ${status(result.local)} in ${vault}/local, production key ${status(result.production)} in ${vault}/production`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('vault-import-autumn-keys.mjs')) {
  main();
}
