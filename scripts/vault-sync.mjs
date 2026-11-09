import nodeFs from 'node:fs';
import { renderEnv } from './env/dotenv.mjs';
import { isSecretKey } from './env/rules.mjs';
import {
  ENV_FILE_FOR_ENVIRONMENT,
  ITEM_FOR_ENVIRONMENT,
  readStartupConfig,
  secretReference,
  startupVault,
} from './vault/names.mjs';
import { createOp } from './vault/op.mjs';

export function buildEnvValues({ fields, environment, vault }) {
  const values = new Map();
  for (const [key, value] of fields) {
    if (environment === 'production' && isSecretKey(key)) {
      values.set(
        key,
        secretReference({
          vault,
          item: ITEM_FOR_ENVIRONMENT.production,
          field: key,
        }),
      );
    } else {
      values.set(key, value);
    }
  }
  return values;
}

/**
 * @param {{ fs?: { readFileSync: (path: string, encoding: 'utf8') => string, writeFileSync: (path: string, data: string) => void }, [key: string]: any }} options
 */
export function syncEnvFile({
  op,
  vault,
  environment,
  templatePath = '.env.template',
  outPath = ENV_FILE_FOR_ENVIRONMENT[environment],
  fs = {
    readFileSync: nodeFs.readFileSync,
    writeFileSync: nodeFs.writeFileSync,
  },
}) {
  const item = ITEM_FOR_ENVIRONMENT[environment];
  const fields = op.readFields({ vault, item });
  if (!fields) {
    const suffix = environment === 'production' ? ' --file .env.prod' : '';
    throw new Error(
      `no 1Password item ${vault}/${item} — run node scripts/init-env.mjs --apply${suffix} first`,
    );
  }
  const template = fs.readFileSync(templatePath, 'utf8');
  const values = buildEnvValues({ fields, environment, vault });
  const rendered = renderEnv({ template, values });
  fs.writeFileSync(outPath, rendered);
  return { path: outPath, keys: values.size };
}

function parseEnvironment(argv) {
  const index = argv.indexOf('--env');
  const environment = index === -1 ? undefined : argv[index + 1];
  if (!environment || !(environment in ITEM_FOR_ENVIRONMENT)) {
    throw new Error(
      'usage: node scripts/vault-sync.mjs --env local|production',
    );
  }
  return environment;
}

function main() {
  try {
    const environment = parseEnvironment(process.argv.slice(2));
    const vault = startupVault(readStartupConfig().slug);
    const { path, keys } = syncEnvFile({
      op: createOp(),
      vault,
      environment,
    });
    console.log(
      `${path} regenerated from ${vault}/${ITEM_FOR_ENVIRONMENT[environment]} (${keys} keys)`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('vault-sync.mjs')) {
  main();
}
