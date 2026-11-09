import { spawnSync } from 'node:child_process';
import { CI_ITEM, readStartupConfig, startupVault } from '../vault/names.mjs';
import { createOp } from '../vault/op.mjs';

const HOOK_NAME = 'production';
const GIT_BRANCH = 'master';
const URL_FIELD = 'VERCEL_DEPLOY_HOOK_URL';
const HOOK_URL_PATTERN =
  /https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\/\S+/;
const UNKNOWN_COMMAND_PATTERN =
  /unknown command|not a valid command|deploy-hooks/i;

function defaultRun(command, args, { input } = {}) {
  const result = spawnSync(command, args, { input, encoding: 'utf8' });
  return {
    status: result.error ? 1 : (result.status ?? 1),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function parseHooks(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('could not read vercel deploy-hooks list output');
  }
  const hooks = Array.isArray(parsed)
    ? parsed
    : (parsed?.deployHooks ?? parsed?.hooks ?? []);
  return Array.isArray(hooks) ? hooks : [];
}

function findExistingUrl({ run, project }) {
  const result = run('vercel', [
    'deploy-hooks',
    'list',
    '--project',
    project,
    '--json',
  ]);
  if (result.status !== 0) {
    if (UNKNOWN_COMMAND_PATTERN.test(result.stderr)) {
      throw new Error('update the Vercel CLI: pnpm add -g vercel@latest');
    }
    throw new Error('vercel deploy-hooks list failed');
  }
  const hook = parseHooks(result.stdout).find(
    (candidate) => candidate?.name === HOOK_NAME,
  );
  return typeof hook?.url === 'string' && hook.url ? hook.url : null;
}

function createHook({ run, project }) {
  const result = run('vercel', [
    'deploy-hooks',
    'create',
    HOOK_NAME,
    '--git-branch',
    GIT_BRANCH,
    '--project',
    project,
  ]);
  if (result.status !== 0) {
    throw new Error('vercel deploy-hooks create failed');
  }
  const match = HOOK_URL_PATTERN.exec(result.stdout);
  if (!match) throw new Error('vercel deploy-hooks create printed no hook URL');
  return match[0];
}

export function provisionDeployHook({ op, run = defaultRun, vault, project }) {
  const existingUrl = findExistingUrl({ run, project });
  const url = existingUrl ?? createHook({ run, project });

  op.writeFields({ vault, item: CI_ITEM, fields: new Map([[URL_FIELD, url]]) });

  const gh = run('gh', ['secret', 'set', URL_FIELD], { input: url });
  if (gh.status !== 0) {
    throw new Error(
      `gh secret set ${URL_FIELD} failed — the URL is stored in ${vault}/${CI_ITEM}; re-run to retry`,
    );
  }
  return existingUrl ? 'reused' : 'created';
}

function readProjectArg(argv) {
  const index = argv.indexOf('--project');
  const project = index === -1 ? undefined : argv[index + 1];
  if (!project || project.startsWith('--')) {
    throw new Error(
      'usage: node scripts/providers/vercel-deploy-hook.mjs --project <vercel-project>',
    );
  }
  return project;
}

function main() {
  try {
    const project = readProjectArg(process.argv.slice(2));
    const { slug } = readStartupConfig();
    const vault = startupVault(slug);
    const outcome = provisionDeployHook({ op: createOp(), vault, project });
    console.log(
      `OK  deploy hook ${HOOK_NAME} ${outcome}, stored in ${vault}/${CI_ITEM}, set as GitHub secret`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('vercel-deploy-hook.mjs')) {
  main();
}
