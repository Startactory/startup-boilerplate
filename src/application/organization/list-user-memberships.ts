import 'server-only';

import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import { listMembershipsForUser } from '@/infra/data-access/organization/member-repo';
import type { UserMembershipDto } from './dto';

export async function listUserMemberships(
  userId: string,
): Promise<Result<UserMembershipDto[], AppError>> {
  return listMembershipsForUser(userId);
}
