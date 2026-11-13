import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ProPriceLine } from '@/components/pricing/pro-price-line';
import { Button } from '@/components/ui/button';

export async function Hero(): Promise<React.ReactElement> {
  const t = await getTranslations('Storefront');

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <h1 className="text-balance text-[28px] font-semibold leading-tight tracking-tight text-ink">
        {t('hero.headline')}
      </h1>
      <p className="text-balance text-[15px] text-graphite">
        {t('hero.subheadline')}
      </p>
      <div className="flex flex-col items-center gap-2">
        <Button
          size="lg"
          nativeButton={false}
          render={<Link href="/sign-in" />}
        >
          {t('cta')}
        </Button>
        <ProPriceLine className="text-xs text-slate" />
      </div>
    </section>
  );
}
