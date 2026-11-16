import { Lock } from "lucide-react";
import { mosaicSpec, portraitSpec, type AvatarData } from "@/lib/avatar";

/**
 * Renders a generated SVG avatar. Which variant to draw is decided on the server
 * (see avatarFor in src/lib/avatar.ts); this component only draws what it is given.
 */
export function Avatar({ avatar, size = 64, label }: { avatar: AvatarData; size?: number; label: string }) {
  if (avatar.variant === "abstract") {
    const cells = mosaicSpec(avatar.seed);
    return (
      <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={`${label}: avatar hidden until the Co-Op is complete`} className="rounded-full border border-line">
          {cells.map((colour, i) => (
            <rect key={i} x={(i % 4) * 16} y={Math.floor(i / 4) * 16} width="16" height="16" fill={colour} />
          ))}
        </svg>
        <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-ink-soft">
          <Lock size={11} aria-hidden />
        </span>
      </span>
    );
  }

  const p = portraitSpec(avatar.seed);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={`${label}: illustrated avatar`} className="shrink-0 rounded-full border border-line">
      <rect width="64" height="64" fill={p.background} />
      {/* long hair sits behind the head */}
      {p.hairStyle === 2 && <path d="M16 30c0-12 7-19 16-19s16 7 16 19v18H16z" fill={p.hair} />}
      {/* shoulders */}
      <path d="M10 64c0-13 10-19 22-19s22 6 22 19z" fill={p.shirt} />
      {/* neck + head */}
      <rect x="27" y="38" width="10" height="10" rx="3" fill={p.skin} />
      <circle cx="32" cy="29" r="12" fill={p.skin} />
      {/* hair on top */}
      {p.hairStyle === 0 && <path d="M20 27c0-8 5-13 12-13s12 5 12 13c-3-5-7-7-12-7s-9 2-12 7z" fill={p.hair} />}
      {p.hairStyle === 1 && <path d="M19 28c-1-10 5-15 13-15s14 5 13 15c-2-4-4-6-7-7-5 3-12 3-19 7z" fill={p.hair} />}
      {p.hairStyle === 2 && <path d="M20 28c0-9 5-14 12-14s12 5 12 14c-4-6-8-8-12-8s-8 2-12 8z" fill={p.hair} />}
      {p.hairStyle === 3 && (
        <>
          <path d="M20 26c0-8 5-12 12-12s12 4 12 12c-3-4-7-6-12-6s-9 2-12 6z" fill={p.hair} />
          <circle cx="32" cy="12" r="5" fill={p.hair} />
        </>
      )}
    </svg>
  );
}
