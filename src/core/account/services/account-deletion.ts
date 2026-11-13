export type MembershipForDeletion = {
  organizationId: string;
  role: string;
  otherMemberRoles: readonly string[];
};

export type AccountDeletionPlan =
  | { kind: 'blocked'; blockingOrganizationIds: string[] }
  | {
      kind: 'ready';
      organizationIdsToDelete: string[];
      organizationIdsToLeave: string[];
    };

const OWNER_ROLE = 'owner';

// why: the better-auth organization plugin stores several roles as "owner,admin"
export function hasOwnerRole(role: string): boolean {
  return role
    .split(',')
    .map((part) => part.trim())
    .includes(OWNER_ROLE);
}

function isSoleMember(membership: MembershipForDeletion): boolean {
  return membership.otherMemberRoles.length === 0;
}

function isLastOwnerOfSharedOrganization(
  membership: MembershipForDeletion,
): boolean {
  return (
    hasOwnerRole(membership.role) &&
    !isSoleMember(membership) &&
    !membership.otherMemberRoles.some(hasOwnerRole)
  );
}

export function planAccountDeletion(
  memberships: readonly MembershipForDeletion[],
): AccountDeletionPlan {
  const blockingOrganizationIds = memberships
    .filter(isLastOwnerOfSharedOrganization)
    .map((membership) => membership.organizationId);
  if (blockingOrganizationIds.length > 0) {
    return { kind: 'blocked', blockingOrganizationIds };
  }

  return {
    kind: 'ready',
    organizationIdsToDelete: memberships
      .filter(isSoleMember)
      .map((membership) => membership.organizationId),
    organizationIdsToLeave: memberships
      .filter((membership) => !isSoleMember(membership))
      .map((membership) => membership.organizationId),
  };
}

export function isDeletionConfirmed(args: {
  typedConfirmation: string;
  accountEmail: string;
}): boolean {
  const typed = args.typedConfirmation.trim().toLowerCase();
  return typed.length > 0 && typed === args.accountEmail.trim().toLowerCase();
}
