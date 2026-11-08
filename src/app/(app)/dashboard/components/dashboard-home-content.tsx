'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/empty-state';
import { AppPageHeader } from './app-page-header';
import { DashboardPageHeaderBridge } from './dashboard-page-header-bridge';

export function DashboardHomeContent() {
  const tNav = useTranslations('Nav');
  const t = useTranslations('Home');

  return (
    <>
      <DashboardPageHeaderBridge>
        <AppPageHeader title={tNav('dashboard')} />
      </DashboardPageHeaderBridge>
      <EmptyState
        icon={Sparkles}
        title={t('title')}
        description={t('description')}
      />
    </>
  );
}
