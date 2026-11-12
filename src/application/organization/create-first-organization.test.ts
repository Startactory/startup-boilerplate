import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/application/organization/create-organization-with-owner', () => ({
  createOrganizationWithOwner: vi.fn(),
}));

vi.mock('@/infra/auth/active-organization', () => ({
  setActiveOrganizationOnSession: vi.fn(),
}));

vi.mock('@/shared/utils/id', () => ({
  newId: () => 'org-new',
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import { createOrganizationWithOwner } from '@/application/organization/create-organization-with-owner';
import { unauthorized, unknown as unknownError } from '@/core/errors';
import { setActiveOrganizationOnSession } from '@/infra/auth/active-organization';
import { createFirstOrganization } from './create-first-organization';

const mockedUser = vi.mocked(getCurrentUser);
const mockedCreate = vi.mocked(createOrganizationWithOwner);
const mockedActivate = vi.mocked(setActiveOrganizationOnSession);

beforeEach(() => {
  vi.clearAllMocks();
});

function mockAuthedUser(): void {
  mockedUser.mockResolvedValue(
    ok({ id: 'u', organizationId: null, sessionId: 's' } as never),
  );
}

describe('createFirstOrganization', () => {
  it('returns invalid_input for too-short organization name', async () => {
    mockAuthedUser();
    const r = await createFirstOrganization({ organizationName: 'x' });
    expect(r).toEqual({ success: false, error: 'invalid_input' });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('returns invalid_input for too-long organization name', async () => {
    mockAuthedUser();
    const r = await createFirstOrganization({
      organizationName: 'a'.repeat(101),
    });
    expect(r).toEqual({ success: false, error: 'invalid_input' });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('returns unauthenticated when no user', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no')));
    const r = await createFirstOrganization({ organizationName: 'Acme' });
    expect(r).toEqual({ success: false, error: 'unauthenticated' });
  });

  it('returns already_in_org when user has organizationId', async () => {
    mockedUser.mockResolvedValue(
      ok({
        id: 'u',
        organizationId: 'existing',
        sessionId: 's',
      } as never),
    );
    const r = await createFirstOrganization({ organizationName: 'Acme' });
    expect(r).toEqual({ success: false, error: 'already_in_org' });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('creates the organization and activates the session on success', async () => {
    mockAuthedUser();
    mockedCreate.mockResolvedValueOnce(ok(undefined));
    mockedActivate.mockResolvedValueOnce(ok(undefined));
    const r = await createFirstOrganization({ organizationName: 'Acme Corp' });
    expect(r).toEqual({ success: true, organizationId: 'org-new' });
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-new',
        name: 'Acme Corp',
        ownerUserId: 'u',
        slug: expect.stringMatching(/^acme-corp-[0-9a-z]+$/),
      }),
    );
    expect(mockedActivate).toHaveBeenCalledWith({
      sessionId: 's',
      organizationId: 'org-new',
    });
  });

  it('returns unknown when organization creation fails', async () => {
    mockAuthedUser();
    mockedCreate.mockResolvedValueOnce(err(unknownError('db down')));
    const r = await createFirstOrganization({ organizationName: 'Acme Corp' });
    expect(r).toEqual({ success: false, error: 'unknown' });
    expect(mockedActivate).not.toHaveBeenCalled();
  });

  it('still succeeds when session activation fails (recoverable)', async () => {
    mockAuthedUser();
    mockedCreate.mockResolvedValueOnce(ok(undefined));
    mockedActivate.mockResolvedValueOnce(err(unknownError('boom')));
    const r = await createFirstOrganization({ organizationName: 'Acme Corp' });
    expect(r).toEqual({ success: true, organizationId: 'org-new' });
  });
});
