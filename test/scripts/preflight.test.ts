import { describe, expect, it, vi } from 'vitest';
import { createRunner, runPreflight } from '../../scripts/preflight.mjs';

const SECRET = 'super-secret-value';
const ALL_KEYS = [
  'SUPABASE_ACCESS_TOKEN',
  'POSTHOG_PERSONAL_API_KEY_EU',
  'DASH0_AUTH_TOKEN_EU',
  'DASH0_API_URL_EU',
  'DASH0_OTLP_ENDPOINT_EU',
  'SMTP_USER',
  'SMTP_PASS',
];

function validConfig() {
  return {
    name: 'Acme',
    slug: 'acme',
    domain: '',
    gdpr: true,
    dataRegion: 'eu',
    idea: 'Contract review assistant for freelance designers',
    githubOwner: 'ada',
    googleAccount: 'ada@example.com',
    pricing: {
      source: 'derived',
      customer: 'individual',
      amount: 19,
      interval: 'month',
      currency: 'EUR',
      trialDays: 14,
      cardRequired: true,
      rationale: 'Well under the value of a review.',
      deferred: [],
    },
    brand: { icon: 'Receipt', accent: '#2f6f5e' },
    legal: {
      termsVersion: '2026-11-12',
      founderName: 'Ada Lovelace',
      contactEmail: 'ada@example.com',
      company: null,
    },
  };
}

type Result = { code: number; stdout: string; stderr: string };
type Overrides = Record<string, Partial<Result>>;

function fakeRun(overrides: Overrides = {}) {
  return vi.fn(async (command: string, args: string[]): Promise<Result> => {
    const key = [command, ...args].join(' ');
    const base: Result = {
      code: 0,
      stdout: key === 'gh config get git_protocol' ? 'ssh\n' : '',
      stderr: '',
    };
    if (key === 'gh repo view ada/acme') base.code = 1;
    return { ...base, ...overrides[key] };
  });
}

function fakeOp(missing: string[] = []) {
  return {
    readFields: vi.fn(
      () =>
        new Map(
          ALL_KEYS.filter((k) => !missing.includes(k)).map((k) => [
            k,
            k.startsWith('DASH0_API_URL') ? 'https://api.dash0.test' : SECRET,
          ]),
        ),
    ),
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  };
}

function fakeFetch({
  activeProjects = [] as Array<{ name: string; status: string }>,
  dash0Status = 200,
  plan = 'free',
} = {}) {
  return vi.fn(async (url: string) => {
    if (url.endsWith('/v1/organizations')) {
      return jsonResponse(200, [
        { slug: 'startup-factory', name: 'startup-factory' },
      ]);
    }
    if (url.endsWith('/v1/organizations/startup-factory')) {
      return jsonResponse(200, { plan });
    }
    if (url.endsWith('/v1/projects')) {
      return jsonResponse(
        200,
        activeProjects.map((p, index) => ({
          ref: `ref${index}`,
          organization_slug: 'startup-factory',
          ...p,
        })),
      );
    }
    if (url.includes('/api/datasets/')) return jsonResponse(dash0Status, {});
    throw new Error(`unexpected url ${url}`);
  });
}

async function preflight({
  config = validConfig() as Record<string, unknown>,
  existing = [] as string[],
  run = fakeRun(),
  op = fakeOp(),
  fetch = fakeFetch(),
  readToken = () => 'token',
} = {}) {
  return runPreflight({
    config,
    commandExists: (name: string) => !existing.includes(name),
    run,
    op,
    fetch: fetch as unknown as typeof globalThis.fetch,
    readToken,
  });
}

function failedNames(results: Array<{ name: string; ok: boolean }>) {
  return results.filter((r) => !r.ok).map((r) => r.name);
}

