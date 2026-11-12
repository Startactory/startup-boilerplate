import { describe, expect, it, vi } from 'vitest';
import { provisionPostHog } from '../../scripts/providers/posthog-projects.mjs';

const HOST = 'https://eu.posthog.com';
const INGESTION_HOST = 'https://eu.i.posthog.com';
const PERSONAL_KEY = 'phx_personal_secret_value';
const PLAN_LIMIT_DETAIL =
  'You have reached the maximum limit of allowed projects for your current plan. Upgrade your plan to be able to create and manage more projects.';

type Project = { id: number; name: string; api_token: string };
type Organization = { id: string; name: string; projects: Project[] };

function fakeResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  };
}

function setup({
  organizations = [],
  projectLimit = 1,
  createOrganizationStatus = 201,
}: {
  organizations?: Organization[];
  projectLimit?: number;
  createOrganizationStatus?: number;
} = {}) {
  const writeFields = vi.fn();
  const op = { readFields: vi.fn(() => null), writeFields };
  const calls: string[] = [];
  let nextProjectId = 100;
  const fetch = vi.fn(
    async (url: string, init: { method: string; body?: string }) => {
      const path = url.replace(HOST, '');
      calls.push(`${init.method} ${path}`);
      const body = JSON.parse(init.body ?? '{}');

      if (path === '/api/organizations/' && init.method === 'GET') {
        return fakeResponse(200, {
          results: organizations.map(({ id, name }) => ({ id, name })),
          next: null,
        });
      }
      if (path === '/api/organizations/' && init.method === 'POST') {
        if (createOrganizationStatus !== 201) {
          return fakeResponse(createOrganizationStatus, {
            detail: "API key missing required scope 'organization:write'",
          });
        }
        const organization = {
          id: `org-${organizations.length + 1}`,
          name: body.name,
          projects: [
            {
              id: nextProjectId++,
              name: 'Default project',
              api_token: 'phc_default',
            },
          ],
        };
        organizations.push(organization);
        return fakeResponse(201, { id: organization.id, name: body.name });
      }

      const projectsMatch = path.match(
        /^\/api\/organizations\/([^/]+)\/projects\/$/,
      );
      const organization = organizations.find(
        (candidate) => candidate.id === projectsMatch?.[1],
      );
      if (organization && init.method === 'GET') {
        return fakeResponse(200, {
          results: organization.projects,
          next: null,
        });
      }
      if (organization && init.method === 'POST') {
        if (organization.projects.length >= projectLimit) {
          return fakeResponse(403, { detail: PLAN_LIMIT_DETAIL });
        }
        const token = body.name.endsWith('(local)') ? 'phc_local' : 'phc_prod';
        const project = {
          id: nextProjectId++,
          name: body.name,
          api_token: token,
        };
        organization.projects.push(project);
        return fakeResponse(201, project);
      }

      const renameMatch = path.match(/^\/api\/projects\/(\d+)\/$/);
      if (renameMatch && init.method === 'PATCH') {
        const project = organizations
          .flatMap((candidate) => candidate.projects)
          .find((candidate) => candidate.id === Number(renameMatch[1]));
        if (!project) return fakeResponse(404, null);
        project.name = body.name;
        return fakeResponse(200, project);
      }
      return fakeResponse(500, { detail: `unexpected ${init.method} ${path}` });
    },
  );
  const syncEnv = vi.fn();
  return { op, fetch, writeFields, syncEnv, calls, organizations };
}

function run(s: ReturnType<typeof setup>) {
  return provisionPostHog({
    op: s.op,
    fetch: s.fetch as unknown as typeof globalThis.fetch,
    slug: 'acme',
    name: 'Acme',
    dataRegion: 'eu',
    personalApiKey: PERSONAL_KEY,
    syncEnv: s.syncEnv,
  });
}

function written(s: ReturnType<typeof setup>, item: string) {
  const call = s.writeFields.mock.calls
    .map((c) => c[0])
    .find((c) => c.item === item);
  return call ? Object.fromEntries(call.fields) : undefined;
}

function silenceWarnings() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {});
}

describe('provisionPostHog', () => {
  it('creates the startup organization and adopts its default project on the free plan', async () => {
    const s = setup();
    const warn = silenceWarnings();
    const result = await run(s);
    expect(result).toEqual({
      organization: 'created',
      production: 'created',
      local: 'skipped',
    });
    expect(s.organizations[0]?.name).toBe('Acme');
    expect(s.organizations[0]?.projects.map((p) => p.name)).toEqual(['Acme']);
    expect(written(s, 'production')).toEqual({
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_default',
      NEXT_PUBLIC_POSTHOG_HOST: INGESTION_HOST,
    });
    expect(written(s, 'local')).toBeUndefined();
    expect(s.syncEnv).toHaveBeenCalledTimes(1);
    expect(s.syncEnv).toHaveBeenCalledWith({
      op: s.op,
      vault: 'startup-acme',
      environment: 'production',
    });
    expect(warn).toHaveBeenCalledWith(
      'WARNING  PostHog plan refused a second project — local analytics disabled',
    );
    warn.mockRestore();
  });

  it('creates a local project when the plan allows it', async () => {
    const s = setup({ projectLimit: 10 });
    const result = await run(s);
    expect(result).toEqual({
      organization: 'created',
      production: 'created',
      local: 'created',
    });
    expect(written(s, 'local')).toEqual({
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_local',
      NEXT_PUBLIC_POSTHOG_HOST: INGESTION_HOST,
    });
    expect(written(s, 'production')?.NEXT_PUBLIC_POSTHOG_KEY).toBe(
      'phc_default',
    );
    expect(s.syncEnv).toHaveBeenCalledTimes(2);
  });

  it('is idempotent on re-run', async () => {
    const s = setup({
      projectLimit: 10,
      organizations: [
        {
          id: 'org-7',
          name: 'Acme',
          projects: [
            { id: 1, name: 'Acme', api_token: 'phc_prod' },
            { id: 2, name: 'Acme (local)', api_token: 'phc_local' },
          ],
        },
      ],
    });
    const result = await run(s);
    expect(result).toEqual({
      organization: 'reused',
      production: 'reused',
      local: 'reused',
    });
    expect(s.calls.some((c) => !c.startsWith('GET'))).toBe(false);
    expect(written(s, 'production')?.NEXT_PUBLIC_POSTHOG_KEY).toBe('phc_prod');
    expect(written(s, 'local')?.NEXT_PUBLIC_POSTHOG_KEY).toBe('phc_local');
  });

  it('keeps other organizations untouched', async () => {
    const s = setup({
      organizations: [
        {
          id: 'org-1',
          name: 'Founder',
          projects: [
            { id: 1, name: 'Default project', api_token: 'phc_founder' },
          ],
        },
      ],
    });
    const warn = silenceWarnings();
    await run(s);
    warn.mockRestore();
    expect(s.organizations[0]?.projects[0]?.name).toBe('Default project');
    expect(written(s, 'production')?.NEXT_PUBLIC_POSTHOG_KEY).toBe(
      'phc_default',
    );
  });

  it('reports a missing scope instead of treating it as a plan limit', async () => {
    const s = setup({ createOrganizationStatus: 403 });
    await expect(run(s)).rejects.toThrow(
      "API key missing required scope 'organization:write'",
    );
    expect(s.writeFields).not.toHaveBeenCalled();
  });
});
