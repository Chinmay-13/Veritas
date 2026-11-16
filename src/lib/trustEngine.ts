/**
 * TRUST ENGINE (pure functions, no database)
 * ==========================================
 * Decides everything about commitment deposits, Trust Credits, the Reliability
 * Score and the match state machine.
 *
 * The pattern used everywhere:
 *   1. The server layer loads FACTS about a match (who, deposits, timestamps, message counts).
 *   2. A function here returns a PLAN: the new status + ledger rows + reliability changes.
 *   3. The server layer writes that plan to the database in one transaction.
 * Nothing in this file reads or writes the database, so every rule is unit-testable.
 *
 * Credits are a LEDGER: a balance is never edited, it is always the sum of
 * credit_transactions rows. A locked deposit is a negative row; a refund is a positive row.
 *
 * Reads from src/config/businessRules.ts:
 *   TRUST_AND_DEPOSIT_RULES, SAFETY_RULES.minReliabilityScoreForActivePool
 */
import { BUSINESS_RULES, type BusinessRules } from "@/config/businessRules";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export const MATCH_STATUSES = [
  "coop_pending", // deposit placed, Co-Op answers still being collected
  "chat_open", // both answered, protected chat is open
  "closed_respectful", // Honest Closure after the Minimum Effort Gate
  "closed_early_exit", // closed before the gate (small fee)
  "closed_ghosted", // someone went silent past the chat window
  "expired_no_response", // nobody did anything in time: everyone refunded, no penalty
  "declined", // the invited person said "not for me" before joining
  "blocked", // a participant blocked/reported the other
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

/**
 * The explicit transition table: from each status, which statuses are allowed next.
 * Closed states are final (empty list).
 */
export const MATCH_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  coop_pending: ["chat_open", "closed_early_exit", "expired_no_response", "declined", "blocked"],
  chat_open: ["closed_respectful", "closed_early_exit", "closed_ghosted", "expired_no_response", "blocked"],
  closed_respectful: [],
  closed_early_exit: [],
  closed_ghosted: [],
  expired_no_response: [],
  declined: [],
  blocked: [],
};

/**
 * Whether a match may move from one status to another.
 * @returns true only if the move is listed in MATCH_TRANSITIONS.
 */
export function canTransition(from: MatchStatus, to: MatchStatus): boolean {
  return MATCH_TRANSITIONS[from].includes(to);
}

/** Whether a match is still in progress (counts towards maxConcurrentCoOps and holds deposits). */
export function isOpenStatus(status: MatchStatus): boolean {
  return status === "coop_pending" || status === "chat_open";
}

// ---------------------------------------------------------------------------
// Types shared with the server layer
// ---------------------------------------------------------------------------

export const CREDIT_REASONS = [
  "initial_grant",
  "deposit_locked",
  "deposit_refunded",
  "early_exit_fee",
  "closure_bonus",
  "ghosting_forfeit",
  "ghosting_compensation",
  "topup",
  "referral_bonus",
] as const;
export type CreditReason = (typeof CREDIT_REASONS)[number];

export const RELIABILITY_REASONS = ["initial", "coop_completed", "respectful_closure", "ghosting"] as const;
export type ReliabilityReason = (typeof RELIABILITY_REASONS)[number];

/** One row to add to the credit ledger. `amount` is signed: negative = credits leave the available balance. */
export type CreditEntry = { userId: string; amount: number; reason: CreditReason; note: string };

/** One row to add to the reliability history. `delta` is signed and already clamped to 0..max. */
export type ReliabilityChange = { userId: string; delta: number; reason: ReliabilityReason; note: string };

/** What should happen to a match: written to the database by the server layer. */
export type SettlementPlan = {
  newStatus: MatchStatus;
  credits: CreditEntry[];
  reliability: ReliabilityChange[];
  /** Plain-language summary, stored as a system message in the chat. */
  summary: string;
};

