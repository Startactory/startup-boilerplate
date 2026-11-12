import { describe, expect, it, vi } from 'vitest';
import type { Consent } from '@/lib/consent';
import { createConsentSync } from '@/lib/consent-sync';

function setup(initial: Consent) {
  let stored = initial;
  const analytics = { start: vi.fn(), stop: vi.fn() };
  const sync = createConsentSync({ read: () => stored, analytics });
  return {
    analytics,
    sync,
    setStored: (value: Consent) => {
      stored = value;
    },
  };
}

describe('createConsentSync', () => {
  it('starts analytics when consent becomes granted', () => {
    const { analytics, sync, setStored } = setup('unset');
    sync();
    setStored('granted');
    sync();
    expect(analytics.start).toHaveBeenCalledTimes(1);
  });

  it('stops analytics when consent is refused in another tab', () => {
    const { analytics, sync, setStored } = setup('granted');
    sync();
    setStored('denied');
    sync();
    expect(analytics.stop).toHaveBeenCalledTimes(1);
  });

  it('stops analytics when the consent cookie disappears', () => {
    const { analytics, sync, setStored } = setup('granted');
    sync();
    setStored('unset');
    sync();
    expect(analytics.stop).toHaveBeenCalledTimes(1);
  });

  it('does nothing when consent did not change', () => {
    const { analytics, sync } = setup('granted');
    sync();
    sync();
    sync();
    expect(analytics.start).toHaveBeenCalledTimes(1);
    expect(analytics.stop).not.toHaveBeenCalled();
  });

  it('does nothing on the first sync when seeded with the consent at load', () => {
    const analytics = { start: vi.fn(), stop: vi.fn() };
    const sync = createConsentSync({
      read: () => 'granted',
      analytics,
      initial: 'granted',
    });
    sync();
    expect(analytics.start).not.toHaveBeenCalled();
    expect(analytics.stop).not.toHaveBeenCalled();
  });
});
