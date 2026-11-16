/**
 * BUSINESS RULES — THE SINGLE SOURCE OF TRUTH
 * ===========================================
 * Every tunable number in the product lives in this file and nowhere else.
 *
 * How it flows through the app:
 *   1. The pure engines in src/lib/*.ts read these values (as a default argument).
 *   2. The server layer in src/server/*.ts calls the engines and enforces the result.
 *   3. UI text that mentions a number is generated from these values (see src/lib/rulesCopy.ts).
 *
 * So changing a number here changes BOTH the behaviour and the on-screen text.
 * The database stores only facts (ledger rows, timestamps, message counts), never
 * thresholds, so an edit here never leaves stale saved state behind.
 */

// ---------------------------------------------------------------------------
// 1. MATCHING
// ---------------------------------------------------------------------------

/**
 * How much each dimension counts towards the total compatibility score.
 * MUST sum to 1.0 (checked by assertConfigValid at startup).
 *
 * Edit effect: raise one weight (and lower another) and every compatibility
 * total in Discover is recalculated on the next page load.
 * Example: financialPhilosophy 0.25 -> 0.40 and batchProximity 0.15 -> 0.00
 *          makes money views dominate and removes the batch-year effect.
 */
export const MATCHING_WEIGHTS = {
  financialPhilosophy: 0.25,
  relocationMobility: 0.25,
  familyStructure: 0.2,
  weekendRhythm: 0.15,
  batchProximity: 0.15,
};

/**
 * Score (0–100) given to one dimension depending on how two answers relate.
 *   exact    = both picked the same option
 *   flexible = at least one side picked a "Flexible" option
 *   adjacent = different but compatible options (see ADJACENT_OPTIONS in matchingEngine.ts)
 *   conflict = different and not compatible
 *
 * Edit effect: e.g. adjacent 50 -> 65 turns many amber bars closer to green.
 */
export const ALIGNMENT_SCORES = { exact: 100, flexible: 70, adjacent: 50, conflict: 0 };

export const MATCHING_RULES = {
  /**
   * Points lost per year of batch difference.
   * batchProximity score = max(0, 100 - batchPenaltyPerYear * |yearA - yearB|)
   * Example: 2022 vs 2020 with 25 -> 100 - 25*2 = 50.
   */
  batchPenaltyPerYear: 25,

  /** A dimension scoring at or above this shows a GREEN flag. Example: 80 -> only exact matches (100) are green. */
  greenFlagAtOrAbove: 80,

  /** A dimension at or above this (but below green) shows AMBER. Below this it shows RED "friction". */
  amberFlagAtOrAbove: 50,

  /**
   * A dimension the user marked "Must match" that scores BELOW this is a Dealbreaker Conflict.
   * Example: 50 -> "adjacent" answers (50) pass, "conflict" answers (0) are dealbreakers.
   *          Raise to 71 and even "flexible" answers (70) count as dealbreakers.
   */
  hardFilterMinScore: 50,

  /**
   * Maximum curated dossiers shown in Discover per day (the anti-swipe limit).
   * Example: 6 -> 3 shows only the three most compatible people.
   */
  dailyDossierLimit: 6,
};

// ---------------------------------------------------------------------------
// 2. TRUST CREDITS, COMMITMENT DEPOSIT AND RELIABILITY
// ---------------------------------------------------------------------------

