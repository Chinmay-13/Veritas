/**
 * COHORT ENGINE (pure functions, no database)
 * ===========================================
 * Solves the two classic cold-start problems of dating products:
 *   1. Gender imbalance  -> a gender-balanced admission queue per metro hub.
 *   2. Empty rooms       -> verified batchmate referrals that skip the queue.
 *
 * Reads from src/config/businessRules.ts:
 *   COHORT_BALANCING_RULES, DEMO_SETTINGS.demoBypassWaitlist
 */
import { BUSINESS_RULES, type BusinessRules } from "@/config/businessRules";

/** A person in the active pool or on the waitlist. */
export type CohortMember = {
  id: string;
  hub: string;
  gender: string;
  /** When they joined the waitlist (earlier = served first). */
  joinedAt: Date;
  /** True if they signed up with a valid referral code from a verified batchmate. */
  referred: boolean;
};

export type GenderMix = {
  hub: string;
  total: number;
  /** Count per gender id, e.g. { woman: 4, man: 3 }. */
  counts: Record<string, number>;
  /** Share per gender in whole percent, e.g. { woman: 57, man: 43 }. */
  percents: Record<string, number>;
  /** The largest share in the hub (0 if the hub is empty). */
  maxSharePercent: number;
  /** True if maxSharePercent is within maxActivePoolGenderSkewPercent. */
  balanced: boolean;
};

/**
 * The gender mix of one hub's active pool.
 *
 * Reads: maxActivePoolGenderSkewPercent.
 *
 * @param activePool Every active member (any hub).
 * @param hub The hub to summarise.
 */
export function genderMixForHub(activePool: Pick<CohortMember, "hub" | "gender">[], hub: string, rules: BusinessRules = BUSINESS_RULES): GenderMix {
  const members = activePool.filter((m) => m.hub === hub);
  const counts: Record<string, number> = {};
  for (const m of members) counts[m.gender] = (counts[m.gender] ?? 0) + 1;

  const total = members.length;
  const percents: Record<string, number> = {};
  for (const [gender, count] of Object.entries(counts)) percents[gender] = total === 0 ? 0 : Math.round((count / total) * 100);

  const maxSharePercent = total === 0 ? 0 : Math.max(...Object.values(counts).map((c) => (c / total) * 100));
  return { hub, total, counts, percents, maxSharePercent: Math.round(maxSharePercent), balanced: maxSharePercent <= rules.cohort.maxActivePoolGenderSkewPercent };
}

/**
 * Whether admitting one candidate keeps their hub within the allowed gender skew.
 *
 * Rule: admit if, AFTER admission, the candidate's gender is at most
 * maxActivePoolGenderSkewPercent of the hub, OR the candidate's gender is not
 * currently the largest group (so an empty or tiny hub can always start filling).
 *
 * Reads: enableGenderBalancedQueue, maxActivePoolGenderSkewPercent.
 */
export function canAdmitWithoutSkew(
  activePool: Pick<CohortMember, "hub" | "gender">[],
  candidate: Pick<CohortMember, "hub" | "gender">,
  rules: BusinessRules = BUSINESS_RULES,
): boolean {
  if (!rules.cohort.enableGenderBalancedQueue) return true;

  const hubMembers = activePool.filter((m) => m.hub === candidate.hub);
  const sameGenderBefore = hubMembers.filter((m) => m.gender === candidate.gender).length;
  const otherBefore = hubMembers.length - sameGenderBefore;

  // Not the majority yet: admitting them improves (or starts) the balance.
  if (sameGenderBefore <= otherBefore) return true;

  const shareAfter = ((sameGenderBefore + 1) / (hubMembers.length + 1)) * 100;
  return shareAfter <= rules.cohort.maxActivePoolGenderSkewPercent;
}

export type AdmissionResult = {
  /** Ids admitted in this run, in admission order. */
  admittedIds: string[];
  /** Ids still waiting. */
  waitingIds: string[];
  /** Why each admitted person got in: "referral" or "balance". */
  reasons: Record<string, "referral" | "balance">;
};

