import { useEffect, useRef } from "react";
import { Navigate, useParams } from "react-router-dom";
import { articleSlugSchema } from "@blw/shared";
import { getSafetyArticle } from "../features/safety/content.js";
import { fromRouteFor, track } from "../lib/usage/track.js";
import { Markdown } from "../lib/markdown/Markdown.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { BackButton } from "../components/ui/BackButton.js";

/**
 * `article_viewed` — which Learn articles actually get read, by slug.
 *
 * The slug is re-checked against the shared closed set rather than trusted
 * from the URL: `/safety/:slug` is a route a parent can type anything into,
 * and an unknown slug sends nothing at all (the page is already redirecting
 * away from it). Fires once per slug, so a re-render is not a second read.
 */
function useArticleViewed(slug: string | undefined): void {
  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!slug || reportedRef.current === slug) return;
    const parsed = articleSlugSchema.safeParse(slug);
    if (!parsed.success) return;
    reportedRef.current = slug;
    track("article_viewed", { article: parsed.data, from_route: fromRouteFor("/safety/:slug") });
  }, [slug]);
}

export function SafetyArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = slug ? getSafetyArticle(slug) : undefined;
  // Before the redirect below, so the hook order never depends on the slug.
  useArticleViewed(article?.slug);

  // An unknown or stale slug (e.g. a bookmarked link to a removed article)
  // falls back to the index rather than a dead end.
  if (!article) {
    return <Navigate to="/safety" replace />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title={article.title}
        description={article.summary}
        leading={<BackButton fallback="/safety" />}
      />

      <Markdown content={article.body} />
    </div>
  );
}
