#!/usr/bin/env node
// Set ONE environment variable in .env, validating it before writing.
//
//   printf "Paste GOOGLE_CLIENT_SECRET: "; read -rs V; echo
//   printf %s "$V" | node scripts/set-env-var.mjs GOOGLE_CLIENT_SECRET
//   unset V
//
// Target another file with --file (e.g. the production file):
//   printf %s "$V" | node scripts/set-env-var.mjs --file .env.prod DATABASE_URL
//
// Reading from stdin keeps the value out of argv (visible in `ps`) and out of
// shell history. The value is never echoed — only a masked confirmation.
//
// Validation mirrors src/shared/env.ts, so a wrong paste fails here rather than
// surfacing later as a confusing build or runtime error.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { validateEnvValue } from './env/rules.mjs';

const args = process.argv.slice(2);
const fileFlagIndex = args.indexOf('--file');
const fileFlagValue =
  fileFlagIndex === -1 ? undefined : args[fileFlagIndex + 1];
const positional =
  fileFlagIndex === -1
    ? args
    : args.filter((_, i) => i !== fileFlagIndex && i !== fileFlagIndex + 1);
const KEY = positional[0];
const ENV_PATH = fileFlagValue ?? positional[1] ?? '.env';
const IS_LOCAL_FILE = ENV_PATH.replace(/^.*\//, '') === '.env';

if (!KEY || (fileFlagIndex !== -1 && !fileFlagValue)) {
  console.error(
    'Usage: node scripts/set-env-var.mjs [--file <envFile>] <KEY>  (default file: .env)',
  );
  process.exit(1);
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
  const { errors, warnings } = validateEnvValue(KEY, value, {
    environment: IS_LOCAL_FILE ? 'local' : 'production',
  });

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
