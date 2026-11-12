// @vitest-environment jsdom
import posthog from 'posthog-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnalytics } from '@/lib/analytics';

function posthogCookies(): string[] {
  return document.cookie.split(';').filter((c) => c.includes('_posthog'));
}

function buildAnalytics() {
  return createAnalytics({
    client: posthog,
    key: 'phc_test_token',
    host: 'http://127.0.0.1:1',
    isDebug: () => false,
  });
}

function clearBrowserState(): void {
  localStorage.clear();
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

function simulateReload(): void {
  (posthog as { __loaded: boolean }).__loaded = false;
}

describe('createAnalytics with the real posthog-js', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}'))),
    );
    clearBrowserState();
    simulateReload();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops capturing and leaves no PostHog cookie after Accept then Refuse', () => {
    const analytics = buildAnalytics();
    analytics.start();
    expect(posthog.is_capturing()).toBe(true);

    analytics.stop();

    expect(posthog.is_capturing()).toBe(false);
    expect(posthogCookies()).toEqual([]);
  });

  it('stays off after a reload where consent is still denied', () => {
    const analytics = buildAnalytics();
    analytics.start();
    analytics.stop();

    simulateReload();

    expect(posthogCookies()).toEqual([]);
    expect(posthog.has_opted_out_capturing()).toBe(true);
  });

  it('captures again after Refuse then Accept', () => {
    const analytics = buildAnalytics();
    analytics.start();
    analytics.stop();
    analytics.start();

    expect(posthog.is_capturing()).toBe(true);
  });

  it('captures after a reload where consent was granted following a refusal', () => {
    const analytics = buildAnalytics();
    analytics.start();
    analytics.stop();

    simulateReload();
    buildAnalytics().start();

    expect(posthog.is_capturing()).toBe(true);
  });
});
