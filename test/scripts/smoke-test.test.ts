import { describe, expect, it, vi } from 'vitest';
import { runSmokeTest } from '../../scripts/smoke-test.mjs';

const SITE_URL = 'https://acme.vercel.app';
const COMMIT = 'aaa';
const CLIENT_ID = 'client-123.apps.googleusercontent.com';

type FakeFetch = ReturnType<typeof fakeFetch>;

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function htmlResponse(status: number, html: string) {
  return { status, text: async () => html, json: async () => ({}) };
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
}: {
  commitSha?: string | null;
  redirectUri?: string;
  missingPath?: string;
  landingHtml?: string;
} = {}) {
  return vi.fn(async (input: string, init?: { method?: string }) => {
    const path = input.replace(SITE_URL, '');
    if (path === missingPath) return htmlResponse(404, 'not found');
    if (path === '/') return htmlResponse(200, landingHtml);
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
  countAppliedMigrations = async () => 3,
  expectedName = 'Acme',
}: {
  fetch?: FakeFetch;
  countAppliedMigrations?: () => Promise<number>;
  expectedName?: string;
} = {}) {
  return runSmokeTest({
    url: SITE_URL,
    fetch: fetch as unknown as typeof globalThis.fetch,
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
      'version',
      'google-sign-in',
      'migrations',
    ]);
    expect(failedNames(results)).toEqual([]);
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
