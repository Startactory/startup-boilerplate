import { describe, expect, it } from 'vitest';
import {
  ensureVercelProject,
  VERCEL_REGION,
  writeProductionUrl,
  writeVercelRegions,
} from '../../scripts/providers/vercel-project.mjs';

type Result = { code: number; stdout: string; stderr: string };

const ok: Result = { code: 0, stdout: '', stderr: '' };
const failed = (stderr: string): Result => ({ code: 1, stdout: '', stderr });
const json = (body: unknown): Result => ({
  code: 0,
  stdout: JSON.stringify(body),
  stderr: '',
});

type Account = {
  projectExists?: boolean;
  domains?: string[];
  takenElsewhere?: string[];
  refusalForOwned?: boolean;
  unrelatedAddError?: boolean;
  gitConnect?: Result;
  createResult?: Result;
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
      return account.projectExists
        ? json({ name: 'acme' })
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

const base = {
  slug: 'acme',
  repository: 'me/acme',
  randomSuffix: () => 'abcd',
};

const addedNames = (calls: string[][]) =>
  calls.filter((call) => call[2] === '-X').map((call) => call[call.length - 1]);

function memoryFs(initial: Record<string, string>) {
  const files = { ...initial };
  return {
    files,
    readFileSync: (path: string) => files[path],
    writeFileSync: (path: string, text: string) => {
      files[path] = text;
    },
  };
}

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
      projectExists: true,
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
      projectExists: true,
      domains: ['other-acme.vercel.app', 'acme-teams.vercel.app'],
    });
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result.productionUrl).toBe('https://acme.vercel.app');
  });

  it('reuses its own domain when the add is refused because it already owns it', async () => {
    const { calls, runVercel } = fakeVercel({
      projectExists: true,
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

  it('stops when the project cannot be created', async () => {
    const { runVercel } = fakeVercel({
      createResult: failed('Error: not logged in'),
    });
    await expect(ensureVercelProject({ ...base, runVercel })).rejects.toThrow(
      'vercel project create failed',
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

describe('writeVercelRegions', () => {
  it('sets the region and keeps the git block', () => {
    const fs = memoryFs({
      'vercel.json': JSON.stringify({
        git: { deploymentEnabled: { master: false } },
      }),
    });
    writeVercelRegions({ fs: fs as never, dataRegion: 'eu' });
    expect(JSON.parse(fs.files['vercel.json'] ?? '')).toEqual({
      git: { deploymentEnabled: { master: false } },
      regions: ['cdg1'],
    });
    expect(VERCEL_REGION).toEqual({ eu: 'cdg1', us: 'iad1' });
  });
});
