import type { Analytics } from '@/lib/analytics';
import type { Consent } from '@/lib/consent';

export function createConsentSync({
  read,
  analytics,
}: {
  read: () => Consent;
  analytics: Analytics;
}): () => void {
  let applied: Consent | null = null;

  return function sync(): void {
    const current = read();
    if (current === applied) return;
    applied = current;
    if (current === 'granted') analytics.start();
    else analytics.stop();
  };
}
