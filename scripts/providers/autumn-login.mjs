import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStartupConfig, startupVault } from '../vault/names.mjs';
import { createOp } from '../vault/op.mjs';
import { importAutumnKeys } from '../vault-import-autumn-keys.mjs';

const ATMN_BIN = fileURLToPath(
  new URL('../../node_modules/.bin/atmn', import.meta.url),
);
const URL_FILE = 'auth-url';
const BROWSER_COMMANDS = ['open', 'xdg-open'];
const URL_WAIT_MS = 30_000;

// atmn opens the consent page with the system `open`; this shim hands the URL to us instead
function writeBrowserShim(binDir, urlPath) {
  mkdirSync(binDir);
  const script = `#!/bin/sh\nfor last; do :; done\nprintf '%s\\n' "$last" > '${urlPath}'\n`;
  for (const command of BROWSER_COMMANDS) {
    const path = join(binDir, command);
    writeFileSync(path, script);
    chmodSync(path, 0o755);
  }
}

function defaultSpawnAtmn({ cwd, env }) {
  return new Promise((resolve) => {
    const child = spawn(ATMN_BIN, ['login'], {
      cwd,
      env,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.on('error', () => resolve({ status: 1 }));
    child.on('exit', (code) => resolve({ status: code ?? 1 }));
  });
}

async function waitForUrl({ urlPath, done, pollMs }) {
  const deadline = Date.now() + URL_WAIT_MS;
  while (Date.now() < deadline) {
    if (existsSync(urlPath)) {
      const url = readFileSync(urlPath, 'utf8').trim();
      if (url) return url;
    }
    if (done()) return null;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return null;
}

export async function loginToAutumn({
  op,
  vault,
  spawnAtmn = defaultSpawnAtmn,
  importKeys = importAutumnKeys,
  productionKey = 'sandbox',
  onUrl,
  pollMs = 200,
}) {
  const dir = mkdtempSync(join(tmpdir(), 'atmn-login-'));
  try {
    const binDir = join(dir, 'bin');
    const urlPath = join(dir, URL_FILE);
    writeBrowserShim(binDir, urlPath);

    let finished = false;
    const run = spawnAtmn({
      cwd: dir,
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` },
    }).finally(() => {
      finished = true;
    });

    const url = await waitForUrl({ urlPath, done: () => finished, pollMs });
    if (!url) {
      await run;
      throw new Error('atmn login never opened a browser');
    }
    onUrl(url);

    const { status } = await run;
    if (status !== 0) {
      throw new Error(`atmn login failed (exit ${status}) — run it again`);
    }
    return importKeys({
      op,
      vault,
      envPath: join(dir, '.env'),
      productionKey,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function status(found) {
  return found ? 'stored' : 'not found';
}

async function main() {
  try {
    const { slug, name } = readStartupConfig();
    const vault = startupVault(slug);
    const result = await loginToAutumn({
      op: createOp(),
      vault,
      productionKey: process.argv.includes('--live') ? 'live' : 'sandbox',
      onUrl: (url) =>
        console.log(
          `OPEN  ${url}\n      Approve it in the founder's browser and pick the "${name}" organization.`,
        ),
    });
    console.log(
      `OK  Autumn sandbox key ${status(result.local)} in ${vault}/local, production uses the ${result.production} key`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('autumn-login.mjs')) {
  await main();
}
