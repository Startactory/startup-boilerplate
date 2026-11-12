import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/application/rate-limit/apply-rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

vi.mock('@/application/billing/accept-terms', () => ({
  acceptTerms: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from '@/app/api/billing/accept-terms/route';
import { acceptTerms } from '@/application/billing/accept-terms';
import { getCurrentUser } from '@/application/me/get-current-user';
import { applyRateLimit } from '@/application/rate-limit/apply-rate-limit';
import { unauthorized, unknown } from '@/core/errors';

const mockedUser = vi.mocked(getCurrentUser);
const mockedRateLimit = vi.mocked(applyRateLimit);
const mockedAcceptTerms = vi.mocked(acceptTerms);

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
  mockedAcceptTerms.mockResolvedValue(ok({ termsVersion: '2026-11-12' }));
});

describe('POST /api/billing/accept-terms', () => {
  it('returns 200 with the accepted terms version', async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ termsVersion: '2026-11-12' });
  });

  it('returns 401 without recording when signed out', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('nope')));

    const res = await POST();

    expect(res.status).toBe(401);
    expect(mockedAcceptTerms).not.toHaveBeenCalled();
  });

  it('returns 500 when the use case fails', async () => {
    mockedAcceptTerms.mockResolvedValue(err(unknown('db down')));

    const res = await POST();

    expect(res.status).toBe(500);
  });
});
