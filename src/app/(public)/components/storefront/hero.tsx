import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { getStartupProfile } from '@/shared/startup-profile/startup-profile';
import {
  formatPrice,
  getProPricing,
  vatRegime,
} from '@/shared/storefront/price-line';

export async function Hero(): Promise<React.ReactElement> {
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

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <h1 className="text-balance text-[28px] font-semibold leading-tight tracking-tight text-ink">
        {t('hero.headline')}
      </h1>
      <p className="text-balance text-[15px] text-graphite">
        {t('hero.subheadline')}
      </p>
      <div className="flex flex-col items-center gap-2">
        <Button
          size="lg"
          nativeButton={false}
          render={<Link href="/sign-in" />}
        >
          {t('cta')}
        </Button>
        <p className="text-xs text-slate">{priceLine}</p>
      </div>
    </section>
  );
}
