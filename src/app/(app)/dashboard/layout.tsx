import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { getCurrentUser } from '@/application/me/get-current-user';
import { DashboardMainShell } from './components/dashboard-main-shell';
import { DashboardWrapper } from './components/dashboard-wrapper';
import { ToastFromSearchParams } from './components/toast-from-search-params';

export default async function DashboardLayout({
  children,
  header,
  chat,
}: {
  children: ReactNode;
  header: ReactNode;
  chat: ReactNode;
}): Promise<React.ReactElement> {
  const currentUser = await getCurrentUser();
  if (currentUser.isErr()) redirect('/sign-in');
  if (!currentUser.value.organizationId) redirect('/onboarding');

  return (
    <DashboardWrapper user={currentUser.value} chat={chat}>
      <Suspense fallback={null}>
        <ToastFromSearchParams />
      </Suspense>
      <DashboardMainShell header={header}>{children}</DashboardMainShell>
    </DashboardWrapper>
  );
}
