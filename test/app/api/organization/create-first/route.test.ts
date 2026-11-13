import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/application/rate-limit/apply-rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

vi.mock('@/application/organization/create-first-organization', () => ({
  createFirstOrganization: vi.fn(),
}));

vi.mock('@/i18n/active-locale', () => ({
  getActiveLocale: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from '@/app/api/organization/create-first/route';
import { getCurrentUser } from '@/application/me/get-current-user';
import { createFirstOrganization } from '@/application/organization/create-first-organization';
import { applyRateLimit } from '@/application/rate-limit/apply-rate-limit';
import { unauthorized } from '@/core/errors';
import { getActiveLocale } from '@/i18n/active-locale';

const mockedUser = vi.mocked(getCurrentUser);
const mockedRateLimit = vi.mocked(applyRateLimit);
const mockedCreateFirst = vi.mocked(createFirstOrganization);
const mockedActiveLocale = vi.mocked(getActiveLocale);

function request(body: unknown): Request {
  return new Request('http://localhost/api/organization/create-first', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { organizationName: 'Acme' };

beforeEach(() => {
  vi.clearAllMocks();
  mockedUser.mockResolvedValue(
    ok({
      id: 'user-1',
      organizationId: null,
      sessionId: 'session-1',
    }) as unknown as Awaited<ReturnType<typeof getCurrentUser>>,
  );
  mockedRateLimit.mockResolvedValue({
    success: true,
    reset: 0,
  } as unknown as Awaited<ReturnType<typeof applyRateLimit>>);
  mockedCreateFirst.mockResolvedValue({
    success: true,
    organizationId: 'org-1',
  });
  mockedActiveLocale.mockResolvedValue('en');
});

describe('POST /api/organization/create-first', () => {
  it('returns 200 and the organization id on success', async () => {
    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      organizationId: 'org-1',
    });
    expect(mockedCreateFirst).toHaveBeenCalledWith({
      ...VALID_BODY,
      locale: 'en',
    });
  });

  it('creates the organization in the request locale', async () => {
    mockedActiveLocale.mockResolvedValue('fr');

    await POST(request(VALID_BODY));

    expect(mockedCreateFirst).toHaveBeenCalledWith({
      ...VALID_BODY,
      locale: 'fr',
    });
  });

  it('returns 401 without creating an organization when unauthenticated', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('nope')));

    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(401);
    expect(mockedCreateFirst).not.toHaveBeenCalled();
  });

  it('returns 429 without creating an organization when rate limited', async () => {
    mockedRateLimit.mockResolvedValue({
      success: false,
      reset: 123,
    } as unknown as Awaited<ReturnType<typeof applyRateLimit>>);

    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(429);
    expect(mockedCreateFirst).not.toHaveBeenCalled();
  });

  it('rejects a malformed body before creating an organization', async () => {
    const res = await POST(request({ organizationName: 123 }));

    expect(res.status).toBe(400);
    expect(mockedCreateFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid_input', 400],
    ['already_in_org', 409],
    ['unauthenticated', 401],
    ['unknown', 500],
  ] as const)('maps the %s outcome to HTTP %i', async (reason, status) => {
    mockedCreateFirst.mockResolvedValue({ success: false, error: reason });

    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: reason,
    });
  });
});
