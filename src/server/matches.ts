/**
 * MATCHES (server only) — every write to a Co-Op, chat or deposit
 * ================================================================
 * Each operation follows the same three steps:
 *   1. READ the facts from the database.
 *   2. ASK a pure engine (src/lib/trustEngine.ts, safetyFilter.ts) what should happen.
 *   3. WRITE the resulting plan in ONE transaction.
 *
 * The server enforces everything here. The browser only ever sends an intent
 * ("start", "answer", "send", "close") and is never trusted for credits,
 * reliability, unmasking or unlocking.
 */
import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { COOP_SCENARIOS } from "@/data/coopScenarios";
import { CLOSURE_TEMPLATES } from "@/data/copy";
import { isInterestedIn } from "@/data/nonNegotiables";
import { SEED_PROFILES } from "@/data/seedProfiles";
import { db, type DbOrTx, type Tx } from "@/db/client";
import { pairKeyFor } from "@/db/seed";
import { blocks, coopAnswers, matches, messages, reports, users, type Match, type User } from "@/db/schema";
import { RATE_LIMITS, rateLimit } from "@/lib/rateLimit";
import { fastForwardHours } from "@/lib/rulesCopy";
import { maskAllPii, maskPii } from "@/lib/safetyFilter";
import {
  canJoinCoOp,
  canStartCoOp,
  canTransition,
  closureOutcome,
  depositLockEntry,
  isOpenStatus,
  planBlock,
  planClosure,
  planCoOpCompleted,
  planDecline,
  settleExpiredMatches,
  type ClosureOutcome,
  type MatchFacts,
  type MatchStatus,
  type SettlementPlan,
} from "@/lib/trustEngine";
import { getUnlockedHubs } from "./entitlements";
import { countOpenMatches, getBalance, getReliability, getReliabilityMap, getUserById, getVisibility, insertCreditEntries, insertReliabilityChanges, logEvent } from "./users";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const OPEN_STATUSES = ["coop_pending", "chat_open"];
/** Message kinds written by a person (as opposed to "system"). */
const PERSON_MESSAGE_KINDS = ["text", "closure"];

// ---------------------------------------------------------------------------
// Reading facts
// ---------------------------------------------------------------------------

/** @returns The match if the user is one of its two participants, otherwise null. This is the authorization check. */
export async function getMatchForUser(userId: string, matchId: string, q: DbOrTx = db): Promise<Match | null> {
  const rows = await q.select().from(matches).where(and(eq(matches.id, matchId), or(eq(matches.requesterId, userId), eq(matches.targetId, userId)))).limit(1);
  return rows[0] ?? null;
}

/** Turns a match row + its messages into the facts the trust engine needs. */
export async function loadMatchFacts(match: Match, q: DbOrTx = db): Promise<MatchFacts> {
  const personMessages = and(eq(messages.matchId, match.id), isNotNull(messages.senderId), inArray(messages.kind, PERSON_MESSAGE_KINDS));
  const [last, counts] = await Promise.all([
    q.select({ senderId: messages.senderId, at: messages.createdAt }).from(messages).where(personMessages).orderBy(desc(messages.createdAt)).limit(1),
    q.select({ senderId: messages.senderId, n: sql<number>`count(*)::int` }).from(messages).where(personMessages).groupBy(messages.senderId),
  ]);
  const messagesSentBy: Record<string, number> = {};
  for (const row of counts) if (row.senderId) messagesSentBy[row.senderId] = row.n;

  return {
    status: match.status as MatchStatus,
    requesterId: match.requesterId,
    targetId: match.targetId,
    requesterDeposit: match.requesterDeposit,
    targetDeposit: match.targetDeposit,
    createdAt: match.createdAt,
    coopCompletedAt: match.coopCompletedAt,
    lastMessage: last[0]?.senderId ? { senderId: last[0].senderId, at: last[0].at } : null,
    messagesSentBy,
  };
}

