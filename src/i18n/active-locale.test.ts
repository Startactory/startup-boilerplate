import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieValues = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieValues.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

import { getActiveLocale } from './active-locale';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES } from './locales';

describe('getActiveLocale', () => {
  beforeEach(() => {
    cookieValues.clear();
  });

  it('uses the locale cookie when it holds a supported locale', async () => {
    for (const locale of LOCALES) {
      cookieValues.set(LOCALE_COOKIE, locale);
      await expect(getActiveLocale()).resolves.toBe(locale);
    }
  });

  it('falls back to the default locale without a locale cookie', async () => {
    await expect(getActiveLocale()).resolves.toBe(DEFAULT_LOCALE);
  });

  it('falls back to the default locale for an unsupported cookie value', async () => {
    cookieValues.set(LOCALE_COOKIE, 'de');
    await expect(getActiveLocale()).resolves.toBe(DEFAULT_LOCALE);
  });
});
