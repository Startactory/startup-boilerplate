import { describe, expect, it } from 'vitest';
import type { LegalIdentity } from '../startup-profile/startup-profile';
import { resolveMediator } from './mediation';

const company = {
  name: 'Acme SAS',
  form: 'SAS',
  address: '1 rue de Rivoli, 75001 Paris',
  siren: '123456789',
  publicationDirector: 'Ada Lovelace',
};

function legalWith(company: LegalIdentity['company']): LegalIdentity {
  return {
    termsVersion: '2026-11-12',
    founderName: 'Ada Lovelace',
    contactEmail: 'ada@example.com',
    company,
  };
}

describe('resolveMediator', () => {
  it('returns undefined before the company exists', () => {
    expect(resolveMediator(legalWith(null))).toBeUndefined();
  });

  it('returns undefined when the company names no mediator', () => {
    expect(resolveMediator(legalWith(company))).toBeUndefined();
    expect(
      resolveMediator(legalWith({ ...company, mediator: '  ' })),
    ).toBeUndefined();
  });

  it('returns the trimmed mediator when named', () => {
    expect(
      resolveMediator(legalWith({ ...company, mediator: ' Example, x.eu ' })),
    ).toBe('Example, x.eu');
  });
});
