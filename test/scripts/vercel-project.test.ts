import { describe, expect, it, vi } from 'vitest';
import {
  checkVercelName,
  configureVercelProject,
  ensureVercelProject,
  VERCEL_REGION,
  writeProductionUrl,
} from '../../scripts/providers/vercel-project.mjs';

type Result = { code: number; stdout: string; stderr: string };

const ok: Result = { code: 0, stdout: '', stderr: '' };
const failed = (stderr: string): Result => ({ code: 1, stdout: '', stderr });
const json = (body: unknown): Result => ({
  code: 0,
  stdout: JSON.stringify(body),
  stderr: '',
});

type Project = {
  name: string;
  link?: { type: string; org?: string; repo?: string };
  latestDeployments?: Array<{ id: string }>;
  targets?: { production?: { id: string } | null };
};

type Account = {
  project?: Project;
  domains?: string[];
  takenElsewhere?: string[];
  refusalForOwned?: boolean;
  unrelatedAddError?: boolean;
  gitConnect?: Result;
  createResult?: Result;
  lookupResult?: Result;
};

function fakeVercel(account: Account = {}) {
  const calls: string[][] = [];
  let listReads = 0;
  const domains = [...(account.domains ?? [])];
  const runVercel = async (args: string[]): Promise<Result> => {
    calls.push(args);
    if (args[0] === 'project') return account.createResult ?? ok;
    if (args[0] === 'git') return account.gitConnect ?? ok;
    if (args[0] !== 'api') return ok;
    const path = args[1] ?? '';
    if (path === '/v9/projects/acme') {
      if (account.lookupResult) return account.lookupResult;
      return account.project
        ? json(account.project)
        : failed('Error: 404 not_found');
    }
    if (path.startsWith('/v9/projects/acme/domains')) {
      listReads += 1;
      const visible =
        account.refusalForOwned && listReads === 1 ? [] : [...domains];
      return json({ domains: visible.map((name) => ({ name })) });
    }
    const name = args[args.length - 1]?.replace('name=', '') ?? '';
    if (account.unrelatedAddError) return failed('Error: not logged in');
    if (account.refusalForOwned && name === 'acme.vercel.app') {
      domains.push(name);
      return failed('409 domain is already assigned to this project');
    }
    if (account.takenElsewhere?.includes(name)) {
      return failed('409 domain is already assigned to another project');
    }
    domains.push(name);
    return json({ name });
  };
  return { calls, runVercel };
}

const BOILERPLATE_GITIGNORE = '.env\n.env.*\n!.env.template\n';

function memoryFs(initial: Record<string, string>) {
  const files = { ...initial };
  return {
    files,
    existsSync: (path: string) => path in files,
    readFileSync: (path: string) => files[path],
    writeFileSync: (path: string, text: string) => {
      files[path] = text;
    },
    unlinkSync: (path: string) => {
      delete files[path];
    },
  };
}

const base = {
  slug: 'acme',
  repository: 'me/acme',
  randomSuffix: () => 'abcd',
  fs: memoryFs({ '.gitignore': BOILERPLATE_GITIGNORE }) as never,
  log: () => {},
};

const unlinkedProject: Project = { name: 'acme', latestDeployments: [] };
const OTHER_OWNER =
  'Vercel project acme already exists and belongs to something else — pick another slug (founder decision)';

const addedNames = (calls: string[][]) =>
  calls.filter((call) => call[2] === '-X').map((call) => call[call.length - 1]);

