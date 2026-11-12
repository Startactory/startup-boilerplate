import { analytics } from '@/lib/analytics';
import { readConsentFromCookieString } from '@/lib/consent';

if (readConsentFromCookieString(document.cookie) === 'granted') {
  analytics.start();
}
