import { describe, expect, it, vi } from 'vitest';
import { importAutumnKeys } from '../../scripts/vault-import-autumn-keys.mjs';

const SANDBOX_KEY = 'am_sk_test_sandbox_value';
const PRODUCTION_KEY = 'am_sk_live_production_value';

function setup(envText: string) {
  const written = new Map<string, string>();
  const fs = {
    readFileSync: vi.fn((path: string) =>
      path === '.env.template'
        ? 'AUTUMN_SECRET_KEY=\nNEXT_PUBLIC_APP_URL=\n'
        : envText,
    ),
    writeFileSync: vi.fn((path: string, data: string) => {
      written.set(path, data);
    }),
    rmSync: vi.fn(),
  };
  const op = {
    writeFields: vi.fn(),
    readFields: vi.fn(
      ({ item }: { item: string }): Map<string, string> | null =>
        new Map([
          [
            'AUTUMN_SECRET_KEY',
            item === 'local' ? SANDBOX_KEY : PRODUCTION_KEY,
          ],
          ['NEXT_PUBLIC_APP_URL', 'http://localhost:3000'],
        ]),
    ),
  };
  return { fs, op, written };
}

describe('importAutumnKeys', () => {
  it('moves both keys to their items', () => {
    const { fs, op } = setup(
      `AUTUMN_SECRET_KEY=${SANDBOX_KEY}\nAUTUMN_PROD_SECRET_KEY=${PRODUCTION_KEY}\n`,
    );
    const result = importAutumnKeys({ op, fs, vault: 'startup-acme' });
    expect(result).toEqual({ local: true, production: true });
    expect(op.writeFields).toHaveBeenCalledWith({
      vault: 'startup-acme',
      item: 'local',
      fields: new Map([['AUTUMN_SECRET_KEY', SANDBOX_KEY]]),
    });
    expect(op.writeFields).toHaveBeenCalledWith({
      vault: 'startup-acme',
      item: 'production',
      fields: new Map([['AUTUMN_SECRET_KEY', PRODUCTION_KEY]]),
    });
    expect(JSON.stringify(result)).not.toContain(PRODUCTION_KEY);
  });

  it('removes the production key from .env', () => {
    const { fs, op, written } = setup(
      `AUTUMN_SECRET_KEY=${SANDBOX_KEY}\nAUTUMN_PROD_SECRET_KEY=${PRODUCTION_KEY}\n`,
    );
    importAutumnKeys({ op, fs, vault: 'startup-acme' });
    const envText = written.get('.env');
    expect(envText).toContain(`AUTUMN_SECRET_KEY=${SANDBOX_KEY}`);
    expect(envText).not.toContain('AUTUMN_PROD_SECRET_KEY');
    expect(written.has('.env.prod')).toBe(true);
  });

  it('refuses a live key in the local item', () => {
    const { fs, op } = setup(`AUTUMN_SECRET_KEY=${PRODUCTION_KEY}\n`);
    expect(() => importAutumnKeys({ op, fs, vault: 'startup-acme' })).toThrow(
      'AUTUMN_SECRET_KEY in .env is a live key — run atmn login again and pick the sandbox',
    );
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('imports one key and reports the other as not found', () => {
    const { fs, op } = setup(`AUTUMN_SECRET_KEY=${SANDBOX_KEY}\n`);
    const result = importAutumnKeys({ op, fs, vault: 'startup-acme' });
    expect(result).toEqual({ local: true, production: false });
    expect(op.writeFields).toHaveBeenCalledTimes(1);
  });

  it('throws when .env holds neither key', () => {
    const { fs, op } = setup('OTHER=1\n');
    expect(() => importAutumnKeys({ op, fs, vault: 'startup-acme' })).toThrow(
      'no Autumn keys in .env — run pnpm dlx atmn login first',
    );
  });

  it('imports only the production key and still clears it from .env', () => {
    const { fs, op, written } = setup(
      `AUTUMN_PROD_SECRET_KEY=${PRODUCTION_KEY}\n`,
    );
    const result = importAutumnKeys({ op, fs, vault: 'startup-acme' });
    expect(result).toEqual({ local: false, production: true });
    expect(written.get('.env')).not.toContain('AUTUMN_PROD_SECRET_KEY');
  });

  it('stops before writing when the local item is missing', () => {
    const { fs, op } = setup(`AUTUMN_SECRET_KEY=${SANDBOX_KEY}\n`);
    op.readFields.mockImplementation(({ item }: { item: string }) =>
      item === 'local' ? null : new Map(),
    );
    expect(() => importAutumnKeys({ op, fs, vault: 'startup-acme' })).toThrow(
      'no 1Password item startup-acme/local — run node scripts/init-env.mjs --apply first',
    );
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('stops before writing when the production item is missing', () => {
    const { fs, op } = setup(`AUTUMN_SECRET_KEY=${SANDBOX_KEY}\n`);
    op.readFields.mockImplementation(({ item }: { item: string }) =>
      item === 'production' ? null : new Map(),
    );
    expect(() => importAutumnKeys({ op, fs, vault: 'startup-acme' })).toThrow(
      'no 1Password item startup-acme/production — run node scripts/init-env.mjs --apply --file .env.prod first',
    );
    expect(op.writeFields).not.toHaveBeenCalled();
  });
});
