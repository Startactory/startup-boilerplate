import { describe, expect, it, vi } from 'vitest';
import { runSmokeTest } from '../../scripts/smoke-test.mjs';

const SITE_URL = 'https://acme.vercel.app';
const COMMIT = 'aaa';
const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const HOOK_URL =
  'https://api.vercel.com/v1/integrations/deploy/prj_abc/secrethook';
const BRANCH_FIX =
  'run node scripts/providers/vercel-deploy-hook.mjs --project acme';

type FakeFetch = ReturnType<typeof fakeFetch>;
type CommandResult = { status: number; stdout: string; stderr: string };

function headers(contentType: string) {
  return {
    get: (name: string) => (name === 'content-type' ? contentType : null),
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    headers: headers('application/json'),
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function htmlResponse(status: number, html: string) {
  return {
    status,
    headers: headers('text/html; charset=utf-8'),
    text: async () => html,
    json: async () => ({}),
  };
}

function pngResponse(contentType: string) {
  return {
    status: 200,
    headers: headers(contentType),
    text: async () => '',
    json: async () => ({}),
  };
}

function projectAnswer(productionBranch: string): CommandResult {
  return {
    status: 0,
    stdout: JSON.stringify({
      name: 'acme',
      link: {
        productionBranch,
        deployHooks: [{ name: 'production', url: HOOK_URL }],
      },
    }),
    stderr: '',
  };
}

function fakeRunCommand(answer: CommandResult = projectAnswer('master')) {
  return vi.fn((_command: string, _args: string[]) => answer);
}

function googleUrl(redirectUri: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function fakeFetch({
  commitSha = COMMIT,
  redirectUri = `${SITE_URL}/auth/callback/google`,
  missingPath,
  landingHtml = '<h1>Acme</h1>',
  logoContentType = 'image/png',
}: {
  commitSha?: string | null;
  redirectUri?: string;
  missingPath?: string;
  landingHtml?: string;
  logoContentType?: string;
} = {}) {
  return vi.fn(async (input: string, init?: { method?: string }) => {
    const path = input.replace(SITE_URL, '');
    if (path === missingPath) return htmlResponse(404, 'not found');
    if (path === '/') return htmlResponse(200, landingHtml);
    if (path === '/brand-logo.png') return pngResponse(logoContentType);
    if (path.startsWith('/legal/')) return htmlResponse(200, 'legal');
    if (path === '/api/version') {
      return jsonResponse(200, { deploymentId: 'dpl', commitSha });
    }
    if (path === '/auth/sign-in/social' && init?.method === 'POST') {
      return jsonResponse(200, { url: googleUrl(redirectUri), redirect: true });
    }
    return htmlResponse(404, 'not found');
  });
}

function run({
  fetch = fakeFetch(),
  runCommand = fakeRunCommand(),
  countAppliedMigrations = async () => 3,
  expectedName = 'Acme',
}: {
  fetch?: FakeFetch;
  runCommand?: ReturnType<typeof fakeRunCommand>;
  countAppliedMigrations?: () => Promise<number>;
  expectedName?: string;
} = {}) {
  return runSmokeTest({
    url: SITE_URL,
    fetch: fetch as unknown as typeof globalThis.fetch,
    runCommand,
    project: 'acme',
    expectedCommit: COMMIT,
    expectedName,
    googleClientId: CLIENT_ID,
    countAppliedMigrations,
    expectedMigrations: 3,
  });
}

function failedNames(results: Array<{ name: string; ok: boolean }>) {
  return results.filter((r) => !r.ok).map((r) => r.name);
}

describe('runSmokeTest', () => {
  it('passes every check against a healthy deployment', async () => {
    const results = await run();
    expect(results.map((r: { name: string }) => r.name)).toEqual([
      'landing',
      'legal/notice',
      'legal/terms',
      'legal/privacy',
      'legal/cookies',
      'brand-logo',
      'version',
      'production-branch',
      'google-sign-in',
      'migrations',
    ]);
    expect(failedNames(results)).toEqual([]);
  });

  it('reads the production branch from the Vercel project', async () => {
    const runCommand = fakeRunCommand();
    await run({ runCommand });
    expect(runCommand).toHaveBeenCalledWith('vercel', [
      'api',
      '/v9/projects/acme',
    ]);
  });

  it('fails production-branch on main and never shows a deploy hook URL', async () => {
    const results = await run({
      runCommand: fakeRunCommand(projectAnswer('main')),
    });
    expect(results.filter((r: { ok: boolean }) => !r.ok)).toEqual([
      {
        name: 'production-branch',
        ok: false,
        detail: `Vercel production branch is main, expected master — ${BRANCH_FIX}`,
      },
    ]);
    expect(JSON.stringify(results)).not.toContain('secrethook');
  });

  it.each([
    [
      'a failed command',
      { status: 1, stdout: '', stderr: `Error: forbidden ${HOOK_URL}\nmore` },
      'vercel api /v9/projects/acme failed: Error: forbidden <url redacted>',
    ],
    [
      'an answer that is not JSON',
      { status: 0, stdout: `oops ${HOOK_URL}`, stderr: '' },
      'vercel api /v9/projects/acme gave an answer without link.productionBranch',
    ],
  ])('fails production-branch on %s without the hook URL', async (_label, answer, detail) => {
    const results = await run({ runCommand: fakeRunCommand(answer) });
    expect(
      results.find((r: { name: string }) => r.name === 'production-branch'),
    ).toEqual({
      name: 'production-branch',
      ok: false,
      detail,
    });
    expect(JSON.stringify(results)).not.toContain('secrethook');
  });

  it('fails brand-logo when the logo is missing', async () => {
    const results = await run({
      fetch: fakeFetch({ missingPath: '/brand-logo.png' }),
    });
    expect(results.filter((r: { ok: boolean }) => !r.ok)).toEqual([
      { name: 'brand-logo', ok: false, detail: 'status 404' },
    ]);
  });

  it('fails brand-logo when the answer is not a PNG', async () => {
    const results = await run({
      fetch: fakeFetch({ logoContentType: 'text/html; charset=utf-8' }),
    });
    expect(results.filter((r: { ok: boolean }) => !r.ok)).toEqual([
      {
        name: 'brand-logo',
        ok: false,
        detail: 'content-type text/html; charset=utf-8, expected image/png',
      },
    ]);
  });

  it('sends the sign-in request with the production origin', async () => {
    const fetch = fakeFetch();
    await run({ fetch });
    const call = fetch.mock.calls.find(([u]) =>
      u.endsWith('/auth/sign-in/social'),
    );
    const init = call?.[1] as unknown as {
      headers: Record<string, string>;
      body: string;
    };
    expect(init.headers.origin).toBe(SITE_URL);
    expect(JSON.parse(init.body)).toEqual({
      provider: 'google',
      callbackURL: '/dashboard',
    });
  });

  it('fails the version check when an older deployment is served', async () => {
    const results = await run({ fetch: fakeFetch({ commitSha: 'bbb' }) });
    expect(results.filter((r: { ok: boolean }) => !r.ok)).toEqual([
      { name: 'version', ok: false, detail: 'expected aaa, got bbb' },
    ]);
  });

  it('fails google-sign-in when the redirect_uri is wrong', async () => {
    const results = await run({
      fetch: fakeFetch({
        redirectUri: 'https://other.example/auth/callback/google',
      }),
    });
    expect(failedNames(results)).toEqual(['google-sign-in']);
  });

  it.each([
    ['raw', "<h1>L'Atelier & Co</h1>"],
    ['React-escaped', '<h1>L&#x27;Atelier &amp; Co</h1>'],
    ['decimal-escaped', '<h1>L&#39;Atelier &amp; Co</h1>'],
  ])('finds a name with an apostrophe and an ampersand, %s', async (_form, landingHtml) => {
    const results = await run({
      fetch: fakeFetch({ landingHtml }),
      expectedName: "L'Atelier & Co",
    });
    expect(failedNames(results)).toEqual([]);
  });

  it('finds a name with quotes and angle brackets once escaped', async () => {
    const results = await run({
      fetch: fakeFetch({
        landingHtml: '<title>&quot;Ship&quot; &lt;fast&gt;</title>',
      }),
      expectedName: '"Ship" <fast>',
    });
    expect(failedNames(results)).toEqual([]);
  });

  it('fails the landing check when the name is absent', async () => {
    const results = await run({
      fetch: fakeFetch({ landingHtml: '<h1>L&#x27;Atelier</h1>' }),
      expectedName: "L'Atelier & Co",
    });
    expect(results[0]).toEqual({
      name: 'landing',
      ok: false,
      detail: `page does not mention "L'Atelier & Co"`,
    });
  });

  it('fails only the legal page that returns 404', async () => {
    const results = await run({
      fetch: fakeFetch({ missingPath: '/legal/terms' }),
    });
    expect(failedNames(results)).toEqual(['legal/terms']);
  });

  it('never leaks the database URL when the migration count fails', async () => {
    const results = await run({
      countAppliedMigrations: async () => {
        throw Object.assign(
          new Error('connect failed postgresql://user:secret@host/db'),
          { code: 'ECONNREFUSED' },
        );
      },
    });
    const migrations = results.find(
      (r: { name: string }) => r.name === 'migrations',
    );
    expect(migrations.ok).toBe(false);
    expect(migrations.detail).toBe('database query failed (ECONNREFUSED)');
    expect(JSON.stringify(results)).not.toContain('secret');
    expect(JSON.stringify(results)).not.toContain('postgresql://');
  });

  it('turns a thrown fetch error into a failed check', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as FakeFetch;
    const results = await run({ fetch });
    expect(results[0]).toEqual({
      name: 'landing',
      ok: false,
      detail: 'network down',
    });
  });
});
