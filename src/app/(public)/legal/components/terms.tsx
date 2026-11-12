import { getLocale, getTranslations } from 'next-intl/server';
import { getStartupProfile } from '@/shared/startup-profile/startup-profile';
import {
  formatPrice,
  getProPricing,
  vatRegime,
} from '@/shared/storefront/price-line';
import { resolvePublisher } from '@/shared/storefront/publisher';
import { LegalDocument } from './legal-document';
import { LegalSection } from './legal-section';
import { PublisherDetails } from './publisher-details';

export async function Terms(): Promise<React.ReactElement> {
  const [t, tCommon, tStorefront, locale] = await Promise.all([
    getTranslations('Legal.terms'),
    getTranslations('Legal.common'),
    getTranslations('Storefront'),
    getLocale(),
  ]);
  const profile = getStartupProfile();
  const publisher = resolvePublisher(profile.legal);
  const pricing = getProPricing();
  const price = formatPrice({
    amount: pricing.amount,
    currency: pricing.currency,
    locale,
  });
  const contactEmail = publisher.contactEmail || tCommon('contactFallback');
  const termsVersion = profile.legal.termsVersion.trim();

  return (
    <LegalDocument title={t('title')}>
      <LegalSection>
        <p>{t('intro')}</p>
      </LegalSection>
      <LegalSection title={t('seller.title')}>
        <p>
          {publisher.kind === 'company'
            ? t('seller.company')
            : t('seller.individual')}
        </p>
        <PublisherDetails publisher={publisher} />
      </LegalSection>
      <LegalSection title={t('service.title')}>
        <p>
          {t('service.body', {
            name: profile.name || tStorefront('defaultName'),
          })}
        </p>
      </LegalSection>
      <LegalSection title={t('price.title')}>
        <p>
          {pricing.interval === 'month'
            ? t('price.monthly', { price })
            : t('price.yearly', { price })}{' '}
          {vatRegime(profile.legal) === 'franchise'
            ? t('price.franchise')
            : t('price.included')}
        </p>
        <p>{t('price.payment')}</p>
      </LegalSection>
      {pricing.trialDays > 0 ? (
        <LegalSection title={t('trial.title')}>
          <p>{t('trial.body', { days: pricing.trialDays })}</p>
        </LegalSection>
      ) : null}
      <LegalSection title={t('cancellation.title')}>
        <p>{t('cancellation.body')}</p>
      </LegalSection>
      <LegalSection title={t('refunds.title')}>
        <p>{t('refunds.body')}</p>
      </LegalSection>
      <LegalSection title={t('withdrawal.title')}>
        <p>{t('withdrawal.body', { email: contactEmail })}</p>
      </LegalSection>
      <LegalSection title={t('waiver.title')}>
        <p>{t('waiver.body')}</p>
      </LegalSection>
      <LegalSection title={t('availability.title')}>
        <p>{t('availability.body')}</p>
      </LegalSection>
      <LegalSection title={t('data.title')}>
        <p>{t('data.body')}</p>
      </LegalSection>
      <LegalSection title={t('mediation.title')}>
        <p>{t('mediation.body', { email: contactEmail })}</p>
      </LegalSection>
      <LegalSection title={t('law.title')}>
        <p>{t('law.body')}</p>
      </LegalSection>
      {termsVersion ? (
        <p className="text-xs text-slate">
          {tCommon('version', { version: termsVersion })}
        </p>
      ) : null}
    </LegalDocument>
  );
}
