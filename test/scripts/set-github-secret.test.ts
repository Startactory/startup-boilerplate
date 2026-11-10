import { describe, expect, it, vi } from 'vitest';
import { setGithubSecret } from '../../scripts/set-github-secret.mjs';

const REFERENCE = 'op://startup-acme/production/DATABASE_URL';

function setup({ value = 'postgresql://u:p@h/db', status = 0 } = {}) {
  const op = { read: vi.fn(() => value) };
  const run = vi.fn(
    (_command: string, _args: string[], _options: { input: string }) => ({
      status,
      stdout: '',
      stderr: 'gh said something',
    }),
  );
  return { op, run };
}

describe('setGithubSecret', () => {
  it('sets the secret from stdin', () => {
    const { op, run } = setup();
    const message = setGithubSecret({
      op,
      run,
      name: 'DATABASE_URL',
      reference: REFERENCE,
      config: {},
    });
    expect(op.read).toHaveBeenCalledWith(REFERENCE);
    expect(run).toHaveBeenCalledWith('gh', ['secret', 'set', 'DATABASE_URL'], {
      input: 'postgresql://u:p@h/db',
    });
    expect(message).toBe('OK  DATABASE_URL set as a GitHub secret');
    expect(message).not.toContain('postgresql');
  });

  it('refuses an empty value', () => {
    const { op, run } = setup({ value: '\n' });
    expect(() =>
      setGithubSecret({
        op,
        run,
        name: 'DATABASE_URL',
        reference: REFERENCE,
        config: {},
      }),
    ).toThrow(`${REFERENCE} resolved to an empty value — nothing was set`);
    expect(run).not.toHaveBeenCalled();
  });

  it('passes --repo from startup.config.json', () => {
    const { op, run } = setup();
    setGithubSecret({
      op,
      run,
      name: 'DATABASE_URL',
      reference: REFERENCE,
      config: { repository: 'me/acme' },
    });
    expect(run.mock.calls[0]?.[1]).toEqual([
      'secret',
      'set',
      'DATABASE_URL',
      '--repo',
      'me/acme',
    ]);
  });

  it('keeps gh output out of the error', () => {
    const { op, run } = setup({ status: 1 });
    expect(() =>
      setGithubSecret({
        op,
        run,
        name: 'DATABASE_URL',
        reference: REFERENCE,
        config: {},
      }),
    ).toThrow(/^gh secret set DATABASE_URL failed$/);
  });
});
