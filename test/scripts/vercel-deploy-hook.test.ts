import { describe, expect, it, vi } from 'vitest';
import { provisionDeployHook } from '../../scripts/providers/vercel-deploy-hook.mjs';

const HOOK_URL =
  'https://api.vercel.com/v1/integrations/deploy/prj_abc/secrethook';

type RunResult = { status: number; stdout: string; stderr: string };
type Call = { command: string; args: string[]; input?: string };

const emptyList = { status: 0, stdout: '[]', stderr: '' };

const created = {
  status: 0,
  stdout: `Created ${HOOK_URL}\n`,
  stderr: '',
};

function setup({
  list,
  create = created,
}: {
  list: RunResult;
  create?: RunResult;
}) {
  const calls: Call[] = [];
  const run = vi.fn(
    (command: string, args: string[], options: { input?: string } = {}) => {
      calls.push({ command, args, input: options.input });
      if (command === 'gh') return { status: 0, stdout: '', stderr: '' };
      if (args[1] === 'list') return list;
      return create;
    },
  );
  const op = { writeFields: vi.fn() };
  return { run, op, calls };
}

function provisionError(options: { list: RunResult; create?: RunResult }) {
  const { run, op } = setup(options);
  try {
    provisionDeployHook({ op, run, vault: 'startup-acme', project: 'acme' });
  } catch (error) {
    return { message: (error as Error).message, op };
  }
  throw new Error('expected provisionDeployHook to throw');
}

function listing(url: string): RunResult {
  return {
    status: 0,
    stdout: JSON.stringify({ deployHooks: [{ name: 'production', url }] }),
    stderr: '',
  };
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
    ).toThrow('update the Vercel CLI: npm i -g vercel@latest');
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it.each([
    ['a double quote', `"${HOOK_URL}"`],
    ['a single quote', `'${HOOK_URL}'`],
    ['a backtick', `\`${HOOK_URL}\``],
    ['angle brackets', `<${HOOK_URL}>`],
  ])('stores the created URL without %s around it', (_label, printed) => {
    const { run, op, calls } = setup({
      list: emptyList,
      create: { status: 0, stdout: `Created ${printed}\n`, stderr: '' },
    });
    provisionDeployHook({ op, run, vault: 'startup-acme', project: 'acme' });
    expect(op.writeFields).toHaveBeenCalledWith({
      vault: 'startup-acme',
      item: 'ci',
      fields: new Map([['VERCEL_DEPLOY_HOOK_URL', HOOK_URL]]),
    });
    expect(calls.find((call) => call.command === 'gh')?.input).toBe(HOOK_URL);
  });

  it('sanitizes the URL of an existing hook the same way', () => {
    const { run, op } = setup({ list: listing(`${HOOK_URL}"`) });
    expect(
      provisionDeployHook({ op, run, vault: 'startup-acme', project: 'acme' }),
    ).toBe('reused');
    expect(op.writeFields).toHaveBeenCalledWith({
      vault: 'startup-acme',
      item: 'ci',
      fields: new Map([['VERCEL_DEPLOY_HOOK_URL', HOOK_URL]]),
    });
  });

  it.each([
    [
      'one path segment',
      'https://api.vercel.com/v1/integrations/deploy/prj_abc',
    ],
    [
      'a query string',
      'https://api.vercel.com/v1/integrations/deploy/prj_abc/hook?x=1',
    ],
    ['three path segments', `${HOOK_URL}/extra`],
  ])('stores nothing and hides the URL when the created URL has %s', (_label, url) => {
    const { message, op } = provisionError({
      list: emptyList,
      create: { status: 0, stdout: `Created ${url}\n`, stderr: '' },
    });
    expect(message).toBe(
      'vercel deploy-hooks create gave no hook URL shaped like https://api.vercel.com/v1/integrations/deploy/<project-id>/<hook-id> — nothing stored',
    );
    expect(message).not.toContain('prj_abc');
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('stores nothing when an existing hook URL has an unexpected shape', () => {
    const { message, op } = provisionError({
      list: listing('https://api.vercel.com/v1/integrations/deploy/prj_abc'),
    });
    expect(message).toContain('vercel deploy-hooks list gave no hook URL');
    expect(message).not.toContain('prj_abc');
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('asks to push master first when Vercel cannot find the branch', () => {
    const { message, op } = provisionError({
      list: emptyList,
      create: {
        status: 1,
        stdout: '',
        stderr:
          '{\n  "message": "Branch \\"master\\" not found in the connected Git repository. (400)"\n}\n',
      },
    });
    expect(message).toBe(
      'master does not exist on GitHub yet — push master first, then run this again',
    );
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('prints the reason of a failed create with every URL redacted', () => {
    const { message } = provisionError({
      list: emptyList,
      create: {
        status: 1,
        stdout: HOOK_URL,
        stderr: `Error: rate limited, see https://vercel.com/docs/limits and ${HOOK_URL}\n`,
      },
    });
    expect(message).toBe(
      'vercel deploy-hooks create failed: Error: rate limited, see <url redacted> and <url redacted>',
    );
  });

  it('prints the reason of a failed list with every URL redacted', () => {
    const { message } = provisionError({
      list: { status: 1, stdout: '', stderr: `Error: forbidden ${HOOK_URL}` },
    });
    expect(message).toBe(
      'vercel deploy-hooks list failed: Error: forbidden <url redacted>',
    );
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
