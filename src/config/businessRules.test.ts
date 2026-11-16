import { describe, expect, it } from "vitest";
import { BUSINESS_RULES, assertConfigValid, findConfigProblems, type BusinessRules } from "./businessRules";

/** Makes a deep copy of the rules so a test can break one value safely. */
function cloneRules(): BusinessRules {
  return structuredClone(BUSINESS_RULES);
}

describe("businessRules config", () => {
  it("is valid as shipped", () => {
    expect(findConfigProblems()).toEqual([]);
    expect(() => assertConfigValid()).not.toThrow();
  });

  it("has matching weights that sum to 1.0", () => {
    const sum = Object.values(BUSINESS_RULES.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("fails loudly when weights do not sum to 1.0", () => {
    const rules = cloneRules();
    rules.weights.financialPhilosophy = 0.5;
    expect(() => assertConfigValid(rules)).toThrow(/must sum to 1\.0/);
  });

  it("rejects negative numbers", () => {
    const rules = cloneRules();
    rules.trust.stakeRequiredToConnect = -1;
    expect(findConfigProblems(rules).join(" ")).toMatch(/trust\.stakeRequiredToConnect/);
  });

  it("rejects minBatchYear > maxBatchYear", () => {
    const rules = cloneRules();
    rules.cohort.minBatchYear = 2024;
    expect(findConfigProblems(rules).join(" ")).toMatch(/minBatchYear/);
  });
});
