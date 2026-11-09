import {
  ITEM_FOR_ENVIRONMENT,
  masterKeyName,
  readStartupConfig,
  startupVault,
} from '../vault/names.mjs';
import { createOp } from '../vault/op.mjs';
import { syncEnvFile } from '../vault-sync.mjs';
import { ProviderError, requestJson } from './http.mjs';
import { readMasterKeys } from './master-keys.mjs';

const HOSTS_BY_REGION = {
  eu: {
    management: 'https://eu.posthog.com',
    ingestion: 'https://eu.i.posthog.com',
  },
  us: {
    management: 'https://us.posthog.com',
    ingestion: 'https://us.i.posthog.com',
  },
};
// http.mjs does not surface PostHog's `detail` field, so 402 is matched by status
const PAYMENT_REQUIRED = 402;
const PLAN_LIMIT_PATTERN = /limit|plan|upgrade/i;
const KEY_FIELD = 'NEXT_PUBLIC_POSTHOG_KEY';
const HOST_FIELD = 'NEXT_PUBLIC_POSTHOG_HOST';
const SKIPPED_WARNING =
  'WARNING  PostHog plan refused a second project — local analytics disabled';

function isPlanLimit(error) {
  if (!(error instanceof ProviderError)) return false;
  if (error.status === PAYMENT_REQUIRED) return true;
  return (
    error.status >= 400 &&
    error.status < 500 &&
    PLAN_LIMIT_PATTERN.test(error.message)
  );
}

async function listProjects({ call, managementHost, organizationId }) {
  const projects = [];
  let url = `${managementHost}/api/organizations/${organizationId}/projects/`;
  while (url) {
    if (!url.startsWith(`${managementHost}/`)) {
      throw new Error(
        'PostHog returned a pagination URL on an unexpected host',
      );
    }
    const { json } = await call({ method: 'GET', url });
    projects.push(...(json?.results ?? []));
    url = json?.next ?? null;
  }
  return projects;
}

export async function provisionPostHog({
  op,
  fetch = globalThis.fetch,
  slug,
  name,
  dataRegion,
  personalApiKey,
  syncEnv = syncEnvFile,
}) {
  const hosts = HOSTS_BY_REGION[dataRegion];
  if (!hosts) throw new Error(`unknown data region "${dataRegion}"`);
  const { management: managementHost, ingestion: ingestionHost } = hosts;
  const vault = startupVault(slug);
  const call = (options) =>
    requestJson({
      provider: 'posthog',
      fetch,
      token: personalApiKey,
      ...options,
    });

  const organization = await call({
    method: 'GET',
    url: `${managementHost}/api/organizations/@current/`,
  });
  const organizationId = organization.json?.id;
  if (!organizationId) throw new Error('PostHog returned no organization id');

  const projects = await listProjects({ call, managementHost, organizationId });

  async function ensureProject(projectName) {
    const existing = projects.find((project) => project.name === projectName);
    if (existing?.api_token)
      return { token: existing.api_token, state: 'reused' };
    const created = await call({
      method: 'POST',
      url: `${managementHost}/api/organizations/${organizationId}/projects/`,
      body: { name: projectName },
    });
    const token = created.json?.api_token;
    if (!token)
      throw new Error(`PostHog returned no api_token for ${projectName}`);
    return { token, state: 'created' };
  }

  function store(environment, token) {
    op.writeFields({
      vault,
      item: ITEM_FOR_ENVIRONMENT[environment],
      fields: new Map([
        [KEY_FIELD, token],
        [HOST_FIELD, ingestionHost],
      ]),
    });
    syncEnv({ op, vault, environment });
  }

  let local;
  try {
    local = await ensureProject(`${name} (local)`);
  } catch (error) {
    if (!isPlanLimit(error)) throw error;
    local = { state: 'skipped' };
    console.warn(SKIPPED_WARNING);
  }
  const production = await ensureProject(name);

  if (local.token) store('local', local.token);
  store('production', production.token);
  return { local: local.state, production: production.state };
}

async function main() {
  try {
    const { slug, name, dataRegion } = readStartupConfig();
    const op = createOp();
    const keyName = masterKeyName('POSTHOG_PERSONAL_API_KEY', dataRegion);
    const keys = readMasterKeys({ op, fields: [keyName] });
    const { local, production } = await provisionPostHog({
      op,
      slug,
      name,
      dataRegion,
      personalApiKey: keys.get(keyName),
    });
    const vault = startupVault(slug);
    console.log(
      `OK  PostHog local ${local}, production ${production}, stored in ${vault}/local and ${vault}/production`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('posthog-projects.mjs')) {
  await main();
}
