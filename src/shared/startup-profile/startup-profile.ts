import * as v from 'valibot';
import profileJson from './profile.json';

const CompanySchema = v.object({
  name: v.string(),
  form: v.string(),
  address: v.string(),
  siren: v.string(),
  publicationDirector: v.string(),
  rcs: v.optional(v.string()),
  vatNumber: v.optional(v.string()),
  shareCapital: v.optional(v.string()),
});

const LegalIdentitySchema = v.object({
  termsVersion: v.string(),
  founderName: v.string(),
  contactEmail: v.string(),
  company: v.nullable(CompanySchema),
});

const StartupProfileSchema = v.object({
  name: v.string(),
  brand: v.object({
    icon: v.string(),
    accent: v.pipe(v.string(), v.regex(/^#[0-9a-f]{6}$/i)),
  }),
  currency: v.string(),
  legal: LegalIdentitySchema,
});

export type LegalIdentity = v.InferOutput<typeof LegalIdentitySchema>;
export type StartupProfile = v.InferOutput<typeof StartupProfileSchema>;

let cachedProfile: StartupProfile | undefined;

export function getStartupProfile(): StartupProfile {
  cachedProfile ??= v.parse(StartupProfileSchema, profileJson);
  return cachedProfile;
}
