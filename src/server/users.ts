/**
 * USER FACTS (server only)
 * Small read/write helpers for the two ledgers (credits, reliability) and for
 * the facts the engines need. Every function accepts an optional `q` so it can
 * run inside a transaction.
 */
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { BUSINESS_RULES } from "@/config/businessRules";
import { db, type DbOrTx } from "@/db/client";
import { creditTransactions, events, matches, reliabilityEvents, reports, users, type User } from "@/db/schema";
import type { CreditEntry, ReliabilityChange } from "@/lib/trustEngine";
import { poolVisibility } from "@/lib/visibility";

const OPEN_STATUSES = ["coop_pending", "chat_open"];

/** @returns The user row, or null. */
export async function getUserById(userId: string, q: DbOrTx = db): Promise<User | null> {
  const rows = await q.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

/** @returns Available (unlocked) Trust Credits = SUM of the user's ledger rows. */
export async function getBalance(userId: string, q: DbOrTx = db): Promise<number> {
  const rows = await q.select({ total: sql<number>`coalesce(sum(${creditTransactions.amount}), 0)::int` }).from(creditTransactions).where(eq(creditTransactions.userId, userId));
  return rows[0]?.total ?? 0;
}

/** @returns Credits currently locked as deposits in open matches. */
export async function getLockedCredits(userId: string, q: DbOrTx = db): Promise<number> {
  const rows = await q
    .select({ requesterId: matches.requesterId, requesterDeposit: matches.requesterDeposit, targetDeposit: matches.targetDeposit })
    .from(matches)
    .where(and(inArray(matches.status, OPEN_STATUSES), or(eq(matches.requesterId, userId), eq(matches.targetId, userId))));
  return rows.reduce((sum, m) => sum + (m.requesterId === userId ? m.requesterDeposit : m.targetDeposit), 0);
}

/** @returns How many Co-Ops / chats the user currently has open (counts towards maxConcurrentCoOps). */
export async function countOpenMatches(userId: string, q: DbOrTx = db): Promise<number> {
  const rows = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(matches)
    .where(and(inArray(matches.status, OPEN_STATUSES), or(eq(matches.requesterId, userId), eq(matches.targetId, userId))));
  return rows[0]?.n ?? 0;
}

/**
 * @returns Reliability Score per user id = SUM of their reliability events.
 *          Users with no events get maxReliability.
 */
export async function getReliabilityMap(userIds: string[], q: DbOrTx = db): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const id of userIds) result[id] = BUSINESS_RULES.trust.maxReliability;
  if (userIds.length === 0) return result;
  const rows = await q
    .select({ userId: reliabilityEvents.userId, total: sql<number>`sum(${reliabilityEvents.delta})::int` })
    .from(reliabilityEvents)
    .where(inArray(reliabilityEvents.userId, userIds))
    .groupBy(reliabilityEvents.userId);
  for (const row of rows) result[row.userId] = row.total;
  return result;
}

/** @returns One user's Reliability Score. */
export async function getReliability(userId: string, q: DbOrTx = db): Promise<number> {
  return (await getReliabilityMap([userId], q))[userId];
}

/** @returns How many times each user has been penalised for ghosting. */
export async function getGhostingCounts(userIds: string[], q: DbOrTx = db): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (userIds.length === 0) return result;
  const rows = await q
    .select({ userId: reliabilityEvents.userId, n: sql<number>`count(*)::int` })
    .from(reliabilityEvents)
    .where(and(inArray(reliabilityEvents.userId, userIds), eq(reliabilityEvents.reason, "ghosting")))
    .groupBy(reliabilityEvents.userId);
  for (const row of rows) result[row.userId] = row.n;
  return result;
}

/** @returns Number of unresolved reports against each user. */
export async function getOpenReportCounts(userIds: string[], q: DbOrTx = db): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (userIds.length === 0) return result;
  const rows = await q
    .select({ userId: reports.reportedId, n: sql<number>`count(*)::int` })
    .from(reports)
    .where(and(inArray(reports.reportedId, userIds), eq(reports.status, "open")))
    .groupBy(reports.reportedId);
  for (const row of rows) result[row.userId] = row.n;
  return result;
}

/**
 * Whether a user is currently visible in the active pool, and why not.
 * Combines database facts with the pure rule in src/lib/visibility.ts.
 */
export async function getVisibility(user: User, q: DbOrTx = db) {
  const [reliability, reportCounts] = await Promise.all([getReliability(user.id, q), getOpenReportCounts([user.id], q)]);
  return poolVisibility({
    status: user.status,
    profileComplete: user.profileCompletedAt !== null,
    consentMatching: user.consentMatchingAt !== null,
    reliability,
    openReports: reportCounts[user.id] ?? 0,
  });
}

/** Inserts ledger rows produced by an engine plan. */
export async function insertCreditEntries(q: DbOrTx, entries: CreditEntry[], matchId: string | null): Promise<void> {
  if (entries.length === 0) return;
  // Explicit timestamps one millisecond apart keep the ledger in a stable, readable order
  // (inside a transaction the database clock would give every row the same time).
  const base = Date.now();
  await q.insert(creditTransactions).values(entries.map((e, i) => ({ userId: e.userId, amount: e.amount, reason: e.reason, note: e.note, matchId, createdAt: new Date(base + i) })));
}

/** Inserts reliability rows produced by an engine plan. */
export async function insertReliabilityChanges(q: DbOrTx, changes: ReliabilityChange[], matchId: string | null): Promise<void> {
  if (changes.length === 0) return;
  const base = Date.now();
  await q.insert(reliabilityEvents).values(changes.map((c, i) => ({ userId: c.userId, delta: c.delta, reason: c.reason, note: c.note, matchId, createdAt: new Date(base + i) })));
}

/** Records a funnel event for the founder dashboard (event name only, no content). */
export async function logEvent(q: DbOrTx, userId: string | null, type: string): Promise<void> {
  await q.insert(events).values({ userId, type });
}

/** Everything the navbar chips need for one user. */
export async function getHeaderStats(userId: string): Promise<{ credits: number; reliability: number }> {
  const [credits, reliability] = await Promise.all([getBalance(userId), getReliability(userId)]);
  return { credits, reliability };
}
