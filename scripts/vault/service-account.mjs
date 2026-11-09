import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';

export const KEYCHAIN_SERVICE = 'startup-factory-op';

const MISSING_TOKEN_MESSAGE = `no 1Password service account token in the Keychain (${KEYCHAIN_SERVICE}) — run step 0, item 2`;

function defaultRunner(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function readServiceAccountToken({
  run = defaultRunner,
  user = userInfo().username,
} = {}) {
  const result = run('security', [
    'find-generic-password',
    '-a',
    user,
    '-s',
    KEYCHAIN_SERVICE,
    '-w',
  ]);
  if (result.status !== 0) throw new Error(MISSING_TOKEN_MESSAGE);
  return result.stdout.replace(/\r?\n$/, '');
}
