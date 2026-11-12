'use client';

import { useTranslations } from 'next-intl';
import { openCookiePreferences } from '@/components/cookie-consent/consent-store';

export function ManageCookiesButton(): React.ReactElement {
  const t = useTranslations('Storefront');

  return (
    <button
      type="button"
      onClick={openCookiePreferences}
      className="text-slate underline-offset-4 hover:text-ink hover:underline"
    >
      {t('footer.manageCookies')}
    </button>
  );
}
