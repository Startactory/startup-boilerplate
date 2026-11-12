import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { type AppError, unknown } from '@/core/errors';
import { db } from '@/infra/database/connection';
import { termsAcceptance } from '@/infra/database/schema/billing-schema';
import { log } from '@/shared/logger';

export async function recordTermsAcceptance(args: {
  id: string;
  userId: string;
  organizationId: string;
  termsVersion: string;
}): Promise<Result<void, AppError>> {
  try {
    await db.insert(termsAcceptance).values(args).onConflictDoNothing();
    return ok(undefined);
  } catch (e) {
    log.error('billing.terms_acceptance.record_failed', e, {
      userId: args.userId,
      organizationId: args.organizationId,
    });
    return err(unknown('Failed to record terms acceptance'));
  }
}
