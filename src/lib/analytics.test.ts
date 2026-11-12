import { describe, expect, it, vi } from 'vitest';
import { createAnalytics } from '@/lib/analytics';

function fakeClient() {
  const client = {
    __loaded: false,
    init: vi.fn(() => {
      client.__loaded = true;
    }),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    reset: vi.fn(),
  };
  return client;
}

const host = 'https://eu.i.posthog.com';

describe('createAnalytics', () => {
  it('initializes only once when started twice', () => {
    const client = fakeClient();
    const analytics = createAnalytics({ client, key: 'phc_test', host });
    analytics.start();
    analytics.start();
    expect(client.init).toHaveBeenCalledTimes(1);
  });

  it('never initializes without a key', () => {
    const client = fakeClient();
    const analytics = createAnalytics({ client, key: undefined, host });
    analytics.start();
    expect(client.init).not.toHaveBeenCalled();
  });

  it('opts out and resets on stop', () => {
    const client = fakeClient();
    const analytics = createAnalytics({ client, key: 'phc_test', host });
    analytics.start();
    analytics.stop();
    expect(client.opt_out_capturing).toHaveBeenCalledTimes(1);
    expect(client.reset).toHaveBeenCalledTimes(1);
  });

  it('opts back in when started after stop', () => {
    const client = fakeClient();
    const analytics = createAnalytics({ client, key: 'phc_test', host });
    analytics.start();
    analytics.stop();
    analytics.start();
    expect(client.init).toHaveBeenCalledTimes(1);
    expect(client.opt_in_capturing).toHaveBeenCalledTimes(1);
  });

  it('does nothing on stop when never started', () => {
    const client = fakeClient();
    const analytics = createAnalytics({ client, key: 'phc_test', host });
    analytics.stop();
    expect(client.opt_out_capturing).not.toHaveBeenCalled();
  });
});
