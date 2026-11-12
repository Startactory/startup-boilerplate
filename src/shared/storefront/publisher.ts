import type { LegalIdentity } from '../startup-profile/startup-profile';

export const LEGAL_PAGES = ['notice', 'terms', 'privacy', 'cookies'] as const;

export type LegalPage = (typeof LEGAL_PAGES)[number];

export function isLegalPage(slug: string): slug is LegalPage {
  return (LEGAL_PAGES as readonly string[]).includes(slug);
}

export type Publisher =
  | { kind: 'individual'; name: string; contactEmail: string }
  | {
      kind: 'company';
      name: string;
      form: string;
      address: string;
      siren: string;
      rcs?: string;
      vatNumber?: string;
      shareCapital?: string;
      publicationDirector: string;
      contactEmail: string;
    };

export function resolvePublisher(legal: LegalIdentity): Publisher {
  const { company } = legal;
  if (!company) {
    return {
      kind: 'individual',
      name: legal.founderName,
      contactEmail: legal.contactEmail,
    };
  }
  return {
    kind: 'company',
    name: company.name,
    form: company.form,
    address: company.address,
    siren: company.siren,
    rcs: company.rcs,
    vatNumber: company.vatNumber,
    shareCapital: company.shareCapital,
    publicationDirector: company.publicationDirector,
    contactEmail: legal.contactEmail,
  };
}
