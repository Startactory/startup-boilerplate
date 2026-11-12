import { describe, expect, it } from 'vitest';
import { parseConsent, serializeConsentCookie } from '@/lib/consent';

describe('parseConsent', () => {
  it('accepts exact granted and denied values', () => {
    expect(parseConsent('granted')).toBe('granted');
    expect(parseConsent('denied')).toBe('denied');
  });

  it('treats anything else as unset', () => {
    expect(parseConsent('yes')).toBe('unset');
    expect(parseConsent('GRANTED')).toBe('unset');
    expect(parseConsent(undefined)).toBe('unset');
  });
});

describe('serializeConsentCookie', () => {
  it('sets a 180 day lifetime and Secure on https', () => {
    const cookie = serializeConsentCookie('denied', { secure: true });
    expect(cookie).toBe(
      'cookie_consent=denied; Path=/; Max-Age=15552000; SameSite=Lax; Secure',
    );
  });

  it('omits Secure on http', () => {
    const cookie = serializeConsentCookie('granted', { secure: false });
    expect(cookie).toBe(
      'cookie_consent=granted; Path=/; Max-Age=15552000; SameSite=Lax',
    );
  });
});
