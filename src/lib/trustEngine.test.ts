import { describe, expect, it } from "vitest";
import { BUSINESS_RULES, type BusinessRules } from "@/config/businessRules";
import {
  MATCH_STATUSES,
  MATCH_TRANSITIONS,
  canCloseForFreeRefund,
  canStartCoOp,
  canTransition,
  closureOutcome,
  coOpsNeededToRecover,
  depositLockEntry,
  detectGhosting,
  forfeitSplit,
  isOpenStatus,
  planBlock,
  planClosure,
  planCoOpCompleted,
  planDecline,
  planExpiry,
  reliabilityAfter,
  settleExpiredMatches,
  type MatchFacts,
  type StartCoOpContext,
} from "./trustEngine";

const T = BUSINESS_RULES.trust;
const STAKE = T.stakeRequiredToConnect;
const START = new Date("2026-01-01T00:00:00Z");
const hoursLater = (h: number) => new Date(START.getTime() + h * 3600_000);

/** A chat-open match between "ann" (requester) and "bob" (target), both with deposits. */
function facts(overrides: Partial<MatchFacts> = {}): MatchFacts {
  return {
    status: "chat_open",
    requesterId: "ann",
    targetId: "bob",
    requesterDeposit: STAKE,
    targetDeposit: STAKE,
    createdAt: START,
    coopCompletedAt: START,
    lastMessage: null,
    messagesSentBy: {},
    ...overrides,
  };
}

const okContext: StartCoOpContext = {
  reliability: 90,
  availableCredits: 100,
  activeCoOps: 0,
  hasExistingMatch: false,
  isBlocked: false,
  targetVisible: true,
};

/** Sum of ledger amounts for one user in a plan. */
const net = (plan: { credits: { userId: string; amount: number }[] }, userId: string) =>
  plan.credits.filter((c) => c.userId === userId).reduce((sum, c) => sum + c.amount, 0);

describe("state machine", () => {
  it("allows the documented happy path", () => {
    expect(canTransition("coop_pending", "chat_open")).toBe(true);
    expect(canTransition("chat_open", "closed_respectful")).toBe(true);
    expect(canTransition("chat_open", "closed_early_exit")).toBe(true);
    expect(canTransition("chat_open", "closed_ghosted")).toBe(true);
    expect(canTransition("coop_pending", "expired_no_response")).toBe(true);
    expect(canTransition("coop_pending", "blocked")).toBe(true);
  });
  it("rejects impossible moves", () => {
    expect(canTransition("coop_pending", "closed_respectful")).toBe(false); // cannot be respectful before the Co-Op
    expect(canTransition("coop_pending", "closed_ghosted")).toBe(false); // ghosting only exists in chat
    expect(canTransition("chat_open", "coop_pending")).toBe(false);
    expect(canTransition("chat_open", "declined")).toBe(false);
  });
  it("treats every closed state as final", () => {
    for (const status of MATCH_STATUSES) {
      if (!isOpenStatus(status)) expect(MATCH_TRANSITIONS[status]).toEqual([]);
    }
  });
  it("only coop_pending and chat_open are open", () => {
    expect(MATCH_STATUSES.filter(isOpenStatus)).toEqual(["coop_pending", "chat_open"]);
  });
});

