import 'server-only';

import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import { autumnBillingAdapter } from '@/infra/external-apis/autumn/autumn-billing-adapter';

export async function deleteOrganizationBilling(args: {
  organizationId: string;
}): Promise<Result<void, AppError>> {
  return autumnBillingAdapter.deleteCustomer({
    organizationId: args.organizationId,
  });
}
