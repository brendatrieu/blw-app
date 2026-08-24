import { Link, Navigate, useParams } from "react-router-dom";
import { getSafetyArticle } from "../features/safety/content.js";
import { Markdown } from "../lib/markdown/Markdown.js";
import { PageHeader } from "../components/ui/PageHeader.js";

export function SafetyArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = slug ? getSafetyArticle(slug) : undefined;

  // An unknown or stale slug (e.g. a bookmarked link to a removed article)
  // falls back to the index rather than a dead end.
  if (!article) {
    return <Navigate to="/safety" replace />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link
        to="/safety"
        className="flex w-fit min-h-9 items-center text-sm font-medium text-[var(--color-primary)] underline underline-offset-2"
      >
        {"← Safety Library"}
      </Link>

      <PageHeader title={article.title} description={article.summary} />

      <Markdown content={article.body} />
    </div>
  );
}
