'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setDevPaywallSkip } from '@/application/billing/set-dev-paywall-skip';
import { Button } from '@/components/ui/button';

export function DevSkipButton(): React.ReactElement {
  const t = useTranslations('Paywall');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      loading={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await setDevPaywallSkip();
          if (result.success) router.replace('/dashboard');
        });
      }}
    >
      {t('devSkip')}
    </Button>
  );
}