/** The facts about one match that the rules need. No thresholds are stored: they come from config. */
export type MatchFacts = {
  status: MatchStatus;
  requesterId: string;
  targetId: string;
  /** Credits each person has locked for this match (0 = that person has not placed a deposit). */
  requesterDeposit: number;
  targetDeposit: number;
  createdAt: Date;
  /** When both people finished the Co-Op (null while pending). */
  coopCompletedAt: Date | null;
  /** The most recent chat message written by a person (not system messages). */
  lastMessage: { senderId: string; at: Date } | null;
  /** How many chat messages each participant has sent, keyed by user id. */
  messagesSentBy: Record<string, number>;
};

const HOUR_MS = 60 * 60 * 1000;

/** @returns Hours between two dates (may be fractional, e.g. 1.5). */
function hoursBetween(earlier: Date, later: Date): number {
  return (later.getTime() - earlier.getTime()) / HOUR_MS;
}

/** @returns The deposit a given participant has locked in this match. */
function depositOf(facts: MatchFacts, userId: string): number {
  return userId === facts.requesterId ? facts.requesterDeposit : facts.targetDeposit;
}

/** @returns The other participant's user id. */
export function partnerOf(facts: Pick<MatchFacts, "requesterId" | "targetId">, userId: string): string {
  return userId === facts.requesterId ? facts.targetId : facts.requesterId;
}

