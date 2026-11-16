/**
 * INTEGRATION TESTS for the server layer.
 * These run the real SQL against an in-memory Postgres (PGlite), seeded with the
 * demo data, and walk through the acceptance criteria end to end.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BUSINESS_RULES } from "@/config/businessRules";
import { COOP_SCENARIOS } from "@/data/coopScenarios";
import { db, ensureLocalDatabaseReady } from "@/db/client";
import { coopAnswers, creditTransactions, matches, messages, reports, users, type User } from "@/db/schema";
import { resetDemoData } from "@/db/seed";
import { getDiscoverFeed } from "./discover";
import { blockAndReport, closeMatch, fastForwardOpenMatches, sendMessage, startCoOp, submitCoOpAnswers } from "./matches";
import { getChatState, getMatchDetail, listMatches } from "./matchViews";
import { countOpenMatches, getBalance, getLockedCredits, getReliability } from "./users";
import { getWallet } from "./wallet";

const T = BUSINESS_RULES.trust;
const STAKE = T.stakeRequiredToConnect;
const UNMASK_AT = BUSINESS_RULES.safety.messagesRequiredToUnmaskPII;

let people: Record<string, User> = {};

/** Simple answers for every scenario (first option each). */
const answers = () => COOP_SCENARIOS.map((s) => ({ scenarioId: s.id, optionId: s.options[0].id, reason: "" }));

/** Finds the match between two seeded people. */
async function matchBetween(a: string, b: string) {
  const rows = await db.select().from(matches);
  const found = rows.find((m) => [m.requesterId, m.targetId].includes(people[a].id) && [m.requesterId, m.targetId].includes(people[b].id));
  if (!found) throw new Error(`No match between ${a} and ${b}`);
  return found;
}

beforeAll(async () => {
  await ensureLocalDatabaseReady();
});

beforeEach(async () => {
  await resetDemoData();
  const all = await db.select().from(users);
  people = Object.fromEntries(all.filter((u) => u.seedKey).map((u) => [u.seedKey!, u]));
});

describe("seeded demo state", () => {
  it("matches the personas promised in the README", async () => {
    expect(await getBalance(people.arjun.id)).toBe(120);
    expect(await getLockedCredits(people.arjun.id)).toBe(2 * STAKE);
    expect(await getReliability(people.arjun.id)).toBe(98);
    expect(await countOpenMatches(people.arjun.id)).toBe(2);
    expect(await getBalance(people.ananya.id)).toBe(100);
    expect(await getReliability(people.ananya.id)).toBe(96);
    expect(await getReliability(people.rohan.id)).toBe(58);
    const chat = await getChatState(people.arjun.id, (await matchBetween("arjun", "kavya")).id);
    expect(chat?.totalMessages).toBe(4);
  });

  it("reset is idempotent and restores the starting state", async () => {
    await startCoOp(people.arjun, people.tara.id);
    await resetDemoData();
    await resetDemoData();
    expect(await getBalance(people.arjun.id)).toBe(120);
    expect(await countOpenMatches(people.arjun.id)).toBe(2);
  });
});

