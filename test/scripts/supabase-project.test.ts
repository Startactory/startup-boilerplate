import { describe, expect, it, vi } from 'vitest';
import {
  ensureSupabaseProject,
  findFactoryOrganization,
  listActiveProjects,
} from '../../scripts/providers/supabase-project.mjs';

type Project = {
  ref: string;
  name: string;
  status: string;
  organization_slug: string;
};

const ORG = { id: 'old-id', slug: 'startup-factory', name: 'startup-factory' };

function fakeResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  };
}

function project(ref: string, name: string, status: string): Project {
  return { ref, name, status, organization_slug: ORG.slug };
}

function setup({
  plan = 'free',
  projects = [],
  organizations = [ORG],
  pollStatuses = ['ACTIVE_HEALTHY'],
}: {
  plan?: string;
  projects?: Project[];
  organizations?: unknown[];
  pollStatuses?: string[];
}) {
  const posts: { url: string; body: string }[] = [];
  const polls = [...pollStatuses];
  const fetch = vi.fn(
    async (url: string, init: { method: string; body?: string }) => {
      const path = url.replace('https://api.supabase.com', '');
      if (init.method === 'POST') {
        posts.push({ url: path, body: init.body ?? '' });
        return fakeResponse(201, {
          ref: 'newrefnewrefnewrefne',
          status: 'COMING_UP',
        });
      }
      if (path === '/v1/organizations') return fakeResponse(200, organizations);
      if (path === `/v1/organizations/${ORG.slug}`)
        return fakeResponse(200, { plan });
      if (path === '/v1/projects') return fakeResponse(200, projects);
      const status = polls.length > 1 ? polls.shift() : polls[0];
      return fakeResponse(200, { status });
    },
  );
  const wait = vi.fn(async (_ms: number) => undefined);
  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    wait,
    posts,
  };
}

const run = (s: ReturnType<typeof setup>, extra = {}) =>
  ensureSupabaseProject({
    fetch: s.fetch,
    wait: s.wait,
    token: 't',
    slug: 'acme',
    dataRegion: 'eu',
    ...extra,
  });

describe('findFactoryOrganization', () => {
  it('returns the slug and plan', async () => {
    const s = setup({ plan: 'pro' });
    expect(
      await findFactoryOrganization({ fetch: s.fetch, token: 't' }),
    ).toEqual({ id: 'startup-factory', plan: 'pro' });
  });

  it('throws when the organization is absent', async () => {
    const s = setup({ organizations: [] });
    await expect(
      findFactoryOrganization({ fetch: s.fetch, token: 't' }),
    ).rejects.toThrow(
      'Supabase organization "startup-factory" not found — run step 0',
    );
  });
});

describe('listActiveProjects', () => {
  it('keeps only active projects of the organization', async () => {
    const s = setup({
      projects: [
        project('a', 'one', 'ACTIVE_HEALTHY'),
        project('b', 'two', 'INACTIVE'),
        {
          ...project('c', 'three', 'ACTIVE_HEALTHY'),
          organization_slug: 'other',
        },
      ],
    });
    expect(
      await listActiveProjects({
        fetch: s.fetch,
        token: 't',
        organizationId: ORG.slug,
      }),
    ).toEqual([{ ref: 'a', name: 'one', status: 'ACTIVE_HEALTHY' }]);
  });
});

describe('ensureSupabaseProject', () => {
  it('creates the project in eu-west-3 when none exists', async () => {
    const s = setup({});
    const result = await run(s);
    expect(result).toEqual({ ref: 'newrefnewrefnewrefne', outcome: 'created' });
    expect(JSON.parse(s.posts[0]?.body ?? '{}')).toMatchObject({
      name: 'acme',
      organization_slug: 'startup-factory',
      region: 'eu-west-3',
    });
  });

  it('creates in us-east-1 for the us region', async () => {
    const s = setup({});
    await run(s, { dataRegion: 'us' });
    expect(JSON.parse(s.posts[0]?.body ?? '{}').region).toBe('us-east-1');
  });

  it('reuses a project named after the slug without a POST', async () => {
    const s = setup({
      projects: [project('existingexistingexis', 'acme', 'ACTIVE_HEALTHY')],
    });
    expect(await run(s)).toEqual({
      ref: 'existingexistingexis',
      outcome: 'reused',
    });
    expect(s.posts).toHaveLength(0);
    expect(s.wait).not.toHaveBeenCalled();
  });

  it('waits for a project that is coming up', async () => {
    const s = setup({
      projects: [project('existingexistingexis', 'acme', 'COMING_UP')],
      pollStatuses: ['COMING_UP', 'ACTIVE_HEALTHY'],
    });
    expect(await run(s)).toMatchObject({ outcome: 'reused' });
    expect(s.wait).toHaveBeenCalledTimes(2);
  });

  it('throws naming the ref and status on timeout', async () => {
    const s = setup({
      projects: [project('existingexistingexis', 'acme', 'COMING_UP')],
      pollStatuses: ['COMING_UP'],
    });
    await expect(run(s)).rejects.toThrow(
      'Supabase project existingexistingexis still COMING_UP after 10 minutes — re-run to keep waiting',
    );
  });

  it.each([
    'INACTIVE',
    'PAUSED',
    'INIT_FAILED',
    'RESTORE_FAILED',
    'PAUSE_FAILED',
  ])('stops at once on a reused project that is %s', async (status) => {
    const s = setup({
      projects: [project('existingexistingexis', 'acme', status)],
    });
    await expect(run(s)).rejects.toThrow(
      `Supabase project existingexistingexis is ${status} — the founder restores or deletes it in the Supabase dashboard`,
    );
    expect(s.wait).not.toHaveBeenCalled();
    expect(s.posts).toHaveLength(0);
  });

  it('stops at once when a new project fails to initialize', async () => {
    const s = setup({ pollStatuses: ['COMING_UP', 'INIT_FAILED'] });
    await expect(run(s)).rejects.toThrow(
      'Supabase project newrefnewrefnewrefne is INIT_FAILED — the founder restores or deletes it in the Supabase dashboard',
    );
    expect(s.wait).toHaveBeenCalledTimes(2);
  });

  it('refuses a paid plan without creating', async () => {
    const s = setup({ plan: 'pro' });
    await expect(run(s)).rejects.toThrow(
      'Supabase organization startup-factory is on a paid plan — the run creates free projects only',
    );
    expect(s.posts).toHaveLength(0);
  });

  it('refuses when two projects are already active', async () => {
    const s = setup({
      projects: [
        project('a', 'one', 'ACTIVE_HEALTHY'),
        project('b', 'two', 'ACTIVE_HEALTHY'),
        project('c', 'three', 'INACTIVE'),
      ],
    });
    await expect(run(s)).rejects.toThrow(
      'Supabase Free plan allows 2 active projects and startup-factory has 2 — pause one or upgrade (founder action)',
    );
    expect(s.posts).toHaveLength(0);
  });

  it('never leaks the generated database password in an error', async () => {
    const s = setup({ pollStatuses: ['COMING_UP'] });
    let message = '';
    try {
      await run(s);
    } catch (error) {
      message = (error as Error).message;
    }
    const password = JSON.parse(s.posts[0]?.body ?? '{}').db_pass;
    expect(password.length).toBeGreaterThan(20);
    expect(message).toContain('still COMING_UP');
    expect(message).not.toContain(password);
  });
});
