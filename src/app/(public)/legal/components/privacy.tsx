import { getTranslations } from 'next-intl/server';
import { getStartupProfile } from '@/shared/startup-profile/startup-profile';
import { resolvePublisher } from '@/shared/storefront/publisher';
import { LegalDocument } from './legal-document';
import { LegalList, LegalSection } from './legal-section';
import { PublisherDetails } from './publisher-details';

export async function Privacy(): Promise<React.ReactElement> {
  const [t, tCommon, tStorefront] = await Promise.all([
    getTranslations('Legal.privacy'),
    getTranslations('Legal.common'),
    getTranslations('Storefront'),
  ]);
  const profile = getStartupProfile();
  const publisher = resolvePublisher(profile.legal);
  const contactEmail = publisher.contactEmail || tCommon('contactFallback');

  return (
    <LegalDocument title={t('title')}>
      <LegalSection>
        <p>
          {t('intro', { name: profile.name || tStorefront('defaultName') })}
        </p>
      </LegalSection>
      <LegalSection title={t('controller.title')}>
        <p>
          {publisher.kind === 'company'
            ? t('controller.company')
            : t('controller.individual')}
        </p>
        <PublisherDetails publisher={publisher} />
      </LegalSection>
      <LegalSection title={t('collected.title')}>
        <p>{t('collected.intro')}</p>
        <LegalList
          items={[
            t('collected.account'),
            t('collected.organization'),
            t('collected.billing'),
            t('collected.technical'),
            t('collected.analytics'),
          ]}
        />
      </LegalSection>
      <LegalSection title={t('purposes.title')}>
        <p>{t('purposes.intro')}</p>
        <LegalList
          items={[
            t('purposes.contract'),
            t('purposes.security'),
            t('purposes.legal'),
            t('purposes.analytics'),
          ]}
        />
      </LegalSection>
      <LegalSection title={t('retention.title')}>
        <LegalList
          items={[
            t('retention.account'),
            t('retention.billing'),
            t('retention.analytics'),
            t('retention.technical'),
          ]}
        />
      </LegalSection>
      <LegalSection title={t('processors.title')}>
        <p>{t('processors.intro')}</p>
        <LegalList
          items={[
            t('processors.supabase'),
            t('processors.vercel'),
            t('processors.posthog'),
            t('processors.dash0'),
            t('processors.email'),
            t('processors.autumn'),
            t('processors.stripe'),
            t('processors.google'),
          ]}
        />
      </LegalSection>
      <LegalSection title={t('transfers.title')}>
        <p>{t('transfers.body')}</p>
      </LegalSection>
      <LegalSection title={t('rights.title')}>
        <p>{t('rights.intro')}</p>
        <p>{t('rights.contact', { email: contactEmail })}</p>
        <p>{t('rights.complaint')}</p>
      </LegalSection>
    </LegalDocument>
  );
}
