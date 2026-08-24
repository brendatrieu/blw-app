import { Navigate, useParams } from "react-router-dom";
import { getSafetyArticle } from "../features/safety/content.js";
import { Markdown } from "../lib/markdown/Markdown.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { BackButton } from "../components/ui/BackButton.js";

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
      <BackButton fallback="/safety">Safety Library</BackButton>

      <PageHeader title={article.title} description={article.summary} />

      <Markdown content={article.body} />
    </div>
  );
}