export const TRUST_AND_DEPOSIT_RULES = {
  /** Trust Credits granted to every new user. Example: 100 with a 20 deposit = up to 5 deposits, but concurrency is capped below. */
  initialCredits: 100,

  /**
   * The refundable commitment deposit locked when you start (or join) a Co-Op.
   * Edit effect: 20 -> 30 changes the button text, the rules modal, the server check and the ledger amount.
   */
  stakeRequiredToConnect: 20,

  /**
   * Maximum Co-Ops / chats a user can have open at the same time.
   * NOT purchasable. Credits cannot raise this. This is the core anti-"pay to spam" rule.
   * Example: 3 -> 1 forces one conversation at a time.
   */
  maxConcurrentCoOps: 3,

  /**
   * Hours a Co-Op may stay unfinished. If the other person never answers,
   * the match expires and the requester gets a FULL refund with no penalty.
   */
  coOpAnswerWindowHours: 72,

  /**
   * Minimum Effort Gate: messages YOU must have sent (after the Co-Op is complete)
   * before Honest Closure returns your deposit in full plus the bonus.
   * Example: 3 -> 5 asks for a slightly longer conversation before a free exit.
   */
  minMessagesForFreeClosure: 3,

  /** Credits kept as a fee when you close before passing the Minimum Effort Gate. Example: 2 -> 5 makes early exits costlier. */
  earlyExitFeeCredits: 2,

  /**
   * Hours a partner's message may stay unanswered before it counts as ghosting.
   * The demo "Fast-forward" button jumps chatWindowHours + 1 hours.
   * Example: 48 -> 24 makes the product stricter.
   */
  chatWindowHours: 48,

  /** Reliability points lost for ghosting (never goes below 0). Example: 15 -> a 98% user drops to 83%. */
  ghostingPenaltyReliability: 15,

  /**
   * Share of a forfeited deposit paid to the person who was ghosted.
   * The rest is burned (removed from circulation). It is NEVER platform revenue,
   * so the company has no incentive to encourage ghosting.
   * Example: 50 with a 20 deposit -> 10 credits to the wronged user, 10 burned.
   */
  forfeitedDepositToWrongedUserPercent: 50,

  /** Bonus credits for closing respectfully after passing the Minimum Effort Gate. */
  respectfulClosureBonusCredits: 5,

  /** Reliability points gained for a respectful closure. */
  respectfulClosureReliabilityBonus: 2,

  /** Reliability points gained by each person when a Co-Op is completed (this is how a low score recovers). */
  reliabilityRecoveryPerCompletedCoOp: 4,

  /** Reliability can never exceed this. */
  maxReliability: 100,
};

// ---------------------------------------------------------------------------
// 3. COHORT, WAITLIST AND REFERRALS
// ---------------------------------------------------------------------------

export const COHORT_BALANCING_RULES = {
  /** Only eLitmus batches in this range may join. Example: maxBatchYear 2023 -> 2024 opens one more batch. */
  minBatchYear: 2020,
  maxBatchYear: 2023,

  /** Turn the gender-balanced waitlist on or off. */
  enableGenderBalancedQueue: true,

  /**
   * Per metro hub, no single gender may be more than this share of ACTIVE users.
   * New sign-ups that would push the hub past it wait on the waitlist.
   * Example: 60 -> 55 is stricter balance, longer waits.
   */
  maxActivePoolGenderSkewPercent: 60,

  /** Credits given to the referrer when a referred batchmate completes sign-up. */
  referralBoostCredits: 30,

  /** If true, a user with a valid referral code skips the waitlist. */
  referralSkipsWaitlist: true,
};

// ---------------------------------------------------------------------------
// 4. PRICING (payments are simulated in this demo)
// ---------------------------------------------------------------------------

export const MONETIZATION_PRICING = {
  currency: "INR",

  /** Prices below are what the customer pays, GST included. */
  pricesIncludeGst: true,

  /** GST rate used to split revenue in the unit-economics calculator. NOTE: verify the current GST rate before launch. */
  gstPercent: 18,

  /** Trust Credit Top-Up: price, credits received, and the monthly cap (so nobody can buy their way out of penalties). */
  trustCreditPackInr: 149,
  trustCreditPackCredits: 50,
  maxTopUpsPerMonth: 2,

  /** Relocation Cohort Pass: unlocks ONE other metro hub in Discover for cohortPassDays days. */
  relocationCohortPassInr: 199,
  cohortPassDays: 30,

  /** Weekend Curated Mixer: price per seat and seats available per gender (strict balance). */
  weekendCuratedMixerInr: 299,
  mixerSeatsPerGender: 6,
};

// ---------------------------------------------------------------------------
// 5. SAFETY
// ---------------------------------------------------------------------------

export const SAFETY_RULES = {
  /** Master switch for the PII Safety Shield in chat. */
  maskPiiInEarlyChat: true,

  /**
   * Total messages (both people combined) that must already exist in a chat
   * before phone numbers, emails, UPI IDs and handles stop being masked.
   * Example: 6 -> 10 keeps contact details hidden for longer.
   */
  messagesRequiredToUnmaskPII: 6,

  /** If true, contact details are also masked until the Co-Op is complete (in addition to the message count). */
  requireCoOpCompleteToUnmask: true,

  /**
   * Users below this Reliability Score are hidden from other people's feeds
   * and cannot start new Co-Ops (they can still finish open ones to recover).
   * Example: 60 -> 55 would make the demo user Rohan (58%) visible again.
   */
  minReliabilityScoreForActivePool: 60,

  /** Open reports against one user at which they are automatically hidden until an admin reviews. */
  maxReportsBeforeAutoHide: 3,
};

