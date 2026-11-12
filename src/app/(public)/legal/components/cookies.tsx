import { getTranslations } from 'next-intl/server';
import { ManageCookiesButton } from '../../components/storefront/manage-cookies-button';
import { LegalDocument } from './legal-document';
import { LegalList, LegalSection } from './legal-section';

export async function Cookies(): Promise<React.ReactElement> {
  const t = await getTranslations('Legal.cookies');

  return (
    <LegalDocument title={t('title')}>
      <LegalSection>
        <p>{t('intro')}</p>
      </LegalSection>
      <LegalSection title={t('list.title')}>
        <LegalList
          items={[t('list.session'), t('list.consent'), t('list.analytics')]}
        />
      </LegalSection>
      <LegalSection title={t('manage.title')}>
        <p>{t('manage.body')}</p>
        <div className="text-sm">
          <ManageCookiesButton />
        </div>
      </LegalSection>
    </LegalDocument>
  );
}
