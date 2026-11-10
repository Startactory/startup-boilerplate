import nodeFs from 'node:fs';
import { validateEnvValue } from './env/rules.mjs';
import {
  ITEM_FOR_ENVIRONMENT,
  readStartupConfig,
  startupVault,
} from './vault/names.mjs';
import { createOp } from './vault/op.mjs';
import { ValidationError } from './vault-put.mjs';
import { syncEnvFile } from './vault-sync.mjs';

const NOT_A_WEB_CLIENT = 'not a Google OAuth web client file';

export function readGoogleClientFile(text) {
  let web;
  try {
    web = JSON.parse(text)?.web;
  } catch {
    throw new Error(NOT_A_WEB_CLIENT);
  }
  if (
    typeof web?.client_id !== 'string' ||
    typeof web?.client_secret !== 'string' ||
    !web.client_id ||
    !web.client_secret
  ) {
    throw new Error(NOT_A_WEB_CLIENT);
  }
  return { clientId: web.client_id, clientSecret: web.client_secret };
}

/**
 * @param {{ fs?: { readFileSync: (path: string, encoding: 'utf8') => string, writeFileSync: (path: string, data: string) => void, rmSync: (path: string) => void }, [key: string]: any }} options
 */
export function importGoogleClient({
  op,
  fs = nodeFs,
  vault,
  environment,
  path,
}) {
  const { clientId, clientSecret } = readGoogleClientFile(
    fs.readFileSync(path, 'utf8'),
  );
  const item = ITEM_FOR_ENVIRONMENT[environment];
  const fields = new Map([
    ['GOOGLE_CLIENT_ID', clientId],
    ['GOOGLE_CLIENT_SECRET', clientSecret],
  ]);
  const errors = [];
  const warnings = [];
  for (const [field, value] of fields) {
    const result = validateEnvValue(field, value, { environment });
    errors.push(...result.errors.map((message) => `${field}: ${message}`));
    warnings.push(...result.warnings.map((message) => `${field}: ${message}`));
  }
  if (errors.length > 0) throw new ValidationError(errors);

  op.writeFields({ vault, item, fields });
  syncEnvFile({ op, vault, environment, fs });
  fs.rmSync(path);
  return { item, warnings };
}

function parseArgs(argv) {
  const envIndex = argv.indexOf('--env');
  const environment = envIndex === -1 ? undefined : argv[envIndex + 1];
  const positional = argv.filter(
    (_, index) => index !== envIndex && index !== envIndex + 1,
  );
  if (
    !environment ||
    !(environment in ITEM_FOR_ENVIRONMENT) ||
    positional.length !== 1
  ) {
    throw new Error(
      'usage: node scripts/vault-import-google-client.mjs --env local|production <path>',
    );
  }
  return { environment, path: positional[0] };
}

function main() {
  let path;
  try {
    const args = parseArgs(process.argv.slice(2));
    path = args.path;
    const vault = startupVault(readStartupConfig().slug);
    const { item, warnings } = importGoogleClient({
      op: createOp(),
      vault,
      environment: args.environment,
      path,
    });
    console.log(
      `OK  GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET stored in ${vault}/${item}`,
    );
    for (const warning of warnings) console.log(`WARNING  ${warning}`);
    console.log(`deleted ${path}`);
  } catch (error) {
    console.error(error.message);
    if (path) console.error(`kept ${path} — fix the error and re-run`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('vault-import-google-client.mjs')) {
  main();
}
