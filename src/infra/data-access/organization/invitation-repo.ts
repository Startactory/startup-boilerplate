import 'server-only';

import { asc, eq, sql } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, unknown } from '@/core/errors';
import { db } from '@/infra/database/connection';
import {
  invitation,
  organization,
} from '@/infra/database/schema/organization-schema';
import { log } from '@/shared/logger';

export type ReceivedInvitationRecord = {
  id: string;
  organizationId: string;
  organizationName: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

export type SentInvitationRecord = ReceivedInvitationRecord & {
  email: string;
};

export type UserInvitationsRecord = {
  sent: SentInvitationRecord[];
  received: ReceivedInvitationRecord[];
};

const invitationColumns = {
  id: invitation.id,
  organizationId: invitation.organizationId,
  organizationName: organization.name,
  email: invitation.email,
  role: invitation.role,
  status: invitation.status,
  expiresAt: invitation.expiresAt,
  createdAt: invitation.createdAt,
};

type InvitationRow = {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
};

function toReceived(row: InvitationRow): ReceivedInvitationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    role: row.role,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toSent(row: InvitationRow): SentInvitationRecord {
  return { ...toReceived(row), email: row.email };
}

export async function listInvitationsForUser(args: {
  userId: string;
  email: string;
}): Promise<Result<UserInvitationsRecord, AppError>> {
  try {
    const [sent, received] = await Promise.all([
      db
        .select(invitationColumns)
        .from(invitation)
        .innerJoin(organization, eq(invitation.organizationId, organization.id))
        .where(eq(invitation.inviterId, args.userId))
        .orderBy(asc(invitation.createdAt)),
      db
        .select(invitationColumns)
        .from(invitation)
        .innerJoin(organization, eq(invitation.organizationId, organization.id))
        .where(sql`lower(${invitation.email}) = ${args.email.toLowerCase()}`)
        .orderBy(asc(invitation.createdAt)),
    ]);
    return ok({ sent: sent.map(toSent), received: received.map(toReceived) });
  } catch (e) {
    log.error('organization.invitation.list_for_user_failed', e, {
      userId: args.userId,
    });
    return err(unknown('Failed to list invitations'));
  }
}
