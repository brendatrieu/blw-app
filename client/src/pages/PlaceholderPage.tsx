interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-2 p-4">
      <h1 className="text-xl font-semibold" style={{ color: "var(--color-text)" }}>
        {title}
      </h1>
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        {description ?? "Coming soon."}
      </p>
    </div>
  );
}
