'use client';

import { AutumnProvider, useCustomer } from 'autumn-js/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DevSkipButton } from './dev-skip-button';

// Must match the paid plan id in autumn.config.ts.
const PRO_PLAN_ID = 'pro';

function UpgradeButton(): React.ReactElement {
  const t = useTranslations('Paywall');
  const { attach } = useCustomer();
  const [isPending, setIsPending] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);

  async function recordAcceptance(): Promise<boolean> {
    try {
      const response = await fetch('/api/billing/accept-terms', {
        method: 'POST',
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async function startCheckout(): Promise<void> {
    setIsPending(true);
    try {
      if (!(await recordAcceptance())) {
        toast.error(t('acceptTermsError'));
        return;
      }
      try {
        // Redirects to Stripe checkout when payment is required.
        await attach({ planId: PRO_PLAN_ID });
      } catch {
        toast.error(t('checkoutError'));
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Checkbox
          id="accept-terms"
          checked={hasAcceptedTerms}
          onCheckedChange={setHasAcceptedTerms}
          className="mt-0.5"
        />
        <Label
          htmlFor="accept-terms"
          className="block text-sm font-normal leading-snug"
        >
          {t.rich('acceptTerms', {
            terms: (chunks) => (
              <Link href="/legal/terms" className="underline" target="_blank">
                {chunks}
              </Link>
            ),
          })}
        </Label>
      </div>
      <Button
        type="button"
        loading={isPending}
        disabled={!hasAcceptedTerms}
        onClick={startCheckout}
      >
        {t('upgrade')}
      </Button>
    </div>
  );
}

export function PaywallView({
  logo,
  priceLine,
  showDevSkip,
}: {
  logo: React.ReactNode;
  priceLine: React.ReactNode;
  showDevSkip: boolean;
}): React.ReactElement {
  const t = useTranslations('Paywall');

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6">
      {logo}
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            {t('title')}
          </CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {priceLine}
          <AutumnProvider>
            <UpgradeButton />
          </AutumnProvider>
          {showDevSkip ? <DevSkipButton /> : null}
        </CardContent>
      </Card>
    </main>
  );
}
