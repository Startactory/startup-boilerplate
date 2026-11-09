import { describe, expect, it, vi } from 'vitest';
import { provisionResend } from '../../scripts/providers/resend-keys.mjs';

const API = 'https://api.resend.com';
const MASTER_KEY = 're_master_full_access_value';

function fakeResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  };
}

function setup({
  stored = {},
  remoteKeys = [],
  domains = [{ id: 'dom_1', name: 'acme.com', status: 'verified' }],
}: {
  stored?: Partial<Record<'local' | 'production', Map<string, string>>>;
  remoteKeys?: { id: string; name: string }[];
  domains?: { id: string; name: string; status: string }[];
} = {}) {
  const writeFields = vi.fn();
  const op = {
    readFields: vi.fn(
      ({ item }: { item: 'local' | 'production' }) => stored[item] ?? null,
    ),
    writeFields,
  };
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetch = vi.fn(
    async (url: string, init: { method: string; body?: string }) => {
      const path = url.replace(API, '');
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ method: init.method, path, body });
      if (init.method === 'GET' && path === '/domains') {
        return fakeResponse(200, { data: domains });
      }
      if (init.method === 'GET' && path === '/api-keys') {
        return fakeResponse(200, { data: remoteKeys });
      }
      if (init.method === 'DELETE') return fakeResponse(200, {});
      return fakeResponse(201, {
        id: `key_${body.name}`,
        token: `re_token_${body.name}`,
      });
    },
  );
  const syncEnv = vi.fn();
  return { op, fetch, writeFields, syncEnv, calls };
}

function run(s: ReturnType<typeof setup>, domain = 'acme.com') {
  return provisionResend({
    op: s.op,
    fetch: s.fetch as unknown as typeof globalThis.fetch,
    slug: 'acme',
    domain,
    fullAccessKey: MASTER_KEY,
    syncEnv: s.syncEnv,
  });
}

describe('provisionResend', () => {
  it("scopes each key to the startup's domain", async () => {
    const s = setup();
    const result = await run(s);
    expect(result).toEqual({ local: 'created', production: 'created' });
    const posts = s.calls.filter((call) => call.method === 'POST');
    expect(posts.map((call) => call.body)).toEqual([
      { name: 'acme-local', permission: 'sending_access', domain_id: 'dom_1' },
      {
        name: 'acme-production',
        permission: 'sending_access',
        domain_id: 'dom_1',
      },
    ]);
    expect(s.writeFields).toHaveBeenCalledTimes(2);
    const local = s.writeFields.mock.calls[0]?.[0];
    expect(local?.vault).toBe('startup-acme');
    expect(local?.item).toBe('local');
    expect(Object.fromEntries(local?.fields ?? [])).toEqual({
      RESEND_API_KEY: 're_token_acme-local',
      EMAIL_PROVIDER: 'resend',
      RESEND_FROM_EMAIL: 'noreply@acme.com',
    });
    expect(s.writeFields.mock.calls[1]?.[0]?.item).toBe('production');
    expect(s.syncEnv).toHaveBeenCalledTimes(2);
  });

  it('is idempotent on re-run', async () => {
    const held = () => new Map([['RESEND_API_KEY', 're_held']]);
    const s = setup({ stored: { local: held(), production: held() } });
    const result = await run(s);
    expect(result).toEqual({ local: 'reused', production: 'reused' });
    expect(s.calls.some((call) => call.method !== 'GET')).toBe(false);
    expect(s.writeFields).toHaveBeenCalledTimes(2);
    expect(
      Object.fromEntries(s.writeFields.mock.calls[0]?.[0]?.fields ?? []),
    ).toEqual({
      EMAIL_PROVIDER: 'resend',
      RESEND_FROM_EMAIL: 'noreply@acme.com',
    });
  });

  it('rotates a key the vault does not hold', async () => {
    const s = setup({ remoteKeys: [{ id: 'old_1', name: 'acme-local' }] });
    const result = await run(s);
    expect(result).toEqual({ local: 'rotated', production: 'created' });
    expect(
      s.calls.filter((call) => call.method === 'DELETE').map((c) => c.path),
    ).toEqual(['/api-keys/old_1']);
  });

  it('stops when the domain is not in Resend', async () => {
    const s = setup({ domains: [] });
    await expect(run(s)).rejects.toThrow(
      'domain acme.com is not in Resend — add and verify it first',
    );
    expect(s.writeFields).not.toHaveBeenCalled();
  });
});
