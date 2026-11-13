import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import { detachTermsAcceptancesFromUser as detachInRepo } from '@/infra/data-access/billing/terms-acceptance-repo';
import { log } from '@/shared/logger';

export async function detachTermsAcceptancesFromUser(
  userId: string,
): Promise<Result<void, AppError>> {
  log.info('billing.terms_acceptance.detach.start', { userId });
  const detached = await detachInRepo(userId);
  if (detached.isErr()) {
    log.warn('billing.terms_acceptance.detach.failed', {
      userId,
      reason: detached.error.code,
    });
    return err(detached.error);
  }
  log.info('billing.terms_acceptance.detach.success', {
    userId,
    detachedCount: detached.value.detachedCount,
  });
  return ok(undefined);
}
