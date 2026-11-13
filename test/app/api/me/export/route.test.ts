import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/application/rate-limit/apply-rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

vi.mock('@/application/me/export-personal-data', () => ({
  exportPersonalData: vi.fn(),
}));

vi.mock('@/shared/startup-profile/startup-profile', () => ({
  getStartupProfile: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from '@/app/api/me/export/route';
import type { PersonalDataExportDto } from '@/application/me/dto';
import { exportPersonalData } from '@/application/me/export-personal-data';
import { getCurrentUser } from '@/application/me/get-current-user';
import { applyRateLimit } from '@/application/rate-limit/apply-rate-limit';
import { unauthorized, unknown } from '@/core/errors';
import { getStartupProfile } from '@/shared/startup-profile/startup-profile';

const mockedUser = vi.mocked(getCurrentUser);
const mockedRateLimit = vi.mocked(applyRateLimit);
const mockedExport = vi.mocked(exportPersonalData);
const mockedProfile = vi.mocked(getStartupProfile);

const EXPORT: PersonalDataExportDto = {
  exportedAt: '2026-11-12T09:30:00.000Z',
  profile: {
    id: 'user-1',
    name: 'Ada Lovelace',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    emailVerified: true,
    image: null,
    locale: 'en',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  linkedAccounts: [],
  sessions: [],
  organizationMemberships: [],
  invitations: { sent: [], received: [] },
  termsAcceptances: [],
};

function profileNamed(name: string): ReturnType<typeof getStartupProfile> {
  return { name } as ReturnType<typeof getStartupProfile>;
}

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
  mockedExport.mockResolvedValue(ok(EXPORT));
  mockedProfile.mockReturnValue(profileNamed('Café Atelier'));
});

describe('GET /api/me/export', () => {
  it('returns the export as a JSON attachment named after the app and the date', async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="cafe-atelier-data-export-2026-11-12.json"',
    );
    expect(res.headers.get('cache-control')).toBe('no-store');
    await expect(res.json()).resolves.toEqual(EXPORT);
  });

  it('falls back to a generic file name when the app has no name yet', async () => {
    mockedProfile.mockReturnValue(profileNamed(''));

    const res = await GET();

    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="data-export-2026-11-12.json"',
    );
  });

  it('works for a signed-in user without an organization', async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(mockedRateLimit).toHaveBeenCalledWith({
      identifier: 'user:user-1',
      limit: 'default',
    });
  });

  it('returns 401 without exporting when signed out', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('nope')));

    const res = await GET();

    expect(res.status).toBe(401);
    expect(mockedExport).not.toHaveBeenCalled();
  });

  it('returns 429 without exporting when rate limited', async () => {
    mockedRateLimit.mockResolvedValue({
      success: false,
      reset: 123,
    } as unknown as Awaited<ReturnType<typeof applyRateLimit>>);

    const res = await GET();

    expect(res.status).toBe(429);
    expect(mockedExport).not.toHaveBeenCalled();
  });

  it('returns 500 when the export fails', async () => {
    mockedExport.mockResolvedValue(err(unknown('db down')));

    const res = await GET();

    expect(res.status).toBe(500);
    expect(res.headers.get('content-disposition')).toBeNull();
  });
});
