import { describe, expect, it } from 'vitest';
import { getStartupProfile } from './startup-profile';

describe('getStartupProfile', () => {
  it('returns the neutral committed profile', () => {
    const profile = getStartupProfile();
    expect(profile.name).toBe('');
    expect(profile.legal.company).toBeNull();
    expect(profile.brand.accent).toBe('#2f3130');
  });
});
