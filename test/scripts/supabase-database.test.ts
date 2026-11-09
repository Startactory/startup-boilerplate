import { describe, expect, it, vi } from 'vitest';
import { provisionSupabaseDatabase } from '../../scripts/providers/supabase-database.mjs';

const POOLER_HOST = 'aws-1-eu-west-3.pooler.supabase.com';

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

function setup({ existing }: { existing: Map<string, string> | null }) {
  const writeFields = vi.fn();
  const op = {
    readFields: vi.fn(() => existing),
    writeFields,
  };
  const pooler = [
    {
      db_host: 'other.pooler.supabase.com',
      db_port: 6543,
      pool_mode: 'transaction',
    },
    { db_host: POOLER_HOST, db_port: 5432, pool_mode: 'session' },
  ];
  const fetch = vi.fn(async (_url: string, init: { method: string }) =>
    init.method === 'PATCH' ? fakeResponse(200, {}) : fakeResponse(200, pooler),
  );
  const connect = vi.fn(async (_url: string) => undefined);
  const syncEnv = vi.fn();
  return { op, fetch, connect, writeFields, syncEnv };
}

const BASE = { ref: 'abc', slug: 'acme', rotate: false, token: 'tok' };

describe('provisionSupabaseDatabase', () => {
  it('is idempotent on re-run', async () => {
    const { op, fetch, connect, syncEnv } = setup({
      existing: new Map([['DATABASE_URL', 'postgresql://u:p@h:5432/postgres']]),
    });
    const result = await provisionSupabaseDatabase({
      ...BASE,
      op,
      fetch: asFetch(fetch),
      connect,
      syncEnv,
    });
    expect(result).toBe('reused');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the session pooler host from the API', async () => {
    const { op, fetch, connect, writeFields, syncEnv } = setup({
      existing: null,
    });
    const result = await provisionSupabaseDatabase({
      ...BASE,
      op,
      fetch: asFetch(fetch),
      connect,
      syncEnv,
    });
    expect(result).toBe('created');
    const patch = fetch.mock.calls.find((c) => c[1]?.method === 'PATCH');
    const body = JSON.parse((patch?.[1] as unknown as { body: string }).body);
    expect(body.password).toHaveLength(32);
    const written = writeFields.mock.calls[0]?.[0]?.fields as Map<
      string,
      string
    >;
    const url = written.get('DATABASE_URL') as string;
    expect(url).toContain('postgres.abc:');
    expect(url).toContain(`@${POOLER_HOST}:5432/postgres`);
    expect(written.get('DATABASE_SSL')).toBe('require');
    expect(syncEnv).toHaveBeenCalledOnce();
  });

  it('reports only the error code when the connection fails', async () => {
    const { op, fetch, syncEnv } = setup({ existing: null });
    const connect = vi.fn(async (_url: string) => {
      throw Object.assign(new Error('postgresql://x:secret@h/db'), {
        code: 'ECONNREFUSED',
      });
    });
    await expect(
      provisionSupabaseDatabase({
        ...BASE,
        op,
        fetch: asFetch(fetch),
        connect,
        syncEnv,
      }),
    ).rejects.toThrow(
      /^database password set but connection failed: ECONNREFUSED$/,
    );
    expect(syncEnv).not.toHaveBeenCalled();
  });
});
