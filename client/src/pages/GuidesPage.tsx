import { useParams } from "react-router-dom";
import { getGuide, guideArticles } from "../features/safety/content.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { BackButton } from "../components/ui/BackButton.js";
import { ArticleLinks } from "./SafetyPage.js";
import { ArticleView } from "./SafetyArticlePage.js";
import { NotFoundPage } from "./NotFoundPage.js";

/** The how-to guides (item 608), reached from More rather than Learn. */
export function GuidesPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="How-to guides"
        emoji="📖"
        description="Step by step: recipes, meals, and storage."
        leading={<BackButton fallback="/more" />}
      />
      <ArticleLinks articles={guideArticles} base="/guides" />
    </div>
  );
}

/** One guide. Guides are not tracked by `article_viewed` (its slug set is safety-only). */
export function GuidePage() {
  const { slug } = useParams<{ slug: string }>();
  const guide = slug ? getGuide(slug) : undefined;
  if (!guide) return <NotFoundPage />;
  return <ArticleView article={guide} back="/guides" />;
}
