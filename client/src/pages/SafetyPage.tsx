import { safetyArticles, type SafetyArticle } from "../features/safety/content.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { CardLink } from "../components/ui/Card.js";

export function SafetyPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Learn"
        description="Choking, allergies, storage, and more — every article here is saved on your device, so it's readable even with no signal."
      />

      <div
        role="note"
        className="flex gap-2 rounded-lg border border-[var(--color-callout-border)] bg-[var(--color-callout-bg)] p-3"
      >
        <span aria-hidden="true" className="text-base leading-none text-[var(--color-callout-icon)]">
          {"⚠️"}
        </span>
        <p className="text-sm text-[var(--color-text)]">
          This library is educational information, not medical advice. For anything urgent — breathing
          trouble, choking, or a reaction you're worried about — call your local emergency number or your
          pediatrician right away.
        </p>
      </div>

      <ArticleLinks articles={safetyArticles} base="/safety" />
    </div>
  );
}

/** The article cards, shared by Learn and the How-to guides list (item 608). */
export function ArticleLinks({ articles, base }: { articles: SafetyArticle[]; base: string }) {
  return (
    <div className="flex flex-col gap-2">
      {articles.map((article) => (
        <CardLink key={article.slug} to={`${base}/${article.slug}`} padding="sm" className="flex flex-col gap-1">
          <span className="text-base font-medium text-[var(--color-text)]">{article.title}</span>
          <span className="text-sm text-[var(--color-text-muted)]">{article.summary}</span>
        </CardLink>
      ))}
    </div>
  );
}
