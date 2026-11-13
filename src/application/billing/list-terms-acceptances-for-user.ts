import 'server-only';

import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import { listTermsAcceptancesForUser as listFromRepo } from '@/infra/data-access/billing/terms-acceptance-repo';
import type { TermsAcceptanceDto } from './dto';

export async function listTermsAcceptancesForUser(
  userId: string,
): Promise<Result<TermsAcceptanceDto[], AppError>> {
  return listFromRepo(userId);
}
