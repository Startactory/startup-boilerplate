import { err, ok, type Result } from 'neverthrow';
import { requireOrganizationScope } from '@/application/me/organization-scope';
import type { AppError } from '@/core/errors';
import { recordTermsAcceptance } from '@/infra/data-access/billing/terms-acceptance-repo';
import { log } from '@/shared/logger';
import { getStartupProfile } from '@/shared/startup-profile/startup-profile';
import { newId } from '@/shared/utils/id';

export async function acceptTerms(): Promise<
  Result<{ termsVersion: string }, AppError>
> {
  log.info('billing.accept_terms.start');

  const scope = await requireOrganizationScope();
  if (scope.isErr()) {
    log.warn('billing.accept_terms.failed', { reason: scope.error.code });
    return err(scope.error);
  }

  const { userId, organizationId } = scope.value;
  const termsVersion = getStartupProfile().legal.termsVersion;

  const recorded = await recordTermsAcceptance({
    id: newId(),
    userId,
    organizationId,
    termsVersion,
  });
  if (recorded.isErr()) {
    log.warn('billing.accept_terms.failed', {
      userId,
      organizationId,
      reason: recorded.error.code,
    });
    return err(recorded.error);
  }

  log.info('billing.accept_terms.success', {
    userId,
    organizationId,
    termsVersion,
  });
  return ok({ termsVersion });
}
