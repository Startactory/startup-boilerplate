import 'server-only';

import { AutumnError } from 'autumn-js';
import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import type {
  BillingPort,
  CheckAppAccessInput,
  DeleteCustomerInput,
} from '@/core/billing/ports/billing.port';
import {
  APP_ACCESS_FEATURE_ID,
  type Entitlement,
} from '@/core/billing/types/entitlement';
import { type AppError, externalApi } from '@/core/errors';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';
import { autumnClient } from './client';
import {
  AutumnCheckResultSchema,
  AutumnDeleteCustomerResultSchema,
  AutumnErrorBodySchema,
} from './schemas';

const PROVIDER = 'autumn';
const CUSTOMER_NOT_FOUND_CODE = 'customer_not_found';

function parseErrorCode(body: string): string | undefined {
  try {
    const parsed = v.safeParse(AutumnErrorBodySchema, JSON.parse(body));
    return parsed.success ? parsed.output.code : undefined;
  } catch {
    return undefined;
  }
}

// why: Autumn creates the customer only when the client first calls
// getOrCreateCustomer, so a brand-new organization has none yet.
function isCustomerNotFound(error: unknown): boolean {
  return (
    error instanceof AutumnError &&
    error.statusCode === 404 &&
    parseErrorCode(error.body) === CUSTOMER_NOT_FOUND_CODE
  );
}

async function checkAppAccess(
  input: CheckAppAccessInput,
): Promise<Result<Entitlement, AppError>> {
  const secretKey = env().AUTUMN_SECRET_KEY;
  if (!secretKey) {
    // No key configured (allowed locally). Callers treat this as "not entitled";
    // the dev paywall-skip is what lets developers through without billing.
    log.warn('billing.check_app_access.unconfigured', {
      organizationId: input.organizationId,
    });
    return ok({ allowed: false, reason: 'billing_unconfigured' });
  }

  log.info('billing.check_app_access.start', {
    organizationId: input.organizationId,
  });
  try {
    const response = await autumnClient(secretKey).check({
      customerId: input.organizationId,
      featureId: APP_ACCESS_FEATURE_ID,
    });

    const parsed = v.safeParse(AutumnCheckResultSchema, response);
    if (!parsed.success) {
      return err(externalApi(PROVIDER, 'Unexpected check response shape'));
    }

    log.info('billing.check_app_access.success', {
      organizationId: input.organizationId,
      allowed: parsed.output.allowed,
    });
    return ok({
      allowed: parsed.output.allowed,
      reason: parsed.output.allowed ? 'entitled' : 'not_entitled',
    });
  } catch (e) {
    if (isCustomerNotFound(e)) {
      log.info('billing.check_app_access.no_customer', {
        organizationId: input.organizationId,
      });
      return ok({ allowed: false, reason: 'not_entitled' });
    }
    log.error('billing.check_app_access.exception', e, {
      organizationId: input.organizationId,
    });
    return err(externalApi(PROVIDER, 'Billing check failed'));
  }
}

async function deleteCustomer(
  input: DeleteCustomerInput,
): Promise<Result<void, AppError>> {
  const secretKey = env().AUTUMN_SECRET_KEY;
  if (!secretKey) {
    log.warn('billing.delete_customer.unconfigured', {
      organizationId: input.organizationId,
    });
    return ok(undefined);
  }

  log.info('billing.delete_customer.start', {
    organizationId: input.organizationId,
  });
  try {
    // why: deleting the Stripe customer is what cancels its active subscriptions
    const response = await autumnClient(secretKey).customers.delete({
      customerId: input.organizationId,
      deleteInStripe: true,
    });

    const parsed = v.safeParse(AutumnDeleteCustomerResultSchema, response);
    if (!parsed.success || !parsed.output.success) {
      log.warn('billing.delete_customer.failed', {
        organizationId: input.organizationId,
        reason: 'unexpected_response',
      });
      return err(externalApi(PROVIDER, 'Unexpected delete customer response'));
    }

    log.info('billing.delete_customer.success', {
      organizationId: input.organizationId,
    });
    return ok(undefined);
  } catch (e) {
    if (isCustomerNotFound(e)) {
      log.info('billing.delete_customer.no_customer', {
        organizationId: input.organizationId,
      });
      return ok(undefined);
    }
    log.error('billing.delete_customer.exception', e, {
      organizationId: input.organizationId,
    });
    return err(externalApi(PROVIDER, 'Customer deletion failed'));
  }
}

export const autumnBillingAdapter: BillingPort = {
  checkAppAccess,
  deleteCustomer,
};
