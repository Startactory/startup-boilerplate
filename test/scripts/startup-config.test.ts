import { describe, expect, it } from 'vitest';
import { validateRunConfig } from '../../scripts/startup-config.mjs';

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
      company: null as Record<string, string> | null,
    },
  };
}

function issuesOf(config: unknown): string[] {
  const result = validateRunConfig(config);
  if (result.ok) throw new Error('expected the config to be invalid');
  return result.issues ?? [];
}

describe('validateRunConfig', () => {
  it('accepts a complete config', () => {
    expect(validateRunConfig(validConfig())).toEqual({ ok: true });
  });

  it('accepts optional fields and unknown keys', () => {
    const config = {
      ...validConfig(),
      repository: 'ada/acme',
      productionUrl: 'https://acme.vercel.app',
      googleCloudProject: 'acme-473215',
      autumnOrganization: 'org_2x9Kd7',
      createdStep: '3',
      defaultLocale: 'en',
      extra: true,
    };
    expect(validateRunConfig(config)).toEqual({ ok: true });
  });

  it.each([
    'Acme-473215',
    '1acme-473215',
    'acme-',
    'acme',
  ])('reports a Google Cloud project ID that Google refuses: %s', (googleCloudProject) => {
    expect(issuesOf({ ...validConfig(), googleCloudProject })).toEqual([
      expect.stringMatching(/^googleCloudProject:/),
    ]);
  });

  it.each([
    '',
    '   ',
  ])('reports a recorded Autumn organization that is blank: "%s"', (autumnOrganization) => {
    expect(issuesOf({ ...validConfig(), autumnOrganization })).toEqual([
      expect.stringMatching(/^autumnOrganization:/),
    ]);
  });

  it.each(['fr', 'en'])('accepts the default locale %s', (defaultLocale) => {
    expect(validateRunConfig({ ...validConfig(), defaultLocale })).toEqual({
      ok: true,
    });
  });

  it.each([
    'de',
    'EN',
    '',
    1,
  ])('reports an unsupported default locale naming defaultLocale: %s', (defaultLocale) => {
    expect(issuesOf({ ...validConfig(), defaultLocale })).toEqual([
      'defaultLocale: must be fr or en',
    ]);
  });

  it('reports a missing idea', () => {
    const { idea: _idea, ...config } = validConfig();
    expect(issuesOf(config)).toEqual([expect.stringMatching(/^idea:/)]);
  });

  it('reports a missing googleAccount', () => {
    const { googleAccount: _googleAccount, ...config } = validConfig();
    expect(issuesOf(config)).toEqual([
      expect.stringMatching(/^googleAccount:/),
    ]);
  });

  it('reports a googleAccount that is not an email address', () => {
    const issues = issuesOf({ ...validConfig(), googleAccount: 'ada' });
    expect(issues).toEqual([expect.stringMatching(/^googleAccount:/)]);
  });

  it('reports a non-empty domain', () => {
    const issues = issuesOf({ ...validConfig(), domain: 'acme.com' });
    expect(issues).toEqual([expect.stringMatching(/^domain:/)]);
  });

  it('reports an unknown currency', () => {
    const config = validConfig();
    config.pricing.currency = 'ZZZ';
    expect(issuesOf(config)).toEqual([
      expect.stringMatching(/^pricing\.currency:/),
    ]);
  });

  it('reports a slug that is too short', () => {
    const issues = issuesOf({ ...validConfig(), slug: 'ab' });
    expect(issues).toEqual([expect.stringMatching(/^slug:/)]);
  });

  it('reports a company that already exists', () => {
    const config = validConfig();
    config.legal.company = {
      name: 'Acme SAS',
      form: 'SAS',
      address: '1 rue de Rivoli, 75001 Paris',
      siren: '123456789',
      publicationDirector: 'Ada Lovelace',
    };
    expect(issuesOf(config)).toEqual([
      expect.stringMatching(/^legal\.company:/),
    ]);
  });

  it('reports a production URL with a path', () => {
    const config = {
      ...validConfig(),
      productionUrl: 'https://acme.vercel.app/x',
    };
    expect(issuesOf(config)).toEqual([
      expect.stringMatching(/^productionUrl:/),
    ]);
  });

  it('reports every problem at once', () => {
    const config = { ...validConfig(), slug: 'ab', domain: 'acme.com' };
    const issues = issuesOf(config);
    expect(issues).toHaveLength(2);
    expect(issues.some((issue) => issue.startsWith('slug:'))).toBe(true);
    expect(issues.some((issue) => issue.startsWith('domain:'))).toBe(true);
  });
});
