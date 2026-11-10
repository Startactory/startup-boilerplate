import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export const FOUNDER_VAULT = 'startup-founder';
export const MASTER_KEYS_ITEM = 'master-keys';
export const CI_ITEM = 'ci';

export const ITEM_FOR_ENVIRONMENT = {
  local: 'local',
  production: 'production',
};

export const ENV_FILE_FOR_ENVIRONMENT = {
  local: '.env',
  production: '.env.prod',
};

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function startupVault(slug) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid startup slug "${slug}"`);
  }
  return `startup-${slug}`;
}

export function secretReference({ vault, item, field }) {
  return `op://${vault}/${item}/${field}`;
}

export function readStartupConfig(path = 'startup.config.json') {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('startup.config.json not found — run step 1 first');
    }
    throw error;
  }
  const config = JSON.parse(text);
  if (
    typeof config.slug !== 'string' ||
    !config.slug ||
    !['eu', 'us'].includes(config.dataRegion)
  ) {
    throw new Error(
      'startup.config.json is missing slug or dataRegion — run step 1 first',
    );
  }
  return config;
}

export function environmentForFile(path) {
  const name = basename(path);
  for (const [environment, fileName] of Object.entries(
    ENV_FILE_FOR_ENVIRONMENT,
  )) {
    if (name === fileName) return environment;
  }
  throw new Error(`"${name}" is not a known env file (.env or .env.prod)`);
}

export function masterKeyName(base, dataRegion) {
  return `${base}_${dataRegion.toUpperCase()}`;
}
