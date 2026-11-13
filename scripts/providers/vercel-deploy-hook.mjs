import { spawnSync } from 'node:child_process';
import { CI_ITEM, readStartupConfig, startupVault } from '../vault/names.mjs';
import { createOp } from '../vault/op.mjs';

const HOOK_NAME = 'production';
const GIT_BRANCH = 'master';
const URL_FIELD = 'VERCEL_DEPLOY_HOOK_URL';
const HOOK_URL_PATTERN =
  /https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\/[^\s"'`<>]+/;
const HOOK_URL_SHAPE =
  /^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\/[A-Za-z0-9_]+\/[A-Za-z0-9_-]+$/;
const HOOK_URL_SHAPE_HINT =
  'https://api.vercel.com/v1/integrations/deploy/<project-id>/<hook-id>';
const ANY_URL_PATTERN = /https?:\/\/[^\s"'`<>]+/g;
const UNKNOWN_COMMAND_PATTERN =
  /unknown command|not a valid command|deploy-hooks/i;
const PRODUCTION_BRANCH_STEP = 'vercel api production branch update';
const BRANCH_NOT_FOUND_PATTERN = new RegExp(
  `branch\\W+${GIT_BRANCH}\\W+not found`,
  'i',
);

function defaultRun(command, args, { input } = {}) {
  const result = spawnSync(command, args, { input, encoding: 'utf8' });
  return {
    status: result.error ? 1 : (result.status ?? 1),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function redactUrls(text) {
  return text.replace(ANY_URL_PATTERN, '<url redacted>');
}

function commandFailure(step, stderr) {
  const reason = redactUrls(stderr).trim();
  return new Error(`${step} failed${reason ? `: ${reason}` : ''}`);
}

function sanitizeHookUrl({ text, source }) {
  const url = HOOK_URL_PATTERN.exec(text)?.[0];
  if (!url || !HOOK_URL_SHAPE.test(url)) {
    throw new Error(
      `${source} gave no hook URL shaped like ${HOOK_URL_SHAPE_HINT} — nothing stored`,
    );
  }
  return url;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// why: the answer is the whole project, deploy hook URLs included, so only one field is read
function describeProductionBranch(stdout) {
  const body = parseJson(stdout);
  const branch = body?.link?.productionBranch;
  if (typeof branch === 'string') return { branch, detail: redactUrls(branch) };
  const reason = body?.error?.message;
  return {
    branch: null,
    detail:
      typeof reason === 'string'
        ? redactUrls(reason)
        : 'an answer without link.productionBranch',
  };
}

function ensureProductionBranch({ run, project }) {
  const result = run(
    'vercel',
    ['api', `/v9/projects/${project}/branch`, '-X', 'PATCH', '--input', '-'],
    { input: JSON.stringify({ branch: GIT_BRANCH }) },
  );
  if (result.status !== 0) {
    throw commandFailure(PRODUCTION_BRANCH_STEP, result.stderr);
  }
  const { branch, detail } = describeProductionBranch(result.stdout);
  if (branch !== GIT_BRANCH) {
    throw new Error(
      `${PRODUCTION_BRANCH_STEP} failed: expected ${GIT_BRANCH}, got ${detail}`,
    );
  }
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
      throw new Error('update the Vercel CLI: npm i -g vercel@latest');
    }
    throw commandFailure('vercel deploy-hooks list', result.stderr);
  }
  const hook = parseHooks(result.stdout).find(
    (candidate) => candidate?.name === HOOK_NAME,
  );
  if (typeof hook?.url !== 'string' || !hook.url) return null;
  return sanitizeHookUrl({
    text: hook.url,
    source: 'vercel deploy-hooks list',
  });
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
    if (BRANCH_NOT_FOUND_PATTERN.test(result.stderr)) {
      throw new Error(
        `${GIT_BRANCH} does not exist on GitHub yet — push ${GIT_BRANCH} first, then run this again`,
      );
    }
    throw commandFailure('vercel deploy-hooks create', result.stderr);
  }
  return sanitizeHookUrl({
    text: result.stdout,
    source: 'vercel deploy-hooks create',
  });
}

export function provisionDeployHook({
  op,
  run = defaultRun,
  vault,
  project,
  repository = '',
}) {
  ensureProductionBranch({ run, project });
  const existingUrl = findExistingUrl({ run, project });
  const url = existingUrl ?? createHook({ run, project });

  op.writeFields({ vault, item: CI_ITEM, fields: new Map([[URL_FIELD, url]]) });

  const repoArgs = repository ? ['--repo', repository] : [];
  const gh = run('gh', ['secret', 'set', URL_FIELD, ...repoArgs], {
    input: url,
  });
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
    const { slug, repository } = readStartupConfig();
    const vault = startupVault(slug);
    const outcome = provisionDeployHook({
      op: createOp(),
      vault,
      project,
      repository,
    });
    console.log(`OK  Vercel production branch is ${GIT_BRANCH}`);
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
