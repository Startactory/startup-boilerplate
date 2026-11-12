import { NextResponse } from 'next/server';
import { acceptTerms } from '@/application/billing/accept-terms';
import { requireAuthedRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';

export async function POST(): Promise<Response> {
  const guard = await requireAuthedRoute({
    rateLimit: 'default',
    event: 'api.billing.accept_terms',
  });
  if (!guard.ok) return guard.response;

  const result = await acceptTerms();
  if (result.isErr()) return jsonError(result.error);

  return NextResponse.json({ termsVersion: result.value.termsVersion });
}
