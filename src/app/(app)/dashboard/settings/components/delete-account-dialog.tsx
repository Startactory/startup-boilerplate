'use client';

import { useTranslations } from 'next-intl';
import posthog from 'posthog-js';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isDeletionConfirmed } from '@/core/account/services/account-deletion';

type DeletionOutcome =
  | 'deleted'
  | 'mismatch'
  | 'owner_blocked'
  | 'rate_limited'
  | 'failed';

const ERROR_MESSAGE_KEYS = {
  mismatch: 'deleteConfirmMismatch',
  owner_blocked: 'deleteOwnerBlocked',
  rate_limited: 'rateLimited',
  failed: 'deleteError',
} as const satisfies Record<Exclude<DeletionOutcome, 'deleted'>, string>;

const CONFIRMATION_INPUT_ID = 'delete-account-confirmation';

async function requestAccountDeletion(
  confirmationEmail: string,
): Promise<DeletionOutcome> {
  try {
    const response = await fetch('/api/me/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmationEmail }),
    });
    if (response.ok) return 'deleted';
    if (response.status === 400) return 'mismatch';
    if (response.status === 409) return 'owner_blocked';
    if (response.status === 429) return 'rate_limited';
    return 'failed';
  } catch {
    return 'failed';
  }
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
};

export function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
}: Props): React.ReactElement {
  const t = useTranslations('Settings');
  const [confirmation, setConfirmation] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isConfirmed = isDeletionConfirmed({
    typedConfirmation: confirmation,
    accountEmail: email,
  });

  const handleOpenChange = (nextOpen: boolean): void => {
    if (isPending) return;
    if (!nextOpen) {
      setConfirmation('');
      setErrorMessage(null);
    }
    onOpenChange(nextOpen);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!isConfirmed) return;
    setErrorMessage(null);
    startTransition(async () => {
      const outcome = await requestAccountDeletion(confirmation);
      if (outcome === 'deleted') {
        if (posthog.__loaded) posthog.reset();
        window.location.href = '/';
        return;
      }
      setErrorMessage(t(ERROR_MESSAGE_KEYS[outcome]));
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('deleteDialogTitle')}</DialogTitle>
          <DialogDescription>{t('deleteDialogDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-graphite">
            <li>{t('deleteConsequenceAccount')}</li>
            <li>{t('deleteConsequenceOrganizations')}</li>
            <li>{t('deleteConsequenceMemberships')}</li>
          </ul>
          <div className="flex flex-col gap-2">
            <Label htmlFor={CONFIRMATION_INPUT_ID}>
              {t('deleteConfirmLabel', { email })}
            </Label>
            <Input
              id={CONFIRMATION_INPUT_ID}
              name="confirmationEmail"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={email}
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                setErrorMessage(null);
              }}
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={
                errorMessage ? `${CONFIRMATION_INPUT_ID}-error` : undefined
              }
              disabled={isPending}
            />
            {errorMessage && (
              <p
                id={`${CONFIRMATION_INPUT_ID}-error`}
                role="alert"
                className="text-[12px] text-destructive"
              >
                {errorMessage}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {t('deleteCancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              className="border-transparent bg-destructive text-paper hover:bg-destructive/90"
              disabled={!isConfirmed}
              loading={isPending}
            >
              {t('deleteConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