/** @returns True if either person has blocked the other. */
export async function isBlockedBetween(a: string, b: string, q: DbOrTx = db): Promise<boolean> {
  const rows = await q
    .select({ blockerId: blocks.blockerId })
    .from(blocks)
    .where(or(and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)), and(eq(blocks.blockerId, b), eq(blocks.blockedId, a))))
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Writing a plan
// ---------------------------------------------------------------------------

/**
 * Writes an engine plan to the database. Must be called inside a transaction.
 *
 * The status update is conditional ("... WHERE status = the status we planned from"),
 * so if two requests race, only the first one changes the row and the second writes nothing.
 * That makes every settlement safe to attempt twice.
 *
 * @returns true if the plan was applied, false if the match had already moved on.
 */
async function applyPlan(tx: Tx, match: Match, plan: SettlementPlan, closedById: string | null = null): Promise<boolean> {
  const from = match.status as MatchStatus;
  if (!canTransition(from, plan.newStatus)) return false;

  const now = new Date();
  const updated = await tx
    .update(matches)
    .set({
      status: plan.newStatus,
      coopCompletedAt: plan.newStatus === "chat_open" ? now : match.coopCompletedAt,
      closedAt: isOpenStatus(plan.newStatus) ? null : now,
      closedById,
    })
    .where(and(eq(matches.id, match.id), eq(matches.status, from)))
    .returning({ id: matches.id });
  if (updated.length === 0) return false;

  await insertCreditEntries(tx, plan.credits, match.id);
  await insertReliabilityChanges(tx, plan.reliability, match.id);
  // Explicit timestamp (+1ms) so the system line always sorts after a closing note written in the same transaction.
  await tx.insert(messages).values({ matchId: match.id, senderId: null, kind: "system", body: plan.summary, createdAt: new Date(now.getTime() + 1) });
  return true;
}

// ---------------------------------------------------------------------------
// Lazy settlement (no cron jobs) and demo time travel
// ---------------------------------------------------------------------------

/**
 * Applies the time-based rules (ghosting, expiry) to a user's open matches.
 * Called whenever a user loads their matches or acts on one, instead of a cron job.
 *
 * @param userId Whose open matches to check.
 * @param now The current time (injectable for tests).
 * @returns How many matches were settled.
 */
export async function settleExpiredMatchesFor(userId: string, now: Date = new Date()): Promise<number> {
  const open = await db.select().from(matches).where(and(inArray(matches.status, OPEN_STATUSES), or(eq(matches.requesterId, userId), eq(matches.targetId, userId))));
  if (open.length === 0) return 0;

  const withFacts = await Promise.all(open.map(async (match) => ({ match, facts: await loadMatchFacts(match) })));
  const participantIds = [...new Set(open.flatMap((m) => [m.requesterId, m.targetId]))];
  const reliability = await getReliabilityMap(participantIds);

  const due = settleExpiredMatches(withFacts.map(({ match, facts }) => ({ id: match.id, ...facts })), reliability, now);
  let settled = 0;
  for (const { matchId, plan } of due) {
    const match = open.find((m) => m.id === matchId);
    if (!match) continue;
    const applied = await db.transaction((tx) => applyPlan(tx, match, plan));
    if (applied) settled += 1;
  }
  return settled;
}

/**
 * DEMO TOOL: "Fast-forward". Moves the timestamps of the user's open matches (and their
 * messages) back in time, then runs settlement, so ghosting can be seen without waiting two days.
 * Reads: chatWindowHours (jumps chatWindowHours + 1 hours).
 *
 * @returns How many matches were settled as a result.
 */
export async function fastForwardOpenMatches(userId: string): Promise<number> {
  const hours = fastForwardHours();
  const open = await db.select({ id: matches.id }).from(matches).where(and(inArray(matches.status, OPEN_STATUSES), or(eq(matches.requesterId, userId), eq(matches.targetId, userId))));
  const ids = open.map((m) => m.id);
  if (ids.length === 0) return 0;

  await db.transaction(async (tx) => {
    await tx
      .update(matches)
      .set({ createdAt: sql`${matches.createdAt} - make_interval(hours => ${hours})`, coopCompletedAt: sql`${matches.coopCompletedAt} - make_interval(hours => ${hours})` })
      .where(inArray(matches.id, ids));
    await tx.update(messages).set({ createdAt: sql`${messages.createdAt} - make_interval(hours => ${hours})` }).where(inArray(messages.matchId, ids));
  });
  return settleExpiredMatchesFor(userId);
}

