import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const validSource = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'GOCSPX-secret',
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'user@example.com',
  SMTP_PASS: 'password',
  SMTP_FROM_EMAIL: 'user@example.com',
};

describe('parseEnv — .env files leave optional keys empty', () => {
  it('parses a complete environment', () => {
    const parsed = parseEnv(validSource);
    expect(parsed.GOOGLE_CLIENT_ID).toBe('id.apps.googleusercontent.com');
    expect(parsed.SMTP_PORT).toBe(465);
  });

  it('treats an empty optional key as unset instead of rejecting it', () => {
    const parsed = parseEnv({
      ...validSource,
      NEXT_PUBLIC_POSTHOG_KEY: '',
      MICROSOFT_CLIENT_ID: '',
      UPSTASH_REDIS_REST_URL: '',
      RESEND_FROM_EMAIL: '',
      AUTUMN_SECRET_KEY: '',
    });
    expect(parsed.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined();
    expect(parsed.MICROSOFT_CLIENT_ID).toBeUndefined();
    expect(parsed.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(parsed.AUTUMN_SECRET_KEY).toBeUndefined();
  });

  it('applies the default when an optional key with a default is empty', () => {
    const parsed = parseEnv({
      ...validSource,
      SMTP_PORT: '',
      NEXT_PUBLIC_POSTHOG_HOST: '',
      EMAIL_PROVIDER: '',
    });
    expect(parsed.SMTP_PORT).toBe(465);
    expect(parsed.NEXT_PUBLIC_POSTHOG_HOST).toBe('https://eu.i.posthog.com');
    expect(parsed.EMAIL_PROVIDER).toBe('smtp');
  });

  it('still rejects an empty required key, and names it', () => {
    expect(() => parseEnv({ ...validSource, GOOGLE_CLIENT_ID: '' })).toThrow(
      /GOOGLE_CLIENT_ID/,
    );
  });

  it('still rejects a non-empty invalid value', () => {
    expect(() =>
      parseEnv({ ...validSource, NEXT_PUBLIC_POSTHOG_HOST: 'not-a-url' }),
    ).toThrow(/NEXT_PUBLIC_POSTHOG_HOST/);
  });

  it('still requires the provider credentials for the selected email provider', () => {
    expect(() => parseEnv({ ...validSource, SMTP_PASS: '' })).toThrow(
      /EMAIL_PROVIDER=smtp requires: SMTP_PASS/,
    );
  });
});
