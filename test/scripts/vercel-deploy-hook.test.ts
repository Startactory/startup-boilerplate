import { describe, expect, it, vi } from 'vitest';
import { provisionDeployHook } from '../../scripts/providers/vercel-deploy-hook.mjs';

const HOOK_URL =
  'https://api.vercel.com/v1/integrations/deploy/prj_abc/secrethook';
const SITE_URL = 'https://acme.vercel.app';
const base = {
  vault: 'startup-acme',
  project: 'acme',
  productionUrl: SITE_URL,
};

type RunResult = { status: number; stdout: string; stderr: string };
type Call = { command: string; args: string[]; input?: string };

const emptyList = { status: 0, stdout: '[]', stderr: '' };

const created = {
  status: 0,
  stdout: `Created ${HOOK_URL}\n`,
  stderr: '',
};

function projectAnswer(productionBranch: string): RunResult {
  return {
    status: 0,
    stdout: JSON.stringify({
      name: 'acme',
      link: {
        type: 'github',
        productionBranch,
        deployHooks: [{ name: 'production', url: HOOK_URL }],
      },
    }),
    stderr: '',
  };
}

type Answers = { list: RunResult; create?: RunResult; branch?: RunResult };

function setup({
  list,
  create = created,
  branch = projectAnswer('master'),
}: Answers) {
  const calls: Call[] = [];
  const run = vi.fn(
    (command: string, args: string[], options: { input?: string } = {}) => {
      calls.push({ command, args, input: options.input });
      if (command === 'gh') return { status: 0, stdout: '', stderr: '' };
      if (args[0] === 'api') return branch;
      if (args[1] === 'list') return list;
      return create;
    },
  );
  const op = { writeFields: vi.fn() };
  return { run, op, calls };
}

