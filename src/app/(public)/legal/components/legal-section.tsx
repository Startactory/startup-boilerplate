type Props = {
  title?: string;
  children: React.ReactNode;
};

export function LegalSection({ title, children }: Props): React.ReactElement {
  return (
    <section className="flex flex-col gap-3">
      {title ? (
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
      ) : null}
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-graphite">
        {children}
      </div>
    </section>
  );
}

export function LegalList({
  items,
}: {
  items: readonly string[];
}): React.ReactElement {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
