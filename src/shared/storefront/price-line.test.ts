import { describe, expect, it } from 'vitest';
import {
  getStartupProfile,
  type LegalIdentity,
} from '../startup-profile/startup-profile';
import { formatPrice, getProPricing, vatRegime } from './price-line';

const company: NonNullable<LegalIdentity['company']> = {
  name: 'Example SAS',
  form: 'SAS',
  address: '1 rue Example',
  siren: '123456789',
  publicationDirector: 'Ada',
  vatNumber: 'FR12345678901',
};

const companyLegal: LegalIdentity = {
  termsVersion: '1',
  founderName: 'Ada',
  contactEmail: 'ada@example.com',
  company,
};

describe('getProPricing', () => {
  it('reads the committed pro plan price and the profile currency', () => {
    expect(getProPricing()).toEqual({
      amount: 20,
      interval: 'month',
      currency: getStartupProfile().currency,
      trialDays: 0,
    });
  });
});

describe('formatPrice', () => {
  it('formats the amount with the French decimal separator and the euro sign', () => {
    const formatted = formatPrice({
      amount: 9.99,
      currency: 'EUR',
      locale: 'fr',
    });
    expect(formatted).toContain('9,99');
    expect(formatted).toContain('€');
  });

  it('formats the amount with the English conventions', () => {
    const formatted = formatPrice({
      amount: 20,
      currency: 'EUR',
      locale: 'en',
    });
    expect(formatted).toContain('20');
    expect(formatted).toContain('€');
  });
});

describe('vatRegime', () => {
  it('is franchise when there is no company', () => {
    expect(vatRegime(getStartupProfile().legal)).toBe('franchise');
  });

  it('is franchise when the company has no VAT number', () => {
    const legal: LegalIdentity = {
      ...companyLegal,
      company: { ...company, vatNumber: undefined },
    };
    expect(vatRegime(legal)).toBe('franchise');
  });

  it('is franchise when the VAT number is blank', () => {
    const legal: LegalIdentity = {
      ...companyLegal,
      company: { ...company, vatNumber: '   ' },
    };
    expect(vatRegime(legal)).toBe('franchise');
  });

  it('is vat when the company has a VAT number', () => {
    expect(vatRegime(companyLegal)).toBe('vat');
  });
});
