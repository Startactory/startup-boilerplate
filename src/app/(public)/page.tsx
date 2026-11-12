import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { findPendingInvitationForCurrentUser } from '@/application/invitations/find-pending-for-current-user';
import { getCurrentUser } from '@/application/me/get-current-user';
import { getStartupProfile } from '@/shared/startup-profile/startup-profile';
import { Hero } from './components/storefront/hero';
import { SiteFooter } from './components/storefront/site-footer';
import { SiteHeader } from './components/storefront/site-header';
import { resolveHomeDestination } from './home-destination';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Storefront');
  return {
    title: getStartupProfile().name || t('defaultName'),
    description: t('hero.subheadline'),
  };
}

export default async function HomePage(): Promise<React.ReactElement> {
  const currentUser = await getCurrentUser();
  const organizationId = currentUser.isOk()
    ? currentUser.value.organizationId
    : null;
  const pending =
    currentUser.isOk() && !organizationId
      ? await findPendingInvitationForCurrentUser()
      : null;

  const destination = resolveHomeDestination({
    signedIn: currentUser.isOk(),
    organizationId,
    pendingInvitationId: pending?.id ?? null,
  });
  if (destination) redirect(destination);

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Hero />
      </main>
      <SiteFooter />
    </div>
  );
}
