import { Link, Navigate, useParams } from "react-router-dom";
import { getSafetyArticle } from "../features/safety/content.js";
import { Markdown } from "../lib/markdown/Markdown.js";

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
      <Link to="/safety" className="w-fit text-sm font-medium text-[var(--color-primary)] underline">
        {"← Safety Library"}
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{article.title}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">{article.summary}</p>
      </div>

      <Markdown content={article.body} />
    </div>
  );
}
