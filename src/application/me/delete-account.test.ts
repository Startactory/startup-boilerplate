import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/application/organization/list-user-memberships', () => ({
  listUserMemberships: vi.fn(),
}));

vi.mock('@/application/organization/delete-organization', () => ({
  deleteOrganization: vi.fn(),
}));

vi.mock('@/application/organization/remove-user-from-organizations', () => ({
  removeUserFromOrganizations: vi.fn(),
}));

vi.mock('@/application/billing/delete-organization-billing', () => ({
  deleteOrganizationBilling: vi.fn(),
}));

vi.mock('@/application/billing/detach-terms-acceptances-from-user', () => ({
  detachTermsAcceptancesFromUser: vi.fn(),
}));

vi.mock('@/infra/data-access/auth/user-data-repo', () => ({
  deleteUserWithCredentials: vi.fn(),
}));

import { deleteOrganizationBilling } from '@/application/billing/delete-organization-billing';
import { detachTermsAcceptancesFromUser } from '@/application/billing/detach-terms-acceptances-from-user';
import { getCurrentUser } from '@/application/me/get-current-user';
import { deleteOrganization } from '@/application/organization/delete-organization';
import type { UserMembershipDto } from '@/application/organization/dto';
import { listUserMemberships } from '@/application/organization/list-user-memberships';
import { removeUserFromOrganizations } from '@/application/organization/remove-user-from-organizations';
import { externalApi, unauthorized } from '@/core/errors';
import { deleteUserWithCredentials } from '@/infra/data-access/auth/user-data-repo';
import { deleteAccount } from './delete-account';

const mockedUser = vi.mocked(getCurrentUser);
const mockedMemberships = vi.mocked(listUserMemberships);
const mockedDeleteOrganization = vi.mocked(deleteOrganization);
const mockedRemoveUser = vi.mocked(removeUserFromOrganizations);
const mockedDeleteBilling = vi.mocked(deleteOrganizationBilling);
const mockedDetachTerms = vi.mocked(detachTermsAcceptancesFromUser);
const mockedDeleteUser = vi.mocked(deleteUserWithCredentials);

const USER_ID = 'user-1';
const EMAIL = 'ada@example.com';

function membership(
  overrides: Partial<UserMembershipDto> & { organizationId: string },
): UserMembershipDto {
  return {
    organizationName: 'Acme',
    role: 'owner',
    joinedAt: '2026-01-01T00:00:00.000Z',
    otherMemberRoles: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUser.mockResolvedValue(
    ok({ id: USER_ID, email: EMAIL, sessionId: 'session-1' } as never),
  );
  mockedMemberships.mockResolvedValue(ok([]));
  mockedDeleteBilling.mockResolvedValue(ok(undefined));
  mockedDeleteOrganization.mockResolvedValue(ok(undefined));
  mockedRemoveUser.mockResolvedValue(ok(undefined));
  mockedDetachTerms.mockResolvedValue(ok(undefined));
  mockedDeleteUser.mockResolvedValue(ok({ deleted: true }));
});