describe("Co-Op lifecycle (acceptance criterion 4)", () => {
  it("locks the deposit, completes, and refunds deposit + bonus after the Minimum Effort Gate", async () => {
    const start = await startCoOp(people.ananya, people.vikram.id);
    expect(start.ok).toBe(true);
    const matchId = start.ok ? start.matchId : "";
    expect(await getBalance(people.ananya.id)).toBe(100 - STAKE);
    expect(await getLockedCredits(people.ananya.id)).toBe(STAKE);

    // Vikram is scripted: he has joined and answered, but his answers are not revealed yet.
    let detail = await getMatchDetail(people.ananya, matchId);
    expect(detail).toMatchObject({ status: "coop_pending", partnerHasAnswered: true, iHaveAnswered: false, reveal: null });
    expect(detail?.partner.avatar.variant).toBe("abstract");

    expect((await submitCoOpAnswers(people.ananya, matchId, answers())).ok).toBe(true);
    detail = await getMatchDetail(people.ananya, matchId);
    expect(detail?.status).toBe("chat_open");
    expect(detail?.reveal).toHaveLength(COOP_SCENARIOS.length);
    expect(detail?.partner.avatar.variant).toBe("revealed"); // server-decided unlock
    expect(await getReliability(people.ananya.id)).toBe(Math.min(100, 96 + T.reliabilityRecoveryPerCompletedCoOp));

    for (let i = 0; i < T.minMessagesForFreeClosure; i++) await sendMessage(people.ananya, matchId, `Message ${i + 1}`);
    const closed = await closeMatch(people.ananya, matchId, "no-fit", "");
    expect(closed).toMatchObject({ ok: true, outcome: { respectful: true } });
    expect(await getBalance(people.ananya.id)).toBe(100 + T.respectfulClosureBonusCredits);
    expect(await getLockedCredits(people.ananya.id)).toBe(0);
    expect((await getMatchDetail(people.ananya, matchId))?.status).toBe("closed_respectful");
    // The partner is made whole too.
    expect(await getBalance(people.vikram.id)).toBe(100);
  });

  it("charges the early-exit fee when closing before the gate", async () => {
    const start = await startCoOp(people.ananya, people.vikram.id);
    const matchId = start.ok ? start.matchId : "";
    const closed = await closeMatch(people.ananya, matchId, "timing", "");
    expect(closed).toMatchObject({ ok: true, outcome: { respectful: false, fee: T.earlyExitFeeCredits } });
    expect(await getBalance(people.ananya.id)).toBe(100 - T.earlyExitFeeCredits);
    expect(await getReliability(people.ananya.id)).toBe(96);
    expect((await closeMatch(people.ananya, matchId, "timing", "")).ok).toBe(false); // cannot close twice
  });

  it("lets Arjun finish the seeded Co-Op that is waiting for his answers", async () => {
    const match = await matchBetween("arjun", "meera");
    expect((await listMatches(people.arjun)).items.find((i) => i.id === match.id)?.nextAction).toBe("answer");
    expect((await submitCoOpAnswers(people.arjun, match.id, answers())).ok).toBe(true);
    expect((await getMatchDetail(people.arjun, match.id))?.status).toBe("chat_open");
    expect((await submitCoOpAnswers(people.arjun, match.id, answers())).ok).toBe(false); // cannot answer twice
  });

  it("masks contact details inside Co-Op reasons", async () => {
    const match = await matchBetween("arjun", "meera");
    const withPhone = answers().map((a, i) => (i === 0 ? { ...a, reason: "call me 9876543210" } : a));
    await submitCoOpAnswers(people.arjun, match.id, withPhone);
    const stored = await db.select().from(coopAnswers).where(and(eq(coopAnswers.matchId, match.id), eq(coopAnswers.userId, people.arjun.id)));
    expect(stored.some((a) => a.reason?.includes("9876543210"))).toBe(false);
  });
});

