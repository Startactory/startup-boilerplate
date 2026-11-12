import type { Analytics } from '@/lib/analytics';
import type { Consent } from '@/lib/consent';

export function createConsentSync({
  read,
  analytics,
  initial,
}: {
  read: () => Consent;
  analytics: Analytics;
  initial?: Consent;
}): () => void {
  let applied: Consent | null = initial ?? null;

  return function sync(): void {
    const current = read();
    if (current === applied) return;
    applied = current;
    if (current === 'granted') analytics.start();
    else analytics.stop();
  };
}
