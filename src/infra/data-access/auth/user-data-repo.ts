import 'server-only';

import { asc, eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, unknown } from '@/core/errors';
import { db } from '@/infra/database/connection';
import { account, session, user } from '@/infra/database/schema/auth-schema';
import { log } from '@/shared/logger';

export type UserProfileRecord = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  locale: string;
  createdAt: string;
  updatedAt: string;
};

export type LinkedAccountRecord = {
  providerId: string;
  accountId: string;
  linkedAt: string;
};

export type SessionRecord = {
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export async function getUserProfile(
  userId: string,
): Promise<Result<UserProfileRecord | null, AppError>> {
  try {
    const [row] = await db
      .select({
        id: user.id,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        locale: user.locale,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!row) return ok(null);
    return ok({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (e) {
    log.error('auth.user_data.profile_failed', e, { userId });
    return err(unknown('Failed to read user profile'));
  }
}

export async function listLinkedAccountsForUser(
  userId: string,
): Promise<Result<LinkedAccountRecord[], AppError>> {
  try {
    const rows = await db
      .select({
        providerId: account.providerId,
        accountId: account.accountId,
        createdAt: account.createdAt,
      })
      .from(account)
      .where(eq(account.userId, userId))
      .orderBy(asc(account.createdAt));
    return ok(
      rows.map((row) => ({
        providerId: row.providerId,
        accountId: row.accountId,
        linkedAt: row.createdAt.toISOString(),
      })),
    );
  } catch (e) {
    log.error('auth.user_data.accounts_failed', e, { userId });
    return err(unknown('Failed to list linked accounts'));
  }
}

export async function listSessionsForUser(
  userId: string,
): Promise<Result<SessionRecord[], AppError>> {
  try {
    const rows = await db
      .select({
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })
      .from(session)
      .where(eq(session.userId, userId))
      .orderBy(asc(session.createdAt));
    return ok(
      rows.map((row) => ({
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
      })),
    );
  } catch (e) {
    log.error('auth.user_data.sessions_failed', e, { userId });
    return err(unknown('Failed to list sessions'));
  }
}

export async function deleteUserWithCredentials(
  userId: string,
): Promise<Result<{ deleted: boolean }, AppError>> {
  try {
    const deleted = await db.transaction(async (tx) => {
      await tx.delete(session).where(eq(session.userId, userId));
      await tx.delete(account).where(eq(account.userId, userId));
      const rows = await tx
        .delete(user)
        .where(eq(user.id, userId))
        .returning({ id: user.id });
      return rows.length > 0;
    });
    return ok({ deleted });
  } catch (e) {
    log.error('auth.user_data.delete_failed', e, { userId });
    return err(unknown('Failed to delete user'));
  }
}
