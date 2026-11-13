import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { requestJson } from './providers/http.mjs';
import {
  findFactoryOrganization,
  listActiveProjects,
} from './providers/supabase-project.mjs';
import {
  FOUNDER_VAULT,
  MASTER_KEYS_ITEM,
  masterKeyName,
} from './vault/names.mjs';
import { createOp } from './vault/op.mjs';
import { readServiceAccountToken } from './vault/service-account.mjs';

const FREE_PLAN = 'free';
const FREE_PLAN_ACTIVE_PROJECTS = 2;
const DASH0_REVOKED_STATUSES = new Set([401, 402, 403]);
const DASH0_FIX =
  'Dash0 trial ended or token revoked — the founder renews the Dash0 subscription';
const DEPENDENCIES_FIX = 'pnpm install';
const MISSING_PACKAGE_PATTERN = /Cannot find package/;
const NVMRC_PATH = '.nvmrc';
const NODE_VERSION_PATTERN = /^v?(\d+)(\.\d+){0,2}$/;

function masterKeyFields(dataRegion) {
  return [
    'SUPABASE_ACCESS_TOKEN',
    masterKeyName('POSTHOG_PERSONAL_API_KEY', dataRegion),
    masterKeyName('DASH0_AUTH_TOKEN', dataRegion),
    masterKeyName('DASH0_API_URL', dataRegion),
    masterKeyName('DASH0_OTLP_ENDPOINT', dataRegion),
    'SMTP_USER',
    'SMTP_PASS',
  ];
}

function pass(name) {
  return { name, ok: true, fix: '' };
}

function fail(name, fix) {
  return { name, ok: false, fix };
}

function verdict(name, ok, fix) {
  return ok ? pass(name) : fail(name, fix);
}

async function attempt(name, check) {
  try {
    return await check();
  } catch (error) {
    return fail(name, error instanceof Error ? error.message : String(error));
  }
}

function isMissingPackage(error) {
  return (
    error?.code === 'ERR_MODULE_NOT_FOUND' &&
    MISSING_PACKAGE_PATTERN.test(error.message)
  );
}

// why: startup-config.mjs needs valibot, so a static import crashes before pnpm install
export async function loadConfigValidator({
  importModule = (specifier) => import(specifier),
} = {}) {
  try {
    const { validateRunConfig } = await importModule('./startup-config.mjs');
    return validateRunConfig;
  } catch (error) {
    if (isMissingPackage(error)) return null;
    throw error;
  }
}

function checkConfig({ config, validateConfig }) {
  if (!validateConfig) {
    return fail('config', `cannot be checked before ${DEPENDENCIES_FIX}`);
  }
  const result = validateConfig(config);
  return verdict(
    'config',
    result.ok,
    result.ok ? '' : `fix startup.config.json: ${result.issues.join('; ')}`,
  );
}

async function exitsZero(run, command, args) {
  try {
    return (await run(command, args)).code === 0;
  } catch {
    return false;
  }
}

function majorVersion(version) {
  return NODE_VERSION_PATTERN.exec(version)?.[1] ?? null;
}

function readPinnedVersion(readNvmrc) {
  try {
    return readNvmrc().trim();
  } catch {
    return null;
  }
}

function checkNodeVersion({ nodeVersion, readNvmrc }) {
  const name = 'node-version';
  const pinned = readPinnedVersion(readNvmrc);
  if (pinned === null) {
    return fail(
      name,
      `cannot read ${NVMRC_PATH} — run from the repository root`,
    );
  }
  const pinnedMajor = majorVersion(pinned);
  if (!pinnedMajor) {
    return fail(
      name,
      `${NVMRC_PATH} holds "${pinned}", expected a version like v25.2.1`,
    );
  }
  const version = pinned.replace(/^v/, '');
  return verdict(
    name,
    majorVersion(nodeVersion) === pinnedMajor,
    `use Node ${version} — prefix commands with export PATH="$HOME/.nvm/versions/node/v${version}/bin:$PATH" (or nvm use)`,
  );
}

