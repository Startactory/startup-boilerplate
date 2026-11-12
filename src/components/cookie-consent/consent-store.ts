'use client';

import { useSyncExternalStore } from 'react';
import { analytics } from '@/lib/analytics';
import {
  type Consent,
  readConsentFromCookieString,
  serializeConsentCookie,
} from '@/lib/consent';
import { createConsentSync } from '@/lib/consent-sync';

const listeners = new Set<() => void>();
let preferencesOpen = false;

function notify(): void {
  for (const listener of listeners) listener();
}

function readConsent(): Consent {
  return readConsentFromCookieString(document.cookie);
}

// Consent at load is already applied by instrumentation-client, so it seeds the sync.
const syncAnalyticsWithConsent = createConsentSync({
  read: readConsent,
  analytics,
  initial: typeof document === 'undefined' ? undefined : readConsent(),
});

// Cookie changes fire no event, so a choice made in another tab is picked up when this tab regains attention.
function handleRegainedAttention(): void {
  if (document.visibilityState === 'hidden') return;
  syncAnalyticsWithConsent();
  notify();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener('focus', handleRegainedAttention);
    document.addEventListener('visibilitychange', handleRegainedAttention);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('focus', handleRegainedAttention);
      document.removeEventListener('visibilitychange', handleRegainedAttention);
    }
  };
}

export function setConsent(choice: 'granted' | 'denied'): void {
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is not available in all supported browsers
  document.cookie = serializeConsentCookie(choice, {
    secure: window.location.protocol === 'https:',
  });
  syncAnalyticsWithConsent();
  notify();
}

export function openCookiePreferences(): void {
  preferencesOpen = true;
  notify();
}

export function closeCookiePreferences(): void {
  preferencesOpen = false;
  notify();
}

// The server cannot read the cookie; reporting a decided state keeps the banner out of the SSR HTML.
export function useConsent(): Consent {
  return useSyncExternalStore(subscribe, readConsent, () => 'denied');
}

export function useCookiePreferencesOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => preferencesOpen,
    () => false,
  );
}