/**
 * Admits people from the waitlist into the active pool.
 *
 * Order:
 *   1. Referred users first (if referralSkipsWaitlist): a verified batchmate vouched for them.
 *   2. Everyone else first-come-first-served, but only if admitting them keeps their hub
 *      within maxActivePoolGenderSkewPercent. We loop until nobody else fits, because
 *      admitting one woman can unlock a waiting man (and vice versa).
 *
 * Reads: enableGenderBalancedQueue, maxActivePoolGenderSkewPercent, referralSkipsWaitlist.
 *
 * @param waitlist People waiting.
 * @param activePool People already active.
 * @returns Who was admitted, who still waits, and why.
 */
export function admitFromWaitlist(
  waitlist: CohortMember[],
  activePool: Pick<CohortMember, "hub" | "gender">[],
  rules: BusinessRules = BUSINESS_RULES,
): AdmissionResult {
  const pool = [...activePool];
  const queue = [...waitlist].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  const admittedIds: string[] = [];
  const reasons: Record<string, "referral" | "balance"> = {};

  const admit = (member: CohortMember, reason: "referral" | "balance") => {
    pool.push({ hub: member.hub, gender: member.gender });
    admittedIds.push(member.id);
    reasons[member.id] = reason;
  };

  // Step 1: referrals skip the line.
  if (rules.cohort.referralSkipsWaitlist) {
    for (const member of queue) if (member.referred) admit(member, "referral");
  }

  // Step 2: balanced first-come-first-served, repeated until a full pass admits nobody.
  let admittedSomeone = true;
  while (admittedSomeone) {
    admittedSomeone = false;
    for (const member of queue) {
      if (admittedIds.includes(member.id)) continue;
      if (canAdmitWithoutSkew(pool, member, rules)) {
        admit(member, "balance");
        admittedSomeone = true;
      }
    }
  }

  return { admittedIds, waitingIds: queue.filter((m) => !admittedIds.includes(m.id)).map((m) => m.id), reasons };
}

/**
 * Decides the status of a brand-new sign-up.
 *
 * Reads: DEMO_SETTINGS.demoBypassWaitlist, referralSkipsWaitlist, plus the balance rules above.
 *
 * @returns "active" or "waitlisted", with a reason for the UI.
 */
export function decideSignupStatus(
  candidate: Pick<CohortMember, "hub" | "gender" | "referred">,
  activePool: Pick<CohortMember, "hub" | "gender">[],
  rules: BusinessRules = BUSINESS_RULES,
): { status: "active" | "waitlisted"; reason: "demo_bypass" | "referral" | "balance" | "waitlist" } {
  if (rules.demo.demoBypassWaitlist) return { status: "active", reason: "demo_bypass" };
  if (candidate.referred && rules.cohort.referralSkipsWaitlist) return { status: "active", reason: "referral" };
  if (canAdmitWithoutSkew(activePool, candidate, rules)) return { status: "active", reason: "balance" };
  return { status: "waitlisted", reason: "waitlist" };
}

/**
 * Whether a batch year is inside the eligible eLitmus cohort.
 * Reads: minBatchYear, maxBatchYear.
 */
export function isEligibleBatch(batchYear: number, rules: BusinessRules = BUSINESS_RULES): boolean {
  return batchYear >= rules.cohort.minBatchYear && batchYear <= rules.cohort.maxBatchYear;
}

/**
 * The list of eligible batch years, e.g. [2020, 2021, 2022, 2023].
 * Reads: minBatchYear, maxBatchYear.
 */
export function eligibleBatchYears(rules: BusinessRules = BUSINESS_RULES): number[] {
  const years: number[] = [];
  for (let y = rules.cohort.minBatchYear; y <= rules.cohort.maxBatchYear; y++) years.push(y);
  return years;
}
