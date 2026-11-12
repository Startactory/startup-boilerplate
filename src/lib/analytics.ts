import posthog from 'posthog-js';

type AnalyticsClient = {
  __loaded: boolean;
  init: (key: string, options: Record<string, unknown>) => unknown;
  opt_in_capturing: () => void;
  opt_out_capturing: () => void;
  reset: () => void;
};

export type Analytics = { start(): void; stop(): void };

export function createAnalytics({
  client,
  key,
  host,
}: {
  client: AnalyticsClient;
  key: string | undefined;
  host: string;
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
        debug: process.env.NODE_ENV === 'development',
      });
    },
    stop(): void {
      if (!client.__loaded) return;
      client.opt_out_capturing();
      client.reset();
    },
  };
}

export const analytics = createAnalytics({
  client: posthog,
  key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
});
