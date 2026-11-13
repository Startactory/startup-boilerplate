import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { deleteAccount } from '@/application/me/delete-account';
import { validation } from '@/core/errors';
import { auth } from '@/infra/auth/auth';
import { parseJsonBody, requireSignedInRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

const EVENT = 'api.me.delete';

const BodySchema = v.object({
  confirmationEmail: v.string(),
});

// why: a JSON content type forces a CORS preflight, so a cross-site form cannot trigger this
function isJsonRequest(req: Request): boolean {
  return (
    req.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json') ?? false
  );
}

async function appendSessionCookieClearing(args: {
  req: Request;
  response: NextResponse;
  userId: string;
}): Promise<void> {
  try {
    const signedOut = await auth.api.signOut({
      headers: args.req.headers,
      returnHeaders: true,
    });
    for (const cookie of signedOut.headers.getSetCookie()) {
      args.response.headers.append('set-cookie', cookie);
    }
  } catch (e) {
    // why: the sessions are already deleted, so a leftover cookie no longer authenticates
    log.warn(`${EVENT}.sign_out_failed`, {
      userId: args.userId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!isJsonRequest(req)) {
    return jsonError(validation('Expected an application/json request body'));
  }

  const guard = await requireSignedInRoute({
    rateLimit: 'default',
    event: EVENT,
  });
  if (!guard.ok) return guard.response;

  const body = await parseJsonBody(req, BodySchema);
  if (!body.ok) return body.response;

  const result = await deleteAccount({
    confirmationEmail: body.value.confirmationEmail,
  });
  if (result.isErr()) {
    log.warn(`${EVENT}.failure`, {
      userId: guard.ctx.userId,
      reason: result.error.code,
    });
    return jsonError(result.error);
  }

  const response = NextResponse.json({ success: true });
  await appendSessionCookieClearing({
    req,
    response,
    userId: guard.ctx.userId,
  });
  log.info(`${EVENT}.success`, { userId: guard.ctx.userId });
  return response;
}
