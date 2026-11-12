import { icons } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { getStartupProfile } from '@/shared/startup-profile/startup-profile';

type Props = {
  showName?: boolean;
  className?: string;
};

export async function BrandLogo({
  showName = true,
  className,
}: Props): Promise<React.ReactElement> {
  const t = await getTranslations('Storefront');
  const profile = getStartupProfile();
  const name = profile.name || t('defaultName');
  const Icon =
    icons[profile.brand.icon as keyof typeof icons] ?? icons.Sparkles;

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="flex size-8 items-center justify-center rounded-md bg-charcoal text-white">
        <Icon className="size-4" aria-hidden />
      </span>
      {showName ? (
        <span className="text-[15px] font-semibold text-ink">{name}</span>
      ) : (
        <span className="sr-only">{name}</span>
      )}
    </span>
  );
}
