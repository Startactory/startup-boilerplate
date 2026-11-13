import { redirect } from 'next/navigation';
import { getAppEntitlement } from '@/application/billing/get-app-entitlement';
import { BrandLogo } from '@/components/brand/brand-logo';
import { ProPriceLine } from '@/components/pricing/pro-price-line';
import { env } from '@/shared/env';
import { PaywallView } from './components/paywall-view';

export default async function PaywallPage(): Promise<React.ReactElement> {
  const entitlement = await getAppEntitlement();
  if (entitlement.isOk() && entitlement.value.allowed) {
    redirect('/dashboard');
  }

  const showDevSkip = env().VERCEL_ENV !== 'production';
  return (
    <PaywallView
      brandMark={<BrandLogo />}
      priceLine={<ProPriceLine className="text-sm font-medium text-ink" />}
      showDevSkip={showDevSkip}
    />
  );
}
