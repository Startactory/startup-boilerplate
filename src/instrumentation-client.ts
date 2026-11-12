import { analytics, setAnalyticsDebug } from '@/lib/analytics';
import { readConsentFromCookieString } from '@/lib/consent';

setAnalyticsDebug(process.env.NODE_ENV === 'development');

if (readConsentFromCookieString(document.cookie) === 'granted') {
  analytics.start();
}
