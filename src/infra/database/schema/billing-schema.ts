import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const termsAcceptance = pgTable('terms_acceptance', {
  id: text().primaryKey().notNull(),
  userId: text().notNull(),
  organizationId: text().notNull(),
  termsVersion: text().notNull(),
  acceptedAt: timestamp().defaultNow().notNull(),
});