describe('ensureVercelProject', () => {
  it('creates the project and gives it <slug>.vercel.app', async () => {
    const { calls, runVercel } = fakeVercel();
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result).toEqual({
      productionUrl: 'https://acme.vercel.app',
      outcome: 'created',
    });
    expect(calls.map((call) => call.slice(0, 2).join(' '))).toEqual([
      'api /v9/projects/acme',
      'project create',
      'link --yes',
      'git connect',
      'api /v9/projects/acme/domains?limit=100',
      'api /v10/projects/acme/domains',
    ]);
    expect(calls).toContainEqual([
      'git',
      'connect',
      'https://github.com/me/acme',
      '--yes',
    ]);
    expect(addedNames(calls)).toEqual(['name=acme.vercel.app']);
  });

  it('falls back to a random suffix when the name is taken elsewhere', async () => {
    const { calls, runVercel } = fakeVercel({
      takenElsewhere: ['acme.vercel.app'],
    });
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result.productionUrl).toBe('https://acme-abcd.vercel.app');
    expect(addedNames(calls)).toEqual([
      'name=acme.vercel.app',
      'name=acme-abcd.vercel.app',
    ]);
  });

  it('reuses the existing domain without adding one', async () => {
    const { calls, runVercel } = fakeVercel({
      project: unlinkedProject,
      domains: ['acme-teams.vercel.app', 'acme-abcd.vercel.app'],
    });
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result).toEqual({
      productionUrl: 'https://acme-abcd.vercel.app',
      outcome: 'reused',
    });
    expect(addedNames(calls)).toEqual([]);
    expect(calls.some((call) => call[0] === 'project')).toBe(false);
  });

  it('ignores look-alike names such as other-acme.vercel.app', async () => {
    const { runVercel } = fakeVercel({
      project: unlinkedProject,
      domains: ['other-acme.vercel.app', 'acme-teams.vercel.app'],
    });
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result.productionUrl).toBe('https://acme.vercel.app');
  });

  it('reuses its own domain when the add is refused because it already owns it', async () => {
    const { calls, runVercel } = fakeVercel({
      project: unlinkedProject,
      refusalForOwned: true,
    });
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result).toEqual({
      productionUrl: 'https://acme.vercel.app',
      outcome: 'reused',
    });
    expect(addedNames(calls)).toEqual(['name=acme.vercel.app']);
  });

  it('tolerates a repository that is already connected', async () => {
    const { runVercel } = fakeVercel({
      gitConnect: failed('Error: already connected to me/acme'),
    });
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result.outcome).toBe('created');
  });

  it('fails when every candidate name is taken', async () => {
    const { calls, runVercel } = fakeVercel({
      takenElsewhere: ['acme.vercel.app', 'acme-abcd.vercel.app'],
    });
    await expect(ensureVercelProject({ ...base, runVercel })).rejects.toThrow(
      'no free *.vercel.app name for acme after 3 tries',
    );
    expect(addedNames(calls)).toHaveLength(3);
  });

  it('stops on an unrelated domain error', async () => {
    const { calls, runVercel } = fakeVercel({ unrelatedAddError: true });
    await expect(ensureVercelProject({ ...base, runVercel })).rejects.toThrow(
      'vercel api domain add failed: Error: not logged in',
    );
    expect(addedNames(calls)).toHaveLength(1);
  });

  it('reuses a project Git-linked to the startup repository without reconnecting it', async () => {
    const { calls, runVercel } = fakeVercel({
      project: {
        name: 'acme',
        link: { type: 'github', org: 'Me', repo: 'Acme' },
        latestDeployments: [{ id: 'dpl_1' }],
        targets: { production: { id: 'dpl_1' } },
      },
      domains: ['acme.vercel.app'],
    });
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result).toEqual({
      productionUrl: 'https://acme.vercel.app',
      outcome: 'reused',
    });
    expect(calls.some((call) => call[0] === 'git')).toBe(false);
    expect(calls.some((call) => call[0] === 'project')).toBe(false);
  });

  it('reuses and Git-connects an unlinked project with no deployment', async () => {
    const { calls, runVercel } = fakeVercel({
      project: { name: 'acme', latestDeployments: [], targets: {} },
    });
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result.outcome).toBe('reused');
    expect(calls).toContainEqual([
      'git',
      'connect',
      'https://github.com/me/acme',
      '--yes',
    ]);
  });

  it('refuses a project Git-linked to another repository', async () => {
    const { calls, runVercel } = fakeVercel({
      project: {
        name: 'acme',
        link: { type: 'github', org: 'someone', repo: 'acme' },
      },
    });
    await expect(ensureVercelProject({ ...base, runVercel })).rejects.toThrow(
      OTHER_OWNER,
    );
    expect(calls.map((call) => call[0])).toEqual(['api']);
  });

  it.each([
    'gitlab',
    'github-custom-host',
  ])('refuses a project linked through %s', async (type) => {
    const { runVercel } = fakeVercel({
      project: { name: 'acme', link: { type, org: 'me', repo: 'acme' } },
    });
    await expect(ensureVercelProject({ ...base, runVercel })).rejects.toThrow(
      OTHER_OWNER,
    );
  });

  it('refuses an unlinked project that has a production deployment', async () => {
    const { calls, runVercel } = fakeVercel({
      project: {
        name: 'acme',
        latestDeployments: [],
        targets: { production: { id: 'dpl_1' } },
      },
    });
    await expect(ensureVercelProject({ ...base, runVercel })).rejects.toThrow(
      OTHER_OWNER,
    );
    expect(calls.map((call) => call[0])).toEqual(['api']);
  });

  it('refuses an unlinked project that has any deployment', async () => {
    const { runVercel } = fakeVercel({
      project: { name: 'acme', latestDeployments: [{ id: 'dpl_1' }] },
    });
    await expect(ensureVercelProject({ ...base, runVercel })).rejects.toThrow(
      OTHER_OWNER,
    );
  });

  it('never links or connects when the project lookup is unreadable', async () => {
    const { calls, runVercel } = fakeVercel({
      lookupResult: { code: 0, stdout: 'not json', stderr: '' },
    });
    await expect(ensureVercelProject({ ...base, runVercel })).rejects.toThrow(
      'vercel api project lookup',
    );
    expect(calls.some((call) => call[0] === 'link' || call[0] === 'git')).toBe(
      false,
    );
  });

  it('stops before any call when the repository is not recorded yet', async () => {
    const { calls, runVercel } = fakeVercel();
    await expect(
      ensureVercelProject({ ...base, repository: undefined, runVercel }),
    ).rejects.toThrow(
      'no repository in startup.config.json — run the repository step first',
    );
    expect(calls).toEqual([]);
  });

  const VERCEL_ENV_LOCAL =
    '# Created by Vercel CLI\nVERCEL_OIDC_TOKEN="oidc-secret"\n';

  function linkWrites({
    fs,
    runVercel,
    linkResult,
    envLocal = VERCEL_ENV_LOCAL,
  }: {
    fs: ReturnType<typeof memoryFs>;
    runVercel: (args: string[]) => Promise<Result>;
    linkResult?: Result;
    envLocal?: string;
  }) {
    return async (args: string[]) => {
      if (args[0] !== 'link') return runVercel(args);
      fs.files['.gitignore'] = `${fs.files['.gitignore']}.env*\n`;
      fs.files['.env.local'] = envLocal;
      return linkResult ?? ok;
    };
  }

  it('restores .gitignore and removes the .env.local the Vercel CLI wrote', async () => {
    const fs = memoryFs({ '.gitignore': BOILERPLATE_GITIGNORE });
    const log = vi.fn();
    const { runVercel } = fakeVercel();
    await ensureVercelProject({
      ...base,
      fs: fs as never,
      log,
      runVercel: linkWrites({ fs, runVercel }),
    });
    expect(fs.files['.gitignore']).toBe(BOILERPLATE_GITIGNORE);
    expect('.env.local' in fs.files).toBe(false);
    expect(log.mock.calls).toEqual([
      ['OK  .gitignore restored to its content from before vercel link'],
      ['OK  removed .env.local written by vercel link'],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('oidc-secret');
  });

  it('keeps a new .env.local that holds more than VERCEL_OIDC_TOKEN', async () => {
    const fs = memoryFs({ '.gitignore': BOILERPLATE_GITIGNORE });
    const log = vi.fn();
    const { runVercel } = fakeVercel();
    const envLocal = `${VERCEL_ENV_LOCAL}OTHER_KEY="value"\n`;
    await ensureVercelProject({
      ...base,
      fs: fs as never,
      log,
      runVercel: linkWrites({ fs, runVercel, envLocal }),
    });
    expect(fs.files['.env.local']).toBe(envLocal);
    expect(log.mock.calls).toContainEqual([
      'NOTE  .env.local was written by vercel link with more than VERCEL_OIDC_TOKEN; it is git-ignored and was kept',
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('value');
  });

  it('keeps an .env.local that existed before vercel link', async () => {
    const fs = memoryFs({
      '.gitignore': BOILERPLATE_GITIGNORE,
      '.env.local': 'VERCEL_OIDC_TOKEN="old"\n',
    });
    const log = vi.fn();
    const { runVercel } = fakeVercel();
    await ensureVercelProject({
      ...base,
      fs: fs as never,
      log,
      runVercel: linkWrites({ fs, runVercel }),
    });
    expect(fs.files['.env.local']).toBe(VERCEL_ENV_LOCAL);
    expect(log.mock.calls).toEqual([
      ['OK  .gitignore restored to its content from before vercel link'],
    ]);
  });

  it('restores .gitignore and removes .env.local even when vercel link fails', async () => {
    const fs = memoryFs({ '.gitignore': BOILERPLATE_GITIGNORE });
    const { runVercel } = fakeVercel();
    await expect(
      ensureVercelProject({
        ...base,
        fs: fs as never,
        runVercel: linkWrites({
          fs,
          runVercel,
          linkResult: failed('Error: not logged in'),
        }),
      }),
    ).rejects.toThrow('vercel link failed: Error: not logged in');
    expect(fs.files['.gitignore']).toBe(BOILERPLATE_GITIGNORE);
    expect('.env.local' in fs.files).toBe(false);
  });

  it('prints nothing when vercel link leaves .gitignore and .env.local alone', async () => {
    const fs = memoryFs({
      '.gitignore': BOILERPLATE_GITIGNORE,
      '.env.local': 'VERCEL_OIDC_TOKEN="old"\n',
    });
    const log = vi.fn();
    const { runVercel } = fakeVercel();
    await ensureVercelProject({ ...base, fs: fs as never, log, runVercel });
    expect(log).not.toHaveBeenCalled();
    expect(fs.files['.gitignore']).toBe(BOILERPLATE_GITIGNORE);
  });

  it('stops when the project cannot be created', async () => {
    const { runVercel } = fakeVercel({
      createResult: failed('Error: not logged in'),
    });
    await expect(ensureVercelProject({ ...base, runVercel })).rejects.toThrow(
      'vercel project create failed',
    );
  });
});

describe('checkVercelName', () => {
  it('reports a name no project holds, and creates nothing', async () => {
    const { calls, runVercel } = fakeVercel();
    expect(await checkVercelName({ ...base, runVercel })).toBe('free');
    expect(calls).toEqual([['api', '/v9/projects/acme']]);
  });

  it("reports a project that is this startup's", async () => {
    const { runVercel } = fakeVercel({
      project: {
        name: 'acme',
        link: { type: 'github', org: 'me', repo: 'acme' },
        latestDeployments: [{ id: 'dpl_1' }],
      },
    });
    expect(await checkVercelName({ ...base, runVercel })).toBe('own');
  });

  it.each([
    ['text that is not JSON', { code: 0, stdout: 'not json', stderr: '' }],
    ['an empty answer', { code: 0, stdout: '', stderr: '' }],
    ['a JSON array', json([])],
  ])('fails closed when the lookup returns %s', async (_label, lookupResult) => {
    const { calls, runVercel } = fakeVercel({ lookupResult });
    await expect(checkVercelName({ ...base, runVercel })).rejects.toThrow(
      'vercel api project lookup',
    );
    expect(calls).toEqual([['api', '/v9/projects/acme']]);
  });

  it('refuses a name another project holds', async () => {
    const { runVercel } = fakeVercel({
      project: {
        name: 'acme',
        link: { type: 'github', org: 'someone', repo: 'site' },
      },
    });
    await expect(checkVercelName({ ...base, runVercel })).rejects.toThrow(
      OTHER_OWNER,
    );
  });
});

describe('writeProductionUrl', () => {
  it('adds productionUrl and keeps every other key', () => {
    const fs = memoryFs({
      'startup.config.json': JSON.stringify({ slug: 'acme', dataRegion: 'eu' }),
    });
    writeProductionUrl({
      fs: fs as never,
      productionUrl: 'https://acme.vercel.app',
    });
    expect(fs.files['startup.config.json']).toBe(
      `${JSON.stringify(
        {
          slug: 'acme',
          dataRegion: 'eu',
          productionUrl: 'https://acme.vercel.app',
        },
        null,
        2,
      )}\n`,
    );
  });
});

describe('configureVercelProject', () => {
  const HOOK_URL =
    'https://api.vercel.com/v1/integrations/deploy/prj_abc/secrethook';

  function projectAnswer({
    framework = 'nextjs' as string | null,
    regions = ['cdg1'],
  } = {}): Result {
    return json({
      name: 'acme',
      framework,
      resourceConfig: { fluid: true, functionDefaultRegions: regions },
      link: { deployHooks: [{ name: 'production', url: HOOK_URL }] },
    });
  }

  function fakePatch(answer: Result) {
    const calls: Array<{ args: string[]; input?: string }> = [];
    const runVercel = async (
      args: string[],
      options: { input?: string } = {},
    ) => {
      calls.push({ args, input: options.input });
      return answer;
    };
    return { calls, runVercel };
  }

  it.each([
    ['eu', 'cdg1'],
    ['us', 'iad1'],
  ])('sets the Next.js preset and the %s function region through the API', async (dataRegion, region) => {
    const { calls, runVercel } = fakePatch(
      projectAnswer({ regions: [region] }),
    );
    const result = await configureVercelProject({
      runVercel,
      slug: 'acme',
      dataRegion,
    });
    expect(result).toEqual({ framework: 'nextjs', region });
    expect(calls).toEqual([
      {
        args: ['api', '/v9/projects/acme', '-X', 'PATCH', '--input', '-'],
        input: JSON.stringify({
          framework: 'nextjs',
          resourceConfig: { functionDefaultRegions: [region] },
        }),
      },
    ]);
    expect(VERCEL_REGION).toEqual({ eu: 'cdg1', us: 'iad1' });
  });

  it('fails when the project keeps another preset or region, without the hook URL', async () => {
    const { runVercel } = fakePatch(
      projectAnswer({ framework: null, regions: ['iad1'] }),
    );
    const error = await configureVercelProject({
      runVercel,
      slug: 'acme',
      dataRegion: 'eu',
    }).catch((caught: Error) => caught);
    expect((error as Error).message).toBe(
      'vercel api project settings update failed: expected framework nextjs, function regions cdg1, got framework none, function regions iad1',
    );
  });

  it('prints the API error with every URL redacted', async () => {
    const { runVercel } = fakePatch({
      code: 1,
      stdout: '',
      stderr: `\nError: Invalid request, see ${HOOK_URL} (400)\n`,
    });
    await expect(
      configureVercelProject({ runVercel, slug: 'acme', dataRegion: 'eu' }),
    ).rejects.toThrow(
      /^vercel api project settings update failed: Error: Invalid request, see <url redacted> \(400\)$/,
    );
  });

  it('never echoes an answer that is not JSON', async () => {
    const { runVercel } = fakePatch({
      code: 0,
      stdout: `oops ${HOOK_URL}`,
      stderr: '',
    });
    const error = await configureVercelProject({
      runVercel,
      slug: 'acme',
      dataRegion: 'us',
    }).catch((caught: Error) => caught);
    expect((error as Error).message).toBe(
      'vercel api project settings update failed: expected framework nextjs, function regions iad1, got framework none, function regions none',
    );
  });

  it('refuses an unknown data region before any call', async () => {
    const { calls, runVercel } = fakePatch(projectAnswer());
    await expect(
      configureVercelProject({ runVercel, slug: 'acme', dataRegion: 'apac' }),
    ).rejects.toThrow('dataRegion must be eu or us, got apac');
    expect(calls).toEqual([]);
  });
});
