import { guideArticles, safetyArticles } from "../features/safety/content.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { CardLink } from "../components/ui/Card.js";

export function SafetyPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Safety Library"
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

      <div className="flex flex-col gap-2">
        {safetyArticles.map((article) => (
          <CardLink key={article.slug} to={`/safety/${article.slug}`} padding="sm" className="flex flex-col gap-1">
            <span className="text-base font-semibold text-[var(--color-text)]">{article.title}</span>
            <span className="text-sm text-[var(--color-text-muted)]">{article.summary}</span>
          </CardLink>
        ))}
      </div>

      <section aria-labelledby="using-the-app" className="flex flex-col gap-2">
        <h2 id="using-the-app" className="font-h2 text-[var(--color-text)]">
          Using the app
        </h2>
        {guideArticles.map((guide) => (
          <CardLink key={guide.slug} to={`/safety/${guide.slug}`} padding="sm" className="flex flex-col gap-1">
            <span className="text-base font-semibold text-[var(--color-text)]">{guide.title}</span>
            <span className="text-sm text-[var(--color-text-muted)]">{guide.summary}</span>
          </CardLink>
        ))}
      </section>
    </div>
  );
}
