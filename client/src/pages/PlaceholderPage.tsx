import { PageHeader } from "../components/ui/PageHeader.js";

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="p-4">
      <PageHeader title={title} description={description ?? "Coming soon."} />
    </div>
  );
}