// ---------------------------------------------------------------------------
// Starting and joining a Co-Op
// ---------------------------------------------------------------------------

/** Inserts a scripted demo profile's canned answers for every scenario. */
async function insertScriptedAnswers(tx: Tx, matchId: string, scripted: User): Promise<void> {
  const profile = SEED_PROFILES.find((p) => p.key === scripted.seedKey);
  await tx
    .insert(coopAnswers)
    .values(
      COOP_SCENARIOS.map((scenario) => {
        const [optionId, reason] = profile?.coopAnswers[scenario.id] ?? [scenario.options[0].id, ""];
        return { matchId, userId: scripted.id, scenarioId: scenario.id, optionId, reason: reason || null };
      }),
    )
    .onConflictDoNothing();
}

/**
 * Whether `viewer` is allowed to see and invite `target` at all:
 * mutual interest, a hub the viewer has access to, target visible in the pool, no block.
 */
export async function checkPairEligibility(viewer: User, target: User, q: DbOrTx = db): Promise<{ targetVisible: boolean; isBlocked: boolean }> {
  const [visibility, blocked, unlockedHubs] = await Promise.all([getVisibility(target, q), isBlockedBetween(viewer.id, target.id, q), getUnlockedHubs(viewer, q)]);
  const mutualInterest = isInterestedIn(viewer.interestedIn ?? "", target.gender ?? "") && isInterestedIn(target.interestedIn ?? "", viewer.gender ?? "");
  const hubAllowed = unlockedHubs.includes(target.hub ?? "");
  return { targetVisible: visibility.visible && mutualInterest && hubAllowed && target.role === "user", isBlocked: blocked };
}

/**
 * Places the starter's commitment deposit and creates the Co-Op.
 * Reads (via canStartCoOp): minReliabilityScoreForActivePool, stakeRequiredToConnect, maxConcurrentCoOps.
 *
 * @returns `{ ok: true, matchId }` or `{ ok: false, error }`.
 */
export async function startCoOp(user: User, targetId: string): Promise<Result<{ matchId: string }>> {
  await settleExpiredMatchesFor(user.id);
  if (user.status !== "active") return { ok: false, error: user.status === "waitlisted" ? "You are on the waitlist. You can start Co-Ops once you are admitted." : "Your account is suspended." };
  if (targetId === user.id) return { ok: false, error: "You cannot start a Co-Op with yourself." };

  const target = await getUserById(targetId);
  if (!target) return { ok: false, error: "This profile is not available." };

  const pairKey = pairKeyFor(user.id, target.id);
  const [eligibility, reliability, availableCredits, activeCoOps, existing] = await Promise.all([
    checkPairEligibility(user, target),
    getReliability(user.id),
    getBalance(user.id),
    countOpenMatches(user.id),
    db.select({ id: matches.id }).from(matches).where(eq(matches.pairKey, pairKey)).limit(1),
  ]);

  const decision = canStartCoOp({ reliability, availableCredits, activeCoOps, hasExistingMatch: existing.length > 0, ...eligibility });
  if (!decision.ok) return { ok: false, error: decision.reason ?? "You cannot start this Co-Op right now." };

  const lock = depositLockEntry(user.id);
  try {
    const matchId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(matches)
        .values({ requesterId: user.id, targetId: target.id, pairKey, status: "coop_pending", requesterDeposit: -lock.amount })
        .returning({ id: matches.id });
      await insertCreditEntries(tx, [lock], created.id);
      // Safety net against two simultaneous requests spending the same credits.
      if ((await getBalance(user.id, tx)) < 0) throw new Error("INSUFFICIENT_CREDITS");
      await logEvent(tx, user.id, "coop_started");

      // Scripted demo profiles join and answer straight away (labelled as scripted in the UI).
      if (target.isScripted) {
        const targetLock = depositLockEntry(target.id);
        await tx.update(matches).set({ targetDeposit: -targetLock.amount }).where(eq(matches.id, created.id));
        await insertCreditEntries(tx, [targetLock], created.id);
        await insertScriptedAnswers(tx, created.id, target);
      }
      return created.id;
    });
    return { ok: true, matchId };
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") return { ok: false, error: "You do not have enough available Trust Credits." };
    // The unique pair key rejects a second match between the same two people.
    return { ok: false, error: "You already have a Co-Op with this person." };
  }
}

