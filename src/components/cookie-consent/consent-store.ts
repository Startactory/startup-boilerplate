'use client';

import { useSyncExternalStore } from 'react';
import { analytics } from '@/lib/analytics';
import {
  type Consent,
  readConsentFromCookieString,
  serializeConsentCookie,
} from '@/lib/consent';

const listeners = new Set<() => void>();
let preferencesOpen = false;

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readConsent(): Consent {
  return readConsentFromCookieString(document.cookie);
}

export function setConsent(choice: 'granted' | 'denied'): void {
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is not available in all supported browsers
  document.cookie = serializeConsentCookie(choice, {
    secure: window.location.protocol === 'https:',
  });
  if (choice === 'granted') analytics.start();
  else analytics.stop();
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
