import { NextResponse } from 'next/server';
import type { BaseIssue, BaseSchema } from 'valibot';
import * as v from 'valibot';
import { getCurrentUser } from '@/application/me/get-current-user';
import {
  applyRateLimit,
  type RateLimitBucket,
} from '@/application/rate-limit/apply-rate-limit';
import { forbidden, unauthorized, validation } from '@/core/errors';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export type AuthedRouteContext = {
  userId: string;
  organizationId: string;
};

export type SignedInRouteContext = {
  userId: string;
};

type GuardResult<TContext> =
  | { ok: true; ctx: TContext }
  | { ok: false; response: Response };

async function rateLimitedResponse(args: {
  identifier: string;
  rateLimit: RateLimitBucket;
  event: string;
  logContext: Record<string, string>;
}): Promise<Response | null> {
  const rl = await applyRateLimit({
    identifier: args.identifier,
    limit: args.rateLimit,
  });
  if (rl.success) return null;
  log.warn(`${args.event}.rate_limited`, {
    ...args.logContext,
    reset: rl.reset,
  });
  return NextResponse.json(
    { error: 'rate_limited', reset: rl.reset },
    { status: 429 },
  );
}

export async function requireAuthedRoute(args: {
  rateLimit: RateLimitBucket;
  event: string;
}): Promise<GuardResult<AuthedRouteContext>> {
  const me = await getCurrentUser();
  if (me.isErr()) {
    return { ok: false, response: jsonError(unauthorized(me.error.message)) };
  }
  if (!me.value.organizationId) {
    return {
      ok: false,
      response: jsonError(forbidden('Organization required')),
    };
  }
  const limited = await rateLimitedResponse({
    identifier: `${me.value.organizationId}:${me.value.id}`,
    rateLimit: args.rateLimit,
    event: args.event,
    logContext: {
      organizationId: me.value.organizationId,
      userId: me.value.id,
    },
  });
  if (limited) return { ok: false, response: limited };
  return {
    ok: true,
    ctx: { userId: me.value.id, organizationId: me.value.organizationId },
  };
}

export async function requireSignedInRoute(args: {
  rateLimit: RateLimitBucket;
  event: string;
}): Promise<GuardResult<SignedInRouteContext>> {
  const me = await getCurrentUser();
  if (me.isErr()) {
    return { ok: false, response: jsonError(unauthorized(me.error.message)) };
  }
  const limited = await rateLimitedResponse({
    identifier: `user:${me.value.id}`,
    rateLimit: args.rateLimit,
    event: args.event,
    logContext: { userId: me.value.id },
  });
  if (limited) return { ok: false, response: limited };
  return { ok: true, ctx: { userId: me.value.id } };
}

export async function parseJsonBody<
  TSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
>(
  req: Request,
  schema: TSchema,
): Promise<
  | { ok: true; value: v.InferOutput<TSchema> }
  | { ok: false; response: Response }
> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      response: jsonError(validation('Request body is not valid JSON')),
    };
  }
  const parsed = v.safeParse(schema, body);
  if (!parsed.success) {
    const first = parsed.issues[0];
    return {
      ok: false,
      response: jsonError(
        validation(
          first?.message ?? 'Invalid request body',
          String(first?.path?.[0]?.key ?? ''),
        ),
      ),
    };
  }
  return { ok: true, value: parsed.output };
}
