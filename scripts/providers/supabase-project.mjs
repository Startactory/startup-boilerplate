import { randomBytes } from 'node:crypto';
import { readStartupConfig } from '../vault/names.mjs';
import { createOp } from '../vault/op.mjs';
import { requestJson } from './http.mjs';
import { readMasterKeys } from './master-keys.mjs';

const API_HOST = 'https://api.supabase.com';
const HEALTHY_STATUS = 'ACTIVE_HEALTHY';
const FREE_PLAN_ACTIVE_PROJECTS = 2;
const NOT_ACTIVE_STATUSES = new Set(['INACTIVE', 'PAUSED', 'REMOVED']);
const NEVER_HEALTHY_STATUSES = new Set([
  'INACTIVE',
  'PAUSED',
  'INIT_FAILED',
  'RESTORE_FAILED',
  'PAUSE_FAILED',
]);

export const SUPABASE_REGION = { eu: 'eu-west-3', us: 'us-east-1' };
export const FACTORY_ORGANIZATION = 'startup-factory';

function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function get({ fetch, token, path }) {
  return requestJson({
    provider: 'supabase',
    fetch,
    method: 'GET',
    url: `${API_HOST}${path}`,
    token,
  });
}

export async function findFactoryOrganization({ fetch, token }) {
  const { json: organizations } = await get({
    fetch,
    token,
    path: '/v1/organizations',
  });
  const organization = (Array.isArray(organizations) ? organizations : []).find(
    (o) => o.name === FACTORY_ORGANIZATION || o.slug === FACTORY_ORGANIZATION,
  );
  if (!organization) {
    throw new Error(
      `Supabase organization "${FACTORY_ORGANIZATION}" not found — run step 0`,
    );
  }
  const id = organization.slug ?? organization.id;
  const details = await get({ fetch, token, path: `/v1/organizations/${id}` });
  return { id, plan: details.json?.plan ?? 'unknown' };
}

async function listOrganizationProjects({ fetch, token, organizationId }) {
  const { json } = await get({ fetch, token, path: '/v1/projects' });
  return (Array.isArray(json) ? json : [])
    .filter(
      (p) => (p.organization_slug ?? p.organization_id) === organizationId,
    )
    .map((p) => ({ ref: p.ref ?? p.id, name: p.name, status: p.status }));
}

export async function listActiveProjects({ fetch, token, organizationId }) {
  const projects = await listOrganizationProjects({
    fetch,
    token,
    organizationId,
  });
  return projects.filter((p) => !NOT_ACTIVE_STATUSES.has(p.status));
}

async function waitUntilHealthy({
  fetch,
  token,
  ref,
  initialStatus,
  wait,
  timeoutMs,
  pollMs,
}) {
  let status = initialStatus;
  for (let elapsed = 0; status !== HEALTHY_STATUS; elapsed += pollMs) {
    if (NEVER_HEALTHY_STATUSES.has(status)) {
      throw new Error(
        `Supabase project ${ref} is ${status} — the founder restores or deletes it in the Supabase dashboard`,
      );
    }
    if (elapsed >= timeoutMs) {
      throw new Error(
        `Supabase project ${ref} still ${status} after ${Math.round(timeoutMs / 60_000)} minutes — re-run to keep waiting`,
      );
    }
    await wait(pollMs);
    const { json } = await get({ fetch, token, path: `/v1/projects/${ref}` });
    status = json?.status ?? status;
  }
}

async function createProject({ fetch, token, slug, organizationId, region }) {
  const { json } = await requestJson({
    provider: 'supabase',
    fetch,
    method: 'POST',
    url: `${API_HOST}/v1/projects`,
    token,
    body: {
      name: slug,
      organization_slug: organizationId,
      region,
      db_pass: randomBytes(24).toString('base64url'),
    },
  });
  return { ref: json?.ref ?? json?.id, status: json?.status ?? 'COMING_UP' };
}

export async function ensureSupabaseProject({
  fetch = globalThis.fetch,
  token,
  slug,
  dataRegion,
  wait = defaultWait,
  timeoutMs = 600_000,
  pollMs = 10_000,
}) {
  const region = SUPABASE_REGION[dataRegion];
  if (!region) throw new Error(`unknown data region "${dataRegion}"`);

  const organization = await findFactoryOrganization({ fetch, token });
  const projects = await listOrganizationProjects({
    fetch,
    token,
    organizationId: organization.id,
  });
  const existing = projects.find(
    (p) => p.name === slug && p.status !== 'REMOVED',
  );

  let target = existing;
  let outcome = 'reused';
  if (!existing) {
    if (organization.plan !== 'free') {
      throw new Error(
        `Supabase organization ${FACTORY_ORGANIZATION} is on a paid plan — the run creates free projects only`,
      );
    }
    const active = projects.filter((p) => !NOT_ACTIVE_STATUSES.has(p.status));
    if (active.length >= FREE_PLAN_ACTIVE_PROJECTS) {
      throw new Error(
        `Supabase Free plan allows ${FREE_PLAN_ACTIVE_PROJECTS} active projects and ${FACTORY_ORGANIZATION} has ${active.length} — pause one or upgrade (founder action)`,
      );
    }
    target = await createProject({
      fetch,
      token,
      slug,
      organizationId: organization.id,
      region,
    });
    outcome = 'created';
  }

  await waitUntilHealthy({
    fetch,
    token,
    ref: target.ref,
    initialStatus: target.status,
    wait,
    timeoutMs,
    pollMs,
  });
  return { ref: target.ref, outcome };
}

async function main() {
  try {
    const { slug, dataRegion } = readStartupConfig();
    const token = readMasterKeys({
      op: createOp(),
      fields: ['SUPABASE_ACCESS_TOKEN'],
    }).get('SUPABASE_ACCESS_TOKEN');
    const { ref, outcome } = await ensureSupabaseProject({
      token,
      slug,
      dataRegion,
    });
    console.log(
      `OK  Supabase project ${ref} ${outcome} in ${SUPABASE_REGION[dataRegion]}`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('supabase-project.mjs')) {
  await main();
}
