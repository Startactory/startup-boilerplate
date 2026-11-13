'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DeleteAccountDialog } from './delete-account-dialog';

export function DeleteAccountSection({
  email,
}: {
  email: string;
}): React.ReactElement {
  const t = useTranslations('Settings');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-graphite uppercase tracking-wide">
        {t('dangerZoneSection')}
      </h2>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-stone bg-paper px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-ink">
            {t('deleteTitle')}
          </span>
          <span className="text-[12px] text-slate-neutral">
            {t('deleteDescription')}
          </span>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
          disabled={!email}
        >
          <Trash2 className="size-3.5" />
          {t('deleteAction')}
        </Button>
      </div>
      <DeleteAccountDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        email={email}
      />
    </section>
  );
}
