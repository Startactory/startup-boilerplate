import 'server-only';

import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import { listInvitationsForUser } from '@/infra/data-access/organization/invitation-repo';
import type { UserInvitationsDto } from './dto';

export async function listUserInvitations(args: {
  userId: string;
  email: string;
}): Promise<Result<UserInvitationsDto, AppError>> {
  return listInvitationsForUser(args);
}
