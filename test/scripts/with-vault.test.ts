import { describe, expect, it } from 'vitest';
import { runWithVault } from '../../scripts/with-vault.mjs';

type SpawnOptions = { stdio?: string; env?: Record<string, string> };

describe('with-vault', () => {
  it('runs the command with the token in its environment and returns its status', () => {
    const calls: { command: string; args: string[]; options: SpawnOptions }[] =
      [];
    const status = runWithVault({
      command: 'op',
      args: ['read', 'op://v/i/F'],
      readToken: () => 'ops_fake-token',
      run: ((command: string, args: string[], options: SpawnOptions) => {
        calls.push({ command, args, options });
        return { status: 3 };
      }) as never,
    });
    expect(status).toBe(3);
    expect(calls[0]?.command).toBe('op');
    expect(calls[0]?.args).toEqual(['read', 'op://v/i/F']);
    expect(calls[0]?.options.stdio).toBe('inherit');
    expect(calls[0]?.options.env?.OP_SERVICE_ACCOUNT_TOKEN).toBe(
      'ops_fake-token',
    );
  });

  it('returns 1 when the command could not start', () => {
    const status = runWithVault({
      command: 'nope',
      args: [],
      readToken: () => 'ops_fake-token',
      run: (() => ({ status: null, error: new Error('ENOENT') })) as never,
    });
    expect(status).toBe(1);
  });
});
