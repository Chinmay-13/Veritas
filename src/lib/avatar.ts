/**
 * GENERATED AVATARS (no real photos anywhere in the product)
 * Every avatar is an SVG drawn from a seed. There are two variants:
 *   "revealed" -> a simple illustrated portrait
 *   "abstract" -> a mosaic shown until the Co-Op is complete
 *
 * The SERVER decides which variant to send (see avatarFor). For a locked avatar
 * it sends a different, one-way-hashed seed, so the portrait cannot be recovered
 * in the browser by removing a CSS blur: the data simply is not there.
 */

export type AvatarData = { variant: "revealed" | "abstract"; seed: string };

/** FNV-1a string hash -> unsigned 32-bit number. Deterministic. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Small deterministic random-number generator (mulberry32). Returns numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Chooses which avatar a viewer is allowed to see.
 * @param userId The profile owner's id.
 * @param revealed True only if the viewer has completed a Co-Op with them (or it is their own profile).
 */
export function avatarFor(userId: string, revealed: boolean): AvatarData {
  if (revealed) return { variant: "revealed", seed: userId };
  return { variant: "abstract", seed: `locked-${hashString(`${userId}:locked`).toString(36)}` };
}

const BACKGROUNDS = ["#E0E7FF", "#D1FAE5", "#FEF3C7", "#FFE4E6", "#E0F2FE", "#EDE9FE", "#F1F5F9"];
const SKIN_TONES = ["#F2C9A5", "#E0AC84", "#C68B62", "#A9714B", "#8A5A3C"];
const HAIR_COLOURS = ["#1F2937", "#111827", "#3B2A20", "#4B3621", "#2D2A32"];
const SHIRT_COLOURS = ["#312E81", "#4F46E5", "#059669", "#D97706", "#475569", "#BE123C"];
const MOSAIC_COLOURS = ["#C7D2FE", "#E0E7FF", "#A5B4FC", "#E2E8F0", "#CBD5E1", "#DDD6FE", "#F1F5F9"];

export type PortraitSpec = { background: string; skin: string; hair: string; shirt: string; hairStyle: 0 | 1 | 2 | 3 };

/** @returns Colours and hair style for a revealed portrait, derived from the seed. */
export function portraitSpec(seed: string): PortraitSpec {
  const random = seededRandom(hashString(seed));
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  return { background: pick(BACKGROUNDS), skin: pick(SKIN_TONES), hair: pick(HAIR_COLOURS), shirt: pick(SHIRT_COLOURS), hairStyle: Math.floor(random() * 4) as 0 | 1 | 2 | 3 };
}

/** @returns 16 colours for the 4x4 abstract mosaic, derived from the seed. */
export function mosaicSpec(seed: string): string[] {
  const random = seededRandom(hashString(seed));
  return Array.from({ length: 16 }, () => MOSAIC_COLOURS[Math.floor(random() * MOSAIC_COLOURS.length)]);
}