describe('deleteAccount', () => {
  it('cancels billing and deletes an organization where the user is the only member', async () => {
    mockedMemberships.mockResolvedValue(
      ok([membership({ organizationId: 'org-solo' })]),
    );

    const result = await deleteAccount({ confirmationEmail: EMAIL });

    expect(result._unsafeUnwrap()).toEqual({
      deletedOrganizationCount: 1,
      leftOrganizationCount: 0,
    });
    expect(mockedDeleteBilling).toHaveBeenCalledWith({
      organizationId: 'org-solo',
    });
    expect(mockedDeleteOrganization).toHaveBeenCalledWith('org-solo');
    expect(mockedDeleteBilling.mock.invocationCallOrder[0]).toBeLessThan(
      mockedDeleteOrganization.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mockedRemoveUser).toHaveBeenCalledWith({
      userId: USER_ID,
      email: EMAIL,
    });
    expect(mockedDetachTerms).toHaveBeenCalledWith(USER_ID);
    expect(mockedDeleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it('refuses with a conflict when the user is the last owner of an organization with other members', async () => {
    mockedMemberships.mockResolvedValue(
      ok([
        membership({ organizationId: 'org-solo' }),
        membership({
          organizationId: 'org-shared',
          otherMemberRoles: ['member'],
        }),
      ]),
    );

    const result = await deleteAccount({ confirmationEmail: EMAIL });

    expect(result._unsafeUnwrapErr().code).toBe('conflict');
    expect(mockedDeleteBilling).not.toHaveBeenCalled();
    expect(mockedDeleteOrganization).not.toHaveBeenCalled();
    expect(mockedRemoveUser).not.toHaveBeenCalled();
    expect(mockedDetachTerms).not.toHaveBeenCalled();
    expect(mockedDeleteUser).not.toHaveBeenCalled();
  });

  it('removes a plain member from a shared organization without deleting it', async () => {
    mockedMemberships.mockResolvedValue(
      ok([
        membership({
          organizationId: 'org-shared',
          role: 'member',
          otherMemberRoles: ['owner', 'admin'],
        }),
      ]),
    );

    const result = await deleteAccount({ confirmationEmail: EMAIL });

    expect(result._unsafeUnwrap()).toEqual({
      deletedOrganizationCount: 0,
      leftOrganizationCount: 1,
    });
    expect(mockedDeleteBilling).not.toHaveBeenCalled();
    expect(mockedDeleteOrganization).not.toHaveBeenCalled();
    expect(mockedRemoveUser).toHaveBeenCalledWith({
      userId: USER_ID,
      email: EMAIL,
    });
    expect(mockedDeleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it('succeeds again on a second call once everything is already gone', async () => {
    mockedMemberships
      .mockResolvedValueOnce(ok([membership({ organizationId: 'org-solo' })]))
      .mockResolvedValueOnce(ok([]));
    mockedDeleteUser
      .mockResolvedValueOnce(ok({ deleted: true }))
      .mockResolvedValueOnce(ok({ deleted: false }));

    const first = await deleteAccount({ confirmationEmail: EMAIL });
    const second = await deleteAccount({ confirmationEmail: EMAIL });

    expect(first.isOk()).toBe(true);
    expect(second._unsafeUnwrap()).toEqual({
      deletedOrganizationCount: 0,
      leftOrganizationCount: 0,
    });
    expect(mockedDeleteBilling).toHaveBeenCalledTimes(1);
    expect(mockedDeleteOrganization).toHaveBeenCalledTimes(1);
    expect(mockedDeleteUser).toHaveBeenCalledTimes(2);
  });

  it('stops before deleting anything else when billing cancellation fails', async () => {
    mockedMemberships.mockResolvedValue(
      ok([membership({ organizationId: 'org-solo' })]),
    );
    mockedDeleteBilling.mockResolvedValue(
      err(externalApi('autumn', 'Customer deletion failed')),
    );

    const result = await deleteAccount({ confirmationEmail: EMAIL });

    expect(result._unsafeUnwrapErr().code).toBe('external_api');
    expect(mockedDeleteOrganization).not.toHaveBeenCalled();
    expect(mockedRemoveUser).not.toHaveBeenCalled();
    expect(mockedDeleteUser).not.toHaveBeenCalled();
  });

  it('accepts the confirmation regardless of case and surrounding spaces', async () => {
    const result = await deleteAccount({
      confirmationEmail: '  ADA@example.com ',
    });

    expect(result.isOk()).toBe(true);
  });

  it('rejects a confirmation that does not match the account email', async () => {
    const result = await deleteAccount({
      confirmationEmail: 'eve@example.com',
    });

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: 'validation',
      field: 'confirmationEmail',
    });
    expect(mockedMemberships).not.toHaveBeenCalled();
    expect(mockedDeleteUser).not.toHaveBeenCalled();
  });

  it('returns the authentication error when signed out', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('No active session')));

    const result = await deleteAccount({ confirmationEmail: EMAIL });

    expect(result._unsafeUnwrapErr().code).toBe('unauthorized');
    expect(mockedMemberships).not.toHaveBeenCalled();
  });
});
