/**
 * MATCHING ENGINE (pure functions, no database)
 * =============================================
 * Turns two profiles into a transparent compatibility breakdown:
 *   - 4 answered dimensions (money, relocation, family, weekends)
 *   - 1 computed dimension (batch proximity)
 *   - a weighted total
 *   - dealbreaker conflicts for dimensions a user marked "Must match"
 *
 * Reads from src/config/businessRules.ts:
 *   MATCHING_WEIGHTS, ALIGNMENT_SCORES, MATCHING_RULES
 */
import { BUSINESS_RULES, type BusinessRules } from "@/config/businessRules";
import { DIMENSION_KEYS, getDimension, getOption, type DimensionKey, type NonNegotiables } from "@/data/nonNegotiables";

/** The minimum a profile needs to be scored. */
export type MatchProfile = {
  batchYear: number;
  nonNegotiables: NonNegotiables;
};

export type Flag = "green" | "amber" | "red";

export type DimensionResult = {
  key: DimensionKey | "batchProximity";
  label: string;
  /** 0–100 */
  score: number;
  /** Weight used for the total, copied from MATCHING_WEIGHTS so the UI can show it. */
  weight: number;
  flag: Flag;
  explanation: string;
};

export type CompatibilityResult = {
  /** Weighted total, rounded to a whole number 0–100. */
  total: number;
  dimensions: DimensionResult[];
};

export type DealbreakerConflict = {
  key: DimensionKey;
  label: string;
  /** Who marked it "Must match": "you", "them" or "both". */
  markedBy: "you" | "them" | "both";
  message: string;
};

/**
 * ADJACENCY MAP
 * Pairs of DIFFERENT options that are still reasonably compatible.
 * They score ALIGNMENT_SCORES.adjacent instead of ALIGNMENT_SCORES.conflict.
 * Each pair is written once; order does not matter.
 *
 * Example: adding ["quiet", "fitness"] to weekendRhythm would make a quiet
 * person and a fitness person score 50 (amber) instead of 0 (red).
 */
export const ADJACENT_OPTIONS: Record<DimensionKey, [string, string][]> = {
  financialPhilosophy: [
    ["saver", "fire"], // both put saving first, they differ only on what the savings are for
    ["balanced", "fire"], // both invest, they differ on how much is spent now
  ],
  relocationMobility: [], // "anchored" vs "open" is a real conflict; "remote" is flexible
  familyStructure: [], // "nuclear" vs "multigenerational" is a real conflict
  weekendRhythm: [["fitness", "social"]], // both are out-of-the-house weekends
};

/**
 * Scores one answered dimension for two people.
 *
 * Reads: ALIGNMENT_SCORES (exact / flexible / adjacent / conflict).
 *
 * @param key Which dimension, e.g. "financialPhilosophy".
 * @param a Person A's option id.
 * @param b Person B's option id.
 * @param rules Business rules (injectable for tests).
 * @returns Score 0–100.
 */
export function scoreDimension(key: DimensionKey, a: string, b: string, rules: BusinessRules = BUSINESS_RULES): number {
  if (a === b) return rules.alignment.exact;

  const eitherFlexible = Boolean(getOption(key, a)?.isFlexible || getOption(key, b)?.isFlexible);
  if (eitherFlexible) return rules.alignment.flexible;

  const isAdjacent = ADJACENT_OPTIONS[key].some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (isAdjacent) return rules.alignment.adjacent;

  return rules.alignment.conflict;
}

/**
 * Scores how close two batch years are.
 *
 * Reads: MATCHING_RULES.batchPenaltyPerYear.
 * Formula: max(0, 100 - batchPenaltyPerYear * |yearA - yearB|)
 *
 * @returns Score 0–100. Same batch = 100.
 */
export function batchProximityScore(yearA: number, yearB: number, rules: BusinessRules = BUSINESS_RULES): number {
  return Math.max(0, 100 - rules.matching.batchPenaltyPerYear * Math.abs(yearA - yearB));
}

/**
 * Converts a score into a traffic-light flag.
 *
 * Reads: MATCHING_RULES.greenFlagAtOrAbove, MATCHING_RULES.amberFlagAtOrAbove.
 *
 * @param score 0–100.
 * @returns "green", "amber" or "red".
 */