function provisionError(options: Answers) {
  const { run, op } = setup(options);
  try {
    provisionDeployHook({ ...base, op, run });
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
    const result = provisionDeployHook({ ...base, op, run });
    expect(result).toEqual({ outcome: 'created', productionUrl: SITE_URL });
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

  it('sets the Vercel production branch to master before the hook', () => {
    const { run, op, calls } = setup({ list: emptyList });
    provisionDeployHook({ ...base, op, run });
    expect(calls[0]).toEqual({
      command: 'vercel',
      args: ['api', '/v9/projects/acme/branch', '-X', 'PATCH', '--input', '-'],
      input: '{"branch":"master"}',
    });
    expect(calls.map((call) => call.args[1])).toEqual([
      '/v9/projects/acme/branch',
      'list',
      'create',
      'set',
      'set',
    ]);
  });

  it('sets the production branch before reusing an existing hook', () => {
    const { run, op, calls } = setup({ list: listing(HOOK_URL) });
    expect(provisionDeployHook({ ...base, op, run }).outcome).toBe('reused');
    expect(calls[0]?.args[1]).toBe('/v9/projects/acme/branch');
  });

  it('stops before the hook when the production branch stays main', () => {
    const { message, op } = provisionError({
      list: emptyList,
      branch: projectAnswer('main'),
    });
    expect(message).toBe(
      'vercel api production branch update failed: expected master, got main',
    );
    expect(message).not.toContain(HOOK_URL);
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('prints the reason of a failed branch update with every URL redacted', () => {
    const { run, op, calls } = setup({
      list: emptyList,
      branch: {
        status: 1,
        stdout: projectAnswer('master').stdout,
        stderr: `Error: forbidden, see ${HOOK_URL}\n`,
      },
    });
    expect(() => provisionDeployHook({ ...base, op, run })).toThrow(
      /^vercel api production branch update failed: Error: forbidden, see <url redacted>$/,
    );
    expect(calls).toHaveLength(1);
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it.each([
    [
      'text that is not JSON',
      'oops',
      'an answer without link.productionBranch',
    ],
    [
      'an API error',
      JSON.stringify({ error: { message: `Not authorized ${HOOK_URL}` } }),
      'Not authorized <url redacted>',
    ],
  ])('stops on a branch update answer with %s', (_label, stdout, detail) => {
    const { message, op } = provisionError({
      list: emptyList,
      branch: { status: 0, stdout, stderr: '' },
    });
    expect(message).toBe(
      `vercel api production branch update failed: expected master, got ${detail}`,
    );
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('targets the repository from startup.config.json', () => {
    const { run, op, calls } = setup({ list: emptyList });
    provisionDeployHook({ ...base, op, run, repository: 'me/acme' });
    const gh = calls.filter((call) => call.command === 'gh');
    expect(gh.map((call) => call.args)).toEqual([
      ['secret', 'set', 'VERCEL_DEPLOY_HOOK_URL', '--repo', 'me/acme'],
      [
        'variable',
        'set',
        'PRODUCTION_URL',
        '--repo',
        'me/acme',
        '--body',
        SITE_URL,
      ],
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
    const result = provisionDeployHook({ ...base, op, run });
    expect(result.outcome).toBe('reused');
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
    expect(() => provisionDeployHook({ ...base, op, run })).toThrow(
      'update the Vercel CLI: npm i -g vercel@latest',
    );
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
    provisionDeployHook({ ...base, op, run });
    expect(op.writeFields).toHaveBeenCalledWith({
      vault: 'startup-acme',
      item: 'ci',
      fields: new Map([['VERCEL_DEPLOY_HOOK_URL', HOOK_URL]]),
    });
    expect(calls.find((call) => call.command === 'gh')?.input).toBe(HOOK_URL);
  });

  it('sanitizes the URL of an existing hook the same way', () => {
    const { run, op } = setup({ list: listing(`${HOOK_URL}"`) });
    expect(provisionDeployHook({ ...base, op, run }).outcome).toBe('reused');
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

  it('sets the production URL as a GitHub variable after the secret', () => {
    const { run, op, calls } = setup({ list: emptyList });
    provisionDeployHook({
      ...base,
      op,
      run,
      productionUrl: `${SITE_URL}/`,
    });
    const last = calls[calls.length - 1];
    expect(last).toEqual({
      command: 'gh',
      args: ['variable', 'set', 'PRODUCTION_URL', '--body', SITE_URL],
      input: undefined,
    });
  });

  it.each([
    ['missing', undefined],
    ['not https', 'http://acme.vercel.app'],
    ['with a path', 'https://acme.vercel.app/app'],
  ])('stops before any call when productionUrl is %s', (_label, productionUrl) => {
    const { run, op, calls } = setup({ list: emptyList });
    expect(() =>
      provisionDeployHook({ ...base, op, run, productionUrl }),
    ).toThrow(
      'no productionUrl like https://<name>.vercel.app in startup.config.json — run node scripts/providers/vercel-project.mjs first',
    );
    expect(calls).toEqual([]);
    expect(op.writeFields).not.toHaveBeenCalled();
  });

  it('reports a failed variable set once the secret is set', () => {
    const op = { writeFields: vi.fn() };
    const run = vi.fn((command: string, args: string[]) => {
      if (command === 'gh' && args[0] === 'variable') {
        return { status: 1, stdout: '', stderr: 'HTTP 403: forbidden' };
      }
      if (command === 'gh') return { status: 0, stdout: '', stderr: '' };
      if (args[0] === 'api') return projectAnswer('master');
      if (args[1] === 'list') return emptyList;
      return created;
    });
    expect(() => provisionDeployHook({ ...base, op, run })).toThrow(
      'gh variable set PRODUCTION_URL failed: HTTP 403: forbidden',
    );
    expect(op.writeFields).toHaveBeenCalledTimes(1);
  });

  it('keeps the URL out of the error when gh fails', () => {
    const op = { writeFields: vi.fn() };
    const run = vi.fn((command: string, args: string[]) => {
      if (command === 'gh') return { status: 1, stdout: '', stderr: HOOK_URL };
      if (args[0] === 'api') return projectAnswer('master');
      if (args[1] === 'list') return emptyList;
      return { status: 0, stdout: HOOK_URL, stderr: '' };
    });
    let message = '';
    try {
      provisionDeployHook({ ...base, op, run });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('re-run to retry');
    expect(message).not.toContain(HOOK_URL);
    expect(op.writeFields).toHaveBeenCalledTimes(1);
  });
});
