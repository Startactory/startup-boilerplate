import 'server-only';

import { asc, eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, unknown } from '@/core/errors';
import { db } from '@/infra/database/connection';
import { termsAcceptance } from '@/infra/database/schema/billing-schema';
import { log } from '@/shared/logger';

export type TermsAcceptanceRecord = {
  organizationId: string;
  termsVersion: string;
  acceptedAt: string;
};

// why: acceptances are proof of the sale, so they outlive the account but stop naming it
const DETACHED_USER_ID = 'deleted-user';

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

export async function listTermsAcceptancesForUser(
  userId: string,
): Promise<Result<TermsAcceptanceRecord[], AppError>> {
  try {
    const rows = await db
      .select({
        organizationId: termsAcceptance.organizationId,
        termsVersion: termsAcceptance.termsVersion,
        acceptedAt: termsAcceptance.acceptedAt,
      })
      .from(termsAcceptance)
      .where(eq(termsAcceptance.userId, userId))
      .orderBy(asc(termsAcceptance.acceptedAt));
    return ok(
      rows.map((row) => ({
        organizationId: row.organizationId,
        termsVersion: row.termsVersion,
        acceptedAt: row.acceptedAt.toISOString(),
      })),
    );
  } catch (e) {
    log.error('billing.terms_acceptance.list_failed', e, { userId });
    return err(unknown('Failed to list terms acceptances'));
  }
}

export async function detachTermsAcceptancesFromUser(
  userId: string,
): Promise<Result<{ detachedCount: number }, AppError>> {
  try {
    const rows = await db
      .update(termsAcceptance)
      .set({ userId: DETACHED_USER_ID })
      .where(eq(termsAcceptance.userId, userId))
      .returning({ id: termsAcceptance.id });
    return ok({ detachedCount: rows.length });
  } catch (e) {
    log.error('billing.terms_acceptance.detach_failed', e, { userId });
    return err(unknown('Failed to detach terms acceptances'));
  }
}
