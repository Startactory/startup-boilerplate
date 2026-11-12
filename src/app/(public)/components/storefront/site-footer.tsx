import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ManageCookiesButton } from './manage-cookies-button';

const LEGAL_LINKS = [
  { href: '/legal/notice', key: 'notice' },
  { href: '/legal/terms', key: 'terms' },
  { href: '/legal/privacy', key: 'privacy' },
  { href: '/legal/cookies', key: 'cookies' },
] as const;

export async function SiteFooter(): Promise<React.ReactElement> {
  const t = await getTranslations('Storefront');

  return (
    <footer className="border-t border-stone">
      <nav
        aria-label={t('footer.label')}
        className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 py-6 text-xs"
      >
        {LEGAL_LINKS.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            className="text-slate underline-offset-4 hover:text-ink hover:underline"
          >
            {t(`footer.${link.key}`)}
          </Link>
        ))}
        <ManageCookiesButton />
      </nav>
    </footer>
  );
}
