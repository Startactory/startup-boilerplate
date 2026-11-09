import { describe, expect, it, vi } from 'vitest';
import {
  checkFounderVault,
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
