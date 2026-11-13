import { getLocale, getTranslations } from 'next-intl/server';
import { getStartupProfile } from '@/shared/startup-profile/startup-profile';
import {
  formatPrice,
  getProPricing,
  vatRegime,
} from '@/shared/storefront/price-line';

type Props = {
  className?: string;
};

export async function ProPriceLine({
  className,
}: Props): Promise<React.ReactElement> {
  const [t, locale] = await Promise.all([
    getTranslations('Storefront'),
    getLocale(),
  ]);
  const pricing = getProPricing();
  const price = formatPrice({
    amount: pricing.amount,
    currency: pricing.currency,
    locale,
  });
  const priceText =
    pricing.interval === 'month'
      ? t('priceMonthly', { price })
      : t('priceYearly', { price });
  const vatText =
    vatRegime(getStartupProfile().legal) === 'franchise'
      ? t('vat.franchise')
      : t('vat.included');
  const trialText =
    pricing.trialDays > 0 ? t('trial', { days: pricing.trialDays }) : null;
  const priceLine = [priceText, vatText, trialText].filter(Boolean).join(' · ');

  return <p className={className}>{priceLine}</p>;
}
