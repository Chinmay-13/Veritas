/** Standard page heading: small eyebrow, serif title, one-line description. */
export function PageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-ink-soft">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
