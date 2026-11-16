import { describe, expect, it } from "vitest";
import { BUSINESS_RULES, type BusinessRules } from "@/config/businessRules";
import type { NonNegotiables } from "@/data/nonNegotiables";
import { batchProximityScore, calculateCompatibility, detectDealbreakerConflicts, flagForScore, scoreDimension, type MatchProfile } from "./matchingEngine";

/** Builds a profile; every answer is "Preferred" unless listed in `must`. */
function profile(batchYear: number, fin: string, relo: string, fam: string, wk: string, must: (keyof NonNegotiables)[] = []): MatchProfile {
  return {
    batchYear,
    nonNegotiables: {
      financialPhilosophy: { value: fin, mustMatch: must.includes("financialPhilosophy") },
      relocationMobility: { value: relo, mustMatch: must.includes("relocationMobility") },
      familyStructure: { value: fam, mustMatch: must.includes("familyStructure") },
      weekendRhythm: { value: wk, mustMatch: must.includes("weekendRhythm") },
    },
  };
}

describe("scoreDimension", () => {
  it("gives the exact score for identical answers", () => {
    expect(scoreDimension("financialPhilosophy", "saver", "saver")).toBe(BUSINESS_RULES.alignment.exact);
  });
  it("gives the flexible score when either side is flexible", () => {
    expect(scoreDimension("financialPhilosophy", "flexible", "saver")).toBe(BUSINESS_RULES.alignment.flexible);
    expect(scoreDimension("relocationMobility", "anchored", "remote")).toBe(BUSINESS_RULES.alignment.flexible);
  });
  it("gives the adjacent score for listed pairs, in either order", () => {
    expect(scoreDimension("financialPhilosophy", "saver", "fire")).toBe(BUSINESS_RULES.alignment.adjacent);
    expect(scoreDimension("financialPhilosophy", "fire", "saver")).toBe(BUSINESS_RULES.alignment.adjacent);
    expect(scoreDimension("weekendRhythm", "social", "fitness")).toBe(BUSINESS_RULES.alignment.adjacent);
  });
  it("gives the conflict score for unrelated answers", () => {
    expect(scoreDimension("relocationMobility", "anchored", "open")).toBe(BUSINESS_RULES.alignment.conflict);
    expect(scoreDimension("familyStructure", "nuclear", "multigenerational")).toBe(BUSINESS_RULES.alignment.conflict);
  });
  it("two flexible answers are an exact match", () => {
    expect(scoreDimension("familyStructure", "flexible", "flexible")).toBe(BUSINESS_RULES.alignment.exact);
  });
});

describe("batchProximityScore", () => {
  it("is 100 for the same batch and drops by the penalty per year", () => {
    expect(batchProximityScore(2022, 2022)).toBe(100);
    expect(batchProximityScore(2022, 2021)).toBe(100 - BUSINESS_RULES.matching.batchPenaltyPerYear);
    expect(batchProximityScore(2020, 2023)).toBe(100 - 3 * BUSINESS_RULES.matching.batchPenaltyPerYear);
  });
  it("never goes below 0", () => {
    expect(batchProximityScore(2020, 2030)).toBe(0);
  });
});

describe("flagForScore", () => {
  it("uses the green and amber thresholds from config", () => {
    expect(flagForScore(100)).toBe("green");
    expect(flagForScore(BUSINESS_RULES.matching.greenFlagAtOrAbove)).toBe("green");
    expect(flagForScore(BUSINESS_RULES.matching.amberFlagAtOrAbove)).toBe("amber");
    expect(flagForScore(BUSINESS_RULES.matching.amberFlagAtOrAbove - 1)).toBe("red");
  });
});

