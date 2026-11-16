/**
 * POOL VISIBILITY (pure function)
 * Decides whether a person appears in other people's Discover feeds and may be
 * invited to a Co-Op. Computed at read time from facts + config, never stored.
 *
 * Reads: SAFETY_RULES.minReliabilityScoreForActivePool, SAFETY_RULES.maxReportsBeforeAutoHide.
 */
import { BUSINESS_RULES, type BusinessRules } from "@/config/businessRules";

export type VisibilityFacts = {
  /** "active", "waitlisted" or "suspended". */
  status: string;
  profileComplete: boolean;
  /** Whether the person has given (and not withdrawn) consent to be matched. */
  consentMatching: boolean;
  reliability: number;
  /** Reports against this person that an admin has not resolved yet. */
  openReports: number;
};

export type VisibilityReason = "ok" | "incomplete" | "no_consent" | "waitlisted" | "suspended" | "low_reliability" | "reports";

/**
 * @param facts Facts about the person.
 * @returns `{ visible, reason }`. `reason` explains why a person is hidden (used for banners).
 *
 * Example: reliability 58 with the default threshold 60 -> { visible: false, reason: "low_reliability" }.
 */
export function poolVisibility(facts: VisibilityFacts, rules: BusinessRules = BUSINESS_RULES): { visible: boolean; reason: VisibilityReason } {
  if (!facts.profileComplete) return { visible: false, reason: "incomplete" };
  if (!facts.consentMatching) return { visible: false, reason: "no_consent" };
  if (facts.status === "suspended") return { visible: false, reason: "suspended" };
  if (facts.status === "waitlisted") return { visible: false, reason: "waitlisted" };
  if (facts.reliability < rules.safety.minReliabilityScoreForActivePool) return { visible: false, reason: "low_reliability" };
  if (facts.openReports >= rules.safety.maxReportsBeforeAutoHide) return { visible: false, reason: "reports" };
  return { visible: true, reason: "ok" };
}
