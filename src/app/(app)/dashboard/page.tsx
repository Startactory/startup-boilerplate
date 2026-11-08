import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DashboardHomeContent } from './components/dashboard-home-content';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  return { title: t('dashboard') };
}

export default function DashboardHomePage(): React.ReactElement {
  return <DashboardHomeContent />;
}
