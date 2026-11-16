/**
 * WALLET (server only)
 * Reads the two ledgers and adds a running total to each row, so the page can
 * show "balance after" without the database ever storing a balance.
 */
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { creditTransactions, matches, reliabilityEvents, users } from "@/db/schema";
import { getLockedCredits } from "./users";

export type LedgerRow = { id: string; createdAt: Date; reason: string; note: string; amount: number; balanceAfter: number; matchId: string | null; partnerName: string | null };
export type ReliabilityRow = { id: string; createdAt: Date; reason: string; note: string; delta: number; scoreAfter: number };

export type Wallet = {
  available: number;
  locked: number;
  /** Newest first. */
  ledger: LedgerRow[];
  reliability: number;
  /** Newest first. */
  reliabilityHistory: ReliabilityRow[];
};

/** Everything on /wallet for one user. */
export async function getWallet(userId: string): Promise<Wallet> {
  const [transactions, events, locked] = await Promise.all([
    db.select().from(creditTransactions).where(eq(creditTransactions.userId, userId)).orderBy(asc(creditTransactions.createdAt)),
    db.select().from(reliabilityEvents).where(eq(reliabilityEvents.userId, userId)).orderBy(asc(reliabilityEvents.createdAt)),
    getLockedCredits(userId),
  ]);

  // Look up the other person's first name for rows linked to a match.
  const matchIds = [...new Set(transactions.map((t) => t.matchId).filter((id): id is string => id !== null))];
  const partnerNameByMatch: Record<string, string> = {};
  if (matchIds.length > 0) {
    const matchRows = await db.select().from(matches).where(inArray(matches.id, matchIds));
    const partnerIds = matchRows.map((m) => (m.requesterId === userId ? m.targetId : m.requesterId));
    const partners = partnerIds.length > 0 ? await db.select({ id: users.id, firstName: users.firstName }).from(users).where(inArray(users.id, partnerIds)) : [];
    for (const m of matchRows) {
      const partnerId = m.requesterId === userId ? m.targetId : m.requesterId;
      partnerNameByMatch[m.id] = partners.find((p) => p.id === partnerId)?.firstName ?? "Member";
    }
  }

  let balance = 0;
  const ledger = transactions.map((t): LedgerRow => {
    balance += t.amount;
    return { id: t.id, createdAt: t.createdAt, reason: t.reason, note: t.note, amount: t.amount, balanceAfter: balance, matchId: t.matchId, partnerName: t.matchId ? (partnerNameByMatch[t.matchId] ?? null) : null };
  });

  let score = 0;
  const reliabilityHistory = events.map((e): ReliabilityRow => {
    score += e.delta;
    return { id: e.id, createdAt: e.createdAt, reason: e.reason, note: e.note, delta: e.delta, scoreAfter: score };
  });

  return { available: balance, locked, ledger: ledger.reverse(), reliability: events.length > 0 ? score : 100, reliabilityHistory: reliabilityHistory.reverse() };
}
