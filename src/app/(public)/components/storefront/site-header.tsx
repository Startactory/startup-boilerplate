import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Button } from '@/components/ui/button';

export async function SiteHeader(): Promise<React.ReactElement> {
  const t = await getTranslations('Storefront');

  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between py-4 pl-6 pr-24">
      <Link href="/" aria-label={t('home')}>
        <BrandLogo />
      </Link>
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={<Link href="/sign-in" />}
      >
        {t('signIn')}
      </Button>
    </header>
  );
}
