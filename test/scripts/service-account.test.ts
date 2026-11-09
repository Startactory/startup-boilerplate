import { describe, expect, it } from 'vitest';
import {
  KEYCHAIN_SERVICE,
  readServiceAccountToken,
} from '../../scripts/vault/service-account.mjs';

describe('service account token', () => {
  it('reads the token from the Keychain without a trailing newline', () => {
    const calls: { command: string; args: string[] }[] = [];
    const token = readServiceAccountToken({
      user: 'founder',
      run: (command: string, args: string[]) => {
        calls.push({ command, args });
        return { status: 0, stdout: 'ops_fake-token\n', stderr: '' };
      },
    });
    expect(token).toBe('ops_fake-token');
    expect(KEYCHAIN_SERVICE).toBe('startup-factory-op');
    expect(calls).toEqual([
      {
        command: 'security',
        args: [
          'find-generic-password',
          '-a',
          'founder',
          '-s',
          'startup-factory-op',
          '-w',
        ],
      },
    ]);
  });

  it('explains a missing Keychain token', () => {
    try {
      readServiceAccountToken({
        user: 'founder',
        run: () => ({
          status: 44,
          stdout: 'leaky-stdout',
          stderr: 'leaky-stderr',
        }),
      });
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toBe(
        'no 1Password service account token in the Keychain (startup-factory-op) — run step 0, item 2',
      );
      expect(message).not.toContain('leaky');
    }
  });

  it('rejects an empty Keychain token', () => {
    expect(() =>
      readServiceAccountToken({
        user: 'founder',
        run: () => ({ status: 0, stdout: '\n', stderr: '' }),
      }),
    ).toThrow(
      'no 1Password service account token in the Keychain (startup-factory-op) — run step 0, item 2',
    );
  });
});
