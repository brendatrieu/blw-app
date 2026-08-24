interface ProgressRingProps {
  /** Diameter in pixels. */
  size?: number;
  /** 0–1 fraction of the ring to fill. */
  value: number;
  /** Stroke width in pixels. */
  strokeWidth?: number;
  /** Accessible label, e.g. "6 of 9 allergens introduced". */
  label: string;
  /** Content centered inside the ring, e.g. "6/9". */
  children?: React.ReactNode;
}

/** SVG progress ring — coral fill on a soft cream track. Used for allergen/progress summaries. */
export function ProgressRing({ size = 96, value, strokeWidth = 10, label, children }: ProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  return (
    <div
      role="img"
      aria-label={label}
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-bg-inset)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-[var(--duration-slow)] ease-[var(--ease-out)] motion-reduce:transition-none"
        />
      </svg>
      {children ? (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}
