import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loginToAutumn } from '../../scripts/providers/autumn-login.mjs';

const AUTH_URL =
  'https://api.useautumn.com/api/auth/oauth2/authorize?state=abc';

function fakeAtmn({
  status = 0,
  writeUrl = true,
}: {
  status?: number;
  writeUrl?: boolean;
} = {}) {
  const seen: { cwd?: string; path?: string; shim?: string } = {};
  const spawnAtmn = vi.fn(
    async ({ cwd, env }: { cwd: string; env: Record<string, string> }) => {
      seen.cwd = cwd;
      seen.path = env.PATH;
      const binDir = (env.PATH ?? '').split(':')[0] ?? '';
      seen.shim = readFileSync(join(binDir, 'open'), 'utf8');
      if (writeUrl) writeFileSync(join(cwd, 'auth-url'), `${AUTH_URL}\n`);
      writeFileSync(
        join(cwd, '.env'),
        'AUTUMN_PROD_SECRET_KEY=am_sk_live_x\nAUTUMN_SECRET_KEY=am_sk_test_x\n',
      );
      return { status };
    },
  );
  return { spawnAtmn, seen };
}

describe('loginToAutumn', () => {
  it('runs atmn in a fresh directory, reports the URL and imports the keys', async () => {
    const { spawnAtmn, seen } = fakeAtmn();
    const importKeys = vi.fn(() => ({ local: true, production: 'sandbox' }));
    const onUrl = vi.fn();
    const result = await loginToAutumn({
      op: {},
      vault: 'startup-acme',
      spawnAtmn,
      importKeys,
      onUrl,
      pollMs: 1,
    });
    expect(result).toEqual({ local: true, production: 'sandbox' });
    expect(onUrl).toHaveBeenCalledWith(AUTH_URL);
    expect(seen.path?.split(':')[0]).toBe(join(seen.cwd ?? '', 'bin'));
    expect(seen.shim).toContain(join(seen.cwd ?? '', 'auth-url'));
    expect(importKeys).toHaveBeenCalledWith({
      op: {},
      vault: 'startup-acme',
      envPath: join(seen.cwd ?? '', '.env'),
      productionKey: 'sandbox',
    });
    expect(existsSync(seen.cwd ?? '')).toBe(false);
  });

  it('passes the live production choice to the import', async () => {
    const { spawnAtmn } = fakeAtmn();
    const importKeys = vi.fn(() => ({ local: true, production: 'live' }));
    await loginToAutumn({
      op: {},
      vault: 'startup-acme',
      spawnAtmn,
      importKeys,
      productionKey: 'live',
      onUrl: vi.fn(),
      pollMs: 1,
    });
    expect(importKeys).toHaveBeenCalledWith(
      expect.objectContaining({ productionKey: 'live' }),
    );
  });

  it('makes the browser shim executable', async () => {
    let mode = 0;
    const spawnAtmn = vi.fn(
      async ({ cwd, env }: { cwd: string; env: Record<string, string> }) => {
        mode = statSync(
          join((env.PATH ?? '').split(':')[0] ?? '', 'open'),
        ).mode;
        writeFileSync(join(cwd, 'auth-url'), `${AUTH_URL}\n`);
        return { status: 0 };
      },
    );
    await loginToAutumn({
      op: {},
      vault: 'startup-acme',
      spawnAtmn,
      importKeys: vi.fn(() => ({ local: true, production: 'sandbox' })),
      onUrl: vi.fn(),
      pollMs: 1,
    });
    expect(mode & 0o111).not.toBe(0);
  });

  it('fails and cleans up when atmn fails', async () => {
    const { spawnAtmn, seen } = fakeAtmn({ status: 1 });
    const importKeys = vi.fn();
    await expect(
      loginToAutumn({
        op: {},
        vault: 'startup-acme',
        spawnAtmn,
        importKeys,
        onUrl: vi.fn(),
        pollMs: 1,
      }),
    ).rejects.toThrow('atmn login failed');
    expect(importKeys).not.toHaveBeenCalled();
    expect(existsSync(seen.cwd ?? '')).toBe(false);
  });

  it('fails when atmn never asks for a browser', async () => {
    const { spawnAtmn } = fakeAtmn({ writeUrl: false });
    await expect(
      loginToAutumn({
        op: {},
        vault: 'startup-acme',
        spawnAtmn,
        importKeys: vi.fn(),
        onUrl: vi.fn(),
        pollMs: 1,
      }),
    ).rejects.toThrow('atmn login never opened a browser');
  });
});
