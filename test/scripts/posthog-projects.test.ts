import { describe, expect, it, vi } from 'vitest';
import { provisionPostHog } from '../../scripts/providers/posthog-projects.mjs';

const HOST = 'https://eu.posthog.com';
const INGESTION_HOST = 'https://eu.i.posthog.com';
const PERSONAL_KEY = 'phx_personal_secret_value';

function fakeResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  };
}

function setup({
  existing = [],
  localPostStatus = 201,
}: {
  existing?: { id: number; name: string; api_token: string }[];
  localPostStatus?: number;
} = {}) {
  const writeFields = vi.fn();
  const op = { readFields: vi.fn(() => null), writeFields };
  const calls: string[] = [];
  const fetch = vi.fn(
    async (url: string, init: { method: string; body?: string }) => {
      calls.push(`${init.method} ${url.replace(HOST, '')}`);
      if (url.endsWith('/api/organizations/@current/')) {
        return fakeResponse(200, { id: 'org-1' });
      }
      if (init.method === 'GET') {
        return fakeResponse(200, { results: existing, next: null });
      }
      const { name } = JSON.parse(init.body ?? '{}');
      if (name.endsWith('(local)') && localPostStatus !== 201) {
        return fakeResponse(localPostStatus, {
          detail: 'Your plan has a project limit',
        });
      }
      const token = name.endsWith('(local)') ? 'phc_local' : 'phc_prod';
      return fakeResponse(201, { id: 9, name, api_token: token });
    },
  );
  const syncEnv = vi.fn();
  return { op, fetch, writeFields, syncEnv, calls };
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

describe('provisionPostHog', () => {
  it('creates two projects and writes each key to its own item', async () => {
    const s = setup();
    const result = await run(s);
    expect(result).toEqual({ local: 'created', production: 'created' });
    expect(written(s, 'local')).toEqual({
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_local',
      NEXT_PUBLIC_POSTHOG_HOST: INGESTION_HOST,
    });
    expect(written(s, 'production')).toEqual({
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_prod',
      NEXT_PUBLIC_POSTHOG_HOST: INGESTION_HOST,
    });
    expect(s.syncEnv).toHaveBeenCalledTimes(2);
    expect(s.syncEnv).toHaveBeenCalledWith({
      op: s.op,
      vault: 'startup-acme',
      environment: 'local',
    });
    expect(s.syncEnv).toHaveBeenCalledWith({
      op: s.op,
      vault: 'startup-acme',
      environment: 'production',
    });
  });

  it('is idempotent on re-run', async () => {
    const s = setup({
      existing: [
        { id: 1, name: 'Acme (local)', api_token: 'phc_local' },
        { id: 2, name: 'Acme', api_token: 'phc_prod' },
      ],
    });
    const result = await run(s);
    expect(result).toEqual({ local: 'reused', production: 'reused' });
    expect(s.calls.some((c) => c.startsWith('POST'))).toBe(false);
    expect(written(s, 'production')?.NEXT_PUBLIC_POSTHOG_KEY).toBe('phc_prod');
  });

  it('skips the local project when the plan refuses it', async () => {
    const s = setup({ localPostStatus: 402 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await run(s);
    expect(result).toEqual({ local: 'skipped', production: 'created' });
    expect(written(s, 'local')).toBeUndefined();
    expect(written(s, 'production')?.NEXT_PUBLIC_POSTHOG_KEY).toBe('phc_prod');
    expect(warn).toHaveBeenCalledWith(
      'WARNING  PostHog plan refused a second project — local analytics disabled',
    );
    warn.mockRestore();
  });
});
