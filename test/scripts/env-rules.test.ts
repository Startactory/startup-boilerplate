import { describe, expect, it } from 'vitest';
import { isSecretKey, validateEnvValue } from '../../scripts/env/rules.mjs';

describe('validateEnvValue', () => {
  it('rejects a Supabase database in the local environment', () => {
    const r = validateEnvValue(
      'DATABASE_URL',
      'postgresql://postgres.ref:pw@aws-0-eu-west-3.pooler.supabase.com:5432/postgres',
      { environment: 'local' },
    );
    expect(r.errors).toContain(
      '.env is the local environment and must use local Postgres — the Supabase database belongs in .env.prod',
    );
  });

  it('warns when production points at localhost', () => {
    const r = validateEnvValue(
      'DATABASE_URL',
      'postgresql://postgres:postgres@localhost:5432/acme',
      { environment: 'production' },
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toContain('localhost');
  });

  it('rejects placeholders', () => {
    expect(
      validateEnvValue('SMTP_PASS', '[YOUR-PASSWORD]', { environment: 'local' })
        .errors,
    ).toContain('value is still a placeholder');
  });

  it('rejects an OTLP endpoint with a trailing slash', () => {
    expect(
      validateEnvValue(
        'OTEL_EXPORTER_OTLP_ENDPOINT',
        'https://ingress.eu-west-1.aws.dash0.com/',
        { environment: 'production' },
      ).errors.length,
    ).toBe(1);
  });

  it('warns on a master key with the wrong prefix', () => {
    expect(
      validateEnvValue('POSTHOG_PERSONAL_API_KEY_EU', 'phc_abc', {
        environment: 'production',
      }).warnings.length,
    ).toBe(1);
  });
});

describe('isSecretKey', () => {
  it('treats public and plain values as non-secret', () => {
    expect(isSecretKey('NEXT_PUBLIC_POSTHOG_KEY')).toBe(false);
    expect(isSecretKey('EMAIL_PROVIDER')).toBe(false);
  });

  it('treats credentials as secret', () => {
    expect(isSecretKey('OTEL_EXPORTER_OTLP_HEADERS')).toBe(true);
    expect(isSecretKey('DATABASE_URL')).toBe(true);
  });
});