export type CoOpAnswerInput = { scenarioId: string; optionId: string; reason: string };

/**
 * Saves a person's Co-Op answers. For the invited person this also places their deposit (joining).
 * When both people have answered every scenario the Co-Op completes: chat opens, avatars unlock,
 * and both gain reliability.
 *
 * Free-text reasons are public to the partner, so contact details in them are always masked.
 */
export async function submitCoOpAnswers(user: User, matchId: string, answers: CoOpAnswerInput[]): Promise<Result> {
  await settleExpiredMatchesFor(user.id);
  const match = await getMatchForUser(user.id, matchId);
  if (!match) return { ok: false, error: "Match not found." };
  if (match.status !== "coop_pending") return { ok: false, error: "This Co-Op is no longer open for answers." };

  const already = await db.select({ id: coopAnswers.id }).from(coopAnswers).where(and(eq(coopAnswers.matchId, matchId), eq(coopAnswers.userId, user.id))).limit(1);
  if (already.length > 0) return { ok: false, error: "You have already answered this Co-Op." };

  // The invited person joins by placing their own deposit first.
  const needsDeposit = match.targetId === user.id && match.targetDeposit === 0;
  if (needsDeposit) {
    const [availableCredits, openCoOps, blocked] = await Promise.all([getBalance(user.id), countOpenMatches(user.id), isBlockedBetween(match.requesterId, match.targetId)]);
    // This pending invitation already counts as one of the user's open matches, so subtract it.
    const decision = canJoinCoOp({ availableCredits, otherOpenCoOps: openCoOps - 1, isBlocked: blocked });
    if (!decision.ok) return { ok: false, error: decision.reason ?? "You cannot join this Co-Op right now." };
  }

  await db.transaction(async (tx) => {
    if (needsDeposit) {
      const lock = depositLockEntry(user.id);
      await tx.update(matches).set({ targetDeposit: -lock.amount }).where(eq(matches.id, matchId));
      await insertCreditEntries(tx, [lock], matchId);
      match.targetDeposit = -lock.amount;
    }
    await tx.insert(coopAnswers).values(
      answers.map((a) => ({ matchId, userId: user.id, scenarioId: a.scenarioId, optionId: a.optionId, reason: a.reason ? maskAllPii(a.reason).text : null })),
    );

    // Complete the Co-Op if both people have now answered everything.
    const all = await tx.select({ userId: coopAnswers.userId }).from(coopAnswers).where(eq(coopAnswers.matchId, matchId));
    const partnerId = match.requesterId === user.id ? match.targetId : match.requesterId;
    const partnerDone = all.filter((a) => a.userId === partnerId).length >= COOP_SCENARIOS.length;
    if (partnerDone) {
      const reliability = await getReliabilityMap([match.requesterId, match.targetId], tx);
      const applied = await applyPlan(tx, match, planCoOpCompleted(await loadMatchFacts(match, tx), reliability));
      if (applied) {
        await logEvent(tx, match.requesterId, "coop_completed");
        await logEvent(tx, match.targetId, "coop_completed");
      }
    }
  });
  return { ok: true };
}

/** The invited person says "not for me" before joining: the requester is refunded in full, no penalties. */
export async function declineInvitation(user: User, matchId: string): Promise<Result> {
  const match = await getMatchForUser(user.id, matchId);
  if (!match || match.targetId !== user.id) return { ok: false, error: "Match not found." };
  if (match.status !== "coop_pending" || match.targetDeposit > 0) return { ok: false, error: "This invitation can no longer be declined. Use Honest Closure instead." };
  const applied = await db.transaction(async (tx) => applyPlan(tx, match, planDecline(await loadMatchFacts(match, tx)), user.id));
  return applied ? { ok: true } : { ok: false, error: "This invitation has already been resolved." };
}

