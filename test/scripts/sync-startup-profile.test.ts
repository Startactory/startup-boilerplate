import { describe, expect, it, vi } from 'vitest';
import { syncStartupProfile } from '../../scripts/sync-startup-profile.mjs';

const fullConfig = {
  name: 'Acme Analytics',
  slug: 'acme-analytics',
  dataRegion: 'eu',
  brand: { icon: 'Receipt', accent: '#2f3130' },
  pricing: { currency: 'USD' },
  legal: {
    termsVersion: '2026-11-12',
    founderName: 'Ada Lovelace',
    contactEmail: 'ada@example.com',
    company: null,
  },
};

function run(config: Record<string, unknown>) {
  const writeFile = vi.fn();
  syncStartupProfile({ config, writeFile });
  return new Map<string, string>(
    writeFile.mock.calls.map(([path, content]) => [path, content]),
  );
}

function contentOf(written: Map<string, string>, suffix: string) {
  const path = [...written.keys()].find((p) => p.endsWith(suffix));
  return written.get(path as string) as string;
}

describe('syncStartupProfile', () => {
  it('writes profile.json in the documented shape', () => {
    const written = run(fullConfig);
    expect(JSON.parse(contentOf(written, 'profile.json'))).toEqual({
      name: 'Acme Analytics',
      brand: { icon: 'Receipt', accent: '#2f3130' },
      currency: 'USD',
      legal: fullConfig.legal,
    });
  });

  it('keeps the consumer mediator in the written profile', () => {
    const company = {
      name: 'Acme SAS',
      form: 'SAS',
      address: '1 rue de Rivoli, 75001 Paris',
      siren: '123456789',
      publicationDirector: 'Ada Lovelace',
      mediator: 'Example mediator, mediator.example.eu',
    };
    const written = run({
      ...fullConfig,
      legal: { ...fullConfig.legal, company },
    });
    const profile = JSON.parse(contentOf(written, 'profile.json'));
    expect(profile.legal.company.mediator).toBe(company.mediator);
  });

  it('writes brand.css overriding the accent tokens', () => {
    const css = contentOf(run(fullConfig), 'brand.css');
    expect(css).toContain('--primary: #2f3130');
    expect(css).toContain('--sidebar-accent-foreground: #2f3130');
  });

  it('rejects an unknown icon naming brand.icon', () => {
    expect(() =>
      run({ ...fullConfig, brand: { icon: 'NotAnIcon', accent: '#2f3130' } }),
    ).toThrow('brand.icon');
  });

  it('rejects a bad accent naming brand.accent', () => {
    expect(() =>
      run({ ...fullConfig, brand: { icon: 'Receipt', accent: 'blue' } }),
    ).toThrow('brand.accent');
  });

  it('falls back to the neutral legal block with empty founder fields', () => {
    const { legal: _legal, ...withoutLegal } = fullConfig;
    const profile = JSON.parse(contentOf(run(withoutLegal), 'profile.json'));
    expect(profile.legal).toEqual({
      termsVersion: '0',
      founderName: '',
      contactEmail: '',
      company: null,
    });
  });

  it('defaults currency to EUR', () => {
    const profile = JSON.parse(
      contentOf(run({ ...fullConfig, pricing: undefined }), 'profile.json'),
    );
    expect(profile.currency).toBe('EUR');
  });
});
