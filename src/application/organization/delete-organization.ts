import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import { deleteOrganization as deleteInRepo } from '@/infra/data-access/organization/organization-repo';
import { log } from '@/shared/logger';

export async function deleteOrganization(
  organizationId: string,
): Promise<Result<void, AppError>> {
  log.info('organization.delete.start', { organizationId });
  const deleted = await deleteInRepo(organizationId);
  if (deleted.isErr()) {
    log.warn('organization.delete.failed', {
      organizationId,
      reason: deleted.error.code,
    });
    return err(deleted.error);
  }
  log.info('organization.delete.success', {
    organizationId,
    alreadyDeleted: !deleted.value.deleted,
  });
  return ok(undefined);
}
