import posthog from 'posthog-js';

type AnalyticsClient = {
  __loaded: boolean;
  init: (key: string, options: Record<string, unknown>) => unknown;
  has_opted_out_capturing: () => boolean;
  opt_in_capturing: () => void;
  opt_out_capturing: () => void;
  reset: () => void;
};

export type Analytics = { start(): void; stop(): void };

export function createAnalytics({
  client,
  key,
  host,
  isDebug,
}: {
  client: AnalyticsClient;
  key: string | undefined;
  host: string;
  isDebug: () => boolean;
}): Analytics {
  return {
    start(): void {
      if (!key) return;
      if (client.__loaded) {
        client.opt_in_capturing();
        return;
      }
      client.init(key, {
        api_host: host,
        defaults: '2025-05-24',
        capture_exceptions: true,
        debug: isDebug(),
        opt_out_persistence_by_default: true,
        advanced_disable_feature_flags: true,
      });
      if (client.has_opted_out_capturing()) client.opt_in_capturing();
    },
    stop(): void {
      if (!client.__loaded) return;
      // reset() clears the stored opt-out flag, so it must run before opting out
      client.reset();
      client.opt_out_capturing();
    },
  };
}

let debugEnabled = false;

export function setAnalyticsDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

export const analytics = createAnalytics({
  client: posthog,
  key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
  isDebug: () => debugEnabled,
});
