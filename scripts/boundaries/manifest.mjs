export const DOMAINS = [
  {
    name: 'auth',
    dirs: [
      'src/core/account',
      'src/infra/auth',
      'src/infra/data-access/auth',
      'src/application/me',
      'src/application/settings',
      'src/app/auth',
      'src/app/api/me',
      'src/app/(public)/sign-in',
      'src/app/(app)/dashboard/settings',
    ],
    schemas: [
      'src/infra/database/schema/auth-schema',
      // co-owner: the better-auth organization plugin writes org tables
      'src/infra/database/schema/organization-schema',
    ],
    public: [
      'src/infra/auth/auth',
      'src/infra/auth/active-organization',
      'src/application/me/get-current-user',
      'src/application/me/organization-scope',
    ],
    openToAll: true,
  },
  {
    name: 'organization',
    dirs: [
      'src/application/organization',
      'src/application/invitations',
      'src/infra/data-access/organization',
      'src/app/(app)/dashboard/organization',
      'src/app/(public)/accept-invitation',
      'src/app/(public)/onboarding',
      'src/app/api/organization',
    ],
    schemas: ['src/infra/database/schema/organization-schema'],
    public: [
      'src/application/organization/dto',
      'src/application/organization/list-members',
      'src/application/organization/list-invitations',
      'src/application/organization/get-membership',
      'src/application/organization/get-organization-name',
      'src/application/organization/list-user-memberships',
      'src/application/organization/list-user-invitations',
      'src/application/organization/delete-organization',
      'src/application/organization/remove-user-from-organizations',
      'src/application/invitations/find-pending-for-current-user',
    ],
  },
  {
    name: 'rate-limit',
    dirs: ['src/application/rate-limit', 'src/infra/external-apis/redis'],
    schemas: [],
    public: [
      'src/application/rate-limit/apply-rate-limit',
      'src/infra/external-apis/redis/client',
    ],
    openToAll: true,
  },
  {
    name: 'email',
    dirs: [
      'src/core/email',
      'src/infra/email',
      'src/infra/external-apis/resend',
      'src/infra/external-apis/smtp',
    ],
    schemas: [],
    public: [
      'src/infra/email/email-sender',
      'src/infra/email/send-organization-invitation',
    ],
    openToAll: true,
  },
  {
    name: 'billing',
    dirs: [
      'src/core/billing',
      'src/application/billing',
      'src/infra/external-apis/autumn',
      'src/app/(app)/paywall',
      'src/app/api/autumn',
      'src/app/api/billing',
      'src/infra/data-access/billing',
    ],
    schemas: ['src/infra/database/schema/billing-schema'],
    // Reads the active org id via the auth domain (openToAll). The auth domain
    // depends on it for account deletion and personal-data export.
    public: [
      'src/application/billing/get-app-entitlement',
      'src/application/billing/dto',
      'src/application/billing/list-terms-acceptances-for-user',
      'src/application/billing/detach-terms-acceptances-from-user',
      'src/application/billing/delete-organization-billing',
    ],
  },
];

export const ALLOWED_EDGES = [
  ['auth', 'organization'],
  ['auth', 'billing'],
];

export const SHARED_PREFIXES = [
  'src/shared',
  'src/lib',
  'src/components',
  'src/hooks',
  'src/i18n',
  'src/core/errors',
  'src/core/types',
  'src/core/ports',
  'src/global.d',
  'src/instrumentation',
  'src/instrumentation-client',
];

export const DYNAMIC_IMPORT_ALLOWLIST = [
  // locale catalogs are data files resolved by next-intl, not domain modules
  'src/i18n/request.ts',
];
