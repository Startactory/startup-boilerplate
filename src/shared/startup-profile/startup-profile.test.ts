import { afterEach, describe, expect, it, vi } from 'vitest';
import profileJson from './profile.json';
import { getStartupProfile } from './startup-profile';

describe('getStartupProfile', () => {
  it('returns the committed profile.json content', () => {
    expect(getStartupProfile()).toEqual(profileJson);
  });

  describe('with an unsupported default locale', () => {
    afterEach(() => {
      vi.doUnmock('./profile.json');
      vi.resetModules();
    });

    it('rejects the profile', async () => {
      vi.resetModules();
      vi.doMock('./profile.json', () => ({
        default: { ...profileJson, defaultLocale: 'de' },
      }));
      const startupProfile = await import('./startup-profile');

      expect(() => startupProfile.getStartupProfile()).toThrow();
    });
  });
});
