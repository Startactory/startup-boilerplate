import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { getCurrentUser } from '@/application/me/get-current-user';
import {
  type CreateFirstOrganizationResult,
  createFirstOrganization,
} from '@/application/organization/create-first-organization';
import { applyRateLimit } from '@/application/rate-limit/apply-rate-limit';
import { unauthorized } from '@/core/errors';
import { getActiveLocale } from '@/i18n/active-locale';
import { parseJsonBody } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

const BodySchema = v.object({
  organizationName: v.string(),
});

const ERROR_STATUS: Record<
  Extract<CreateFirstOrganizationResult, { success: false }>['error'],
  number
> = {
  unauthenticated: 401,
  already_in_org: 409,
  invalid_input: 400,
  unknown: 500,
};

export async function POST(req: Request): Promise<Response> {
  // The user has no organization yet, so the standard authed-route guard
  // (which requires one) cannot be used here.
  const me = await getCurrentUser();
  if (me.isErr()) return jsonError(unauthorized(me.error.message));

  const rate = await applyRateLimit({
    identifier: `organization:create_first:${me.value.id}`,
    limit: 'default',
  });
  if (!rate.success) {
    log.warn('api.organization.create_first.rate_limited', {
      userId: me.value.id,
      reset: rate.reset,
    });
    return NextResponse.json(
      { error: 'rate_limited', reset: rate.reset },
      { status: 429 },
    );
  }

  const body = await parseJsonBody(req, BodySchema);
  if (!body.ok) return body.response;

  const locale = await getActiveLocale();
  log.info('api.organization.create_first.request', {
    userId: me.value.id,
    locale,
  });

  const result = await createFirstOrganization({ ...body.value, locale });
  if (!result.success) {
    log.warn('api.organization.create_first.failure', {
      userId: me.value.id,
      reason: result.error,
    });
    return NextResponse.json(result, { status: ERROR_STATUS[result.error] });
  }

  log.info('api.organization.create_first.success', {
    userId: me.value.id,
    organizationId: result.organizationId,
  });
  return NextResponse.json(result);
}
