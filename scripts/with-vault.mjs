import { spawnSync } from 'node:child_process';
import { readServiceAccountToken } from './vault/service-account.mjs';

const USAGE = [
  'usage: node scripts/with-vault.mjs <command> [args...]',
  '       node scripts/with-vault.mjs run [--env-file <file>] -- <command> [args...]',
].join('\n');

export function buildRunArgs({ envFile = '', command }) {
  return [
    'run',
    ...(envFile ? ['--env-file', envFile] : []),
    '--',
    'env',
    '-u',
    'OP_SERVICE_ACCOUNT_TOKEN',
    ...command,
  ];
}

export function parseRunMode(argv) {
  const separator = argv.indexOf('--');
  const flags = separator === -1 ? argv : argv.slice(0, separator);
  const command = separator === -1 ? [] : argv.slice(separator + 1);
  const envFileIndex = flags.indexOf('--env-file');
  const envFile = envFileIndex === -1 ? undefined : flags[envFileIndex + 1];
  if (command.length === 0 || (envFileIndex !== -1 && !envFile)) {
    throw new Error(USAGE);
  }
  return { envFile, command };
}

/**
 * @param {{ command: string, args?: string[], run?: Function, readToken?: () => string }} options
 */
export function runWithVault({
  command,
  args = [],
  run = spawnSync,
  readToken = readServiceAccountToken,
}) {
  const token = readToken();
  const result = run(command, args, {
    stdio: 'inherit',
    env: { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: token },
  });
  if (result.error) {
    console.error(`could not start ${command}: ${result.error.code}`);
    return 1;
  }
  if (result.status === null || result.status === undefined) {
    return 1;
  }
  return result.status;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error(USAGE);
    process.exit(1);
  }
  try {
    if (argv[0] === 'run') {
      const options = parseRunMode(argv.slice(1));
      process.exit(
        runWithVault({ command: 'op', args: buildRunArgs(options) }),
      );
    }
    const [command, ...args] = argv;
    process.exit(runWithVault({ command, args }));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('with-vault.mjs')) {
  main();
}
