import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { readStartupConfig } from '../vault/names.mjs';

export const VERCEL_REGION = { eu: 'cdg1', us: 'iad1' };

const MAX_DOMAIN_TRIES = 3;
const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const NOT_FOUND_PATTERN = /404|not[ _-]?found/i;
const REPOSITORY_CONNECTED_PATTERN = /already connected/i;
const GITHUB_COM_LINK_TYPES = new Set(['github', 'github-limited']);
const DOMAIN_REFUSED_PATTERN =
  /409|already|in use|taken|assigned|not allowed|not available|unavailable/i;

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
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function callApi({ runVercel, args }) {
  const result = await runVercel(['api', ...args]);
  const body = parseJson(result.stdout);
  const ok = result.code === 0 && !body?.error;
  return { ok, body, result };
}

async function readProject({ runVercel, slug }) {
  const response = await callApi({ runVercel, args: [`/v9/projects/${slug}`] });
  if (response.ok) return response.body ?? {};
  const text = `${response.result.stderr}${response.result.stdout}`;
  if (NOT_FOUND_PATTERN.test(text)) return null;
  throw failure('vercel api project lookup', response.result);
}

function isLinkedTo({ project, repository }) {
  const link = project.link;
  if (!GITHUB_COM_LINK_TYPES.has(link?.type) || !link.org || !link.repo) {
    return false;
  }
  return `${link.org}/${link.repo}`.toLowerCase() === repository.toLowerCase();
}

function hasDeployment(project) {
  return (
    (project.latestDeployments ?? []).length > 0 ||
    Boolean(project.targets?.production)
  );
}

function assertProjectIsThisStartups({ project, slug, repository }) {
  if (isLinkedTo({ project, repository })) return;
  if (!project.link && !hasDeployment(project)) return;
  throw new Error(
    `Vercel project ${slug} already exists and belongs to something else — pick another slug (founder decision)`,
  );
}

export async function checkVercelName({
  runVercel = defaultRunVercel,
  slug,
  repository,
}) {
  const project = await readProject({ runVercel, slug });
  if (!project) return 'free';
  assertProjectIsThisStartups({ project, slug, repository });
  return 'own';
}

async function findOwnDomain({ runVercel, slug }) {
  const response = await callApi({
    runVercel,
    args: [`/v9/projects/${slug}/domains?limit=100`],
  });
  if (!response.ok) throw failure('vercel api domain list', response.result);
  const names = (response.body?.domains ?? []).map((domain) => domain.name);
  const exact = `${slug}.vercel.app`;
  const suffixed = new RegExp(`^${slug}-[a-z0-9]{4}\\.vercel\\.app$`);
  return (
    names.find((name) => name === exact) ??
    names.find((name) => suffixed.test(name)) ??
    null
  );
}

async function addVercelDomain({ runVercel, slug, randomSuffix }) {
  for (let attempt = 0; attempt < MAX_DOMAIN_TRIES; attempt += 1) {
    const domain =
      attempt === 0
        ? `${slug}.vercel.app`
        : `${slug}-${randomSuffix()}.vercel.app`;
    const added = await callApi({
      runVercel,
      args: [
        `/v10/projects/${slug}/domains`,
        '-X',
        'POST',
        '-F',
        `name=${domain}`,
      ],
    });
    if (added.ok) return domain;
    // A refused add may mean this very project already owns the name.
    if ((await findOwnDomain({ runVercel, slug })) === domain) return domain;
    if (
      !DOMAIN_REFUSED_PATTERN.test(
        `${added.result.stderr}${added.result.stdout}`,
      )
    ) {
      throw failure('vercel api domain add', added.result);
    }
  }
  throw new Error(
    `no free *.vercel.app name for ${slug} after ${MAX_DOMAIN_TRIES} tries`,
  );
}

async function connectRepository({ runVercel, repository }) {
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
}

export async function ensureVercelProject({
  runVercel = defaultRunVercel,
  slug,
  repository,
  randomSuffix = defaultRandomSuffix,
}) {
  if (!repository) {
    throw new Error(
      'no repository in startup.config.json — run the repository step first',
    );
  }
  const project = await readProject({ runVercel, slug });
  if (project) {
    assertProjectIsThisStartups({ project, slug, repository });
  } else {
    const created = await runVercel(['project', 'create', slug]);
    if (created.code !== 0) throw failure('vercel project create', created);
  }

  const linked = await runVercel(['link', '--yes', '--project', slug]);
  if (linked.code !== 0) throw failure('vercel link', linked);

  if (!project || !isLinkedTo({ project, repository })) {
    await connectRepository({ runVercel, repository });
  }

  const existing = await findOwnDomain({ runVercel, slug });
  const domain =
    existing ?? (await addVercelDomain({ runVercel, slug, randomSuffix }));
  return {
    productionUrl: `https://${domain}`,
    outcome: project ? 'reused' : 'created',
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

export function writeVercelSettings({
  path = 'vercel.json',
  fs = { readFileSync, writeFileSync },
  dataRegion,
}) {
  rewriteJson({
    path,
    fs,
    // A project created by the CLI may keep the "Other" preset, which serves 404s for Next.js.
    update: (config) => ({
      ...config,
      framework: 'nextjs',
      regions: [VERCEL_REGION[dataRegion]],
    }),
  });
}

const CHECK_USAGE =
  'usage: node scripts/providers/vercel-project.mjs --check-name <slug> --repository <owner>/<slug>';

function optionValue(argv, flag) {
  const index = argv.indexOf(flag);
  const value = index === -1 ? undefined : argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(CHECK_USAGE);
  return value;
}

async function checkNameFromArguments(argv) {
  const slug = optionValue(argv, '--check-name');
  const repository = optionValue(argv, '--repository');
  const state = await checkVercelName({ slug, repository });
  console.log(
    state === 'free'
      ? `OK  Vercel name ${slug} is free`
      : `OK  Vercel project ${slug} is this startup's`,
  );
}

async function main() {
  try {
    const argv = process.argv.slice(2);
    if (argv.includes('--check-name')) {
      await checkNameFromArguments(argv);
      return;
    }
    const { slug, repository, dataRegion } = readStartupConfig();
    const { productionUrl, outcome } = await ensureVercelProject({
      slug,
      repository,
    });
    writeProductionUrl({ productionUrl });
    writeVercelSettings({ dataRegion });
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