// ---------------------------------------------------------------------------
// Protected chat
// ---------------------------------------------------------------------------

/** @returns Number of person-written messages in a match (both people combined). */
export async function countPersonMessages(matchId: string, q: DbOrTx = db): Promise<number> {
  const rows = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.matchId, matchId), isNotNull(messages.senderId), inArray(messages.kind, PERSON_MESSAGE_KINDS)));
  return rows[0]?.n ?? 0;
}

/**
 * Sends a chat message.
 * The Safety Shield runs HERE, on the server, before the message is stored:
 * the original text is never saved. Reads (via maskPii): messagesRequiredToUnmaskPII etc.
 *
 * @returns `{ ok: true, masked, reasons }` so the UI can tell the sender what was hidden.
 */
export async function sendMessage(user: User, matchId: string, body: string): Promise<Result<{ masked: boolean; reasons: string[] }>> {
  const limit = rateLimit(`message:${user.id}`, RATE_LIMITS.message.limit, RATE_LIMITS.message.windowMs);
  if (!limit.ok) return { ok: false, error: `You are sending messages too quickly. Try again in ${limit.retryAfterSeconds} seconds.` };

  await settleExpiredMatchesFor(user.id);
  const match = await getMatchForUser(user.id, matchId);
  if (!match) return { ok: false, error: "Match not found." };
  if (match.status !== "chat_open") return { ok: false, error: match.status === "coop_pending" ? "Chat opens once you have both completed the Co-Op." : "This chat is closed." };

  const totalMessages = await countPersonMessages(matchId);
  const result = maskPii(body, { totalMessages, coOpComplete: true });
  await db.insert(messages).values({ matchId, senderId: user.id, kind: "text", body: result.text, wasMasked: result.masked, createdAt: new Date() });

  await sendScriptedReply(match, user.id);
  return { ok: true, masked: result.masked, reasons: result.reasons };
}

/**
 * DEMO: if the partner is a scripted profile with behavior "replies", send their next canned line.
 * "goes_silent" profiles never reply, which is what lets an evaluator see ghosting compensation.
 */
async function sendScriptedReply(match: Match, senderId: string): Promise<void> {
  const partnerId = match.requesterId === senderId ? match.targetId : match.requesterId;
  const partner = await getUserById(partnerId);
  if (!partner?.isScripted) return;
  const profile = SEED_PROFILES.find((p) => p.key === partner.seedKey);
  if (!profile || profile.behavior !== "replies" || profile.chatReplies.length === 0) return;

  const sentSoFar = await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(eq(messages.matchId, match.id), eq(messages.senderId, partnerId), eq(messages.kind, "text")));
  // Seeded history may already contain messages, so offset by how many they have sent in THIS chat.
  const index = Math.min(sentSoFar[0]?.n ?? 0, profile.chatReplies.length - 1);
  // One second later so it always sorts after the message it answers.
  await db.insert(messages).values({ matchId: match.id, senderId: partnerId, kind: "text", body: profile.chatReplies[index], createdAt: new Date(Date.now() + 1000) });
}

// ---------------------------------------------------------------------------
// Honest Closure, block and report
// ---------------------------------------------------------------------------

/**
 * What the user would get back if they closed this match right now.
 * Uses the same engine function as the real closure, so the preview can never disagree with the result.
 */
export function previewClosure(match: Match, facts: MatchFacts, userId: string): ClosureOutcome {
  return closureOutcome({
    deposit: match.requesterId === userId ? match.requesterDeposit : match.targetDeposit,
    coOpComplete: match.status === "chat_open",
    messagesSentByCloser: facts.messagesSentBy[userId] ?? 0,
  });
}