async function checkTools({ commandExists, run, nodeVersion, readNvmrc }) {
  const results = [
    verdict(
      'tool:node',
      commandExists('node'),
      'install Node.js, the version in .nvmrc (brew install node)',
    ),
    checkNodeVersion({ nodeVersion, readNvmrc }),
    verdict('tool:pnpm', commandExists('pnpm'), 'npm i -g pnpm'),
    verdict(
      'tool:op',
      commandExists('op'),
      'install the 1Password CLI (brew install 1password-cli)',
    ),
    verdict(
      'tool:gh',
      commandExists('gh'),
      'install the GitHub CLI (brew install gh)',
    ),
  ];
  const vercelReady =
    commandExists('vercel') &&
    (await exitsZero(run, 'vercel', ['deploy-hooks', '--help']));
  results.push(verdict('tool:vercel', vercelReady, 'npm i -g vercel@latest'));
  results.push(
    verdict(
      'tool:database',
      commandExists('psql') || commandExists('docker'),
      'install psql (brew install libpq) or Docker',
    ),
  );
  return results;
}

async function checkVault({ run, readToken }) {
  try {
    readToken();
  } catch (error) {
    return fail('vault', error.message);
  }
  const listed = await exitsZero(run, 'op', [
    'item',
    'list',
    '--vault',
    FOUNDER_VAULT,
  ]);
  return verdict(
    'vault',
    listed,
    `the service account cannot list the ${FOUNDER_VAULT} vault — run step 0, item 2`,
  );
}

function checkMasterKeys({ op, dataRegion }) {
  const stored = op.readFields({
    vault: FOUNDER_VAULT,
    item: MASTER_KEYS_ITEM,
  });
  const missing = masterKeyFields(dataRegion).filter(
    (field) => !stored?.get(field),
  );
  return {
    keys: stored ?? new Map(),
    result: verdict(
      'master-keys',
      missing.length === 0,
      `missing in ${FOUNDER_VAULT}/${MASTER_KEYS_ITEM}: ${missing.join(', ')} — run step 0, item 6`,
    ),
  };
}

async function checkGhSession({ run }) {
  const name = 'gh-session';
  const status = await run('gh', ['auth', 'status']);
  if (status.code !== 0) return fail(name, 'gh auth login');
  const protocol = await run('gh', [
    'config',
    'get',
    'git_protocol',
    '-h',
    'github.com',
  ]);
  if (protocol.stdout.trim() !== 'https') return pass(name);
  const scopes = `${status.stdout}\n${status.stderr}`;
  return verdict(
    name,
    scopes.includes('workflow'),
    'gh auth refresh -s workflow',
  );
}

async function checkSupabaseQuota({ fetch, keys, slug }) {
  const name = 'supabase-quota';
  const token = keys.get('SUPABASE_ACCESS_TOKEN');
  if (!token) return fail(name, 'SUPABASE_ACCESS_TOKEN is missing');
  const organization = await findFactoryOrganization({ fetch, token });
  if (organization.plan !== FREE_PLAN) {
    return fail(
      name,
      `the startup-factory organization is on the "${organization.plan}" plan, expected "${FREE_PLAN}"`,
    );
  }
  const active = await listActiveProjects({
    fetch,
    token,
    organizationId: organization.id,
  });
  const others = active.filter((project) => project.name !== slug);
  return verdict(
    name,
    others.length < FREE_PLAN_ACTIVE_PROJECTS,
    `${others.length} active Supabase projects already use the free quota — pause or delete one`,
  );
}

async function checkGithubRepo({ run, config }) {
  const name = 'github-repo';
  const fullName = `${config.githubOwner}/${config.slug}`;
  const view = await run('gh', ['repo', 'view', fullName]);
  if (view.code !== 0) return pass(name);
  return verdict(
    name,
    config.repository?.toLowerCase() === fullName.toLowerCase(),
    `GitHub repository ${fullName} already exists and is not this startup's — choose another slug`,
  );
}

