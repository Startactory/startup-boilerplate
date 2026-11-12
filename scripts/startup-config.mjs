import * as v from 'valibot';

export const SLUG_PATTERN_RUN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const text = v.string();
const requiredText = v.pipe(text, v.nonEmpty('must not be empty'));

export const Company = v.object({
  name: text,
  form: text,
  address: text,
  siren: text,
  publicationDirector: text,
  rcs: v.optional(text),
  vatNumber: v.optional(text),
  shareCapital: v.optional(text),
  mediator: v.optional(text),
});

export const Legal = v.object({
  termsVersion: text,
  founderName: text,
  contactEmail: text,
  company: v.nullable(Company),
});

// A single-prompt run always starts before the company exists.
const RunLegal = v.object({
  ...Legal.entries,
  founderName: requiredText,
  contactEmail: v.pipe(text, v.email('must be an email address')),
  company: v.null('must be null until the company exists'),
});

const currencyCode = v.pipe(
  text,
  v.regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO 4217 code'),
  v.check(
    (code) => Intl.supportedValuesOf('currency').includes(code),
    'is not a valid currency code',
  ),
);

const Pricing = v.object({
  source: v.picklist(['founder', 'derived']),
  customer: v.picklist(['individual', 'team', 'business']),
  amount: v.pipe(v.number(), v.gtValue(0, 'must be greater than 0')),
  interval: v.picklist(['month', 'year']),
  currency: currencyCode,
  trialDays: v.pipe(v.number(), v.integer(), v.minValue(0)),
  cardRequired: v.boolean(),
  rationale: text,
  deferred: v.optional(v.array(v.unknown())),
});

const Brand = v.object({
  icon: requiredText,
  accent: v.pipe(text, v.regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb color')),
});

export const RunConfig = v.looseObject({
  name: requiredText,
  slug: v.pipe(
    text,
    v.minLength(3, 'must be at least 3 characters'),
    v.maxLength(26, 'must be at most 26 characters'),
    v.regex(SLUG_PATTERN_RUN, 'must be lowercase letters, digits and hyphens'),
  ),
  domain: v.literal('', 'must be empty until a domain is bought'),
  gdpr: v.boolean(),
  dataRegion: v.picklist(['eu', 'us']),
  idea: requiredText,
  githubOwner: requiredText,
  pricing: Pricing,
  brand: Brand,
  legal: RunLegal,
  repository: v.optional(
    v.pipe(text, v.regex(/^[^/\s]+\/[^/\s]+$/, 'must be <owner>/<name>')),
  ),
  productionUrl: v.optional(
    v.pipe(
      text,
      v.regex(
        /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
        'must be https://<host>.vercel.app with no path',
      ),
    ),
  ),
  createdStep: v.optional(v.unknown()),
});

export function validateRunConfig(config) {
  const result = v.safeParse(RunConfig, config, { abortEarly: false });
  if (result.success) return { ok: true };
  const issues = result.issues.map((issue) => {
    const path = (issue.path ?? []).map((item) => item.key).join('.');
    return `${path}: ${issue.message}`;
  });
  return { ok: false, issues };
}