/**
 * Closes a match on the user's side (Honest Closure, or an early exit if the Minimum Effort Gate is not met).
 * Reads (via planClosure): minMessagesForFreeClosure, respectfulClosureBonusCredits,
 * respectfulClosureReliabilityBonus, earlyExitFeeCredits.
 */
export async function closeMatch(user: User, matchId: string, templateId: string, note: string): Promise<Result<{ outcome: ClosureOutcome }>> {
  await settleExpiredMatchesFor(user.id);
  const match = await getMatchForUser(user.id, matchId);
  if (!match) return { ok: false, error: "Match not found." };
  if (!isOpenStatus(match.status as MatchStatus)) return { ok: false, error: "This match is already closed." };
  if (match.targetId === user.id && match.targetDeposit === 0) return { ok: false, error: "You have not joined this Co-Op. Decline the invitation instead." };

  const template = CLOSURE_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return { ok: false, error: "Choose a closing note." };
  if (template.id === "custom" && note.length < 10) return { ok: false, error: "Please write at least a short sentence for your own note." };

  const result = await db.transaction(async (tx) => {
    const facts = await loadMatchFacts(match, tx);
    const outcome = previewClosure(match, facts, user.id);
    const plan = planClosure(facts, user.id, await getReliability(user.id, tx));

    // The closing note is a chat message, so the Safety Shield applies to it too.
    const totalMessages = await countPersonMessages(matchId, tx);
    const text = template.id === "custom" ? note : note ? `${template.text} ${note}` : template.text;
    const masked = maskPii(text, { totalMessages, coOpComplete: match.status === "chat_open" });
    await tx.insert(messages).values({ matchId, senderId: user.id, kind: "closure", body: masked.text, wasMasked: masked.masked, createdAt: new Date() });

    const applied = await applyPlan(tx, match, plan, user.id);
    if (!applied) throw new Error("ALREADY_CLOSED");
    return outcome;
  }).catch(() => null);

  return result ? { ok: true, outcome: result } : { ok: false, error: "This match was already closed." };
}

/**
 * Block & Report: writes a report (shown in the reporter's Audit Log and the admin queue),
 * blocks the other person so the two never see each other again, and ends an open match
 * with a FULL refund for both: safety must never cost credits.
 */
export async function blockAndReport(user: User, matchId: string, reason: string, details: string): Promise<Result> {
  const match = await getMatchForUser(user.id, matchId);
  if (!match) return { ok: false, error: "Match not found." };
  const otherId = match.requesterId === user.id ? match.targetId : match.requesterId;

  await db.transaction(async (tx) => {
    await tx.insert(blocks).values({ blockerId: user.id, blockedId: otherId }).onConflictDoNothing();
    await tx.insert(reports).values({ reporterId: user.id, reportedId: otherId, matchId, reason, details });
    if (isOpenStatus(match.status as MatchStatus)) await applyPlan(tx, match, planBlock(await loadMatchFacts(match, tx)), user.id);
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ending matches on behalf of a user (account deletion, suspension)
// ---------------------------------------------------------------------------

/**
 * Ends all of a user's open matches with a FULL refund for everyone, no fees and no penalties.
 * Used before an account is deleted and when an admin suspends someone, so that no
 * partner is ever left with a locked deposit.
 *
 * @param summary The system message the other person sees in the chat.
 */
export async function endOpenMatchesWithRefund(tx: Tx, userId: string, summary: string): Promise<void> {
  const open = await tx.select().from(matches).where(and(inArray(matches.status, OPEN_STATUSES), or(eq(matches.requesterId, userId), eq(matches.targetId, userId))));
  for (const match of open) {
    const plan = planBlock(await loadMatchFacts(match, tx));
    await applyPlan(tx, match, { ...plan, summary }, userId);
  }
}

/** @returns Display fields for a set of users, keyed by id. */
export async function getUsersByIds(ids: string[], q: DbOrTx = db): Promise<Record<string, User>> {
  if (ids.length === 0) return {};
  const rows = await q.select().from(users).where(inArray(users.id, ids));
  return Object.fromEntries(rows.map((u) => [u.id, u]));
}
