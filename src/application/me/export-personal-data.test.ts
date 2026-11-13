import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/infra/data-access/auth/user-data-repo', () => ({
  getUserProfile: vi.fn(),
  listLinkedAccountsForUser: vi.fn(),
  listSessionsForUser: vi.fn(),
}));

vi.mock('@/application/organization/list-user-memberships', () => ({
  listUserMemberships: vi.fn(),
}));

vi.mock('@/application/organization/list-user-invitations', () => ({
  listUserInvitations: vi.fn(),
}));

vi.mock('@/application/billing/list-terms-acceptances-for-user', () => ({
  listTermsAcceptancesForUser: vi.fn(),
}));

import { listTermsAcceptancesForUser } from '@/application/billing/list-terms-acceptances-for-user';
import { getCurrentUser } from '@/application/me/get-current-user';
import { listUserInvitations } from '@/application/organization/list-user-invitations';
import { listUserMemberships } from '@/application/organization/list-user-memberships';
import { unauthorized, unknown } from '@/core/errors';
import {
  getUserProfile,
  listLinkedAccountsForUser,
  listSessionsForUser,
} from '@/infra/data-access/auth/user-data-repo';
import { exportPersonalData } from './export-personal-data';

const USER_ID = 'user-1';
const EMAIL = 'ada@example.com';

const PROFILE = {
  id: USER_ID,
  name: 'Ada Lovelace',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: EMAIL,
  emailVerified: true,
  image: null,
  locale: 'en',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(
    ok({ id: USER_ID, email: EMAIL } as never),
  );
  vi.mocked(getUserProfile).mockResolvedValue(ok(PROFILE));
  vi.mocked(listLinkedAccountsForUser).mockResolvedValue(
    ok([
      {
        providerId: 'google',
        accountId: 'google-sub-1',
        linkedAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
  );
  vi.mocked(listSessionsForUser).mockResolvedValue(
    ok([
      {
        createdAt: '2026-03-01T00:00:00.000Z',
        expiresAt: '2026-03-08T00:00:00.000Z',
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
      },
    ]),
  );
  vi.mocked(listUserMemberships).mockResolvedValue(
    ok([
      {
        organizationId: 'org-1',
        organizationName: 'Acme',
        role: 'owner',
        joinedAt: '2026-01-02T00:00:00.000Z',
        otherMemberRoles: ['member'],
      },
    ]),
  );
  vi.mocked(listUserInvitations).mockResolvedValue(
    ok({
      sent: [
        {
          id: 'inv-1',
          organizationId: 'org-1',
          organizationName: 'Acme',
          email: 'grace@example.com',
          role: 'member',
          status: 'pending',
          expiresAt: '2026-03-10T00:00:00.000Z',
          createdAt: '2026-03-03T00:00:00.000Z',
        },
      ],
      received: [],
    }),
  );
  vi.mocked(listTermsAcceptancesForUser).mockResolvedValue(
    ok([
      {
        organizationId: 'org-1',
        termsVersion: '2026-01-01',
        acceptedAt: '2026-01-03T00:00:00.000Z',
      },
    ]),
  );
});

describe('exportPersonalData', () => {
  it('gathers every section of the signed-in user personal data', async () => {
    const result = await exportPersonalData();

    const exported = result._unsafeUnwrap();
    expect(exported.profile).toEqual(PROFILE);
    expect(exported.linkedAccounts).toEqual([
      {
        providerId: 'google',
        accountId: 'google-sub-1',
        linkedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(exported.sessions).toHaveLength(1);
    expect(exported.organizationMemberships).toEqual([
      {
        organizationId: 'org-1',
        organizationName: 'Acme',
        role: 'owner',
        joinedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    expect(exported.invitations.sent).toHaveLength(1);
    expect(exported.termsAcceptances).toHaveLength(1);
    expect(Number.isNaN(Date.parse(exported.exportedAt))).toBe(false);
    expect(listUserInvitations).toHaveBeenCalledWith({
      userId: USER_ID,
      email: EMAIL,
    });
  });

  it('contains no tokens, secrets or other members data', async () => {
    const result = await exportPersonalData();

    const serialized = JSON.stringify(result._unsafeUnwrap());
    for (const forbidden of [
      'token',
      'accessToken',
      'refreshToken',
      'idToken',
      'password',
      'otherMemberRoles',
    ]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it('returns the authentication error when signed out', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(err(unauthorized('no')));

    const result = await exportPersonalData();

    expect(result._unsafeUnwrapErr().code).toBe('unauthorized');
    expect(getUserProfile).not.toHaveBeenCalled();
  });

  it('fails when a section cannot be read', async () => {
    vi.mocked(listSessionsForUser).mockResolvedValue(err(unknown('db down')));

    const result = await exportPersonalData();

    expect(result._unsafeUnwrapErr()).toEqual(unknown('db down'));
  });

  it('returns not found when the user row is gone', async () => {
    vi.mocked(getUserProfile).mockResolvedValue(ok(null));

    const result = await exportPersonalData();

    expect(result._unsafeUnwrapErr().code).toBe('not_found');
  });
});
