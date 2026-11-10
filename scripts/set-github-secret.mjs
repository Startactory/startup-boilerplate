#!/usr/bin/env node
// Copy one 1Password field into a GitHub Actions secret without the value ever
// touching argv, the terminal or a file.
//
//   node scripts/set-github-secret.mjs DATABASE_URL op://startup-<slug>/production/DATABASE_URL

import { spawnSync } from 'node:child_process';
import { readStartupConfig } from './vault/names.mjs';
import { createOp } from './vault/op.mjs';

function defaultRun(command, args, { input }) {
  const result = spawnSync(command, args, { input, encoding: 'utf8' });
  return { status: result.error ? 1 : (result.status ?? 1) };
}

export function setGithubSecret({
  op,
  run = defaultRun,
  name,
  reference,
  config,
}) {
  const value = op.read(reference).replace(/\r?\n$/, '');
  if (!value) {
    throw new Error(
      `${reference} resolved to an empty value — nothing was set`,
    );
  }
  const repoArgs = config.repository ? ['--repo', config.repository] : [];
  const result = run('gh', ['secret', 'set', name, ...repoArgs], {
    input: value,
  });
  if (result.status !== 0) {
    throw new Error(`gh secret set ${name} failed`);
  }
  return `OK  ${name} set as a GitHub secret`;
}

function main() {
  const [name, reference, ...rest] = process.argv.slice(2);
  try {
    if (!name || !reference || rest.length > 0) {
      throw new Error(
        'usage: node scripts/set-github-secret.mjs <SECRET_NAME> <op-reference>',
      );
    }
    console.log(
      setGithubSecret({
        op: createOp(),
        name,
        reference,
        config: readStartupConfig(),
      }),
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('set-github-secret.mjs')) {
  main();
}
