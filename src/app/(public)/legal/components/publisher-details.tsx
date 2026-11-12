import { getTranslations } from 'next-intl/server';
import type { Publisher } from '@/shared/storefront/publisher';

type Row = { label: string; value: string | undefined };

export async function PublisherDetails({
  publisher,
}: {
  publisher: Publisher;
}): Promise<React.ReactElement> {
  const t = await getTranslations('Legal.common');

  const rows: Row[] =
    publisher.kind === 'individual'
      ? [
          { label: t('fields.name'), value: publisher.name },
          { label: t('fields.status'), value: t('individualStatus') },
          { label: t('fields.contactEmail'), value: publisher.contactEmail },
        ]
      : [
          { label: t('fields.name'), value: publisher.name },
          { label: t('fields.legalForm'), value: publisher.form },
          { label: t('fields.address'), value: publisher.address },
          { label: t('fields.siren'), value: publisher.siren },
          { label: t('fields.rcs'), value: publisher.rcs },
          { label: t('fields.vatNumber'), value: publisher.vatNumber },
          { label: t('fields.shareCapital'), value: publisher.shareCapital },
          { label: t('fields.contactEmail'), value: publisher.contactEmail },
        ];

  const filledRows = rows.filter((row) => row.value?.trim());

  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
      {filledRows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-slate">{row.label}</dt>
          <dd className="text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
