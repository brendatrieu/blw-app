interface ProgressRingProps {
  /** One CSS color per equal segment, drawn clockwise from the top. */
  segments: readonly string[];
  /** Box size in pixels. */
  size?: number;
  /** Stroke width in pixels. */
  strokeWidth?: number;
  /** Accessible label, e.g. "3 of 9 allergens established, 3 started". */
  label: string;
  /** Content centered inside the ring, e.g. "3/9". */
  children?: React.ReactNode;
}

/** The gap between two segments, in px along the ring. */
const GAP = 4;

/**
 * A ring of equal segments with small gaps (item 663, A-Home): Home's
 * allergen summary draws one per allergen, colored by status. Static, so
 * there is no motion to reduce.
 */
export function ProgressRing({ segments, size = 76, strokeWidth = 9, label, children }: ProgressRingProps) {
  const center = size / 2;
  // A-Home: r=30 in the 76px box, a little air outside the stroke.
  const radius = center - strokeWidth + 1;
  const circumference = 2 * Math.PI * radius;
  const step = circumference / segments.length;

  return (
    <div
      role="img"
      aria-label={label}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {segments.map((color, index) => (
          <circle
            key={index}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${step - GAP} ${circumference - step + GAP}`}
            strokeDashoffset={-(index * step + GAP / 2)}
          />
        ))}
      </svg>
      {children ? (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}