describe('runPreflight', () => {
  it('passes every check when everything is healthy', async () => {
    const results = await preflight();
    expect(failedNames(results)).toEqual([]);
    expect(results.map((r) => r.name)).toEqual([
      'config',
      'tool:node',
      'tool:pnpm',
      'tool:op',
      'tool:gh',
      'tool:vercel',
      'tool:database',
      'vault',
      'master-keys',
      'gh-session',
      'vercel-session',
      'supabase-quota',
      'github-repo',
      'dash0',
    ]);
  });

  it('fails only the config check on a config issue', async () => {
    const { idea: _idea, ...config } = validConfig();
    const results = await preflight({ config });
    expect(failedNames(results)).toEqual(['config']);
    expect(results[0]?.fix).toContain('idea');
  });

  it('points tool:node at the version pinned in .nvmrc', async () => {
    const results = await preflight({ existing: ['node'] });
    expect(results.find((r) => r.name === 'tool:node')).toMatchObject({
      ok: false,
      fix: 'install Node.js, the version in .nvmrc (brew install node)',
    });
  });

  it('fails tool:database when neither psql nor docker exists', async () => {
    const results = await preflight({ existing: ['psql', 'docker'] });
    expect(failedNames(results)).toEqual(['tool:database']);
  });

  it('fails tool:vercel when deploy-hooks is unavailable', async () => {
    const run = fakeRun({ 'vercel deploy-hooks --help': { code: 1 } });
    const results = await preflight({ run });
    const vercel = results.find((r) => r.name === 'tool:vercel');
    expect(vercel).toMatchObject({ ok: false, fix: 'npm i -g vercel@latest' });
  });

  it('fails vault when the founder vault cannot be listed', async () => {
    const run = fakeRun({
      'op item list --vault startup-founder': { code: 1 },
    });
    expect(failedNames(await preflight({ run }))).toEqual(['vault']);
  });

  it('names only the missing master key and never a value', async () => {
    const results = await preflight({ op: fakeOp(['SMTP_PASS']) });
    expect(failedNames(results)).toEqual(['master-keys']);
    const masterKeys = results.find((r) => r.name === 'master-keys');
    expect(masterKeys?.fix).toContain('SMTP_PASS');
    expect(masterKeys?.fix).not.toContain('SMTP_USER');
    expect(JSON.stringify(results)).not.toContain(SECRET);
  });

  it('fails vercel-session when vercel whoami exits 1', async () => {
    const run = fakeRun({ 'vercel whoami': { code: 1 } });
    const results = await preflight({ run });
    expect(failedNames(results)).toEqual(['vercel-session']);
    expect(results.find((r) => r.name === 'vercel-session')?.fix).toBe(
      'vercel login',
    );
  });

  it('fails gh-session on https without the workflow scope', async () => {
    const run = fakeRun({
      'gh config get git_protocol': { stdout: 'https\n' },
      'gh auth status': { stdout: "Token scopes: 'repo', 'read:org'" },
    });
    const results = await preflight({ run });
    expect(failedNames(results)).toEqual(['gh-session']);
    expect(results.find((r) => r.name === 'gh-session')?.fix).toBe(
      'gh auth refresh -s workflow',
    );
  });

  it('passes gh-session on https with the workflow scope', async () => {
    const run = fakeRun({
      'gh config get git_protocol': { stdout: 'https\n' },
      'gh auth status': { stderr: "Token scopes: 'repo', 'workflow'" },
    });
    expect(failedNames(await preflight({ run }))).toEqual([]);
  });

  it('fails supabase-quota with two other active projects', async () => {
    const fetch = fakeFetch({
      activeProjects: [
        { name: 'one', status: 'ACTIVE_HEALTHY' },
        { name: 'two', status: 'ACTIVE_HEALTHY' },
      ],
    });
    expect(failedNames(await preflight({ fetch }))).toEqual(['supabase-quota']);
  });

  it('ignores a paused project and the startup own project', async () => {
    const fetch = fakeFetch({
      activeProjects: [
        { name: 'one', status: 'ACTIVE_HEALTHY' },
        { name: 'acme', status: 'ACTIVE_HEALTHY' },
        { name: 'old', status: 'INACTIVE' },
      ],
    });
    expect(failedNames(await preflight({ fetch }))).toEqual([]);
  });

  it('fails supabase-quota when the organization is not on the free plan', async () => {
    const fetch = fakeFetch({ plan: 'pro' });
    expect(failedNames(await preflight({ fetch }))).toEqual(['supabase-quota']);
  });

  it('fails github-repo when the repository exists and is not recorded', async () => {
    const run = fakeRun({ 'gh repo view ada/acme': { code: 0 } });
    expect(failedNames(await preflight({ run }))).toEqual(['github-repo']);
  });

  it('passes github-repo when the existing repository is the recorded one', async () => {
    const run = fakeRun({ 'gh repo view ada/acme': { code: 0 } });
    const config = { ...validConfig(), repository: 'ada/acme' };
    expect(failedNames(await preflight({ run, config }))).toEqual([]);
  });

  it('fails dash0 with the renewal fix on a 403', async () => {
    const results = await preflight({ fetch: fakeFetch({ dash0Status: 403 }) });
    expect(failedNames(results)).toEqual(['dash0']);
    expect(results.find((r) => r.name === 'dash0')?.fix).toBe(
      'Dash0 trial ended or token revoked — the founder renews the Dash0 subscription',
    );
  });

  it('passes dash0 when the dataset does not exist yet', async () => {
    const results = await preflight({ fetch: fakeFetch({ dash0Status: 404 }) });
    expect(failedNames(results)).toEqual([]);
  });
});

describe('createRunner', () => {
  function recordingRunner(token: string | undefined) {
    const envs = new Map<string, Record<string, string | undefined>>();
    const spawn = (
      command: string,
      _args: string[],
      options: { env: Record<string, string | undefined> },
    ) => {
      envs.set(command, options.env);
      return { status: 0, stdout: 'out', stderr: '' };
    };
    const run = createRunner({
      token,
      spawn: spawn as never,
      env: { PATH: '/usr/bin' } as never,
    });
    return { envs, run };
  }

  it('gives the service account token to op and to no other command', async () => {
    const { envs, run } = recordingRunner(SECRET);
    for (const command of ['op', 'gh', 'vercel']) {
      expect(await run(command, ['--version'])).toEqual({
        code: 0,
        stdout: 'out',
        stderr: '',
      });
    }
    expect(envs.get('op')).toEqual({
      PATH: '/usr/bin',
      OP_SERVICE_ACCOUNT_TOKEN: SECRET,
    });
    expect(envs.get('gh')).toEqual({ PATH: '/usr/bin' });
    expect(envs.get('vercel')).toEqual({ PATH: '/usr/bin' });
  });

  it('gives op no token when the Keychain has none', async () => {
    const { envs, run } = recordingRunner(undefined);
    await run('op', ['item', 'list']);
    expect(envs.get('op')).toEqual({ PATH: '/usr/bin' });
  });
});
