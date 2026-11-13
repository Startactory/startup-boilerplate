import { describe, expect, it } from 'vitest';
import {
  hasOwnerRole,
  isDeletionConfirmed,
  planAccountDeletion,
} from './account-deletion';

describe('hasOwnerRole', () => {
  it.each([
    ['owner', true],
    ['admin,owner', true],
    ['owner, admin', true],
    ['admin', false],
    ['member', false],
    ['co-owner', false],
  ])('reads %s as owner=%s', (role, expected) => {
    expect(hasOwnerRole(role)).toBe(expected);
  });
});

describe('planAccountDeletion', () => {
  it('deletes an organization where the user is the only member', () => {
    const plan = planAccountDeletion([
      { organizationId: 'org-solo', role: 'owner', otherMemberRoles: [] },
    ]);

    expect(plan).toEqual({
      kind: 'ready',
      organizationIdsToDelete: ['org-solo'],
      organizationIdsToLeave: [],
    });
  });

  it('blocks when the user is the last owner of an organization with other members', () => {
    const plan = planAccountDeletion([
      { organizationId: 'org-solo', role: 'owner', otherMemberRoles: [] },
      {
        organizationId: 'org-shared',
        role: 'owner',
        otherMemberRoles: ['member', 'admin'],
      },
    ]);

    expect(plan).toEqual({
      kind: 'blocked',
      blockingOrganizationIds: ['org-shared'],
    });
  });

  it('lets an owner leave when another owner remains', () => {
    const plan = planAccountDeletion([
      {
        organizationId: 'org-shared',
        role: 'owner',
        otherMemberRoles: ['admin,owner'],
      },
    ]);

    expect(plan).toEqual({
      kind: 'ready',
      organizationIdsToDelete: [],
      organizationIdsToLeave: ['org-shared'],
    });
  });

  it('lets a plain member or admin leave a shared organization', () => {
    const plan = planAccountDeletion([
      { organizationId: 'org-a', role: 'member', otherMemberRoles: ['owner'] },
      { organizationId: 'org-b', role: 'admin', otherMemberRoles: ['owner'] },
    ]);

    expect(plan).toEqual({
      kind: 'ready',
      organizationIdsToDelete: [],
      organizationIdsToLeave: ['org-a', 'org-b'],
    });
  });

  it('is ready with nothing to do when the user has no organization', () => {
    expect(planAccountDeletion([])).toEqual({
      kind: 'ready',
      organizationIdsToDelete: [],
      organizationIdsToLeave: [],
    });
  });
});

describe('isDeletionConfirmed', () => {
  it('accepts the account email regardless of case and surrounding spaces', () => {
    expect(
      isDeletionConfirmed({
        typedConfirmation: '  Ada@Example.com ',
        accountEmail: 'ada@example.com',
      }),
    ).toBe(true);
  });

  it('rejects a different email', () => {
    expect(
      isDeletionConfirmed({
        typedConfirmation: 'eve@example.com',
        accountEmail: 'ada@example.com',
      }),
    ).toBe(false);
  });

  it('rejects an empty confirmation', () => {
    expect(
      isDeletionConfirmed({ typedConfirmation: '  ', accountEmail: '' }),
    ).toBe(false);
  });
});
