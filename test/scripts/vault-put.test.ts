import { describe, expect, it, vi } from 'vitest';
import {
  checkFounderVault,
  listFieldNames,
  putValue,
  readClipboardOnce,
  ValidationError,
} from '../../scripts/vault-put.mjs';

const VAULT = 'startup-acme';

function fakeOp() {
  return { writeFields: vi.fn(), ensureVault: vi.fn(() => 'existing') };
}

describe('putValue', () => {
  it('stores a valid value and returns warnings', () => {
    const op = fakeOp();
    const { warnings } = putValue({
      op,
      vault: VAULT,
      item: 'production',
      field: 'GOOGLE_CLIENT_ID',
      value: 'x',
    });
    expect(op.writeFields).toHaveBeenCalledTimes(1);
    expect(op.writeFields).toHaveBeenCalledWith({
      vault: VAULT,
      item: 'production',
      fields: new Map([['GOOGLE_CLIENT_ID', 'x']]),
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('.apps.googleusercontent.com');
  });

  it('refuses a value an env file cannot hold', () => {
    const op = fakeOp();
    expect(() =>
      putValue({
        op,
        vault: VAULT,
        item: 'production',
        field: 'SMTP_FROM_NAME',
        value: 'Acme "Beta"',
      }),
    ).toThrow(ValidationError);
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('writes nothing on a validation error', () => {
    const op = fakeOp();
    expect(() =>
      putValue({
        op,
        vault: VAULT,
        item: 'production',
        field: 'SMTP_PASS',
        value: 'short',
      }),
    ).toThrow(ValidationError);
    expect(op.writeFields).not.toHaveBeenCalled();
  });
});

describe('readClipboardOnce', () => {
  it('clears the clipboard when validation fails', () => {
    const run = vi.fn(() => '');
    const op = fakeOp();
    expect(() =>
      putValue({
        op,
        vault: VAULT,
        item: 'production',
        field: 'SMTP_PASS',
        value: readClipboardOnce({ run }),
      }),
    ).toThrow(ValidationError);
    expect(run).toHaveBeenLastCalledWith('pbcopy', [], { input: '' });
    expect(op.writeFields).not.toHaveBeenCalled();
  });
});

describe('checkFounderVault', () => {
  it('--check reports the founder vault without writing', () => {
    const op = fakeOp();
    op.ensureVault.mockReturnValue('created');
    expect(checkFounderVault({ op })).toBe('startup-founder: created');
    expect(op.ensureVault).toHaveBeenCalledWith('startup-founder');
    expect(op.writeFields).not.toHaveBeenCalled();
  });
});

describe('listFieldNames', () => {
  it('--list-fields prints labels only', () => {
    const readFields = vi.fn(
      () =>
        new Map([
          ['SMTP_PASS', 'secret-value-1'],
          ['DASH0_AUTH_TOKEN_EU', 'secret-value-2'],
        ]),
    );
    const output = listFieldNames({
      op: { readFields },
      vault: 'startup-founder',
      item: 'master-keys',
    });
    expect(output).toBe('DASH0_AUTH_TOKEN_EU\nSMTP_PASS');
    expect(output).not.toContain('secret-value');
    expect(readFields).toHaveBeenCalledWith({
      vault: 'startup-founder',
      item: 'master-keys',
    });
  });

  it('--list-fields reports a missing item', () => {
    const op = { readFields: vi.fn(() => null) };
    expect(
      listFieldNames({ op, vault: 'startup-founder', item: 'master-keys' }),
    ).toBe('none');
  });
});