describe("ghosting settlement via Fast-forward (acceptance criterion 4)", () => {
  it("penalises the person who left a message unanswered", async () => {
    // Seeded: Kavya wrote last in the Arjun-Kavya chat, so Arjun owes a reply.
    const match = await matchBetween("arjun", "kavya");
    const settled = await fastForwardOpenMatches(people.arjun.id);
    expect(settled).toBe(1); // the pending Co-Op with Meera is still inside its longer window
    expect((await getMatchDetail(people.arjun, match.id))?.status).toBe("closed_ghosted");
    expect(await getReliability(people.arjun.id)).toBe(98 - T.ghostingPenaltyReliability);
    // Arjun's deposit never comes back: 120 available before, 120 after.
    expect(await getBalance(people.arjun.id)).toBe(120);
    // Kavya: own deposit back + her share of Arjun's.
    const share = Math.floor((STAKE * T.forfeitedDepositToWrongedUserPercent) / 100);
    expect(await getBalance(people.kavya.id)).toBe(100 + share);
    const wallet = await getWallet(people.arjun.id);
    expect(wallet.ledger[0]).toMatchObject({ reason: "ghosting_forfeit", amount: 0 });
    expect(wallet.reliabilityHistory[0]).toMatchObject({ reason: "ghosting", delta: -T.ghostingPenaltyReliability });
  });

  it("compensates the person who was ghosted (Dev is the 'goes silent' demo profile)", async () => {
    const start = await startCoOp(people.ananya, people.dev.id);
    const matchId = start.ok ? start.matchId : "";
    await submitCoOpAnswers(people.ananya, matchId, answers());
    await sendMessage(people.ananya, matchId, "Hello Dev, how was the climb?");
    expect((await getChatState(people.ananya.id, matchId))?.totalMessages).toBe(1); // Dev never replies

    await fastForwardOpenMatches(people.ananya.id);
    expect((await getMatchDetail(people.ananya, matchId))?.status).toBe("closed_ghosted");
    const share = Math.floor((STAKE * T.forfeitedDepositToWrongedUserPercent) / 100);
    expect(await getBalance(people.ananya.id)).toBe(100 + share);
    // Dev: 86 seeded, + recovery for completing the Co-Op, - ghosting penalty.
    expect(await getReliability(people.dev.id)).toBe(86 + T.reliabilityRecoveryPerCompletedCoOp - T.ghostingPenaltyReliability);
    const reasons = (await getWallet(people.ananya.id)).ledger.map((r) => r.reason);
    expect(reasons).toEqual(expect.arrayContaining(["deposit_refunded", "ghosting_compensation"]));
  });

  it("expires an unfinished Co-Op with a full refund and no penalty after two fast-forwards", async () => {
    await fastForwardOpenMatches(people.arjun.id);
    await fastForwardOpenMatches(people.arjun.id); // 5h + 2 x 49h > 72h
    expect((await getMatchDetail(people.arjun, (await matchBetween("arjun", "meera")).id))?.status).toBe("expired_no_response");
    expect(await getBalance(people.meera.id)).toBe(100);
  });
});

describe("PII Safety Shield (acceptance criterion 5)", () => {
  it("masks on the server before the threshold, never stores the original, and stops masking after", async () => {
    const match = await matchBetween("arjun", "kavya"); // 4 messages so far
    const early = await sendMessage(people.arjun, match.id, "My number is 98765 43210, UPI arjun@okhdfc, insta @arjun.codes");
    expect(early).toMatchObject({ ok: true, masked: true });
    const stored = await db.select().from(messages).where(eq(messages.matchId, match.id));
    expect(stored.some((m) => /98765|okhdfc|arjun\.codes/.test(m.body))).toBe(false);
    expect(stored.some((m) => m.body.includes(`until ${UNMASK_AT} messages exchanged`))).toBe(true);

    // 4 seeded + Arjun's message + Kavya's scripted reply = 6: the shield lifts.
    const chat = await getChatState(people.arjun.id, match.id);
    expect(chat?.totalMessages).toBe(UNMASK_AT);
    expect(chat?.shieldActive).toBe(false);
    const late = await sendMessage(people.arjun, match.id, "My number is 98765 43210");
    expect(late).toMatchObject({ ok: true, masked: false });
  });

  it("does not allow chat before the Co-Op is complete", async () => {
    const match = await matchBetween("arjun", "meera");
    expect((await sendMessage(people.arjun, match.id, "hello")).ok).toBe(false);
  });
});

describe("server-side enforcement", () => {
  it("blocks a low-reliability user from starting a Co-Op (Rohan)", async () => {
    const result = await startCoOp(people.rohan, people.nandini.id);
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toMatch(/Reliability Score/);
    expect(await getBalance(people.rohan.id)).toBe(100);
  });

  it("enforces the concurrency cap regardless of credits", async () => {
    expect((await startCoOp(people.arjun, people.tara.id)).ok).toBe(true); // third open Co-Op
    const fourth = await startCoOp(people.arjun, people.isha.id);
    expect(!fourth.ok && fourth.error).toMatch(/cannot be bought/);
  });

  it("refuses a second match with the same person and people outside the viewer's hubs", async () => {
    expect((await startCoOp(people.arjun, people.kavya.id)).ok).toBe(false);
    expect((await startCoOp(people.ananya, people.karthik.id)).ok).toBe(false); // Hyderabad needs a Cohort Pass
    expect((await startCoOp(people.ananya, people.rohan.id)).ok).toBe(false); // hidden: low reliability
  });

  it("does not let a non-participant read, message, close or report someone else's match", async () => {
    const match = await matchBetween("arjun", "kavya");
    expect(await getMatchDetail(people.ananya, match.id)).toBeNull();
    expect(await getChatState(people.ananya.id, match.id)).toBeNull();
    expect((await sendMessage(people.ananya, match.id, "hi")).ok).toBe(false);
    expect((await closeMatch(people.ananya, match.id, "no-fit", "")).ok).toBe(false);
    expect((await blockAndReport(people.ananya, match.id, "other", "")).ok).toBe(false);
  });

  it("never mints credits: total credits only fall (burn) across a ghosting settlement", async () => {
    const total = async () => (await db.select().from(creditTransactions)).reduce((sum, t) => sum + t.amount, 0);
    const before = await total();
    await fastForwardOpenMatches(people.arjun.id);
    const after = await total();
    // Kavya's deposit is released (+STAKE) and she gets a share of Arjun's; the rest of Arjun's stays burned.
    expect(after - before).toBe(STAKE + Math.floor((STAKE * T.forfeitedDepositToWrongedUserPercent) / 100));
  });
});

