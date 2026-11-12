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
const PAYMENT_REQUIRED = 402;
const PLAN_LIMIT_PATTERN = /limit|plan|upgrade/i;
const DEFAULT_PROJECT_NAME = 'Default project';
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

async function listAll({ call, managementHost, path }) {
  const items = [];
  let url = `${managementHost}${path}`;
  while (url) {
    if (!url.startsWith(`${managementHost}/`)) {
      throw new Error(
        'PostHog returned a pagination URL on an unexpected host',
      );
    }
    const { json } = await call({ method: 'GET', url });
    items.push(...(json?.results ?? []));
    url = json?.next ?? null;
  }
  return items;
}

async function ensureOrganization({ call, managementHost, name }) {
  const organizations = await listAll({
    call,
    managementHost,
    path: '/api/organizations/',
  });
  const existing = organizations.find(
    (organization) => organization.name === name,
  );
  if (existing?.id) return { id: existing.id, state: 'reused' };
  const created = await call({
    method: 'POST',
    url: `${managementHost}/api/organizations/`,
    body: { name },
  });
  const id = created.json?.id;
  if (!id) throw new Error(`PostHog returned no organization id for ${name}`);
  return { id, state: 'created' };
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

  const organization = await ensureOrganization({
    call,
    managementHost,
    name,
  });
  const projectsUrl = `${managementHost}/api/organizations/${organization.id}/projects/`;
  const projects = await listAll({
    call,
    managementHost,
    path: `/api/organizations/${organization.id}/projects/`,
  });

  function tokenOf(project, projectName) {
    if (!project?.api_token) {
      throw new Error(`PostHog returned no api_token for ${projectName}`);
    }
    return project.api_token;
  }

  async function ensureProductionProject() {
    const existing = projects.find((project) => project.name === name);
    if (existing) return { token: tokenOf(existing, name), state: 'reused' };
    // a new organization comes with one bootstrap project, the only one a free plan allows
    const bootstrap =
      projects.length === 1 && projects[0].name === DEFAULT_PROJECT_NAME
        ? projects[0]
        : null;
    const response = bootstrap
      ? await call({
          method: 'PATCH',
          url: `${managementHost}/api/projects/${bootstrap.id}/`,
          body: { name },
        })
      : await call({ method: 'POST', url: projectsUrl, body: { name } });
    return { token: tokenOf(response.json, name), state: 'created' };
  }

  async function ensureLocalProject() {
    const localName = `${name} (local)`;
    const existing = projects.find((project) => project.name === localName);
    if (existing)
      return { token: tokenOf(existing, localName), state: 'reused' };
    try {
      const created = await call({
        method: 'POST',
        url: projectsUrl,
        body: { name: localName },
      });
      return { token: tokenOf(created.json, localName), state: 'created' };
    } catch (error) {
      if (!isPlanLimit(error)) throw error;
      console.warn(SKIPPED_WARNING);
      return { state: 'skipped' };
    }
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

  const production = await ensureProductionProject();
  const local = await ensureLocalProject();

  store('production', production.token);
  if (local.token) store('local', local.token);
  return {
    organization: organization.state,
    production: production.state,
    local: local.state,
  };
}

async function main() {
  try {
    const { slug, name, dataRegion } = readStartupConfig();
    const op = createOp();
    const keyName = masterKeyName('POSTHOG_PERSONAL_API_KEY', dataRegion);
    const keys = readMasterKeys({ op, fields: [keyName] });
    const { organization, production, local } = await provisionPostHog({
      op,
      slug,
      name,
      dataRegion,
      personalApiKey: keys.get(keyName),
    });
    const vault = startupVault(slug);
    const items =
      local === 'skipped'
        ? `${vault}/production`
        : `${vault}/production and ${vault}/local`;
    console.log(
      `OK  PostHog organization ${organization}, production ${production}, local ${local}, stored in ${items}`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('posthog-projects.mjs')) {
  await main();
}
