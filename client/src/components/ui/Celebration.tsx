import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface CelebrationOptions {
  title: string;
  emoji?: string;
}

interface CelebrationContextValue {
  /** Fire a one-off celebration: a confetti burst + a toast naming it. */
  celebrate: (options: CelebrationOptions) => void;
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

/** Fire a celebration from any page. Must be used inside `CelebrationProvider` (mounted in `AppLayout`). */
export function useCelebration(): CelebrationContextValue {
  const ctx = useContext(CelebrationContext);
  if (!ctx) {
    throw new Error("useCelebration must be used within a CelebrationProvider");
  }
  return ctx;
}

const PARTICLE_COLORS = ["var(--color-coral-mid)", "var(--color-sunshine)", "var(--color-leaf)"];
const PARTICLE_COUNT = 24;
const TOAST_DURATION_MS = 2600;

interface Particle {
  id: number;
  left: number;
  x: number;
  spin: number;
  duration: number;
  delay: number;
  color: string;
}

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    x: (Math.random() - 0.5) * 80,
    spin: 360 * (Math.random() > 0.5 ? 1 : -1) * (1 + Math.random()),
    duration: 700 + Math.random() * 500,
    delay: Math.random() * 150,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length]!,
  }));
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Mounted once in `AppLayout`. Renders nothing until `celebrate()` is
 * called, then shows a short confetti burst (skipped entirely for
 * reduced-motion users — there's no meaningful "instant" version of
 * confetti) plus a warm toast naming the moment, auto-dismissing itself.
 *
 * Never used on symptom/safety surfaces — those stay sober by design.
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<CelebrationOptions | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const celebrate = useCallback((options: CelebrationOptions) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActive(options);
    setParticles(prefersReducedMotion() ? [] : makeParticles());
    timeoutRef.current = setTimeout(() => {
      setActive(null);
      setParticles([]);
    }, TOAST_DURATION_MS);
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const value = useMemo(() => ({ celebrate }), [celebrate]);

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      {active ? (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center overflow-hidden" aria-hidden="true">
          <div className="relative h-32 w-full max-w-lg">
            {particles.map((p) => (
              <span
                key={p.id}
                className="confetti-piece absolute top-0 h-2.5 w-1.5 rounded-[2px]"
                style={{
                  left: `${p.left}%`,
                  backgroundColor: p.color,
                  animationDelay: `${p.delay}ms`,
                  ["--_confetti-x" as string]: `${p.x}px`,
                  ["--_confetti-spin" as string]: `${p.spin}deg`,
                  ["--_confetti-duration" as string]: `${p.duration}ms`,
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
      {active ? (
        <div
          role="status"
          className="celebration-toast fixed top-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2.5 shadow-[var(--shadow-lg)]"
        >
          {active.emoji ? (
            <span aria-hidden="true" className="text-xl leading-none">
              {active.emoji}
            </span>
          ) : null}
          <span className="text-sm font-semibold text-[var(--color-text)]">{active.title}</span>
        </div>
      ) : null}
    </CelebrationContext.Provider>
  );
}
