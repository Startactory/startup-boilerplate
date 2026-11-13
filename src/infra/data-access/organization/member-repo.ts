import 'server-only';

import { and, asc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, unknown } from '@/core/errors';
import { db } from '@/infra/database/connection';
import {
  invitation,
  member,
  organization,
} from '@/infra/database/schema/organization-schema';
import { log } from '@/shared/logger';

export type MembershipRecord = {
  organizationId: string;
  role: string;
};

export type UserMembershipRecord = {
  organizationId: string;
  organizationName: string;
  role: string;
  joinedAt: string;
  otherMemberRoles: string[];
};

export async function getMembershipForUser(
  userId: string,
): Promise<Result<MembershipRecord | null, AppError>> {
  try {
    const [row] = await db
      .select({ organizationId: member.organizationId, role: member.role })
      .from(member)
      .where(eq(member.userId, userId))
      .limit(1);
    return ok(row ?? null);
  } catch (e) {
    log.error('organization.membership.lookup_failed', e, { userId });
    return err(unknown('Failed to look up membership'));
  }
}

export async function listMembershipsForUser(
  userId: string,
): Promise<Result<UserMembershipRecord[], AppError>> {
  try {
    const memberships = await db
      .select({
        organizationId: member.organizationId,
        organizationName: organization.name,
        role: member.role,
        joinedAt: member.createdAt,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(and(eq(member.userId, userId), isNull(member.deletedAt)))
      .orderBy(asc(member.createdAt));
    if (memberships.length === 0) return ok([]);

    const coMembers = await db
      .select({ organizationId: member.organizationId, role: member.role })
      .from(member)
      .where(
        and(
          inArray(
            member.organizationId,
            memberships.map((row) => row.organizationId),
          ),
          ne(member.userId, userId),
          isNull(member.deletedAt),
        ),
      );

    return ok(
      memberships.map((row) => ({
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        role: row.role,
        joinedAt: row.joinedAt.toISOString(),
        otherMemberRoles: coMembers
          .filter((coMember) => coMember.organizationId === row.organizationId)
          .map((coMember) => coMember.role),
      })),
    );
  } catch (e) {
    log.error('organization.membership.list_for_user_failed', e, { userId });
    return err(unknown('Failed to list memberships'));
  }
}

export async function removeUserFromAllOrganizations(args: {
  userId: string;
  email: string;
}): Promise<
  Result<
    { removedMembershipCount: number; removedInvitationCount: number },
    AppError
  >
> {
  try {
    const counts = await db.transaction(async (tx) => {
      const invitations = await tx
        .delete(invitation)
        .where(
          or(
            eq(invitation.inviterId, args.userId),
            sql`lower(${invitation.email}) = ${args.email.toLowerCase()}`,
          ),
        )
        .returning({ id: invitation.id });
      const memberships = await tx
        .delete(member)
        .where(eq(member.userId, args.userId))
        .returning({ id: member.id });
      return {
        removedMembershipCount: memberships.length,
        removedInvitationCount: invitations.length,
      };
    });
    return ok(counts);
  } catch (e) {
    log.error('organization.membership.remove_user_failed', e, {
      userId: args.userId,
    });
    return err(unknown('Failed to remove user from organizations'));
  }
}