describe("canStartCoOp", () => {
  it("allows a healthy user", () => {
    expect(canStartCoOp(okContext)).toEqual({ ok: true });
  });
  it("blocks low reliability", () => {
    const result = canStartCoOp({ ...okContext, reliability: BUSINESS_RULES.safety.minReliabilityScoreForActivePool - 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Reliability Score/);
  });
  it("allows reliability exactly at the threshold", () => {
    expect(canStartCoOp({ ...okContext, reliability: BUSINESS_RULES.safety.minReliabilityScoreForActivePool }).ok).toBe(true);
  });
  it("blocks when credits are below the deposit", () => {
    expect(canStartCoOp({ ...okContext, availableCredits: STAKE - 1 }).ok).toBe(false);
    expect(canStartCoOp({ ...okContext, availableCredits: STAKE }).ok).toBe(true);
  });
  it("blocks at the concurrency cap, no matter how many credits", () => {
    const result = canStartCoOp({ ...okContext, activeCoOps: T.maxConcurrentCoOps, availableCredits: 100000 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/cannot be bought/);
  });
  it("blocks existing matches, blocks and hidden targets", () => {
    expect(canStartCoOp({ ...okContext, hasExistingMatch: true }).ok).toBe(false);
    expect(canStartCoOp({ ...okContext, isBlocked: true }).ok).toBe(false);
    expect(canStartCoOp({ ...okContext, targetVisible: false }).ok).toBe(false);
  });
  it("uses an injected deposit (live-edit safety)", () => {
    const rules: BusinessRules = structuredClone(BUSINESS_RULES);
    rules.trust.stakeRequiredToConnect = 30;
    expect(canStartCoOp({ ...okContext, availableCredits: 25 }, rules).ok).toBe(false);
    expect(depositLockEntry("ann", rules)).toMatchObject({ amount: -30, reason: "deposit_locked" });
  });
});

describe("reliability", () => {
  it("drops by the ghosting penalty and never below 0", () => {
    expect(reliabilityAfter(98, "ghosting")).toBe(98 - T.ghostingPenaltyReliability);
    expect(reliabilityAfter(5, "ghosting")).toBe(0);
  });
  it("recovers per completed Co-Op and never above the maximum", () => {
    expect(reliabilityAfter(58, "coop_completed")).toBe(58 + T.reliabilityRecoveryPerCompletedCoOp);
    expect(reliabilityAfter(99, "coop_completed")).toBe(T.maxReliability);
    expect(reliabilityAfter(99, "respectful_closure")).toBe(T.maxReliability);
  });
  it("tells a low-reliability user how many Co-Ops they need", () => {
    expect(coOpsNeededToRecover(58)).toBe(1); // 58 + 4 = 62 >= 60
    expect(coOpsNeededToRecover(50)).toBe(3); // 50 + 12 = 62
    expect(coOpsNeededToRecover(90)).toBe(0);
  });
  it("gives both people the recovery when a Co-Op completes", () => {
    const plan = planCoOpCompleted(facts({ status: "coop_pending" }), { ann: 58, bob: 100 });
    expect(plan.newStatus).toBe("chat_open");
    expect(plan.reliability).toEqual([expect.objectContaining({ userId: "ann", delta: T.reliabilityRecoveryPerCompletedCoOp })]); // bob is already at 100
    expect(plan.credits).toEqual([]);
  });
});

describe("Minimum Effort Gate and Honest Closure", () => {
  it("requires a complete Co-Op AND enough messages", () => {
    expect(canCloseForFreeRefund({ coOpComplete: true, messagesSentByCloser: T.minMessagesForFreeClosure })).toBe(true);
    expect(canCloseForFreeRefund({ coOpComplete: true, messagesSentByCloser: T.minMessagesForFreeClosure - 1 })).toBe(false);
    expect(canCloseForFreeRefund({ coOpComplete: false, messagesSentByCloser: 99 })).toBe(false);
  });

  it("respectful closure: deposit + bonus and a reliability bonus", () => {
    const outcome = closureOutcome({ deposit: STAKE, coOpComplete: true, messagesSentByCloser: T.minMessagesForFreeClosure });
    expect(outcome).toEqual({
      respectful: true,
      refund: STAKE,
      bonus: T.respectfulClosureBonusCredits,
      fee: 0,
      netCredits: STAKE + T.respectfulClosureBonusCredits,
      reliabilityBonus: T.respectfulClosureReliabilityBonus,
    });
  });

  it("early exit: deposit minus the fee, no bonus", () => {
    const outcome = closureOutcome({ deposit: STAKE, coOpComplete: true, messagesSentByCloser: 0 });
    expect(outcome).toMatchObject({ respectful: false, bonus: 0, fee: T.earlyExitFeeCredits, netCredits: STAKE - T.earlyExitFeeCredits, reliabilityBonus: 0 });
  });

  it("plans a respectful closure: closer gets deposit + bonus, partner gets their deposit", () => {
    const plan = planClosure(facts({ messagesSentBy: { ann: T.minMessagesForFreeClosure, bob: 1 } }), "ann", 90);
    expect(plan.newStatus).toBe("closed_respectful");
    expect(net(plan, "ann")).toBe(STAKE + T.respectfulClosureBonusCredits);
    expect(net(plan, "bob")).toBe(STAKE);
    expect(plan.reliability).toEqual([expect.objectContaining({ userId: "ann", delta: T.respectfulClosureReliabilityBonus })]);
  });

  it("plans an early exit: closer pays the fee, partner is whole, no reliability change", () => {
    const plan = planClosure(facts({ messagesSentBy: { ann: 1 } }), "ann", 90);
    expect(plan.newStatus).toBe("closed_early_exit");
    expect(net(plan, "ann")).toBe(STAKE - T.earlyExitFeeCredits);
    expect(net(plan, "bob")).toBe(STAKE);
    expect(plan.reliability).toEqual([]);
    expect(plan.credits.map((c) => c.reason)).toContain("early_exit_fee");
  });

  it("closing during a pending Co-Op is always an early exit, and skips a partner with no deposit", () => {
    const plan = planClosure(facts({ status: "coop_pending", targetDeposit: 0, coopCompletedAt: null, messagesSentBy: { ann: 9 } }), "ann", 90);
    expect(plan.newStatus).toBe("closed_early_exit");
    expect(plan.credits.some((c) => c.userId === "bob")).toBe(false);
  });

  it("every closure plan is a legal state transition", () => {
    expect(canTransition("chat_open", planClosure(facts({ messagesSentBy: { ann: 9 } }), "ann", 90).newStatus)).toBe(true);
    expect(canTransition("coop_pending", planClosure(facts({ status: "coop_pending" }), "ann", 90).newStatus)).toBe(true);
  });
});

describe("decline and block", () => {
  it("decline refunds the requester in full with no penalty", () => {
    const plan = planDecline(facts({ status: "coop_pending", targetDeposit: 0 }));
    expect(plan.newStatus).toBe("declined");
    expect(net(plan, "ann")).toBe(STAKE);
    expect(plan.reliability).toEqual([]);
  });
  it("block refunds everyone in full: safety never costs credits", () => {
    const plan = planBlock(facts());
    expect(plan.newStatus).toBe("blocked");
    expect(net(plan, "ann")).toBe(STAKE);
    expect(net(plan, "bob")).toBe(STAKE);
    expect(plan.credits.every((c) => c.reason === "deposit_refunded")).toBe(true);
  });
});

describe("ghosting", () => {
  const annWroteLast = facts({ lastMessage: { senderId: "ann", at: START }, messagesSentBy: { ann: 2, bob: 1 } });

  it("splits a forfeited deposit by the configured percentage", () => {
    expect(forfeitSplit(20)).toEqual({ toWronged: 10, burned: 10 });
    expect(forfeitSplit(25)).toEqual({ toWronged: 12, burned: 13 }); // rounds down, remainder burned
    const rules: BusinessRules = structuredClone(BUSINESS_RULES);
    rules.trust.forfeitedDepositToWrongedUserPercent = 100;
    expect(forfeitSplit(20, rules)).toEqual({ toWronged: 20, burned: 0 });
  });

  it("is not ghosting inside the chat window", () => {
    expect(detectGhosting(annWroteLast, hoursLater(T.chatWindowHours))).toBeNull();
    expect(planExpiry(annWroteLast, { ann: 90, bob: 90 }, hoursLater(T.chatWindowHours))).toBeNull();
  });

  it("identifies the non-responder as the ghoster after the window", () => {
    expect(detectGhosting(annWroteLast, hoursLater(T.chatWindowHours + 1))).toEqual({ ghosterId: "bob", wrongedId: "ann" });
  });

  it("settles ghosting: forfeit, compensation, refund and reliability penalty", () => {
    const plan = planExpiry(annWroteLast, { ann: 90, bob: 98 }, hoursLater(T.chatWindowHours + 1));
    expect(plan?.newStatus).toBe("closed_ghosted");
    // Wronged user: own deposit back + share of the ghoster's deposit.
    expect(net(plan!, "ann")).toBe(STAKE + forfeitSplit(STAKE).toWronged);
    // Ghoster: nothing comes back.
    expect(net(plan!, "bob")).toBe(0);
    expect(plan!.credits.find((c) => c.userId === "bob")?.reason).toBe("ghosting_forfeit");
    expect(plan!.reliability).toEqual([expect.objectContaining({ userId: "bob", delta: -T.ghostingPenaltyReliability, reason: "ghosting" })]);
  });

  it("credits created by a ghosting settlement never exceed the credits locked (nothing is minted)", () => {
    const plan = planExpiry(annWroteLast, { ann: 90, bob: 98 }, hoursLater(100))!;
    const paidOut = plan.credits.reduce((sum, c) => sum + c.amount, 0);
    expect(paidOut).toBeLessThanOrEqual(2 * STAKE);
    expect(2 * STAKE - paidOut).toBe(forfeitSplit(STAKE).burned);
  });

  it("clamps the reliability penalty at 0", () => {
    const plan = planExpiry(annWroteLast, { ann: 90, bob: 6 }, hoursLater(100))!;
    expect(plan.reliability[0].delta).toBe(-6);
  });

  it("uses an injected chat window (live-edit safety)", () => {
    const rules: BusinessRules = structuredClone(BUSINESS_RULES);
    rules.trust.chatWindowHours = 24;
    expect(detectGhosting(annWroteLast, hoursLater(25), rules)).not.toBeNull();
    expect(detectGhosting(annWroteLast, hoursLater(25))).toBeNull();
  });

  it("does not detect ghosting on closed or pending matches", () => {
    expect(detectGhosting({ ...annWroteLast, status: "closed_respectful" }, hoursLater(500))).toBeNull();
    expect(detectGhosting({ ...annWroteLast, status: "coop_pending" }, hoursLater(500))).toBeNull();
  });
});

describe("expiry (fairness rules)", () => {
  it("a Co-Op nobody finished in time refunds everyone with no penalty", () => {
    const pending = facts({ status: "coop_pending", targetDeposit: 0, coopCompletedAt: null });
    expect(planExpiry(pending, {}, hoursLater(T.coOpAnswerWindowHours))).toBeNull();
    const plan = planExpiry(pending, {}, hoursLater(T.coOpAnswerWindowHours + 1))!;
    expect(plan.newStatus).toBe("expired_no_response");
    expect(net(plan, "ann")).toBe(STAKE);
    expect(plan.credits.some((c) => c.userId === "bob")).toBe(false);
    expect(plan.reliability).toEqual([]);
  });
  it("a chat where nobody ever wrote is a mutual fade: refunds, no penalty", () => {
    const plan = planExpiry(facts(), {}, hoursLater(T.chatWindowHours + 1))!;
    expect(plan.newStatus).toBe("expired_no_response");
    expect(net(plan, "ann")).toBe(STAKE);
    expect(net(plan, "bob")).toBe(STAKE);
    expect(plan.reliability).toEqual([]);
  });
  it("closed matches are never settled again", () => {
    expect(planExpiry(facts({ status: "closed_ghosted" }), {}, hoursLater(999))).toBeNull();
  });
});

describe("settleExpiredMatches", () => {
  it("returns plans only for matches that are due", () => {
    const due = { id: "m1", ...facts({ lastMessage: { senderId: "ann", at: START } }) };
    const fresh = { id: "m2", ...facts({ lastMessage: { senderId: "ann", at: hoursLater(40) } }) };
    const results = settleExpiredMatches([due, fresh], { ann: 90, bob: 90 }, hoursLater(T.chatWindowHours + 1));
    expect(results.map((r) => r.matchId)).toEqual(["m1"]);
  });
  it("applies two penalties to the same ghoster one after another, clamped at 0", () => {
    const m1 = { id: "m1", ...facts({ lastMessage: { senderId: "ann", at: START } }) };
    const m2 = { id: "m2", ...facts({ requesterId: "cat", lastMessage: { senderId: "cat", at: START } }) };
    const results = settleExpiredMatches([m1, m2], { ann: 90, cat: 90, bob: 20 }, hoursLater(100));
    const deltas = results.map((r) => r.plan.reliability[0].delta);
    expect(deltas).toEqual([-15, -5]); // 20 -> 5 -> 0
  });
});
