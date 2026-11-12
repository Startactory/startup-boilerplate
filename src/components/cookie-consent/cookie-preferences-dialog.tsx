'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  closeCookiePreferences,
  setConsent,
  useConsent,
  useCookiePreferencesOpen,
} from '@/components/cookie-consent/consent-store';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

function PreferencesForm(): React.ReactNode {
  const t = useTranslations('CookieConsent');
  const consent = useConsent();
  const [analyticsEnabled, setAnalyticsEnabled] = useState(
    consent === 'granted',
  );

  function save(): void {
    setConsent(analyticsEnabled ? 'granted' : 'denied');
    closeCookiePreferences();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('preferencesTitle')}</DialogTitle>
        <DialogDescription>{t('preferencesDescription')}</DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="cookie-analytics">{t('analyticsLabel')}</Label>
        <Switch
          id="cookie-analytics"
          checked={analyticsEnabled}
          onCheckedChange={setAnalyticsEnabled}
        />
      </div>
      <DialogFooter>
        <Button onClick={save}>{t('save')}</Button>
      </DialogFooter>
    </>
  );
}

export function CookiePreferencesDialog(): React.ReactNode {
  const open = useCookiePreferencesOpen();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeCookiePreferences();
      }}
    >
      <DialogContent>
        <PreferencesForm />
      </DialogContent>
    </Dialog>
  );
}
