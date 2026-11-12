import { describe, expect, it } from 'vitest';
import type { LegalIdentity } from '../startup-profile/startup-profile';
import { isLegalPage, LEGAL_PAGES, resolvePublisher } from './publisher';

const neutralLegal: LegalIdentity = {
  termsVersion: '',
  founderName: '',
  contactEmail: '',
  company: null,
};

const companyLegal: LegalIdentity = {
  termsVersion: '1',
  founderName: 'Ada Lovelace',
  contactEmail: 'ada@example.com',
  company: {
    name: 'Example SAS',
    form: 'SAS',
    address: '1 rue Example, 75001 Paris',
    siren: '123456789',
    publicationDirector: 'Ada Lovelace',
    rcs: 'Paris B 123 456 789',
    vatNumber: 'FR12345678901',
    shareCapital: '1 000 EUR',
  },
};

describe('isLegalPage', () => {
  it('accepts every legal page slug', () => {
    for (const slug of LEGAL_PAGES) expect(isLegalPage(slug)).toBe(true);
    expect(isLegalPage('terms')).toBe(true);
  });

  it('rejects unknown slugs', () => {
    expect(isLegalPage('foo')).toBe(false);
    expect(isLegalPage('')).toBe(false);
  });
});

describe('resolvePublisher', () => {
  it('resolves the neutral profile to an individual with empty fields', () => {
    expect(resolvePublisher(neutralLegal)).toEqual({
      kind: 'individual',
      name: '',
      contactEmail: '',
    });
  });

  it('resolves the founder as an individual before the company exists', () => {
    expect(
      resolvePublisher({ ...neutralLegal, founderName: 'Ada Lovelace' }),
    ).toEqual({ kind: 'individual', name: 'Ada Lovelace', contactEmail: '' });
  });

  it('resolves the company once it exists', () => {
    expect(resolvePublisher(companyLegal)).toEqual({
      kind: 'company',
      name: 'Example SAS',
      form: 'SAS',
      address: '1 rue Example, 75001 Paris',
      siren: '123456789',
      rcs: 'Paris B 123 456 789',
      vatNumber: 'FR12345678901',
      shareCapital: '1 000 EUR',
      publicationDirector: 'Ada Lovelace',
      contactEmail: 'ada@example.com',
    });
  });
});