// ---------------------------------------------------------------------------
// 6. DEMO SETTINGS
// ---------------------------------------------------------------------------

export const DEMO_SETTINGS = {
  /** Shows the one-click demo logins, persona switcher, Reset Demo Data and time-travel tools. Set false for a real launch. */
  demoMode: true,

  /** If true, new sign-ups are activated immediately so evaluators are never stuck on the waitlist. */
  demoBypassWaitlist: true,

  /** Shows the "Fast-forward" button that shifts timestamps so ghosting settlement can be seen live. */
  demoTimeTravelEnabled: true,
};

// ---------------------------------------------------------------------------
// Aggregate object + type (this is what the engines receive)
// ---------------------------------------------------------------------------

/** All rules bundled together. Engines take this as their last argument so tests can inject different values. */
export const BUSINESS_RULES = {
  weights: MATCHING_WEIGHTS,
  alignment: ALIGNMENT_SCORES,
  matching: MATCHING_RULES,
  trust: TRUST_AND_DEPOSIT_RULES,
  cohort: COHORT_BALANCING_RULES,
  pricing: MONETIZATION_PRICING,
  safety: SAFETY_RULES,
  demo: DEMO_SETTINGS,
};

export type BusinessRules = typeof BUSINESS_RULES;

// ---------------------------------------------------------------------------
// Startup validation
// ---------------------------------------------------------------------------

/**
 * Returns a list of human-readable problems with a rules object (empty list = valid).
 * Pure, so it can be unit-tested with broken rules.
 *
 * @param rules The rules to check (defaults to BUSINESS_RULES).
 * @returns Array of error messages.
 */
export function findConfigProblems(rules: BusinessRules = BUSINESS_RULES): string[] {
  const problems: string[] = [];

  // Weights must add up to exactly 1 (we allow a tiny rounding tolerance).
  const weightSum = Object.values(rules.weights).reduce((sum, w) => sum + w, 0);
  if (Math.abs(weightSum - 1) > 0.0001) {
    problems.push(`MATCHING_WEIGHTS must sum to 1.0 but sum to ${weightSum.toFixed(4)}.`);
  }

  // Every number anywhere in the rules must be zero or positive.
  for (const [groupName, group] of Object.entries(rules)) {
    for (const [key, value] of Object.entries(group)) {
      if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
        problems.push(`${groupName}.${key} must be a non-negative number but is ${value}.`);
      }
    }
  }

  if (rules.cohort.minBatchYear > rules.cohort.maxBatchYear) {
    problems.push("COHORT_BALANCING_RULES.minBatchYear must be <= maxBatchYear.");
  }
  if (rules.matching.amberFlagAtOrAbove > rules.matching.greenFlagAtOrAbove) {
    problems.push("MATCHING_RULES.amberFlagAtOrAbove must be <= greenFlagAtOrAbove.");
  }
  if (rules.trust.forfeitedDepositToWrongedUserPercent > 100) {
    problems.push("TRUST_AND_DEPOSIT_RULES.forfeitedDepositToWrongedUserPercent must be between 0 and 100.");
  }
  if (rules.cohort.maxActivePoolGenderSkewPercent < 50 || rules.cohort.maxActivePoolGenderSkewPercent > 100) {
    problems.push("COHORT_BALANCING_RULES.maxActivePoolGenderSkewPercent must be between 50 and 100.");
  }
  if (rules.trust.earlyExitFeeCredits > rules.trust.stakeRequiredToConnect) {
    problems.push("TRUST_AND_DEPOSIT_RULES.earlyExitFeeCredits cannot be larger than stakeRequiredToConnect.");
  }
  return problems;
}

/**
 * Throws a clear error if the rules are invalid. Called once when the app starts
 * (src/app/layout.tsx), so a bad edit fails loudly instead of silently mis-scoring.
 *
 * @param rules The rules to check (defaults to BUSINESS_RULES).
 */
export function assertConfigValid(rules: BusinessRules = BUSINESS_RULES): void {
  const problems = findConfigProblems(rules);
  if (problems.length > 0) {
    throw new Error(`Invalid src/config/businessRules.ts:\n- ${problems.join("\n- ")}`);
  }
}
