import { AutumnDefaultError } from 'autumn-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const check = vi.fn();
const deleteCustomer = vi.fn();
const mockEnv = vi.hoisted(() => ({
  AUTUMN_SECRET_KEY: 'am_sk_test_key' as string | undefined,
  LOG_LEVEL: 'silent',
}));

vi.mock('@/shared/env', () => ({
  env: () => mockEnv,
}));

vi.mock('@/shared/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./client', () => ({
  autumnClient: () => ({ check, customers: { delete: deleteCustomer } }),
}));

import { externalApi } from '@/core/errors';
import { log } from '@/shared/logger';
import { autumnBillingAdapter } from './autumn-billing-adapter';

const ORGANIZATION_ID = 'org-new';

function autumnHttpError(status: number, body: string): AutumnDefaultError {
  return new AutumnDefaultError('API error occurred', {
    response: new Response(body, {
      status,
      headers: { 'content-type': 'application/json' },
    }),
    request: new Request('https://api.useautumn.com/v1/check'),
    body,
  });
}

const CUSTOMER_NOT_FOUND_BODY = JSON.stringify({
  message: 'Customer does not exist in this org and env',
  code: 'customer_not_found',
  env: 'sandbox',
});

describe('autumnBillingAdapter.checkAppAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grants access when Autumn allows the feature', async () => {
    check.mockResolvedValue({ allowed: true });

    const result = await autumnBillingAdapter.checkAppAccess({
      organizationId: ORGANIZATION_ID,
    });

    expect(result._unsafeUnwrap()).toEqual({
      allowed: true,
      reason: 'entitled',
    });
  });

  it('treats a customer Autumn has not created yet as not entitled, without an error log', async () => {
    check.mockRejectedValue(
      autumnHttpError(
        404,
        JSON.stringify({
          message: 'Customer does not exist in this org and env',
          code: 'customer_not_found',
          env: 'sandbox',
        }),
      ),
    );

    const result = await autumnBillingAdapter.checkAppAccess({
      organizationId: ORGANIZATION_ID,
    });

    expect(result._unsafeUnwrap()).toEqual({
      allowed: false,
      reason: 'not_entitled',
    });
    expect(log.info).toHaveBeenCalledWith(
      'billing.check_app_access.no_customer',
      { organizationId: ORGANIZATION_ID },
    );
    expect(log.error).not.toHaveBeenCalled();
  });

  it('keeps any other not-found error as a billing failure', async () => {
    check.mockRejectedValue(
      autumnHttpError(
        404,
        JSON.stringify({ message: 'No feature', code: 'feature_not_found' }),
      ),
    );

    const result = await autumnBillingAdapter.checkAppAccess({
      organizationId: ORGANIZATION_ID,
    });

    expect(result._unsafeUnwrapErr()).toEqual(
      externalApi('autumn', 'Billing check failed'),
    );
    expect(log.error).toHaveBeenCalledOnce();
  });

  it('keeps a not-found error with an unreadable body as a billing failure', async () => {
    check.mockRejectedValue(autumnHttpError(404, 'Not Found'));

    const result = await autumnBillingAdapter.checkAppAccess({
      organizationId: ORGANIZATION_ID,
    });

    expect(result._unsafeUnwrapErr().code).toBe('external_api');
    expect(log.error).toHaveBeenCalledOnce();
  });

  it('keeps a server error carrying the customer_not_found code as a billing failure', async () => {
    check.mockRejectedValue(
      autumnHttpError(500, JSON.stringify({ code: 'customer_not_found' })),
    );

    const result = await autumnBillingAdapter.checkAppAccess({
      organizationId: ORGANIZATION_ID,
    });

    expect(result._unsafeUnwrapErr().code).toBe('external_api');
    expect(log.error).toHaveBeenCalledOnce();
  });

  it('keeps a network failure as a billing failure', async () => {
    check.mockRejectedValue(new TypeError('fetch failed'));

    const result = await autumnBillingAdapter.checkAppAccess({
      organizationId: ORGANIZATION_ID,
    });

    expect(result._unsafeUnwrapErr().code).toBe('external_api');
    expect(log.error).toHaveBeenCalledOnce();
  });
});

describe('autumnBillingAdapter.deleteCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.AUTUMN_SECRET_KEY = 'am_sk_test_key';
  });

  it('deletes the organization customer in Autumn and Stripe', async () => {
    deleteCustomer.mockResolvedValue({ success: true });

    const result = await autumnBillingAdapter.deleteCustomer({
      organizationId: ORGANIZATION_ID,
    });

    expect(result.isOk()).toBe(true);
    expect(deleteCustomer).toHaveBeenCalledWith({
      customerId: ORGANIZATION_ID,
      deleteInStripe: true,
    });
  });

  it('treats a customer Autumn never created as already deleted', async () => {
    deleteCustomer.mockRejectedValue(
      autumnHttpError(404, CUSTOMER_NOT_FOUND_BODY),
    );

    const result = await autumnBillingAdapter.deleteCustomer({
      organizationId: ORGANIZATION_ID,
    });

    expect(result.isOk()).toBe(true);
    expect(log.info).toHaveBeenCalledWith(
      'billing.delete_customer.no_customer',
      {
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(log.error).not.toHaveBeenCalled();
  });

  it('skips the call when billing is not configured', async () => {
    mockEnv.AUTUMN_SECRET_KEY = undefined;

    const result = await autumnBillingAdapter.deleteCustomer({
      organizationId: ORGANIZATION_ID,
    });

    expect(result.isOk()).toBe(true);
    expect(deleteCustomer).not.toHaveBeenCalled();
  });

  it('fails when Autumn reports the deletion as unsuccessful', async () => {
    deleteCustomer.mockResolvedValue({ success: false });

    const result = await autumnBillingAdapter.deleteCustomer({
      organizationId: ORGANIZATION_ID,
    });

    expect(result._unsafeUnwrapErr().code).toBe('external_api');
  });

  it('keeps a server error as a billing failure', async () => {
    deleteCustomer.mockRejectedValue(
      autumnHttpError(500, JSON.stringify({ code: 'internal_error' })),
    );

    const result = await autumnBillingAdapter.deleteCustomer({
      organizationId: ORGANIZATION_ID,
    });

    expect(result._unsafeUnwrapErr()).toEqual(
      externalApi('autumn', 'Customer deletion failed'),
    );
    expect(log.error).toHaveBeenCalledOnce();
  });
});
