import { describe, expect, it } from "vitest";
import { BUSINESS_RULES, type BusinessRules } from "@/config/businessRules";
import { admitFromWaitlist, canAdmitWithoutSkew, decideSignupStatus, eligibleBatchYears, genderMixForHub, isEligibleBatch, type CohortMember } from "./cohortEngine";

const pool = (women: number, men: number, hub = "bengaluru") => [
  ...Array.from({ length: women }, () => ({ hub, gender: "woman" })),
  ...Array.from({ length: men }, () => ({ hub, gender: "man" })),
];

let clock = 0;
const waiting = (id: string, gender: string, referred = false, hub = "bengaluru"): CohortMember => ({
  id, hub, gender, referred, joinedAt: new Date(2026, 0, 1, 0, clock++),
});

/** Rules with the demo bypass turned off, so the real queue logic is exercised. */
function liveRules(): BusinessRules {
  const rules = structuredClone(BUSINESS_RULES);
  rules.demo.demoBypassWaitlist = false;
  return rules;
}

describe("genderMixForHub", () => {
  it("counts only the requested hub and reports balance", () => {
    const mix = genderMixForHub([...pool(3, 2), ...pool(0, 5, "pune")], "bengaluru");
    expect(mix).toMatchObject({ total: 5, counts: { woman: 3, man: 2 }, percents: { woman: 60, man: 40 }, maxSharePercent: 60, balanced: true });
  });
  it("flags a skewed hub", () => {
    expect(genderMixForHub(pool(1, 4), "bengaluru").balanced).toBe(false);
  });
  it("handles an empty hub", () => {
    expect(genderMixForHub([], "pune")).toMatchObject({ total: 0, maxSharePercent: 0, balanced: true });
  });
});

describe("canAdmitWithoutSkew", () => {
  it("always admits into an empty hub", () => {
    expect(canAdmitWithoutSkew([], { hub: "pune", gender: "man" })).toBe(true);
  });
  it("admits the under-represented gender", () => {
    expect(canAdmitWithoutSkew(pool(1, 5), { hub: "bengaluru", gender: "woman" })).toBe(true);
  });
  it("blocks the majority gender when it would exceed the skew limit", () => {
    // 3 men + 2 women = 60% men; a 4th man would be 4/6 = 67% > 60%
    expect(canAdmitWithoutSkew(pool(2, 3), { hub: "bengaluru", gender: "man" })).toBe(false);
  });
  it("allows the majority gender while still within the limit", () => {
    // 6 men + 5 women; a 7th man is 7/12 = 58% <= 60%
    expect(canAdmitWithoutSkew(pool(5, 6), { hub: "bengaluru", gender: "man" })).toBe(true);
  });
  it("ignores other hubs", () => {
    expect(canAdmitWithoutSkew(pool(0, 9, "pune"), { hub: "bengaluru", gender: "man" })).toBe(true);
  });
  it("admits everyone when the balanced queue is disabled", () => {
    const rules = liveRules();
    rules.cohort.enableGenderBalancedQueue = false;
    expect(canAdmitWithoutSkew(pool(0, 9), { hub: "bengaluru", gender: "man" }, rules)).toBe(true);
  });
});

describe("admitFromWaitlist", () => {
  it("keeps the hub within the skew limit and serves first-come-first-served", () => {
    const result = admitFromWaitlist([waiting("m1", "man"), waiting("m2", "man"), waiting("w1", "woman")], pool(2, 3), liveRules());
    // m1 would make 4/6 = 67% men -> waits. w1 makes it 3/3. Then m1 fits (4/7 = 57%), then m2 would be 5/8 = 63% -> waits.
    expect(result.admittedIds).toEqual(["w1", "m1"]);
    expect(result.waitingIds).toEqual(["m2"]);
    expect(result.reasons).toEqual({ w1: "balance", m1: "balance" });
  });
  it("lets referred users skip the line even when the hub is skewed", () => {
    const result = admitFromWaitlist([waiting("m1", "man"), waiting("m2", "man", true)], pool(2, 3), liveRules());
    expect(result.admittedIds).toEqual(["m2"]);
    expect(result.reasons.m2).toBe("referral");
  });
  it("does not let referrals skip when referralSkipsWaitlist is off", () => {
    const rules = liveRules();
    rules.cohort.referralSkipsWaitlist = false;
    const result = admitFromWaitlist([waiting("m2", "man", true)], pool(2, 3), rules);
    expect(result.admittedIds).toEqual([]);
  });
  it("uses an injected skew limit", () => {
    const rules = liveRules();
    rules.cohort.maxActivePoolGenderSkewPercent = 70;
    expect(admitFromWaitlist([waiting("m1", "man")], pool(2, 3), rules).admittedIds).toEqual(["m1"]);
  });
});

describe("decideSignupStatus", () => {
  it("activates immediately in demo mode", () => {
    expect(decideSignupStatus({ hub: "bengaluru", gender: "man", referred: false }, pool(0, 9))).toEqual({ status: "active", reason: "demo_bypass" });
  });
  it("waitlists the majority gender when the bypass is off", () => {
    expect(decideSignupStatus({ hub: "bengaluru", gender: "man", referred: false }, pool(2, 3), liveRules())).toEqual({ status: "waitlisted", reason: "waitlist" });
  });
  it("activates referred users when the bypass is off", () => {
    expect(decideSignupStatus({ hub: "bengaluru", gender: "man", referred: true }, pool(2, 3), liveRules()).reason).toBe("referral");
  });
});

describe("batch eligibility", () => {
  it("accepts only batches inside the configured range", () => {
    expect(isEligibleBatch(BUSINESS_RULES.cohort.minBatchYear)).toBe(true);
    expect(isEligibleBatch(BUSINESS_RULES.cohort.maxBatchYear + 1)).toBe(false);
    expect(eligibleBatchYears()).toEqual([2020, 2021, 2022, 2023]);
  });
});
