export const CONSENT_COOKIE = 'cookie_consent';
export const CONSENT_MAX_AGE_SECONDS = 15552000;

export type Consent = 'granted' | 'denied' | 'unset';

export function parseConsent(raw: string | undefined): Consent {
  return raw === 'granted' || raw === 'denied' ? raw : 'unset';
}

export function serializeConsentCookie(
  choice: 'granted' | 'denied',
  { secure }: { secure: boolean },
): string {
  const parts = [
    `${CONSENT_COOKIE}=${choice}`,
    'Path=/',
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function readConsentFromCookieString(cookieString: string): Consent {
  const prefix = `${CONSENT_COOKIE}=`;
  const entry = cookieString
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return parseConsent(entry?.slice(prefix.length));
}