async function checkDash0({ fetch, keys, slug, dataRegion }) {
  const token = keys.get(masterKeyName('DASH0_AUTH_TOKEN', dataRegion));
  const apiUrl = keys.get(masterKeyName('DASH0_API_URL', dataRegion));
  if (!token || !apiUrl) {
    return fail('dash0', 'Dash0 API URL or token missing from the master keys');
  }
  try {
    await requestJson({
      provider: 'dash0',
      fetch,
      method: 'GET',
      url: `${apiUrl.replace(/\/$/, '')}/api/datasets/${slug}`,
      token,
    });
    return pass('dash0');
  } catch (error) {
    if (DASH0_REVOKED_STATUSES.has(error.status)) {
      return fail('dash0', DASH0_FIX);
    }
    throw error;
  }
}

export async function runPreflight({
  config,
  commandExists,
  run,
  op,
  fetch = globalThis.fetch,
  readToken = readServiceAccountToken,
  loadValidator = loadConfigValidator,
  nodeVersion = process.versions.node,
  readNvmrc = () => readFileSync(NVMRC_PATH, 'utf8'),
}) {
  const validateConfig = await loadValidator();
  const results = [
    verdict('dependencies', validateConfig !== null, DEPENDENCIES_FIX),
    checkConfig({ config, validateConfig }),
  ];
  results.push(
    ...(await checkTools({ commandExists, run, nodeVersion, readNvmrc })),
  );
  results.push(await attempt('vault', () => checkVault({ run, readToken })));

  const { slug, dataRegion } = config;
  const hasRegion = dataRegion === 'eu' || dataRegion === 'us';
  const hasSlug = typeof slug === 'string' && slug !== '';
  let keys = new Map();
  if (hasRegion) {
    const checked = await attempt('master-keys', () =>
      checkMasterKeys({ op, dataRegion }),
    );
    if (checked.result) {
      keys = checked.keys;
      results.push(checked.result);
    } else {
      results.push(checked);
    }
  } else {
    results.push(fail('master-keys', 'dataRegion must be eu or us'));
  }

  results.push(await attempt('gh-session', () => checkGhSession({ run })));
  results.push(
    verdict(
      'vercel-session',
      await exitsZero(run, 'vercel', ['whoami']),
      'vercel login',
    ),
  );
  results.push(
    hasSlug
      ? await attempt('supabase-quota', () =>
          checkSupabaseQuota({ fetch, keys, slug }),
        )
      : fail('supabase-quota', 'slug must be set'),
  );
  results.push(
    hasSlug && typeof config.githubOwner === 'string' && config.githubOwner
      ? await attempt('github-repo', () => checkGithubRepo({ run, config }))
      : fail('github-repo', 'slug and githubOwner must be set'),
  );
  results.push(
    hasSlug && hasRegion
      ? await attempt('dash0', () =>
          checkDash0({ fetch, keys, slug, dataRegion }),
        )
      : fail('dash0', 'slug and dataRegion must be set'),
  );
  return results;
}

function defaultCommandExists(name) {
  return spawnSync('which', [name], { stdio: 'ignore' }).status === 0;
}

export function createRunner({ token, spawn = spawnSync, env = process.env }) {
  return async (command, args) => {
    const result = spawn(command, args, {
      encoding: 'utf8',
      env:
        token && command === 'op'
          ? { ...env, OP_SERVICE_ACCOUNT_TOKEN: token }
          : env,
    });
    return {
      code: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.error
        ? String(result.error.message)
        : (result.stderr ?? ''),
    };
  };
}

function readConfigFile(path = 'startup.config.json') {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  try {
    let token;
    try {
      token = readServiceAccountToken();
    } catch {
      token = undefined;
    }
    const results = await runPreflight({
      config: readConfigFile(),
      commandExists: defaultCommandExists,
      run: createRunner({ token }),
      op: createOp(),
    });
    for (const { name, ok, fix } of results) {
      console.log(ok ? `OK  ${name}` : `MISSING  ${name}: ${fix}`);
    }
    const passed = results.every((result) => result.ok);
    console.log(passed ? 'PREFLIGHT OK' : 'PREFLIGHT FAILED');
    if (!passed) process.exit(1);
  } catch (error) {
    console.error(error.message);
    console.log('PREFLIGHT FAILED');
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('preflight.mjs')) {
  await main();
}
