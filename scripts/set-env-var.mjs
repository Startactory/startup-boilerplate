#!/usr/bin/env node
// Store ONE environment variable in the startup's 1Password vault, validating it
// first, then regenerate the env file from the vault.
//
//   printf "Paste GOOGLE_CLIENT_SECRET: "; read -rs V; echo
//   printf %s "$V" | node scripts/set-env-var.mjs GOOGLE_CLIENT_SECRET
//   unset V
//
// Target the production file with --file:
//   printf %s "$V" | node scripts/set-env-var.mjs --file .env.prod DATABASE_URL
//
// Reading from stdin keeps the value out of argv (visible in `ps`) and out of
// shell history. The value is never printed.

import { readFileSync } from 'node:fs';
import {
  environmentForFile,
  ITEM_FOR_ENVIRONMENT,
  readStartupConfig,
  startupVault,
} from './vault/names.mjs';
import { createOp } from './vault/op.mjs';
import { cleanValue, putValue, ValidationError } from './vault-put.mjs';
import { syncEnvFile } from './vault-sync.mjs';

const USAGE =
  'Usage: node scripts/set-env-var.mjs [--file <envFile>] <KEY>  (default file: .env)';

export function parseArgs(args) {
  const fileIndex = args.indexOf('--file');
  const file = fileIndex === -1 ? '.env' : args[fileIndex + 1];
  const positional =
    fileIndex === -1
      ? args
      : args.filter((_, i) => i !== fileIndex && i !== fileIndex + 1);
  if (!file || positional.length !== 1) throw new Error(USAGE);
  return { file, key: positional[0] };
}

function main() {
  let key;
  try {
    const args = parseArgs(process.argv.slice(2));
    key = args.key;
    const environment = environmentForFile(args.file);
    const item = ITEM_FOR_ENVIRONMENT[environment];
    const vault = startupVault(readStartupConfig().slug);
    const value = cleanValue(readFileSync(0, 'utf8'));
    const op = createOp();
    const { warnings } = putValue({ op, vault, item, field: key, value });
    console.log(
      `OK  ${key} stored in ${vault}/${item} (${value.length} chars)`,
    );
    for (const warning of warnings) console.log(`WARNING  ${key}: ${warning}`);
    const { path, keys } = syncEnvFile({ op, vault, environment });
    console.log(`${path} regenerated (${keys} keys)`);
  } catch (error) {
    if (error instanceof ValidationError) {
      for (const message of error.errors) {
        console.error(`ERROR    ${key}: ${message}`);
      }
      console.error('Nothing was written.');
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('set-env-var.mjs')) {
  main();
}
