import { Link } from "react-router-dom";
import { safetyArticles } from "../features/safety/content.js";

export function SafetyPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Safety Library</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Choking, allergies, storage, and more — every article here is saved on your device, so it's
          readable even with no signal.
        </p>
      </div>

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
          <Link
            key={article.slug}
            to={`/safety/${article.slug}`}
            className="flex flex-col gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 transition-colors hover:border-[var(--color-primary)]"
          >
            <span className="text-base font-semibold text-[var(--color-text)]">{article.title}</span>
            <span className="text-sm text-[var(--color-text-muted)]">{article.summary}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