/** Builds full-refund ledger rows for everyone who has a deposit locked. */
function refundEveryone(facts: MatchFacts, note: string): CreditEntry[] {
  const entries: CreditEntry[] = [];
  for (const userId of [facts.requesterId, facts.targetId]) {
    const deposit = depositOf(facts, userId);
    if (deposit > 0) entries.push({ userId, amount: deposit, reason: "deposit_refunded", note });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Reliability
// ---------------------------------------------------------------------------

export type ReliabilityEvent = "ghosting" | "respectful_closure" | "coop_completed";

/**
 * The Reliability Score after an event, clamped between 0 and maxReliability.
 *
 * Reads: ghostingPenaltyReliability, respectfulClosureReliabilityBonus,
 *        reliabilityRecoveryPerCompletedCoOp, maxReliability.
 *
 * @param current Current score (0–100).
 * @param event What happened.
 * @returns The new score. Example: reliabilityAfter(58, "coop_completed") = 62.
 */
export function reliabilityAfter(current: number, event: ReliabilityEvent, rules: BusinessRules = BUSINESS_RULES): number {
  const t = rules.trust;
  const change =
    event === "ghosting"
      ? -t.ghostingPenaltyReliability
      : event === "respectful_closure"
        ? t.respectfulClosureReliabilityBonus
        : t.reliabilityRecoveryPerCompletedCoOp;
  return Math.min(t.maxReliability, Math.max(0, current + change));
}

/**
 * How many completed Co-Ops a user needs to get back into the active pool.
 * Reads: SAFETY_RULES.minReliabilityScoreForActivePool, reliabilityRecoveryPerCompletedCoOp.
 * @returns 0 if already at or above the threshold.
 */
export function coOpsNeededToRecover(current: number, rules: BusinessRules = BUSINESS_RULES): number {
  const gap = rules.safety.minReliabilityScoreForActivePool - current;
  if (gap <= 0) return 0;
  const perCoOp = rules.trust.reliabilityRecoveryPerCompletedCoOp;
  return perCoOp > 0 ? Math.ceil(gap / perCoOp) : Infinity;
}

// ---------------------------------------------------------------------------
// Starting a Co-Op
// ---------------------------------------------------------------------------

export type StartCoOpContext = {
  /** The starter's current Reliability Score. */
  reliability: number;
  /** The starter's available (unlocked) credits. */
  availableCredits: number;
  /** How many Co-Ops / chats the starter currently has open. */
  activeCoOps: number;
  /** True if these two people already have (or had) a match. */
  hasExistingMatch: boolean;
  /** True if either person has blocked the other. */
  isBlocked: boolean;
  /** True if the target is currently visible in the active pool. */
  targetVisible: boolean;
};

/**
 * Whether a user may place a deposit and start (or join) a Co-Op.
 *
 * Reads: SAFETY_RULES.minReliabilityScoreForActivePool, stakeRequiredToConnect, maxConcurrentCoOps.
 *
 * @returns `{ ok: true }` or `{ ok: false, reason }` with a message safe to show the user.
 */
export function canStartCoOp(ctx: StartCoOpContext, rules: BusinessRules = BUSINESS_RULES): { ok: boolean; reason?: string } {
  const t = rules.trust;
  // The starter's own standing is checked first, so the message they see is about what they can fix.
  if (ctx.reliability < rules.safety.minReliabilityScoreForActivePool) {
    return {
      ok: false,
      reason: `Your Reliability Score is below ${rules.safety.minReliabilityScoreForActivePool}%. Finish your open Co-Ops to recover before starting new ones.`,
    };
  }
  if (ctx.isBlocked) return { ok: false, reason: "This profile is not available." };
  if (!ctx.targetVisible) return { ok: false, reason: "This profile is not in the active pool right now." };
  if (ctx.hasExistingMatch) return { ok: false, reason: "You already have a Co-Op with this person." };
  if (ctx.activeCoOps >= t.maxConcurrentCoOps) {
    return {
      ok: false,
      reason: `You already have ${t.maxConcurrentCoOps} open Co-Ops, the maximum. Close one respectfully to start another. This limit cannot be bought.`,
    };
  }
  if (ctx.availableCredits < t.stakeRequiredToConnect) {
    return { ok: false, reason: `You need ${t.stakeRequiredToConnect} available Trust Credits for the commitment deposit.` };
  }
  return { ok: true };
}

/**
 * Whether an INVITED person may place their deposit and join a Co-Op they were invited to.
 *
 * Same checks as starting, except the Reliability Score is NOT checked: accepting an
 * invitation you already hold is the recovery path for someone below the threshold
 * (completing it earns reliabilityRecoveryPerCompletedCoOp).
 *
 * Reads: stakeRequiredToConnect, maxConcurrentCoOps.
 *
 * @param ctx.otherOpenCoOps Open Co-Ops the person has, NOT counting this invitation.
 */
export function canJoinCoOp(
  ctx: { availableCredits: number; otherOpenCoOps: number; isBlocked: boolean },
  rules: BusinessRules = BUSINESS_RULES,
): { ok: boolean; reason?: string } {
  const t = rules.trust;
  if (ctx.isBlocked) return { ok: false, reason: "This Co-Op is not available." };
  if (ctx.otherOpenCoOps >= t.maxConcurrentCoOps) {
    return { ok: false, reason: `You already have ${t.maxConcurrentCoOps} open Co-Ops, the maximum. Close one respectfully to join this one. This limit cannot be bought.` };
  }
  if (ctx.availableCredits < t.stakeRequiredToConnect) {
    return { ok: false, reason: `You need ${t.stakeRequiredToConnect} available Trust Credits for the commitment deposit.` };
  }
  return { ok: true };
}

/**
 * The ledger row that locks a commitment deposit.
 * Reads: stakeRequiredToConnect.
 */
export function depositLockEntry(userId: string, rules: BusinessRules = BUSINESS_RULES): CreditEntry {
  const stake = rules.trust.stakeRequiredToConnect;
  return { userId, amount: -stake, reason: "deposit_locked", note: `Commitment deposit of ${stake} credits locked for this Co-Op.` };
}

/**
 * Plan for the moment both people have answered every scenario:
 * chat opens and both gain reliability (this is how a low score recovers).
 *
 * Reads: reliabilityRecoveryPerCompletedCoOp, maxReliability.
 *
 * @param facts The match facts.
 * @param reliabilityByUser Current Reliability Score of both participants.
 */
export function planCoOpCompleted(
  facts: MatchFacts,
  reliabilityByUser: Record<string, number>,
  rules: BusinessRules = BUSINESS_RULES,
): SettlementPlan {
  const reliability: ReliabilityChange[] = [];
  for (const userId of [facts.requesterId, facts.targetId]) {
    const before = reliabilityByUser[userId] ?? rules.trust.maxReliability;
    const delta = reliabilityAfter(before, "coop_completed", rules) - before;
    if (delta !== 0) reliability.push({ userId, delta, reason: "coop_completed", note: "Completed a Co-Op." });
  }
  return { newStatus: "chat_open", credits: [], reliability, summary: "Co-Op complete. Answers revealed and protected chat is open." };
}

// ---------------------------------------------------------------------------
// Honest Closure and the Minimum Effort Gate
// ---------------------------------------------------------------------------

/**
 * MINIMUM EFFORT GATE: has the closer earned a free, respectful exit?
 * True only if the Co-Op is complete AND they sent enough messages.
 *
 * Reads: minMessagesForFreeClosure.
 */
export function canCloseForFreeRefund(
  input: { coOpComplete: boolean; messagesSentByCloser: number },
  rules: BusinessRules = BUSINESS_RULES,
): boolean {
  return input.coOpComplete && input.messagesSentByCloser >= rules.trust.minMessagesForFreeClosure;
}

export type ClosureOutcome = {
  respectful: boolean;
  /** Deposit returned to the closer. */
  refund: number;
  /** Extra credits for a respectful closure (0 for an early exit). */
  bonus: number;
  /** Credits kept as an early-exit fee (0 for a respectful closure). */
  fee: number;
  /** Net credits that come back to the closer: refund + bonus - fee. */
  netCredits: number;
  /** Reliability points the closer gains. */
  reliabilityBonus: number;
};

/**
 * What the closer gets back if they close right now. Used for BOTH the preview
 * in the Honest Closure modal and the real settlement, so they can never disagree.
 *
 * Reads: minMessagesForFreeClosure, respectfulClosureBonusCredits,
 *        respectfulClosureReliabilityBonus, earlyExitFeeCredits.
 *
 * Example (defaults, deposit 20): after the gate -> 20 + 5 bonus, +2 reliability.
 *                                 before the gate -> 20 - 2 fee = 18, no bonus.
 */
export function closureOutcome(
  input: { deposit: number; coOpComplete: boolean; messagesSentByCloser: number },
  rules: BusinessRules = BUSINESS_RULES,
): ClosureOutcome {
  const t = rules.trust;
  const respectful = canCloseForFreeRefund(input, rules);
  const bonus = respectful ? t.respectfulClosureBonusCredits : 0;
  const fee = respectful ? 0 : Math.min(t.earlyExitFeeCredits, input.deposit);
  return {
    respectful,
    refund: input.deposit,
    bonus,
    fee,
    netCredits: input.deposit + bonus - fee,
    reliabilityBonus: respectful ? t.respectfulClosureReliabilityBonus : 0,
  };
}

/**
 * Plan for one person closing a match.
 * The closer gets `closureOutcome`; the partner always gets their own deposit back in full.
 *
 * @param facts The match facts.
 * @param closerId Who is closing.
 * @param closerReliability The closer's current Reliability Score.
 */
export function planClosure(
  facts: MatchFacts,
  closerId: string,
  closerReliability: number,
  rules: BusinessRules = BUSINESS_RULES,
): SettlementPlan {
  const partnerId = partnerOf(facts, closerId);
  const outcome = closureOutcome(
    {
      deposit: depositOf(facts, closerId),
      coOpComplete: facts.status === "chat_open",
      messagesSentByCloser: facts.messagesSentBy[closerId] ?? 0,
    },
    rules,
  );

  const credits: CreditEntry[] = [];
  if (outcome.refund > 0) {
    credits.push({ userId: closerId, amount: outcome.refund, reason: "deposit_refunded", note: "Deposit returned on closing." });
  }
  if (outcome.bonus > 0) {
    credits.push({ userId: closerId, amount: outcome.bonus, reason: "closure_bonus", note: "Bonus for an Honest Closure after real effort." });
  }
  if (outcome.fee > 0) {
    credits.push({ userId: closerId, amount: -outcome.fee, reason: "early_exit_fee", note: "Fee for closing before the Minimum Effort Gate." });
  }
  const partnerDeposit = depositOf(facts, partnerId);
  if (partnerDeposit > 0) {
    credits.push({ userId: partnerId, amount: partnerDeposit, reason: "deposit_refunded", note: "The other person closed. Your deposit is returned in full." });
  }

  const reliability: ReliabilityChange[] = [];
  if (outcome.respectful) {
    const delta = reliabilityAfter(closerReliability, "respectful_closure", rules) - closerReliability;
    if (delta !== 0) reliability.push({ userId: closerId, delta, reason: "respectful_closure", note: "Closed respectfully." });
  }

  return {
    newStatus: outcome.respectful ? "closed_respectful" : "closed_early_exit",
    credits,
    reliability,
    summary: outcome.respectful ? "Closed with an Honest Closure. Deposits returned." : "Closed early. Deposits returned, minus an early-exit fee for the closer.",
  };
}

/**
 * Plan for the invited person declining before they join: the requester is refunded in full.
 * Nobody is penalised: saying "not for me" early is the honest thing to do.
 */
export function planDecline(facts: MatchFacts): SettlementPlan {
  return {
    newStatus: "declined",
    credits: refundEveryone(facts, "Invitation declined. Deposit returned in full."),
    reliability: [],
    summary: "Invitation declined. Deposit returned in full.",
  };
}

/**
 * Plan for a block/report on an open match: everyone is refunded in full.
 * Safety must never cost credits, so there is no fee and no bonus here.
 */
export function planBlock(facts: MatchFacts): SettlementPlan {
  return {
    newStatus: "blocked",
    credits: refundEveryone(facts, "Match ended by a block. Deposit returned in full."),
    reliability: [],
    summary: "This match was ended.",
  };
}

// ---------------------------------------------------------------------------
// Time-based rules: ghosting and expiry (applied lazily, no cron jobs)
// ---------------------------------------------------------------------------

/**
 * How a forfeited deposit is split.
 * Reads: forfeitedDepositToWrongedUserPercent.
 * @returns Credits paid to the wronged user and credits burned. Example: 20 at 50% -> 10 and 10.
 */
export function forfeitSplit(deposit: number, rules: BusinessRules = BUSINESS_RULES): { toWronged: number; burned: number } {
  const toWronged = Math.floor((deposit * rules.trust.forfeitedDepositToWrongedUserPercent) / 100);
  return { toWronged, burned: deposit - toWronged };
}

/**
 * Detects ghosting: the chat is open and the latest message has gone unanswered
 * for longer than the chat window. The person who did NOT send it is the ghoster.
 *
 * Reads: chatWindowHours.
 *
 * @returns `{ ghosterId, wrongedId }` or null if nobody is ghosting.
 */
export function detectGhosting(
  facts: MatchFacts,
  now: Date,
  rules: BusinessRules = BUSINESS_RULES,
): { ghosterId: string; wrongedId: string } | null {
  if (facts.status !== "chat_open" || !facts.lastMessage) return null;
  if (hoursBetween(facts.lastMessage.at, now) <= rules.trust.chatWindowHours) return null;
  const wrongedId = facts.lastMessage.senderId;
  return { ghosterId: partnerOf(facts, wrongedId), wrongedId };
}

/**
 * Decides whether time has run out on a match and, if so, what should happen.
 *
 *  a) coop_pending for longer than coOpAnswerWindowHours
 *       -> expired_no_response: every deposit refunded, no penalty.
 *  b) chat_open and a message unanswered for longer than chatWindowHours
 *       -> closed_ghosted: ghoster's deposit forfeited (part to the wronged user, rest burned),
 *          ghoster loses reliability, wronged user's own deposit refunded.
 *  c) chat_open with no messages at all for longer than chatWindowHours
 *       -> expired_no_response: mutual fade, every deposit refunded, no penalty.
 *
 * Reads: coOpAnswerWindowHours, chatWindowHours, forfeitedDepositToWrongedUserPercent,
 *        ghostingPenaltyReliability.
 *
 * @param facts The match facts.
 * @param reliabilityByUser Current Reliability Score of both participants.
 * @param now The current time (passed in so tests and the demo time-travel can control it).
 * @returns A plan, or null if nothing is due yet.
 */
export function planExpiry(
  facts: MatchFacts,
  reliabilityByUser: Record<string, number>,
  now: Date,
  rules: BusinessRules = BUSINESS_RULES,
): SettlementPlan | null {
  const t = rules.trust;

  if (facts.status === "coop_pending") {
    if (hoursBetween(facts.createdAt, now) <= t.coOpAnswerWindowHours) return null;
    const note = `Co-Op not completed within ${t.coOpAnswerWindowHours} hours. Deposit returned in full, no penalty.`;
    return { newStatus: "expired_no_response", credits: refundEveryone(facts, note), reliability: [], summary: note };
  }

  if (facts.status !== "chat_open") return null;

  const ghosting = detectGhosting(facts, now, rules);
  if (ghosting) {
    const { ghosterId, wrongedId } = ghosting;
    const ghosterDeposit = depositOf(facts, ghosterId);
    const wrongedDeposit = depositOf(facts, wrongedId);
    const split = forfeitSplit(ghosterDeposit, rules);

    const credits: CreditEntry[] = [
      {
        userId: ghosterId,
        amount: 0, // the deposit already left the balance when it was locked; this row records that it never comes back
        reason: "ghosting_forfeit",
        note: `Deposit of ${ghosterDeposit} credits forfeited for going silent over ${t.chatWindowHours} hours: ${split.toWronged} to the other person, ${split.burned} burned.`,
      },
    ];
    if (wrongedDeposit > 0) {
      credits.push({ userId: wrongedId, amount: wrongedDeposit, reason: "deposit_refunded", note: "You were ghosted. Your deposit is returned in full." });
    }
    if (split.toWronged > 0) {
      credits.push({ userId: wrongedId, amount: split.toWronged, reason: "ghosting_compensation", note: "Compensation from the forfeited deposit." });
    }

    const before = reliabilityByUser[ghosterId] ?? t.maxReliability;
    const delta = reliabilityAfter(before, "ghosting", rules) - before;
    const reliability: ReliabilityChange[] =
      delta !== 0 ? [{ userId: ghosterId, delta, reason: "ghosting", note: `No reply for over ${t.chatWindowHours} hours.` }] : [];

    return {
      newStatus: "closed_ghosted",
      credits,
      reliability,
      summary: `Closed for ghosting: a message went unanswered for over ${t.chatWindowHours} hours.`,
    };
  }

  // Chat opened but nobody ever wrote: a mutual fade, not ghosting.
  if (!facts.lastMessage && facts.coopCompletedAt && hoursBetween(facts.coopCompletedAt, now) > t.chatWindowHours) {
    const note = `Nobody wrote for ${t.chatWindowHours} hours after the Co-Op. Deposits returned in full, no penalty.`;
    return { newStatus: "expired_no_response", credits: refundEveryone(facts, note), reliability: [], summary: note };
  }

  return null;
}

/**
 * Lazy settlement for a list of open matches (called whenever a user loads their matches).
 * Processes matches in order and keeps a running Reliability Score so two ghosted
 * matches for the same person are penalised one after the other, not from a stale score.
 *
 * @param matches Open matches, each with an `id` and its facts.
 * @param reliabilityByUser Current Reliability Score of every participant involved.
 * @param now The current time.
 * @returns One `{ matchId, plan }` per match that needs settling (possibly empty).
 */
export function settleExpiredMatches(
  matches: (MatchFacts & { id: string })[],
  reliabilityByUser: Record<string, number>,
  now: Date,
  rules: BusinessRules = BUSINESS_RULES,
): { matchId: string; plan: SettlementPlan }[] {
  const running = { ...reliabilityByUser };
  const results: { matchId: string; plan: SettlementPlan }[] = [];
  for (const match of matches) {
    const plan = planExpiry(match, running, now, rules);
    if (!plan) continue;
    for (const change of plan.reliability) {
      running[change.userId] = (running[change.userId] ?? rules.trust.maxReliability) + change.delta;
    }
    results.push({ matchId: match.id, plan });
  }
  return results;
}
