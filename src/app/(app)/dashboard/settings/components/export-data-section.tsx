'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type ExportOutcome = 'downloaded' | 'rate_limited' | 'failed';

const FALLBACK_FILE_NAME = 'data-export.json';

function fileNameFrom(contentDisposition: string | null): string {
  const match = contentDisposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? FALLBACK_FILE_NAME;
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function downloadPersonalData(): Promise<ExportOutcome> {
  try {
    const response = await fetch('/api/me/export', { cache: 'no-store' });
    if (response.status === 429) return 'rate_limited';
    if (!response.ok) return 'failed';
    const blob = await response.blob();
    saveBlob(blob, fileNameFrom(response.headers.get('content-disposition')));
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

export function ExportDataSection(): React.ReactElement {
  const t = useTranslations('Settings');
  const [isExporting, startExport] = useTransition();

  const handleExport = (): void => {
    startExport(async () => {
      const outcome = await downloadPersonalData();
      if (outcome === 'rate_limited') toast.error(t('rateLimited'));
      if (outcome === 'failed') toast.error(t('exportError'));
    });
  };

  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-graphite uppercase tracking-wide">
        {t('dataSection')}
      </h2>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-stone bg-paper px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-ink">
            {t('exportTitle')}
          </span>
          <span className="text-[12px] text-slate-neutral">
            {t('exportDescription')}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExport}
          loading={isExporting}
        >
          <Download className="size-3.5" />
          {t('exportAction')}
        </Button>
      </div>
    </section>
  );
}
