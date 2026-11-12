import { SiteFooter } from '../../components/storefront/site-footer';
import { SiteHeader } from '../../components/storefront/site-header';

type Props = {
  title: string;
  children: React.ReactNode;
};

export function LegalDocument({ title, children }: Props): React.ReactElement {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <article className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink">
            {title}
          </h1>
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
