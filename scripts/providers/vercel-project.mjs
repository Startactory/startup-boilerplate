import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { readStartupConfig } from '../vault/names.mjs';

export const VERCEL_REGION = { eu: 'cdg1', us: 'iad1' };

const MAX_DOMAIN_TRIES = 3;
const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PROJECT_EXISTS_PATTERN = /already exists|already (?:in use|taken)/i;
const REPOSITORY_CONNECTED_PATTERN = /already connected/i;
const DOMAIN_TAKEN_PATTERN =
  /already (?:in use|assigned|taken|exists|registered)|is taken|not available|unavailable|belongs to|another (?:project|account|team)/i;

function defaultRunVercel(args) {
  const result = spawnSync('vercel', args, { encoding: 'utf8' });
  return Promise.resolve({
    code: result.error ? 1 : (result.status ?? 1),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  });
}

export function defaultRandomSuffix() {
  return Array.from(randomBytes(4), (byte) => SUFFIX_ALPHABET[byte % 36]).join(
    '',
  );
}

function failure(step, result) {
  const detail = `${result.stderr}${result.stdout}`.trim().split('\n')[0] ?? '';
  return new Error(`${step} failed${detail ? `: ${detail}` : ''}`);
}

function findOwnDomain({ output, slug }) {
  const pattern = new RegExp(
    `\\b${slug}(?:-[a-z0-9]{4})?\\.vercel\\.app\\b`,
    'i',
  );
  return pattern.exec(output)?.[0].toLowerCase() ?? null;
}

async function addVercelDomain({ runVercel, slug, randomSuffix }) {
  for (let attempt = 0; attempt < MAX_DOMAIN_TRIES; attempt += 1) {
    const domain =
      attempt === 0
        ? `${slug}.vercel.app`
        : `${slug}-${randomSuffix()}.vercel.app`;
    const result = await runVercel(['domains', 'add', domain, slug]);
    if (result.code === 0) return domain;
    if (!DOMAIN_TAKEN_PATTERN.test(`${result.stderr}${result.stdout}`)) {
      throw failure('vercel domains add', result);
    }
  }
  throw new Error(
    `no free *.vercel.app name for ${slug} after ${MAX_DOMAIN_TRIES} tries`,
  );
}

export async function ensureVercelProject({
  runVercel = defaultRunVercel,
  slug,
  repository,
  randomSuffix = defaultRandomSuffix,
}) {
  const created = await runVercel(['project', 'create', slug]);
  const projectExisted =
    created.code !== 0 &&
    PROJECT_EXISTS_PATTERN.test(`${created.stderr}${created.stdout}`);
  if (created.code !== 0 && !projectExisted) {
    throw failure('vercel project create', created);
  }

  const linked = await runVercel(['link', '--yes', '--project', slug]);
  if (linked.code !== 0) throw failure('vercel link', linked);

  const connected = await runVercel([
    'git',
    'connect',
    `https://github.com/${repository}`,
    '--yes',
  ]);
  if (
    connected.code !== 0 &&
    !REPOSITORY_CONNECTED_PATTERN.test(`${connected.stderr}${connected.stdout}`)
  ) {
    throw failure('vercel git connect', connected);
  }

  if (projectExisted) {
    const inspected = await runVercel(['project', 'inspect', slug, '--json']);
    if (inspected.code !== 0) {
      throw failure('vercel project inspect', inspected);
    }
    const existing = findOwnDomain({
      output: `${inspected.stdout}${inspected.stderr}`,
      slug,
    });
    if (existing) {
      return { productionUrl: `https://${existing}`, outcome: 'reused' };
    }
  }

  const domain = await addVercelDomain({ runVercel, slug, randomSuffix });
  return {
    productionUrl: `https://${domain}`,
    outcome: projectExisted ? 'reused' : 'created',
  };
}

function rewriteJson({ path, fs, update }) {
  const current = JSON.parse(fs.readFileSync(path, 'utf8'));
  fs.writeFileSync(path, `${JSON.stringify(update(current), null, 2)}\n`);
}

export function writeProductionUrl({
  path = 'startup.config.json',
  fs = { readFileSync, writeFileSync },
  productionUrl,
}) {
  rewriteJson({ path, fs, update: (config) => ({ ...config, productionUrl }) });
}

export function writeVercelRegions({
  path = 'vercel.json',
  fs = { readFileSync, writeFileSync },
  dataRegion,
}) {
  rewriteJson({
    path,
    fs,
    update: (config) => ({ ...config, regions: [VERCEL_REGION[dataRegion]] }),
  });
}

async function main() {
  try {
    const { slug, repository, dataRegion } = readStartupConfig();
    const { productionUrl, outcome } = await ensureVercelProject({
      slug,
      repository,
    });
    writeProductionUrl({ productionUrl });
    writeVercelRegions({ dataRegion });
    console.log(
      `OK  Vercel project ${slug} ${outcome}, production URL ${productionUrl}`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('vercel-project.mjs')) {
  main();
}
