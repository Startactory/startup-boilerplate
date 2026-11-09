import { describe, expect, it, vi } from 'vitest';
import { copySmtpCredentials } from '../../scripts/vault-copy-smtp.mjs';

const USER = 'founder@gmail.com';
const PASS = 'abcdefghijklmnop';

function setup({ itemsExist = true } = {}) {
  const op = {
    readFields: vi.fn(({ item }: { item: string }) =>
      item === 'master-keys'
        ? new Map([
            ['SMTP_USER', USER],
            ['SMTP_PASS', PASS],
          ])
        : itemsExist
          ? new Map<string, string>()
          : null,
    ),
    writeFields: vi.fn(),
  };
  const syncEnv = vi.fn();
  return { op, syncEnv };
}

describe('copySmtpCredentials', () => {
  it('copies SMTP credentials into both items', () => {
    const { op, syncEnv } = setup();
    copySmtpCredentials({ op, vault: 'startup-acme', syncEnv });
    for (const item of ['local', 'production']) {
      expect(op.writeFields).toHaveBeenCalledWith({
        vault: 'startup-acme',
        item,
        fields: new Map([
          ['SMTP_USER', USER],
          ['SMTP_PASS', PASS],
          ['SMTP_FROM_EMAIL', USER],
          ['EMAIL_PROVIDER', 'smtp'],
        ]),
      });
    }
    expect(op.writeFields).toHaveBeenCalledTimes(2);
    expect(syncEnv).toHaveBeenCalledTimes(2);
  });

  it('stops before writing when an item is missing', () => {
    const { op, syncEnv } = setup({ itemsExist: false });
    expect(() =>
      copySmtpCredentials({ op, vault: 'startup-acme', syncEnv }),
    ).toThrow('no 1Password item startup-acme/local');
    expect(op.writeFields).not.toHaveBeenCalled();
    expect(syncEnv).not.toHaveBeenCalled();
  });
});
