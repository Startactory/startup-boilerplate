import { describe, expect, it, vi } from 'vitest';
import { provisionDeployHook } from '../../scripts/providers/vercel-deploy-hook.mjs';

const HOOK_URL =
  'https://api.vercel.com/v1/integrations/deploy/prj_abc/secrethook';

type RunResult = { status: number; stdout: string; stderr: string };
type Call = { command: string; args: string[]; input?: string };

const emptyList = { status: 0, stdout: '[]', stderr: '' };

function setup({ list }: { list: RunResult }) {
  const calls: Call[] = [];
  const run = vi.fn(
    (command: string, args: string[], options: { input?: string } = {}) => {
      calls.push({ command, args, input: options.input });
      if (command === 'gh') return { status: 0, stdout: '', stderr: '' };
      if (args[1] === 'list') return list;
      return { status: 0, stdout: `Created ${HOOK_URL}\n`, stderr: '' };
    },
  );
  const op = { writeFields: vi.fn() };
  return { run, op, calls };
}

describe('provisionDeployHook', () => {
  it('creates the hook and pipes it to gh on stdin', () => {
    const { run, op, calls } = setup({ list: emptyList });
    const result = provisionDeployHook({
      op,
      run,
      vault: 'startup-acme',
      project: 'acme',
    });
    expect(result).toBe('created');
    expect(op.writeFields).toHaveBeenCalledWith({
      vault: 'startup-acme',
      item: 'ci',
      fields: new Map([['VERCEL_DEPLOY_HOOK_URL', HOOK_URL]]),
    });
    for (const call of calls) {
      expect(call.args.join(' ')).not.toContain(HOOK_URL);
    }
    const gh = calls.find((call) => call.command === 'gh');
    expect(gh?.args).toEqual(['secret', 'set', 'VERCEL_DEPLOY_HOOK_URL']);
    expect(gh?.input).toBe(HOOK_URL);
  });

  it('targets the repository from startup.config.json', () => {
    const { run, op, calls } = setup({ list: emptyList });
    provisionDeployHook({
      op,
      run,
      vault: 'startup-acme',
      project: 'acme',
      repository: 'me/acme',
    });
    const gh = calls.find((call) => call.command === 'gh');
    expect(gh?.args).toEqual([
      'secret',
      'set',
      'VERCEL_DEPLOY_HOOK_URL',
      '--repo',
      'me/acme',
    ]);
  });

  it('is idempotent on re-run', () => {
    const { run, op, calls } = setup({
      list: {
        status: 0,
        stdout: JSON.stringify({
          deployHooks: [{ name: 'production', url: HOOK_URL }],
        }),
        stderr: '',
      },
    });
    const result = provisionDeployHook({
      op,
      run,
      vault: 'startup-acme',
      project: 'acme',
    });
    expect(result).toBe('reused');
    expect(calls.some((call) => call.args[1] === 'create')).toBe(false);
    expect(calls.find((call) => call.command === 'gh')?.input).toBe(HOOK_URL);
  });

  it('asks for a newer CLI when deploy-hooks is unknown', () => {
    const { run, op } = setup({
      list: {
        status: 1,
        stdout: '',
        stderr: 'Error: unknown command deploy-hooks',
      },
    });
    expect(() =>
      provisionDeployHook({ op, run, vault: 'startup-acme', project: 'acme' }),
    ).toThrow('update the Vercel CLI: pnpm add -g vercel@latest');
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('keeps the URL out of the error when gh fails', () => {
    const op = { writeFields: vi.fn() };
    const run = vi.fn((command: string, args: string[]) => {
      if (command === 'gh') return { status: 1, stdout: '', stderr: HOOK_URL };
      if (args[1] === 'list') return emptyList;
      return { status: 0, stdout: HOOK_URL, stderr: '' };
    });
    let message = '';
    try {
      provisionDeployHook({ op, run, vault: 'startup-acme', project: 'acme' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('re-run to retry');
    expect(message).not.toContain(HOOK_URL);
    expect(op.writeFields).toHaveBeenCalledTimes(1);
  });
});
