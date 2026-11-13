import { describe, expect, it } from 'vitest';
import profileJson from '@/shared/startup-profile/profile.json';
import { DEFAULT_LOCALE, isLocale, LOCALES, localeOrDefault } from './locales';

describe('DEFAULT_LOCALE', () => {
  it('is the default locale of the committed startup profile', () => {
    expect(DEFAULT_LOCALE).toBe(profileJson.defaultLocale);
  });

  it('is one of the supported locales', () => {
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });
});

describe('isLocale', () => {
  it('accepts every supported locale', () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
  });

  it('rejects an unsupported value', () => {
    expect(isLocale('de')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('localeOrDefault', () => {
  it('keeps every supported locale', () => {
    for (const locale of LOCALES) expect(localeOrDefault(locale)).toBe(locale);
  });

  it('falls back to the default locale for a missing or unsupported value', () => {
    expect(localeOrDefault(undefined)).toBe(DEFAULT_LOCALE);
    expect(localeOrDefault('de')).toBe(DEFAULT_LOCALE);
    expect(localeOrDefault(42)).toBe(DEFAULT_LOCALE);
  });
});
