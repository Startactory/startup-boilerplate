import 'server-only';

import { err, ok, Result } from 'neverthrow';
import { listTermsAcceptancesForUser } from '@/application/billing/list-terms-acceptances-for-user';
import { getCurrentUser } from '@/application/me/get-current-user';
import { listUserInvitations } from '@/application/organization/list-user-invitations';
import { listUserMemberships } from '@/application/organization/list-user-memberships';
import { type AppError, notFound } from '@/core/errors';
import {
  getUserProfile,
  listLinkedAccountsForUser,
  listSessionsForUser,
} from '@/infra/data-access/auth/user-data-repo';
import { log } from '@/shared/logger';
import type { PersonalDataExportDto } from './dto';

export async function exportPersonalData(): Promise<
  Result<PersonalDataExportDto, AppError>
> {
  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);
  const { id: userId, email } = me.value;

  log.info('me.export_personal_data.start', { userId });

  const gathered = Result.combine(
    await Promise.all([
      getUserProfile(userId),
      listLinkedAccountsForUser(userId),
      listSessionsForUser(userId),
      listUserMemberships(userId),
      listUserInvitations({ userId, email }),
      listTermsAcceptancesForUser(userId),
    ]),
  );
  if (gathered.isErr()) {
    log.warn('me.export_personal_data.failed', {
      userId,
      reason: gathered.error.code,
    });
    return err(gathered.error);
  }

  const [profile, linkedAccounts, sessions, memberships, invitations, terms] =
    gathered.value;
  if (!profile) {
    log.warn('me.export_personal_data.failed', {
      userId,
      reason: 'user_not_found',
    });
    return err(notFound('User not found', 'user'));
  }

  log.info('me.export_personal_data.success', {
    userId,
    sessionCount: sessions.length,
    membershipCount: memberships.length,
  });
  return ok({
    exportedAt: new Date().toISOString(),
    profile,
    linkedAccounts,
    sessions,
    organizationMemberships: memberships.map((membership) => ({
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
      role: membership.role,
      joinedAt: membership.joinedAt,
    })),
    invitations,
    termsAcceptances: terms,
  });
}
