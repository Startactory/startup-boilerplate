import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validateEnvValue } from './env/rules.mjs';
import {
  FOUNDER_VAULT,
  ITEM_FOR_ENVIRONMENT,
  readStartupConfig,
  startupVault,
} from './vault/names.mjs';
import { createOp } from './vault/op.mjs';
import { syncEnvFile } from './vault-sync.mjs';

export class ValidationError extends Error {
  constructor(errors) {
    super(errors.join('; '));
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export function cleanValue(raw) {
  return raw.replace(/\r?\n$/, '').trim();
}

function defaultRun(command, args, { input } = {}) {
  const result = spawnSync(command, args, { input, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed`);
  }
  return result.stdout ?? '';
}

export function readClipboardOnce({ run = defaultRun } = {}) {
  try {
    return cleanValue(run('pbpaste', []));
  } finally {
    run('pbcopy', [], { input: '' });
  }
}

export function putValue({ op, vault, item, field, value }) {
  const environment = item === 'local' ? 'local' : 'production';
  const { errors, warnings } = validateEnvValue(field, value, { environment });
  if (errors.length > 0) throw new ValidationError(errors);
  op.writeFields({ vault, item, fields: new Map([[field, value]]) });
  return { warnings };
}

export function checkFounderVault({ op }) {
  return `${FOUNDER_VAULT}: ${op.ensureVault(FOUNDER_VAULT)}`;
}

export function listFieldNames({ op, vault, item }) {
  const fields = op.readFields({ vault, item });
  if (!fields || fields.size === 0) return 'none';
  return [...fields.keys()].sort().join('\n');
}

function defaultVault(item) {
  return item === 'master-keys'
    ? FOUNDER_VAULT
    : startupVault(readStartupConfig().slug);
}

function parseListFields(argv) {
  let vault;
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--vault') vault = argv[++i];
    else positional.push(argv[i]);
  }
  if (positional.length !== 1) {
    throw new Error(
      'usage: node scripts/vault-put.mjs --list-fields [--vault <name>] <item>',
    );
  }
  return { vault, item: positional[0] };
}

function parseArgs(argv) {
  let vault;
  let fromClipboard = false;
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--vault') vault = argv[++i];
    else if (argv[i] === '--from-clipboard') fromClipboard = true;
    else positional.push(argv[i]);
  }
  const [item, field] = positional;
  if (!item || !field || positional.length > 2) {
    throw new Error(
      'usage: node scripts/vault-put.mjs --check | --list-fields | [--vault <name>] [--from-clipboard] <item> <FIELD>',
    );
  }
  return { vault, fromClipboard, item, field };
}

function main() {
  let field;
  try {
    if (process.argv.slice(2).join(' ') === '--check') {
      console.log(checkFounderVault({ op: createOp() }));
      return;
    }
    if (process.argv[2] === '--list-fields') {
      const { vault, item } = parseListFields(process.argv.slice(3));
      console.log(
        listFieldNames({
          op: createOp(),
          vault: vault ?? defaultVault(item),
          item,
        }),
      );
      return;
    }
    const args = parseArgs(process.argv.slice(2));
    field = args.field;
    const vault = args.vault ?? defaultVault(args.item);
    const value = args.fromClipboard
      ? readClipboardOnce()
      : cleanValue(readFileSync(0, 'utf8'));
    const op = createOp();
    const { warnings } = putValue({
      op,
      vault,
      item: args.item,
      field,
      value,
    });
    console.log(
      `OK  ${field} stored in ${vault}/${args.item} (${value.length} chars)`,
    );
    for (const warning of warnings) {
      console.log(`WARNING  ${field}: ${warning}`);
    }
    if (args.item in ITEM_FOR_ENVIRONMENT) {
      const { path, keys } = syncEnvFile({
        op,
        vault,
        environment: args.item,
      });
      console.log(`${path} regenerated (${keys} keys)`);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      for (const message of error.errors) {
        console.error(`ERROR    ${field}: ${message}`);
      }
      console.error('Nothing was written.');
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('vault-put.mjs')) {
  main();
}
