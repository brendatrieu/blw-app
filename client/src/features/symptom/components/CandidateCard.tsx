import { Link } from "react-router-dom";
import { NOVELTY_LABELS, REACTION_TYPE_LABELS, type Likelihood, type SymptomCandidate } from "@blw/shared";

const LIKELIHOOD_LABELS: Record<Likelihood, string> = {
  high: "Strongest fit",
  medium: "Possible fit",
  low: "Weak fit",
};

/**
 * Colour-coded by fit, not by danger. A "strongest fit" badge on a food is a
 * statement about timing, so it borrows the accent colour rather than the
 * danger red the emergency card owns.
 */
const LIKELIHOOD_CLASS: Record<Likelihood, string> = {
  high: "bg-[var(--color-accent)] text-[var(--color-primary-contrast)]",
  medium: "bg-[var(--color-callout-bg)] text-[var(--color-callout-icon)]",
  low: "bg-[var(--color-bg)] text-[var(--color-text-muted)]",
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]">
      {children}
    </span>
  );
}

export function CandidateCard({ candidate, rank }: { candidate: SymptomCandidate; rank: number }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <Link to={`/foods/${candidate.foodSlug}`} className="text-sm font-semibold text-[var(--color-text)] underline">
            {rank}. {candidate.foodName}
          </Link>
          <span className="text-xs text-[var(--color-text-muted)]">{candidate.windowFit}</span>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${LIKELIHOOD_CLASS[candidate.likelihood]}`}
        >
          {LIKELIHOOD_LABELS[candidate.likelihood]}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip>{NOVELTY_LABELS[candidate.novelty]}</Chip>
        <Chip>{REACTION_TYPE_LABELS[candidate.reactionType]}</Chip>
      </div>

      <p className="text-xs leading-relaxed text-[var(--color-text)]">{candidate.rationale}</p>
    </li>
  );
}

export function CandidateList({ candidates }: { candidates: SymptomCandidate[] }) {
  if (candidates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-sm text-[var(--color-text-muted)]">
        Nothing was logged in the seven days before this, so there is no food history to line the symptoms up against.
        Keep logging meals and the next check will have more to work with.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {candidates.map((candidate, index) => (
        <CandidateCard key={candidate.foodSlug} candidate={candidate} rank={index + 1} />
      ))}
    </ul>
  );
}
