import 'server-only';

import * as v from 'valibot';
import { getCurrentUser } from '@/application/me/get-current-user';
import { createOrganizationWithOwner } from '@/application/organization/create-organization-with-owner';
import { LOCALES } from '@/i18n/locales';
import { setActiveOrganizationOnSession } from '@/infra/auth/active-organization';
import { log } from '@/shared/logger';
import { newId } from '@/shared/utils/id';

const InputSchema = v.object({
  organizationName: v.pipe(v.string(), v.minLength(2), v.maxLength(100)),
  locale: v.picklist(LOCALES),
});

export type CreateFirstOrganizationInput = v.InferInput<typeof InputSchema>;
export type CreateFirstOrganizationResult =
  | { success: true; organizationId: string }
  | {
      success: false;
      error: 'unauthenticated' | 'already_in_org' | 'invalid_input' | 'unknown';
    };

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'org'}-${Date.now().toString(36)}`;
}

export async function createFirstOrganization(
  input: CreateFirstOrganizationInput,
): Promise<CreateFirstOrganizationResult> {
  const parsed = v.safeParse(InputSchema, input);
  if (!parsed.success) return { success: false, error: 'invalid_input' };

  const currentUser = await getCurrentUser();
  if (currentUser.isErr()) return { success: false, error: 'unauthenticated' };

  const me = currentUser.value;
  if (me.organizationId) return { success: false, error: 'already_in_org' };

  const organizationId = newId();
  log.info('organization.create_first.start', {
    userId: me.id,
    organizationId,
  });

  const created = await createOrganizationWithOwner({
    organizationId,
    name: parsed.output.organizationName,
    slug: slugify(parsed.output.organizationName),
    locale: parsed.output.locale,
    ownerUserId: me.id,
  });
  if (created.isErr()) {
    log.error(
      'organization.create_first.failed',
      new Error(created.error.message),
      { userId: me.id, organizationId },
    );
    return { success: false, error: 'unknown' };
  }

  const activated = await setActiveOrganizationOnSession({
    sessionId: me.sessionId,
    organizationId,
  });
  if (activated.isErr()) {
    // Membership is in place, so the session picks the org up on next sign-in.
    log.warn('organization.create_first.activate_session_failed', {
      userId: me.id,
      organizationId,
    });
  }

  log.info('organization.create_first.success', {
    userId: me.id,
    organizationId,
  });

  return { success: true, organizationId };
}
