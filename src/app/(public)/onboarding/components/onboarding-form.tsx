'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import posthog from 'posthog-js';
import { useState, useTransition } from 'react';
import type { CreateFirstOrganizationResult } from '@/application/organization/create-first-organization';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// The route mirrors CreateFirstOrganizationResult for every mapped outcome,
// but transport-level failures (rate limit, malformed body) use another shape.
async function requestFirstOrganization(input: {
  organizationName: string;
}): Promise<CreateFirstOrganizationResult> {
  try {
    const res = await fetch('/api/organization/create-first', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'success' in body) {
      return body as CreateFirstOrganizationResult;
    }
    return { success: false, error: 'unknown' };
  } catch {
    return { success: false, error: 'unknown' };
  }
}

export function OnboardingForm({
  brandMark,
}: {
  brandMark: React.ReactNode;
}): React.ReactElement {
  const t = useTranslations('Onboarding');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (formData: FormData): void => {
    setError(null);
    startTransition(async () => {
      const result = await requestFirstOrganization({
        organizationName: String(formData.get('orgName') ?? ''),
      });

      if (result.success) {
        posthog.capture('onboarding_completed', {
          org_name: String(formData.get('orgName') ?? ''),
        });
        router.replace('/dashboard');
        return;
      }

      switch (result.error) {
        case 'invalid_input':
          setError(t('invalidOrgName'));
          break;
        case 'unauthenticated':
          router.replace('/sign-in');
          break;
        case 'already_in_org':
          router.replace('/dashboard');
          break;
        default:
          setError(t('unknownError'));
      }
    });
  };

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background">
      {brandMark}
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            {t('title')}
          </CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="orgName">{t('orgName')}</Label>
              <Input
                id="orgName"
                name="orgName"
                required
                autoComplete="organization"
                minLength={2}
                maxLength={100}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" loading={isPending}>
              {t('submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
