'use server';

import { cookies } from 'next/headers';
import {
  DEV_PAYWALL_SKIP_COOKIE,
  DEV_PAYWALL_SKIP_VALUE,
} from '@/core/billing/types/entitlement';
import { env } from '@/shared/env';

// Dev-only: drop the paywall-skip cookie so the entitlement gate lets this
// browser through. Refuses in production so the escape hatch can never ship live
// (the button that calls this is also hidden in production).
export async function setDevPaywallSkip(): Promise<{ success: boolean }> {
  if (env().VERCEL_ENV === 'production') return { success: false };

  const cookieStore = await cookies();
  cookieStore.set(DEV_PAYWALL_SKIP_COOKIE, DEV_PAYWALL_SKIP_VALUE, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return { success: true };
}
