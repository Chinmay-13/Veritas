/**
 * RULES COPY — on-screen text generated from src/config/businessRules.ts
 * ======================================================================
 * Any sentence that mentions a rule number is built here from the config, so a
 * live edit to a rule changes the behaviour AND the words on screen together.
 * No component is allowed to type a rule number by hand.
 */
import { APP_NAME } from "@/config/brand";
import { BUSINESS_RULES, type BusinessRules } from "@/config/businessRules";
import { COOP_SCENARIOS } from "@/data/coopScenarios";
import { hubLabel, roleCohortLabel } from "@/data/nonNegotiables";

/** @returns "₹1,499" (Indian digit grouping). */
export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** @returns "₹199 incl. GST" (or without the suffix if prices exclude GST). Reads: pricesIncludeGst. */
export function priceLabel(amount: number, rules: BusinessRules = BUSINESS_RULES): string {
  return rules.pricing.pricesIncludeGst ? `${formatInr(amount)} incl. GST` : `${formatInr(amount)} + GST`;
}

/** The Discover call-to-action. Reads: stakeRequiredToConnect. */
export function depositCtaText(rules: BusinessRules = BUSINESS_RULES): string {
  return `Place a ${rules.trust.stakeRequiredToConnect}-credit commitment deposit & start Co-Op`;
}

/** The call-to-action for an invited person. Reads: stakeRequiredToConnect. */
export function joinCtaText(rules: BusinessRules = BUSINESS_RULES): string {
  return `Place a ${rules.trust.stakeRequiredToConnect}-credit commitment deposit & join Co-Op`;
}

/**
 * The plain-language rules shown in the confirm modal before a deposit is placed.
 * Reads: minMessagesForFreeClosure, stakeRequiredToConnect, respectfulClosureBonusCredits,
 *        earlyExitFeeCredits, chatWindowHours, ghostingPenaltyReliability.
 */
export function depositRulesText(rules: BusinessRules = BUSINESS_RULES): string {
  const t = rules.trust;
  return (
    `Complete the ${COOP_SCENARIOS.length}-step Co-Op and send at least ${t.minMessagesForFreeClosure} messages, or close respectfully afterwards via Honest Closure, ` +
    `and your ${t.stakeRequiredToConnect} credits come back plus ${t.respectfulClosureBonusCredits} bonus credits. ` +
    `Exiting early costs ${t.earlyExitFeeCredits} credits. ` +
    `If you go silent for ${t.chatWindowHours} hours your deposit is forfeited and your Reliability Score drops by ${t.ghostingPenaltyReliability} points.`
  );
}

/** Extra fairness lines shown under the main rules. Reads: coOpAnswerWindowHours, forfeitedDepositToWrongedUserPercent, maxConcurrentCoOps. */
export function depositFairnessLines(rules: BusinessRules = BUSINESS_RULES): string[] {
  const t = rules.trust;
  return [
    `If the other person never completes the Co-Op within ${t.coOpAnswerWindowHours} hours, you get a full refund and no penalty.`,
    `If you are ghosted, your deposit is returned and you receive ${t.forfeitedDepositToWrongedUserPercent}% of theirs. The rest is burned, never kept by ${APP_NAME}.`,
    `You can have at most ${t.maxConcurrentCoOps} Co-Ops open at once. Credits cannot buy more.`,
  ];
}

/** Shield progress, e.g. "3/6 messages until contact details can be shared". Reads: messagesRequiredToUnmaskPII. */
export function shieldProgressText(totalMessages: number, rules: BusinessRules = BUSINESS_RULES): string {
  const needed = rules.safety.messagesRequiredToUnmaskPII;
  if (totalMessages >= needed) return "Safety Shield lifted: contact details can now be shared";
  return `${totalMessages}/${needed} messages until contact details can be shared`;
}

/** e.g. "96% Reliability • Zero ghosting record". */
export function reliabilityBadgeText(score: number, ghostingCount: number): string {
  const record = ghostingCount === 0 ? "Zero ghosting record" : `${ghostingCount} ghosting ${ghostingCount === 1 ? "incident" : "incidents"}`;
  return `${score}% Reliability • ${record}`;
}

/** e.g. "'22 Batch • Bengaluru • Verified SDE Cohort". */
export function verifiedBadgeText(profile: { batchYear: number | null; hub: string | null; roleFamily: string | null }): string {
  const batch = profile.batchYear ? `'${String(profile.batchYear).slice(2)} Batch` : "Batch";
  return `${batch} • ${hubLabel(profile.hub ?? "")} • Verified ${roleCohortLabel(profile.roleFamily ?? "")}`;
}

/** Hours the demo "Fast-forward" button jumps: one hour past the ghosting window. Reads: chatWindowHours. */
export function fastForwardHours(rules: BusinessRules = BUSINESS_RULES): number {
  return rules.trust.chatWindowHours + 1;
}

/** Human label for a ledger reason code. */
export const CREDIT_REASON_LABELS: Record<string, string> = {
  initial_grant: "Welcome credits",
  deposit_locked: "Deposit locked",
  deposit_refunded: "Deposit returned",
  early_exit_fee: "Early-exit fee",
  closure_bonus: "Honest Closure bonus",
  ghosting_forfeit: "Deposit forfeited (ghosting)",
  ghosting_compensation: "Ghosting compensation",
  topup: "Trust Credit Top-Up",
  referral_bonus: "Referral bonus",
};

/** Human label for a reliability reason code. */
export const RELIABILITY_REASON_LABELS: Record<string, string> = {
  initial: "Starting score",
  coop_completed: "Completed a Co-Op",
  respectful_closure: "Honest Closure",
  ghosting: "Ghosting penalty",
};

/** Human label for a match status. */
export const MATCH_STATUS_LABELS: Record<string, string> = {
  coop_pending: "Co-Op in progress",
  chat_open: "Chat open",
  closed_respectful: "Closed respectfully",
  closed_early_exit: "Closed early",
  closed_ghosted: "Closed: ghosting",
  expired_no_response: "Expired: no response",
  declined: "Declined",
  blocked: "Ended",
};
