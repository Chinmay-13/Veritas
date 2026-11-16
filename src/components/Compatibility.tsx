import { flagForScore, type CompatibilityResult, type Flag } from "@/lib/matchingEngine";

const FLAG_STYLES: Record<Flag, { stroke: string; bar: string; text: string; label: string }> = {
  green: { stroke: "var(--color-verified)", bar: "bg-verified", text: "text-verified-ink", label: "Aligned" },
  amber: { stroke: "var(--color-credit)", bar: "bg-credit", text: "text-credit-ink", label: "Worth a chat" },
  red: { stroke: "var(--color-danger)", bar: "bg-danger", text: "text-danger-ink", label: "Friction" },
};

/** SVG ring showing the total compatibility score (0–100). */
export function CompatibilityRing({ total, size = 72 }: { total: number; size?: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const style = FLAG_STYLES[flagForScore(total)];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Compatibility ${total} out of 100`}>
      <svg viewBox="0 0 72 72" width={size} height={size} className="-rotate-90">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="var(--color-line)" strokeWidth="6" />
        <circle cx="36" cy="36" r={radius} fill="none" stroke={style.stroke} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - total / 100)} />
      </svg>
      <span className="tnum absolute inset-0 flex items-center justify-center font-serif text-xl font-semibold">{total}</span>
    </div>
  );
}

/**
 * The transparent breakdown: one bar per dimension with its flag, weight and
 * a one-line explanation. Everything comes from calculateCompatibility().
 */
export function CompatibilityBars({ result }: { result: CompatibilityResult }) {
  return (
    <ul className="space-y-3">
      {result.dimensions.map((dimension) => {
        const style = FLAG_STYLES[dimension.flag];
        return (
          <li key={dimension.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-ink">{dimension.label}</span>
              <span className={`tnum text-xs font-semibold whitespace-nowrap ${style.text}`}>
                {style.label} · {dimension.score}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${Math.max(dimension.score, 3)}%` }} />
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              {dimension.explanation} <span className="whitespace-nowrap">({Math.round(dimension.weight * 100)}% of the score)</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