describe("calculateCompatibility", () => {
  it("is 100 for identical profiles", () => {
    const a = profile(2022, "saver", "open", "nuclear", "quiet");
    expect(calculateCompatibility(a, a).total).toBe(100);
  });

  it("is the rounded weighted sum of the five dimensions", () => {
    const a = profile(2022, "saver", "open", "nuclear", "quiet");
    const b = profile(2021, "fire", "anchored", "flexible", "quiet");
    // fin adjacent 50*0.25 + relo conflict 0*0.25 + family flexible 70*0.20 + weekend exact 100*0.15 + batch 75*0.15
    expect(calculateCompatibility(a, b).total).toBe(Math.round(12.5 + 0 + 14 + 15 + 11.25));
  });

  it("returns five dimensions with flags and explanations", () => {
    const a = profile(2022, "saver", "open", "nuclear", "quiet");
    const b = profile(2022, "saver", "anchored", "nuclear", "social");
    const result = calculateCompatibility(a, b);
    expect(result.dimensions.map((d) => d.key)).toEqual(["financialPhilosophy", "relocationMobility", "familyStructure", "weekendRhythm", "batchProximity"]);
    expect(result.dimensions[0]).toMatchObject({ flag: "green", explanation: "You both prefer saving hard and clearing loans first." });
    expect(result.dimensions[1].flag).toBe("red");
    expect(result.dimensions[1].explanation).toMatch(/worth an early conversation/);
  });

  it("is symmetric", () => {
    const a = profile(2020, "balanced", "remote", "multigenerational", "fitness");
    const b = profile(2023, "fire", "open", "nuclear", "social");
    expect(calculateCompatibility(a, b).total).toBe(calculateCompatibility(b, a).total);
  });

  it("uses injected weights (live-edit safety)", () => {
    const rules: BusinessRules = structuredClone(BUSINESS_RULES);
    rules.weights = { financialPhilosophy: 1, relocationMobility: 0, familyStructure: 0, weekendRhythm: 0, batchProximity: 0 };
    const a = profile(2022, "saver", "open", "nuclear", "quiet");
    const b = profile(2020, "saver", "anchored", "multigenerational", "social");
    expect(calculateCompatibility(a, b, rules).total).toBe(100);
  });
});

describe("detectDealbreakerConflicts", () => {
  it("returns nothing when nobody marked a conflicting dimension as must-match", () => {
    const a = profile(2022, "saver", "open", "nuclear", "quiet");
    const b = profile(2022, "saver", "anchored", "nuclear", "quiet");
    expect(detectDealbreakerConflicts(a, b)).toEqual([]);
  });
  it("flags a conflict the viewer marked must-match", () => {
    const a = profile(2022, "saver", "open", "nuclear", "quiet", ["relocationMobility"]);
    const b = profile(2022, "saver", "anchored", "nuclear", "quiet");
    const conflicts = detectDealbreakerConflicts(a, b);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ key: "relocationMobility", markedBy: "you" });
    expect(conflicts[0].message).toMatch(/Dealbreaker Conflict Warning/);
  });
  it("flags a conflict the other person marked must-match", () => {
    const a = profile(2022, "saver", "open", "nuclear", "quiet");
    const b = profile(2022, "saver", "open", "multigenerational", "quiet", ["familyStructure"]);
    expect(detectDealbreakerConflicts(a, b)[0]).toMatchObject({ key: "familyStructure", markedBy: "them" });
  });
  it("does not flag must-match dimensions that score at or above the hard filter", () => {
    const a = profile(2022, "saver", "open", "nuclear", "quiet", ["financialPhilosophy"]);
    const b = profile(2022, "fire", "open", "nuclear", "quiet"); // adjacent = 50 = hardFilterMinScore
    expect(detectDealbreakerConflicts(a, b)).toEqual([]);
  });
  it("respects an injected hardFilterMinScore", () => {
    const rules: BusinessRules = structuredClone(BUSINESS_RULES);
    rules.matching.hardFilterMinScore = 71;
    const a = profile(2022, "saver", "open", "nuclear", "quiet", ["financialPhilosophy"]);
    const b = profile(2022, "flexible", "open", "nuclear", "quiet"); // flexible = 70 < 71
    expect(detectDealbreakerConflicts(a, b, rules)).toHaveLength(1);
  });
});