export function flagForScore(score: number, rules: BusinessRules = BUSINESS_RULES): Flag {
  if (score >= rules.matching.greenFlagAtOrAbove) return "green";
  if (score >= rules.matching.amberFlagAtOrAbove) return "amber";
  return "red";
}

/**
 * Writes the one-line, human-readable explanation for an answered dimension.
 * @returns e.g. "You both prefer a quiet weekend recharge."
 */
function explainDimension(key: DimensionKey, a: string, b: string, flag: Flag): string {
  const dimension = getDimension(key);
  const optionA = getOption(key, a);
  const optionB = getOption(key, b);
  if (a === b && optionA) return `You both prefer ${optionA.phrase}.`;
  if (flag === "green" || flag === "amber") {
    if (optionA?.isFlexible || optionB?.isFlexible) {
      return `One of you is flexible on ${dimension.topic}, so there is room to meet in the middle.`;
    }
    return `Close but not identical on ${dimension.topic}: ${optionA?.label ?? a} and ${optionB?.label ?? b}.`;
  }
  return `Different views on ${dimension.topic}: worth an early conversation.`;
}

/** Writes the explanation for the batch proximity dimension. */
function explainBatch(yearA: number, yearB: number): string {
  const gap = Math.abs(yearA - yearB);
  if (gap === 0) return "Same graduating batch: similar career stage.";
  return `${gap} batch year${gap === 1 ? "" : "s"} apart: slightly different career stages.`;
}

/**
 * Full compatibility breakdown for two profiles.
 *
 * Reads: MATCHING_WEIGHTS (weights), ALIGNMENT_SCORES, MATCHING_RULES.
 * The total is the weighted sum of the five dimension scores, rounded.
 *
 * @param userA The viewer ("you").
 * @param userB The other person ("them").
 * @param rules Business rules (injectable for tests).
 * @returns `{ total, dimensions[] }` where each dimension has score, flag and explanation.
 */
export function calculateCompatibility(
  userA: MatchProfile,
  userB: MatchProfile,
  rules: BusinessRules = BUSINESS_RULES,
): CompatibilityResult {
  const dimensions: DimensionResult[] = DIMENSION_KEYS.map((key) => {
    const a = userA.nonNegotiables[key].value;
    const b = userB.nonNegotiables[key].value;
    const score = scoreDimension(key, a, b, rules);
    const flag = flagForScore(score, rules);
    return { key, label: getDimension(key).label, score, weight: rules.weights[key], flag, explanation: explainDimension(key, a, b, flag) };
  });

  const batchScore = batchProximityScore(userA.batchYear, userB.batchYear, rules);
  dimensions.push({
    key: "batchProximity",
    label: "Batch Proximity",
    score: batchScore,
    weight: rules.weights.batchProximity,
    flag: flagForScore(batchScore, rules),
    explanation: explainBatch(userA.batchYear, userB.batchYear),
  });

  const weightedSum = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);
  return { total: Math.round(weightedSum), dimensions };
}

/**
 * Finds Dealbreaker Conflicts: dimensions that EITHER person marked "Must match"
 * and that score below the hard-filter threshold.
 *
 * Reads: MATCHING_RULES.hardFilterMinScore, ALIGNMENT_SCORES.
 *
 * @param userA The viewer ("you").
 * @param userB The other person ("them").
 * @returns One entry per conflicting dimension (empty array = no dealbreakers).
 */
export function detectDealbreakerConflicts(
  userA: MatchProfile,
  userB: MatchProfile,
  rules: BusinessRules = BUSINESS_RULES,
): DealbreakerConflict[] {
  const conflicts: DealbreakerConflict[] = [];
  for (const key of DIMENSION_KEYS) {
    const a = userA.nonNegotiables[key];
    const b = userB.nonNegotiables[key];
    if (!a.mustMatch && !b.mustMatch) continue;

    const score = scoreDimension(key, a.value, b.value, rules);
    if (score >= rules.matching.hardFilterMinScore) continue;

    const markedBy = a.mustMatch && b.mustMatch ? "both" : a.mustMatch ? "you" : "them";
    const who = markedBy === "both" ? "You both" : markedBy === "you" ? "You" : "They";
    const label = getDimension(key).label;
    conflicts.push({
      key,
      label,
      markedBy,
      message: `Dealbreaker Conflict Warning: ${who} marked ${label} as "Must match" and your answers conflict.`,
    });
  }
  return conflicts;
}
