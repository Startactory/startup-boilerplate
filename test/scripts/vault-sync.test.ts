import { describe, expect, it, vi } from 'vitest';
import { OpError } from '../../scripts/vault/op.mjs';
import { buildEnvValues, syncEnvFile } from '../../scripts/vault-sync.mjs';

const VAULT = 'startup-acme';
const TEMPLATE = 'DATABASE_URL=\nEMAIL_PROVIDER=\n';

function fakeFs(template = TEMPLATE) {
  return {
    readFileSync: vi.fn(() => template),
    writeFileSync: vi.fn(),
  };
}

function fakeOp(fields: Map<string, string> | null | Error) {
  return {
    readFields: vi.fn(() => {
      if (fields instanceof Error) throw fields;
      return fields;
    }),
  };
}

const FIELDS = new Map([
  ['DATABASE_URL', 'postgres://real'],
  ['EMAIL_PROVIDER', 'resend'],
]);

describe('buildEnvValues', () => {
  it('writes references for production secrets', () => {
    const values = buildEnvValues({
      fields: FIELDS,
      environment: 'production',
      vault: VAULT,
    });
    expect(values.get('DATABASE_URL')).toBe(
      'op://startup-acme/production/DATABASE_URL',
    );
    expect(values.get('EMAIL_PROVIDER')).toBe('resend');
  });

  it('writes real values for local', () => {
    const values = buildEnvValues({
      fields: FIELDS,
      environment: 'local',
      vault: VAULT,
    });
    expect(values.get('DATABASE_URL')).toBe('postgres://real');
    expect(values.get('EMAIL_PROVIDER')).toBe('resend');
  });
});

describe('syncEnvFile', () => {
  it('writes the rendered file once', () => {
    const fs = fakeFs();
    const result = syncEnvFile({
      op: fakeOp(FIELDS),
      vault: VAULT,
      environment: 'local',
      fs,
    });
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '.env',
      'DATABASE_URL=postgres://real\nEMAIL_PROVIDER=resend\n',
    );
    expect(result).toEqual({ path: '.env', keys: 2 });
  });

  it('leaves the env file untouched when the vault read fails', () => {
    const fs = fakeFs();
    expect(() =>
      syncEnvFile({
        op: fakeOp(new OpError('locked')),
        vault: VAULT,
        environment: 'local',
        fs,
      }),
    ).toThrow(/locked/);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('throws a helpful error when the item is missing', () => {
    const fs = fakeFs();
    expect(() =>
      syncEnvFile({
        op: fakeOp(null),
        vault: VAULT,
        environment: 'production',
        fs,
      }),
    ).toThrow(
      'no 1Password item startup-acme/production — run node scripts/init-env.mjs --apply --file .env.prod first',
    );
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('does not write when renderEnv throws', () => {
    const fs = fakeFs();
    const fields = new Map([['EMAIL_PROVIDER', 'bad"value']]);
    expect(() =>
      syncEnvFile({
        op: fakeOp(fields),
        vault: VAULT,
        environment: 'local',
        fs,
      }),
    ).toThrow(/EMAIL_PROVIDER/);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
