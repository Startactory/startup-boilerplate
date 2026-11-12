import { getTranslations } from 'next-intl/server';
import { getStartupProfile } from '@/shared/startup-profile/startup-profile';
import { resolvePublisher } from '@/shared/storefront/publisher';
import { LegalDocument } from './legal-document';
import { LegalSection } from './legal-section';
import { PublisherDetails } from './publisher-details';

export async function Notice(): Promise<React.ReactElement> {
  const [t, tStorefront] = await Promise.all([
    getTranslations('Legal.notice'),
    getTranslations('Storefront'),
  ]);
  const profile = getStartupProfile();
  const publisher = resolvePublisher(profile.legal);
  const director =
    publisher.kind === 'company'
      ? publisher.publicationDirector
      : publisher.name;
  const contactEmail = publisher.contactEmail;

  return (
    <LegalDocument title={t('title')}>
      <LegalSection>
        <p>
          {t('intro', { name: profile.name || tStorefront('defaultName') })}
        </p>
      </LegalSection>
      <LegalSection title={t('publisher.title')}>
        <p>
          {publisher.kind === 'company'
            ? t('publisher.company')
            : t('publisher.individual')}
        </p>
        <PublisherDetails publisher={publisher} />
      </LegalSection>
      {director.trim() ? (
        <LegalSection title={t('director.title')}>
          <p>{t('director.body', { director })}</p>
        </LegalSection>
      ) : null}
      <LegalSection title={t('host.title')}>
        <p>{t('host.body')}</p>
      </LegalSection>
      <LegalSection title={t('contact.title')}>
        <p>
          {contactEmail
            ? t('contact.body', { email: contactEmail })
            : t('contact.none')}
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
