import { afterEach, describe, expect, it, vi } from 'vitest';
import { pro } from '../../../autumn.config';
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
    const declaredTrial = pro.freeTrial;
    expect(getProPricing()).toEqual({
      amount: pro.price?.amount,
      interval: pro.price?.interval,
      currency: getStartupProfile().currency,
      trialDays:
        declaredTrial?.durationType === 'day'
          ? Math.max(0, declaredTrial.durationLength)
          : 0,
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

describe('getProPricing trial days', () => {
  async function loadPricingWithFreeTrial(freeTrial: unknown) {
    vi.resetModules();
    vi.doMock('../../../autumn.config', () => ({
      pro: { price: { amount: 20, interval: 'month' }, freeTrial },
    }));
    const priceLine = await import('./price-line');
    return priceLine.getProPricing();
  }

  afterEach(() => {
    vi.doUnmock('../../../autumn.config');
    vi.resetModules();
  });

  it('returns the trial length when the trial is in days', async () => {
    const pricing = await loadPricingWithFreeTrial({
      durationLength: 14,
      durationType: 'day',
      cardRequired: true,
    });
    expect(pricing.trialDays).toBe(14);
  });

  it('returns zero trial days when the trial is not in days', async () => {
    const pricing = await loadPricingWithFreeTrial({
      durationLength: 1,
      durationType: 'month',
      cardRequired: true,
    });
    expect(pricing.trialDays).toBe(0);
  });

  it('clamps a zero-length trial to zero days', async () => {
    const pricing = await loadPricingWithFreeTrial({
      durationLength: 0,
      durationType: 'day',
      cardRequired: false,
    });
    expect(pricing.trialDays).toBe(0);
  });

  it('clamps a negative trial length to zero days', async () => {
    const pricing = await loadPricingWithFreeTrial({
      durationLength: -7,
      durationType: 'day',
      cardRequired: false,
    });
    expect(pricing.trialDays).toBe(0);
  });
});
