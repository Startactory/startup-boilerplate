import { pro } from '../../../autumn.config';
import {
  getStartupProfile,
  type LegalIdentity,
} from '../startup-profile/startup-profile';

export type ProPricing = {
  amount: number;
  interval: 'month' | 'year';
  currency: string;
  trialDays: number;
};

export type VatRegime = 'franchise' | 'vat';

export function getProPricing(): ProPricing {
  const price = pro.price;
  if (!price) throw new Error('The pro plan has no price in autumn.config.ts');
  if (price.interval !== 'month' && price.interval !== 'year') {
    throw new Error(`Unsupported pro plan interval: ${price.interval}`);
  }

  const freeTrial = pro.freeTrial;
  const trialDays =
    freeTrial?.durationType === 'day' ? freeTrial.durationLength : 0;

  return {
    amount: price.amount,
    interval: price.interval,
    currency: getStartupProfile().currency,
    trialDays,
  };
}

export function formatPrice(input: {
  amount: number;
  currency: string;
  locale: string;
}): string {
  return new Intl.NumberFormat(input.locale, {
    style: 'currency',
    currency: input.currency,
  }).format(input.amount);
}

export function vatRegime(legal: LegalIdentity): VatRegime {
  const vatNumber = legal.company?.vatNumber?.trim();
  return vatNumber ? 'vat' : 'franchise';
}