describe("recovery path for a low-reliability user (Rohan)", () => {
  it("lets Rohan join the invitation he already holds and climb back above the threshold", async () => {
    const invite = await matchBetween("rohan", "nandini");
    expect((await listMatches(people.rohan)).items.find((i) => i.id === invite.id)?.nextAction).toBe("join");
    expect((await submitCoOpAnswers(people.rohan, invite.id, answers())).ok).toBe(true);
    expect(await getBalance(people.rohan.id)).toBe(100 - STAKE);
    expect(await getReliability(people.rohan.id)).toBe(58 + T.reliabilityRecoveryPerCompletedCoOp);
    expect((await getDiscoverFeed(people.rohan, {})).viewerVisibility).toBe("ok");
  });
});

describe("Block & Report (acceptance criterion 7)", () => {
  it("writes a report, refunds both deposits in full and hides the pair from each other", async () => {
    const match = await matchBetween("arjun", "kavya");
    expect((await blockAndReport(people.arjun, match.id, "off-platform", "Kept asking for my number.")).ok).toBe(true);
    expect(await getBalance(people.arjun.id)).toBe(120 + STAKE);
    expect(await getBalance(people.kavya.id)).toBe(100);
    expect(await db.select().from(reports).where(eq(reports.reporterId, people.arjun.id))).toHaveLength(1);
    expect((await listMatches(people.arjun)).items.some((i) => i.id === match.id)).toBe(false);
    expect(await getMatchDetail(people.kavya, match.id)).toBeNull();
  });
});

describe("Discover feed", () => {
  it("shows scored dossiers, hides dealbreaker conflicts by default and never reveals avatars", async () => {
    const feed = await getDiscoverFeed(people.ananya, {});
    expect(feed.filters.hub).toBe("bengaluru");
    expect(feed.dossiers.map((d) => d.firstName)).toEqual(["Vikram", "Dev"]); // sorted by compatibility
    expect(feed.hiddenConflictCount).toBe(1); // Arjun: Ananya marked relocation as must-match
    expect(feed.dossiers.every((d) => d.avatar.variant === "abstract")).toBe(true);
    expect(feed.dossiers[0].compatibility.dimensions).toHaveLength(5);

    const withConflicts = await getDiscoverFeed(people.ananya, { showConflicts: true });
    expect(withConflicts.dossiers.map((d) => d.firstName)).toContain("Arjun");
  });

  it("locks other hubs behind the Relocation Cohort Pass", async () => {
    const feed = await getDiscoverFeed(people.ananya, { hub: "hyderabad" });
    expect(feed.hubLocked).toBe(true);
    expect(feed.dossiers).toEqual([]);
  });

  it("tells Rohan why he is hidden and that he cannot start", async () => {
    const feed = await getDiscoverFeed(people.rohan, {});
    expect(feed.viewerVisibility).toBe("low_reliability");
    expect(feed.viewerCanStart.ok).toBe(false);
  });

  it("excludes people the viewer already has a match with", async () => {
    const names = (await getDiscoverFeed(people.arjun, {})).dossiers.map((d) => d.firstName);
    expect(names).toEqual(["Tara", "Isha"]);
  });
});
