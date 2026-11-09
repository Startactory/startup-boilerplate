import { describe, expect, it, vi } from 'vitest';
import { ProviderError, requestJson } from '../../scripts/providers/http.mjs';
import { readMasterKeys } from '../../scripts/providers/master-keys.mjs';

function asFetch(mock: unknown) {
  return mock as typeof globalThis.fetch;
}

function fakeResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  };
}

describe('requestJson', () => {
  it('throws ProviderError with the response message on 401', async () => {
    const fetch = vi.fn(async () =>
      fakeResponse(401, { message: 'Invalid token' }),
    );
    const call = requestJson({
      provider: 'supabase',
      fetch: asFetch(fetch),
      method: 'PATCH',
      url: 'https://api.example.com/x',
      token: 'secret-token',
      body: { password: 'secret-password' },
    });
    await expect(call).rejects.toBeInstanceOf(ProviderError);
    await expect(call).rejects.toMatchObject({
      provider: 'supabase',
      status: 401,
      message: 'Invalid token',
    });
  });

  it('returns 404 as a normal result and sends auth headers', async () => {
    const fetch = vi.fn(async (_url: string, _init: unknown) =>
      fakeResponse(404, { message: 'nope' }),
    );
    const result = await requestJson({
      provider: 'supabase',
      fetch: asFetch(fetch),
      method: 'GET',
      url: 'https://api.example.com/x',
      token: 't',
    });
    expect(result.status).toBe(404);
    const init = fetch.mock.calls[0]?.[1] as {
      headers: Record<string, string>;
    };
    expect(init.headers.Authorization).toBe('Bearer t');
    expect(init.headers['User-Agent']).toBe('startup-boilerplate-scripts');
  });
});

describe('readMasterKeys', () => {
  it('lists every missing master key', () => {
    const op = { readFields: vi.fn(() => new Map([['A', '1']])) };
    expect(() => readMasterKeys({ op, fields: ['A', 'B', 'C'] })).toThrow(
      'missing in startup-founder/master-keys: B, C — run step 0, item 6',
    );
  });

  it('returns the requested fields', () => {
    const op = {
      readFields: vi.fn(
        () =>
          new Map([
            ['A', '1'],
            ['B', '2'],
          ]),
      ),
    };
    expect(readMasterKeys({ op, fields: ['A'] }).get('A')).toBe('1');
  });
});
