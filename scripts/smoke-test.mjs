import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import {
  ITEM_FOR_ENVIRONMENT,
  readStartupConfig,
  startupVault,
} from './vault/names.mjs';
import { createOp } from './vault/op.mjs';

const LEGAL_PAGES = ['notice', 'terms', 'privacy', 'cookies'];
const GOOGLE_HOST = 'accounts.google.com';
const HTML_ENTITIES = [
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
];
const APOSTROPHE_ENTITIES = ['&#x27;', '&#39;'];

function htmlForms(name) {
  const escaped = HTML_ENTITIES.reduce(
    (text, [character, entity]) => text.replaceAll(character, entity),
    name,
  );
  return [
    name,
    ...APOSTROPHE_ENTITIES.map((entity) => escaped.replaceAll("'", entity)),
  ];
}

async function checkLanding({ url, fetch, expectedName }) {
  const response = await fetch(`${url}/`);
  if (response.status !== 200) {
    return { ok: false, detail: `status ${response.status}` };
  }
  const html = await response.text();
  if (!htmlForms(expectedName).some((form) => html.includes(form))) {
    return { ok: false, detail: `page does not mention "${expectedName}"` };
  }
  return { ok: true, detail: 'status 200' };
}

async function checkLegalPage({ url, fetch, page }) {
  const response = await fetch(`${url}/legal/${page}`);
  return { ok: response.status === 200, detail: `status ${response.status}` };
}

async function checkVersion({ url, fetch, expectedCommit }) {
  const response = await fetch(`${url}/api/version`);
  if (response.status !== 200) {
    return { ok: false, detail: `status ${response.status}` };
  }
  const body = await response.json();
  const actual = body?.commitSha ?? null;
  return {
    ok: actual === expectedCommit,
    detail: `expected ${expectedCommit}, got ${actual}`,
  };
}

async function checkGoogleSignIn({ url, fetch, googleClientId }) {
  const response = await fetch(`${url}/auth/sign-in/social`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: url },
    body: JSON.stringify({ provider: 'google', callbackURL: '/dashboard' }),
  });
  if (response.status !== 200) {
    return { ok: false, detail: `status ${response.status}` };
  }
  const body = await response.json();
  const redirect = new URL(body.url);
  const expectedRedirectUri = `${url}/auth/callback/google`;
  const redirectUri = redirect.searchParams.get('redirect_uri');
  if (redirect.host !== GOOGLE_HOST) {
    return { ok: false, detail: `redirects to ${redirect.host}` };
  }
  if (redirect.searchParams.get('client_id') !== googleClientId) {
    return { ok: false, detail: 'client_id does not match the vault' };
  }
  if (redirectUri !== expectedRedirectUri) {
    return {
      ok: false,
      detail: `expected redirect_uri ${expectedRedirectUri}, got ${redirectUri}`,
    };
  }
  return { ok: true, detail: 'redirects to Google with the right client' };
}

async function checkMigrations({ countAppliedMigrations, expectedMigrations }) {
  const applied = await countAppliedMigrations();
  return {
    ok: applied === expectedMigrations,
    detail: `expected ${expectedMigrations}, got ${applied}`,
  };
}

async function runCheck({ name, run, describeError = (e) => e.message }) {
  try {
    return { name, ...(await run()) };
  } catch (error) {
    return { name, ok: false, detail: describeError(error) };
  }
}

export async function runSmokeTest({
  url,
  fetch,
  expectedCommit,
  expectedName,
  googleClientId,
  countAppliedMigrations,
  expectedMigrations,
}) {
  const checks = [
    { name: 'landing', run: () => checkLanding({ url, fetch, expectedName }) },
    ...LEGAL_PAGES.map((page) => ({
      name: `legal/${page}`,
      run: () => checkLegalPage({ url, fetch, page }),
    })),
    {
      name: 'version',
      run: () => checkVersion({ url, fetch, expectedCommit }),
    },
    {
      name: 'google-sign-in',
      run: () => checkGoogleSignIn({ url, fetch, googleClientId }),
    },
    {
      name: 'migrations',
      run: () =>
        checkMigrations({ countAppliedMigrations, expectedMigrations }),
      describeError: (error) =>
        `database query failed (${error?.code ?? 'unknown'})`,
    },
  ];

  const results = [];
  for (const check of checks) {
    results.push(await runCheck(check));
  }
  return results;
}

function parseUrlArgument(argv) {
  const index = argv.indexOf('--url');
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(
      'usage: node scripts/smoke-test.mjs [--url <productionUrl>]',
    );
  }
  return value;
}

function countJournalEntries() {
  const journal = JSON.parse(
    readFileSync('drizzle/meta/_journal.json', 'utf8'),
  );
  return journal.entries.length;
}

function createMigrationCounter(databaseUrl) {
  return async () => {
    const client = postgres(databaseUrl, { ssl: 'require', max: 1 });
    try {
      const rows =
        await client`select count(*)::int as count from drizzle.__drizzle_migrations`;
      return rows[0].count;
    } finally {
      await client.end({ timeout: 5 });
    }
  };
}

async function main() {
  try {
    const config = readStartupConfig();
    const rawUrl =
      parseUrlArgument(process.argv.slice(2)) ?? config.productionUrl;
    if (!rawUrl) {
      throw new Error(
        'no URL: pass --url or set productionUrl in startup.config.json',
      );
    }
    const url = rawUrl.replace(/\/+$/, '');
    const expectedCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const fields = createOp().readFields({
      vault: startupVault(config.slug),
      item: ITEM_FOR_ENVIRONMENT.production,
    });
    const googleClientId = fields?.get('GOOGLE_CLIENT_ID');
    const databaseUrl = fields?.get('DATABASE_URL');
    if (!googleClientId || !databaseUrl) {
      throw new Error(
        'GOOGLE_CLIENT_ID or DATABASE_URL missing from the production vault item',
      );
    }

    const results = await runSmokeTest({
      url,
      fetch: globalThis.fetch,
      expectedCommit,
      expectedName: config.name,
      googleClientId,
      countAppliedMigrations: createMigrationCounter(databaseUrl),
      expectedMigrations: countJournalEntries(),
    });

    for (const { name, ok, detail } of results) {
      console.log(ok ? `OK  ${name}` : `FAIL  ${name}: ${detail}`);
    }
    const passed = results.every((result) => result.ok);
    console.log(passed ? 'SMOKE TEST PASSED' : 'SMOKE TEST FAILED');
    if (!passed) process.exit(1);
  } catch (error) {
    console.error(error.message);
    console.log('SMOKE TEST FAILED');
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('smoke-test.mjs')) {
  await main();
}
