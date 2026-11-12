import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({ LOG_LEVEL: 'silent' }),
}));

vi.mock('@/application/me/organization-scope', () => ({
  requireOrganizationScope: vi.fn(),
}));

vi.mock('@/infra/data-access/billing/terms-acceptance-repo', () => ({
  recordTermsAcceptance: vi.fn(),
}));

vi.mock('@/shared/startup-profile/startup-profile', () => ({
  getStartupProfile: () => ({ legal: { termsVersion: '2026-11-12' } }),
}));

import { requireOrganizationScope } from '@/application/me/organization-scope';
import { unauthorized, unknown } from '@/core/errors';
import { recordTermsAcceptance } from '@/infra/data-access/billing/terms-acceptance-repo';
import { acceptTerms } from './accept-terms';

const mockedScope = vi.mocked(requireOrganizationScope);
const mockedRecord = vi.mocked(recordTermsAcceptance);

describe('acceptTerms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedScope.mockResolvedValue(
      ok({ userId: 'user-1', organizationId: 'org-1' }),
    );
    mockedRecord.mockResolvedValue(ok(undefined));
  });

  it('records the profile terms version for the current user and organization', async () => {
    const result = await acceptTerms();

    expect(result._unsafeUnwrap()).toEqual({ termsVersion: '2026-11-12' });
    expect(mockedRecord).toHaveBeenCalledWith({
      id: expect.any(String),
      userId: 'user-1',
      organizationId: 'org-1',
      termsVersion: '2026-11-12',
    });
  });

  it('returns the error and records nothing when signed out', async () => {
    mockedScope.mockResolvedValue(err(unauthorized()));

    const result = await acceptTerms();

    expect(result._unsafeUnwrapErr().code).toBe('unauthorized');
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it('propagates a repository error', async () => {
    mockedRecord.mockResolvedValue(err(unknown('db down')));

    const result = await acceptTerms();

    expect(result._unsafeUnwrapErr()).toEqual(unknown('db down'));
  });
});
