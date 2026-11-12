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

function fakeVercel(handlers: Record<string, (args: string[]) => Result>) {
  const calls: string[][] = [];
  const runVercel = async (args: string[]) => {
    calls.push(args);
    const handler = handlers[args.slice(0, 2).join(' ')];
    return handler ? handler(args) : ok;
  };
  return { calls, runVercel };
}

const base = {
  slug: 'acme',
  repository: 'me/acme',
  randomSuffix: () => 'abcd',
};

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
    const { calls, runVercel } = fakeVercel({});
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result).toEqual({
      productionUrl: 'https://acme.vercel.app',
      outcome: 'created',
    });
    expect(calls).toEqual([
      ['project', 'create', 'acme'],
      ['link', '--yes', '--project', 'acme'],
      ['git', 'connect', 'https://github.com/me/acme', '--yes'],
      ['domains', 'add', 'acme.vercel.app', 'acme'],
    ]);
  });

  it('falls back to a random suffix when the name is taken', async () => {
    const { calls, runVercel } = fakeVercel({
      'domains add': (args) =>
        args[2] === 'acme.vercel.app'
          ? failed('Error: domain is already in use by another account')
          : ok,
    });
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result.productionUrl).toBe('https://acme-abcd.vercel.app');
    expect(calls.at(-1)).toEqual([
      'domains',
      'add',
      'acme-abcd.vercel.app',
      'acme',
    ]);
  });

  it('reuses the existing *.vercel.app domain without adding one', async () => {
    const { calls, runVercel } = fakeVercel({
      'project create': () => failed('Error: project already exists'),
      'project inspect': () => ({
        code: 0,
        stdout: JSON.stringify({
          name: 'acme',
          alias: ['acme-abcd.vercel.app'],
          latest: 'acme-x7k2m9pqr-team.vercel.app',
        }),
        stderr: '',
      }),
    });
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result).toEqual({
      productionUrl: 'https://acme-abcd.vercel.app',
      outcome: 'reused',
    });
    expect(calls.some((call) => call[0] === 'domains')).toBe(false);
  });

  it('adds a domain to an existing project that has none', async () => {
    const { runVercel } = fakeVercel({
      'project create': () => failed('project already exists'),
      'project inspect': () => ({ code: 0, stdout: '{}', stderr: '' }),
    });
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result).toEqual({
      productionUrl: 'https://acme.vercel.app',
      outcome: 'reused',
    });
  });

  it('tolerates a repository that is already connected', async () => {
    const { runVercel } = fakeVercel({
      'git connect': () => failed('Error: already connected to me/acme'),
    });
    const result = await ensureVercelProject({ ...base, runVercel });
    expect(result.outcome).toBe('created');
  });

  it('fails when every candidate name is taken', async () => {
    const { calls, runVercel } = fakeVercel({
      'domains add': () => failed('domain is already in use'),
    });
    await expect(ensureVercelProject({ ...base, runVercel })).rejects.toThrow(
      'no free *.vercel.app name for acme after 3 tries',
    );
    expect(calls.filter((call) => call[0] === 'domains')).toHaveLength(3);
  });

  it('stops on an unrelated domain error', async () => {
    const { calls, runVercel } = fakeVercel({
      'domains add': () => failed('Error: not logged in'),
    });
    await expect(ensureVercelProject({ ...base, runVercel })).rejects.toThrow(
      'vercel domains add failed: Error: not logged in',
    );
    expect(calls.filter((call) => call[0] === 'domains')).toHaveLength(1);
  });

  it('stops when the project cannot be created', async () => {
    const { calls, runVercel } = fakeVercel({
      'project create': () => failed('Error: not logged in'),
    });
    await expect(ensureVercelProject({ ...base, runVercel })).rejects.toThrow(
      'vercel project create failed',
    );
    expect(calls).toHaveLength(1);
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
