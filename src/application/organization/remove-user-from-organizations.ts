import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import { removeUserFromAllOrganizations } from '@/infra/data-access/organization/member-repo';
import { log } from '@/shared/logger';

export async function removeUserFromOrganizations(args: {
  userId: string;
  email: string;
}): Promise<Result<void, AppError>> {
  log.info('organization.remove_user.start', { userId: args.userId });
  const removed = await removeUserFromAllOrganizations(args);
  if (removed.isErr()) {
    log.warn('organization.remove_user.failed', {
      userId: args.userId,
      reason: removed.error.code,
    });
    return err(removed.error);
  }
  log.info('organization.remove_user.success', {
    userId: args.userId,
    ...removed.value,
  });
  return ok(undefined);
}
