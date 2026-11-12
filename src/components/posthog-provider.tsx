'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PostHogContextProvider } from 'posthog-js/react';
import { type ReactNode, useEffect, useRef } from 'react';
import { useConsent } from '@/components/cookie-consent/consent-store';
import { authClient } from '@/shared/auth-client';

function PostHogIdentity(): null {
  const { data: session } = authClient.useSession();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const consent = useConsent();
  const identifiedUserId = useRef<string | null>(null);
  const groupedOrganizationId = useRef<string | null>(null);

  useEffect(() => {
    if (consent !== 'granted') {
      identifiedUserId.current = null;
      return;
    }
    if (!posthog.__loaded) return;

    const user = session?.user;
    if (!user) {
      if (identifiedUserId.current) {
        posthog.reset();
        identifiedUserId.current = null;
        groupedOrganizationId.current = null;
      }
      return;
    }

    if (identifiedUserId.current !== user.id) {
      posthog.identify(user.id, { email: user.email, name: user.name });
      identifiedUserId.current = user.id;
    }
  }, [session, consent]);

  useEffect(() => {
    if (consent !== 'granted') {
      groupedOrganizationId.current = null;
      return;
    }
    if (!posthog.__loaded) return;
    const organizationId = activeOrganization?.id;
    if (!organizationId || groupedOrganizationId.current === organizationId)
      return;
    posthog.group('organization', organizationId, {
      name: activeOrganization.name,
    });
    groupedOrganizationId.current = organizationId;
  }, [activeOrganization, consent]);

  return null;
}

export function PostHogProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return children;
  return (
    <PostHogContextProvider client={posthog}>
      <PostHogIdentity />
      {children}
    </PostHogContextProvider>
  );
}
