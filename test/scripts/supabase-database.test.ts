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

function setup({
  existing,
  poolerOverride,
  patchStatus = 200,
}: {
  existing: Map<string, string> | null;
  poolerOverride?: unknown;
  patchStatus?: number;
}) {
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
  const calls: string[] = [];
  const fetch = vi.fn(async (_url: string, init: { method: string }) => {
    calls.push(init.method);
    return init.method === 'PATCH'
      ? fakeResponse(patchStatus, {})
      : fakeResponse(200, poolerOverride ?? pooler);
  });
  const connect = vi.fn(async (_url: string) => undefined);
  const syncEnv = vi.fn();
  return { op, fetch, connect, writeFields, syncEnv, calls };
}

const STORED = new Map([['DATABASE_URL', 'postgresql://u:p@h:5432/postgres']]);

function run({
  op,
  fetch,
  connect,
  syncEnv,
  rotate = false,
}: {
  op: ReturnType<typeof setup>['op'];
  fetch: ReturnType<typeof setup>['fetch'];
  connect: ReturnType<typeof setup>['connect'];
  syncEnv: ReturnType<typeof setup>['syncEnv'];
  rotate?: boolean;
}) {
  return provisionSupabaseDatabase({
    ...BASE,
    rotate,
    op,
    fetch: asFetch(fetch),
    connect,
    syncEnv,
  });
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
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('syncs the env file when reusing', async () => {
    const { op, fetch, connect, syncEnv } = setup({ existing: STORED });
    const result = await run({ op, fetch, connect, syncEnv });
    expect(result).toBe('reused');
    expect(syncEnv).toHaveBeenCalledOnce();
  });

  it('retries the connection while the new password propagates', async () => {
    const { op, fetch, connect, syncEnv } = setup({ existing: null });
    const authFailure = () => Object.assign(new Error('x'), { code: '28P01' });
    connect
      .mockRejectedValueOnce(authFailure())
      .mockRejectedValueOnce(authFailure());
    const wait = vi.fn(async (_ms: number) => undefined);
    const result = await provisionSupabaseDatabase({
      ...BASE,
      op,
      fetch: asFetch(fetch),
      connect,
      syncEnv,
      wait,
    });
    expect(result).toBe('created');
    expect(connect).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(10_000);
  });

  it('gives up after six rejected attempts', async () => {
    const { op, fetch, connect, syncEnv } = setup({ existing: null });
    connect.mockRejectedValue(Object.assign(new Error('x'), { code: '28P01' }));
    const wait = vi.fn(async (_ms: number) => undefined);
    await expect(
      provisionSupabaseDatabase({
        ...BASE,
        op,
        fetch: asFetch(fetch),
        connect,
        syncEnv,
        wait,
      }),
    ).rejects.toThrow('connection failed: 28P01');
    expect(connect).toHaveBeenCalledTimes(6);
    expect(wait).toHaveBeenCalledTimes(5);
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

  it('rotates when the stored password is rejected', async () => {
    const { op, fetch, connect, syncEnv, calls } = setup({ existing: STORED });
    connect.mockRejectedValueOnce(
      Object.assign(new Error('x'), { code: '28P01' }),
    );
    const result = await run({ op, fetch, connect, syncEnv });
    expect(result).toBe('created');
    expect(calls).toContain('PATCH');
  });

  it('stops on a network error instead of rotating', async () => {
    const { op, fetch, connect, syncEnv, calls } = setup({ existing: STORED });
    connect.mockRejectedValueOnce(
      Object.assign(new Error('postgresql://u:p@h'), { code: 'ENOTFOUND' }),
    );
    await expect(run({ op, fetch, connect, syncEnv })).rejects.toThrow(
      'stored DATABASE_URL could not be checked: ENOTFOUND — re-run when online, or pass --rotate',
    );
    expect(calls).not.toContain('PATCH');
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('forces a new password with --rotate even when the stored URL connects', async () => {
    const { op, fetch, connect, syncEnv, calls } = setup({ existing: STORED });
    const result = await run({ op, fetch, connect, syncEnv, rotate: true });
    expect(result).toBe('created');
    expect(calls).toContain('PATCH');
  });

  it('aborts before changing the password when the pooler list is empty', async () => {
    const { op, fetch, connect, syncEnv, calls } = setup({
      existing: null,
      poolerOverride: [],
    });
    await expect(run({ op, fetch, connect, syncEnv })).rejects.toThrow();
    expect(calls).not.toContain('PATCH');
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('aborts before changing the password when the URL fails validation', async () => {
    const { op, fetch, connect, syncEnv, calls } = setup({
      existing: null,
      poolerOverride: [{ db_host: '', pool_mode: 'session' }],
    });
    await expect(run({ op, fetch, connect, syncEnv })).rejects.toThrow();
    expect(calls).not.toContain('PATCH');
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('writes the vault before checking the connection', async () => {
    const { op, fetch, connect, syncEnv, calls } = setup({ existing: null });
    const order: string[] = [];
    op.writeFields.mockImplementation(() => order.push('write'));
    connect.mockImplementation(async () => {
      order.push('connect');
    });
    await run({ op, fetch, connect, syncEnv });
    expect(calls.at(-1)).toBe('PATCH');
    expect(order).toEqual(['write', 'connect']);
  });

  it('throws not found on a 404 from the password update', async () => {
    const { op, fetch, connect, syncEnv } = setup({
      existing: null,
      patchStatus: 404,
    });
    await expect(run({ op, fetch, connect, syncEnv })).rejects.toThrow(
      'Supabase project abc not found',
    );
    expect(op.writeFields).not.toHaveBeenCalled();
  });
});
