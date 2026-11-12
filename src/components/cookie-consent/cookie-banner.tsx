'use client';

import { useTranslations } from 'next-intl';
import {
  openCookiePreferences,
  setConsent,
  useConsent,
} from '@/components/cookie-consent/consent-store';
import { CookiePreferencesDialog } from '@/components/cookie-consent/cookie-preferences-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function CookieBanner(): React.ReactNode {
  const t = useTranslations('CookieConsent');
  const consent = useConsent();

  return (
    <>
      {consent === 'unset' && (
        <Card
          role="region"
          aria-label={t('bannerLabel')}
          className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-xl gap-3 px-4 shadow-lg"
        >
          <p>{t('bannerMessage')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setConsent('denied')}>
              {t('refuse')}
            </Button>
            <Button variant="outline" onClick={() => setConsent('granted')}>
              {t('accept')}
            </Button>
            <Button variant="link" onClick={openCookiePreferences}>
              {t('customize')}
            </Button>
          </div>
        </Card>
      )}
      <CookiePreferencesDialog />
    </>
  );
}
