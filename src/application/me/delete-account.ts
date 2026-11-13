import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { deleteOrganizationBilling } from '@/application/billing/delete-organization-billing';
import { detachTermsAcceptancesFromUser } from '@/application/billing/detach-terms-acceptances-from-user';
import { getCurrentUser } from '@/application/me/get-current-user';
import { deleteOrganization } from '@/application/organization/delete-organization';
import { listUserMemberships } from '@/application/organization/list-user-memberships';
import { removeUserFromOrganizations } from '@/application/organization/remove-user-from-organizations';
import {
  isDeletionConfirmed,
  planAccountDeletion,
} from '@/core/account/services/account-deletion';
import { type AppError, conflict, parseInput, validation } from '@/core/errors';
import { deleteUserWithCredentials } from '@/infra/data-access/auth/user-data-repo';
import { log } from '@/shared/logger';
import type { AccountDeletionOutcome } from './dto';

const InputSchema = v.object({
  confirmationEmail: v.pipe(v.string(), v.trim(), v.maxLength(320)),
});

export type DeleteAccountInput = v.InferInput<typeof InputSchema>;

const EVENT = 'me.delete_account';

async function deleteSoleMemberOrganization(
  organizationId: string,
): Promise<Result<void, AppError>> {
  const billing = await deleteOrganizationBilling({ organizationId });
  if (billing.isErr()) return err(billing.error);
  return deleteOrganization(organizationId);
}

async function eraseAccount(args: {
  userId: string;
  email: string;
}): Promise<Result<AccountDeletionOutcome, AppError>> {
  const memberships = await listUserMemberships(args.userId);
  if (memberships.isErr()) return err(memberships.error);

  const plan = planAccountDeletion(memberships.value);
  if (plan.kind === 'blocked') {
    log.warn(`${EVENT}.blocked`, {
      userId: args.userId,
      blockingOrganizationIds: plan.blockingOrganizationIds,
    });
    return err(
      conflict(
        'Transfer ownership or remove the members of your organizations first',
      ),
    );
  }

  // why: sequential so a billing failure stops before anything else is deleted
  for (const organizationId of plan.organizationIdsToDelete) {
    const deleted = await deleteSoleMemberOrganization(organizationId);
    if (deleted.isErr()) return err(deleted.error);
  }

  const removed = await removeUserFromOrganizations(args);
  if (removed.isErr()) return err(removed.error);

  const detached = await detachTermsAcceptancesFromUser(args.userId);
  if (detached.isErr()) return err(detached.error);

  const deletedUser = await deleteUserWithCredentials(args.userId);
  if (deletedUser.isErr()) return err(deletedUser.error);

  return ok({
    deletedOrganizationCount: plan.organizationIdsToDelete.length,
    leftOrganizationCount: plan.organizationIdsToLeave.length,
  });
}

export async function deleteAccount(
  input: DeleteAccountInput,
): Promise<Result<AccountDeletionOutcome, AppError>> {
  const parsed = parseInput(
    InputSchema,
    input,
    'Invalid account deletion request',
  );
  if (parsed.isErr()) return err(parsed.error);

  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);
  const { id: userId, email } = me.value;

  if (
    !isDeletionConfirmed({
      typedConfirmation: parsed.value.confirmationEmail,
      accountEmail: email,
    })
  ) {
    log.warn(`${EVENT}.failed`, { userId, reason: 'confirmation_mismatch' });
    return err(
      validation(
        'Confirmation does not match the account email',
        'confirmationEmail',
      ),
    );
  }

  log.info(`${EVENT}.start`, { userId });
  const erased = await eraseAccount({ userId, email });
  if (erased.isErr()) {
    log.warn(`${EVENT}.failed`, { userId, reason: erased.error.code });
    return err(erased.error);
  }

  log.info(`${EVENT}.success`, { userId, ...erased.value });
  return ok(erased.value);
}
