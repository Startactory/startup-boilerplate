import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  environmentForFile,
  masterKeyName,
  readStartupConfig,
  secretReference,
  startupVault,
} from '../../scripts/vault/names.mjs';

describe('vault names', () => {
  it('builds the startup vault name from the slug', () => {
    expect(startupVault('acme-analytics')).toBe('startup-acme-analytics');
  });

  it('rejects an invalid slug', () => {
    expect(() => startupVault('Acme')).toThrow();
    expect(() => startupVault('acme--x')).toThrow();
  });

  it('builds an op reference', () => {
    expect(
      secretReference({
        vault: 'startup-acme',
        item: 'production',
        field: 'DATABASE_URL',
      }),
    ).toBe('op://startup-acme/production/DATABASE_URL');
  });

  it('maps env files to environments', () => {
    expect(environmentForFile('/x/.env.prod')).toBe('production');
    expect(environmentForFile('.env')).toBe('local');
    expect(() => environmentForFile('.env.staging')).toThrow();
  });

  it('suffixes master keys with the region', () => {
    expect(masterKeyName('DASH0_TOKEN', 'eu')).toBe('DASH0_TOKEN_EU');
  });

  it('reads the startup config and requires slug and dataRegion', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vault-names-'));
    const good = join(dir, 'good.json');
    writeFileSync(
      good,
      JSON.stringify({
        name: 'A',
        slug: 'a',
        domain: 'a.io',
        dataRegion: 'eu',
      }),
    );
    expect(readStartupConfig(good).dataRegion).toBe('eu');
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ name: 'A' }));
    expect(() => readStartupConfig(bad)).toThrow(
      'startup.config.json is missing slug or dataRegion — run step 1 first',
    );
  });

  it('rejects a non-string slug', () => {
    expect(() => startupVault(undefined as unknown as string)).toThrow();
  });

  it('rejects an invalid data region or non-string slug in the config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vault-names-'));
    const region = join(dir, 'region.json');
    writeFileSync(region, JSON.stringify({ slug: 'a', dataRegion: 'asia' }));
    expect(() => readStartupConfig(region)).toThrow(
      /missing slug or dataRegion/,
    );
    const slug = join(dir, 'slug.json');
    writeFileSync(slug, JSON.stringify({ slug: 5, dataRegion: 'eu' }));
    expect(() => readStartupConfig(slug)).toThrow(/missing slug or dataRegion/);
  });

  it('reports a missing config file', () => {
    expect(() => readStartupConfig('/nonexistent/startup.config.json')).toThrow(
      'startup.config.json not found — run step 1 first',
    );
  });
});
