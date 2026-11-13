import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/application/rate-limit/apply-rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

vi.mock('@/application/me/delete-account', () => ({
  deleteAccount: vi.fn(),
}));

vi.mock('@/infra/auth/auth', () => ({
  auth: { api: { signOut: vi.fn() } },
}));

vi.mock('@/shared/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from '@/app/api/me/delete/route';
import { deleteAccount } from '@/application/me/delete-account';
import { getCurrentUser } from '@/application/me/get-current-user';
import { applyRateLimit } from '@/application/rate-limit/apply-rate-limit';
import { conflict, externalApi, unauthorized, validation } from '@/core/errors';
import { auth } from '@/infra/auth/auth';

const mockedUser = vi.mocked(getCurrentUser);
const mockedRateLimit = vi.mocked(applyRateLimit);
const mockedDelete = vi.mocked(deleteAccount);
const mockedSignOut = vi.mocked(auth.api.signOut);

const CLEARED_COOKIE =
  'better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax';

function request(
  body: unknown,
  contentType: string | null = 'application/json',
): Request {
  const headers = new Headers();
  if (contentType) headers.set('content-type', contentType);
  return new Request('http://localhost/api/me/delete', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const VALID_BODY = { confirmationEmail: 'ada@example.com' };

beforeEach(() => {
  vi.clearAllMocks();
  mockedUser.mockResolvedValue(
    ok({
      id: 'user-1',
      organizationId: 'org-1',
      sessionId: 'session-1',
    }) as unknown as Awaited<ReturnType<typeof getCurrentUser>>,
  );
  mockedRateLimit.mockResolvedValue({
    success: true,
    reset: 0,
  } as unknown as Awaited<ReturnType<typeof applyRateLimit>>);
  mockedDelete.mockResolvedValue(
    ok({ deletedOrganizationCount: 1, leftOrganizationCount: 0 }),
  );
  mockedSignOut.mockResolvedValue({
    headers: new Headers({ 'set-cookie': CLEARED_COOKIE }),
    response: { success: true },
  } as never);
});

describe('POST /api/me/delete', () => {
  it('deletes the account and clears the session cookie', async () => {
    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mockedDelete).toHaveBeenCalledWith(VALID_BODY);
    expect(res.headers.get('set-cookie')).toContain(
      'better-auth.session_token=;',
    );
    expect(mockedDelete.mock.invocationCallOrder[0]).toBeLessThan(
      mockedSignOut.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('still succeeds when clearing the cookie fails, since the sessions are gone', async () => {
    mockedSignOut.mockRejectedValue(new Error('no session'));

    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(200);
  });

  it.each([
    ['text/plain', 'text/plain'],
    ['a missing content type', null],
  ])('rejects %s before touching the account', async (_label, contentType) => {
    const res = await POST(request(VALID_BODY, contentType));

    expect(res.status).toBe(400);
    expect(mockedUser).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('returns 401 without deleting when signed out', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('nope')));

    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(401);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('returns 429 without deleting when rate limited', async () => {
    mockedRateLimit.mockResolvedValue({
      success: false,
      reset: 123,
    } as unknown as Awaited<ReturnType<typeof applyRateLimit>>);

    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(429);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it.each([
    ['a malformed JSON body', 'not json'],
    ['a missing confirmation', {}],
    ['a non-string confirmation', { confirmationEmail: 42 }],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await POST(request(body));

    expect(res.status).toBe(400);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a confirmation mismatch',
      400,
      validation('mismatch', 'confirmationEmail'),
    ],
    ['an owner of a shared organization', 409, conflict('transfer first')],
    ['a billing failure', 502, externalApi('autumn', 'down')],
  ])('maps %s to HTTP %i without clearing the session', async (_label, status, error) => {
    mockedDelete.mockResolvedValue(err(error));

    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toMatchObject({ error: error.code });
    expect(mockedSignOut).not.toHaveBeenCalled();
  });
});
