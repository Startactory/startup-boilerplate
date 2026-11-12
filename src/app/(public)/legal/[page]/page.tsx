import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isLegalPage } from '@/shared/storefront/publisher';
import { Cookies } from '../components/cookies';
import { Notice } from '../components/notice';
import { Privacy } from '../components/privacy';
import { Terms } from '../components/terms';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const { page } = await params;
  if (!isLegalPage(page)) return {};
  const t = await getTranslations(`Legal.${page}`);
  return { title: t('title') };
}

export default async function LegalPageRoute({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<React.ReactElement> {
  const { page } = await params;
  if (!isLegalPage(page)) notFound();

  switch (page) {
    case 'notice':
      return <Notice />;
    case 'terms':
      return <Terms />;
    case 'privacy':
      return <Privacy />;
    case 'cookies':
      return <Cookies />;
  }
}
