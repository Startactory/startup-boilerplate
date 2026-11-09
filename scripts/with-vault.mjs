import { spawnSync } from 'node:child_process';
import { readServiceAccountToken } from './vault/service-account.mjs';

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
  if (result.error || result.status === null || result.status === undefined) {
    return 1;
  }
  return result.status;
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error('usage: node scripts/with-vault.mjs <command> [args...]');
    process.exit(1);
  }
  try {
    process.exit(runWithVault({ command, args }));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('with-vault.mjs')) {
  main();
}
