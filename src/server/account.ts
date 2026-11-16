/**
 * ACCOUNT + DATA RIGHTS (server only)
 * Consent management, "Download my data", "Delete my account", and the
 * reporter's Audit Log. These back the Safety and Legal Center.
 */
import { desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { coopAnswers, creditTransactions, matches, messages, mixerBookings, orders, reliabilityEvents, reports, users, type User } from "@/db/schema";
import { endOpenMatchesWithRefund } from "./matches";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Updates consents. Matching consent can be withdrawn: the user is then hidden from
 * every feed (see src/lib/visibility.ts) until they give it again.
 */
export async function updateConsents(user: User, input: { matching: boolean; marketing: boolean; badge: boolean }): Promise<void> {
  await db
    .update(users)
    .set({
      consentMatchingAt: input.matching ? (user.consentMatchingAt ?? new Date()) : null,
      consentMarketing: input.marketing,
      consentBadge: input.badge,
    })
    .where(eq(users.id, user.id));
}

/**
 * "Download my data": everything we hold about one user, as a plain object.
 * Deliberately excludes the password hash and other people's messages.
 */
export async function exportUserData(user: User) {
  const [myMatches, myAnswers, myMessages, ledger, reliability, myOrders, bookings, myReports] = await Promise.all([
    db.select().from(matches).where(or(eq(matches.requesterId, user.id), eq(matches.targetId, user.id))),
    db.select().from(coopAnswers).where(eq(coopAnswers.userId, user.id)),
    db.select().from(messages).where(eq(messages.senderId, user.id)),
    db.select().from(creditTransactions).where(eq(creditTransactions.userId, user.id)),
    db.select().from(reliabilityEvents).where(eq(reliabilityEvents.userId, user.id)),
    db.select().from(orders).where(eq(orders.userId, user.id)),
    db.select().from(mixerBookings).where(eq(mixerBookings.userId, user.id)),
    db.select().from(reports).where(eq(reports.reporterId, user.id)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    note: "This file contains the personal data held about your account. Messages written by other people are not included.",
    account: { id: user.id, email: user.email, createdAt: user.createdAt, status: user.status },
    consents: { matchingGivenAt: user.consentMatchingAt, marketing: user.consentMarketing, showVerifiedBadge: user.consentBadge },
    verification: { elitmusId: user.elitmusId, verifiedAt: user.verifiedAt, batchYear: user.batchYear, phPercentile: user.phPercentile, showPercentile: user.showPercentile },
    profile: {
      firstName: user.firstName,
      birthYear: user.birthYear,
      hub: user.hub,
      roleFamily: user.roleFamily,
      gender: user.gender,
      interestedIn: user.interestedIn,
      thesis: user.thesis,
      nonNegotiables: user.nonNegotiables,
      referralCode: user.referralCode,
    },
    matches: myMatches.map((m) => ({ id: m.id, status: m.status, startedByMe: m.requesterId === user.id, createdAt: m.createdAt, closedAt: m.closedAt })),
    coOpAnswers: myAnswers.map((a) => ({ matchId: a.matchId, scenarioId: a.scenarioId, optionId: a.optionId, reason: a.reason, createdAt: a.createdAt })),
    messagesSent: myMessages.map((m) => ({ matchId: m.matchId, kind: m.kind, body: m.body, createdAt: m.createdAt })),
    creditLedger: ledger.map((t) => ({ amount: t.amount, reason: t.reason, note: t.note, matchId: t.matchId, createdAt: t.createdAt })),
    reliabilityHistory: reliability.map((e) => ({ delta: e.delta, reason: e.reason, note: e.note, createdAt: e.createdAt })),
    orders: myOrders.map((o) => ({ product: o.product, amountInr: o.amountInr, provider: o.provider, meta: o.meta, createdAt: o.createdAt })),
    mixerBookings: bookings.map((b) => ({ mixerId: b.mixerId, status: b.status, createdAt: b.createdAt })),
    reportsFiled: myReports.map((r) => ({ reason: r.reason, details: r.details, status: r.status, createdAt: r.createdAt })),
  };
}

/**
 * "Delete my account": a HARD delete.
 *   1. Open matches are ended with a full refund for the other person.
 *   2. The user row is deleted; the database cascades to their answers, messages,
 *      ledger rows, orders, reports and blocks. Their eLitmus ID is released.
 * Shared demo accounts cannot be deleted (other evaluators are using them).
 */
export async function deleteAccount(user: User): Promise<Result> {
  if (user.isDemo) return { ok: false, error: "This is a shared demo account, so it cannot be deleted. Sign up with your own account to try deletion." };
  await db.transaction(async (tx) => {
    await endOpenMatchesWithRefund(tx, user.id, "The other person deleted their account. Your deposit is returned in full.");
    await tx.delete(users).where(eq(users.id, user.id));
  });
  return { ok: true };
}

export type AuditLogRow = { id: string; createdAt: Date; reportedName: string; reason: string; details: string; status: string; resolvedAt: Date | null };

/** The user's own reports, newest first (the Audit Log in the Safety Center). */
export async function getAuditLog(userId: string): Promise<AuditLogRow[]> {
  const rows = await db.select().from(reports).where(eq(reports.reporterId, userId)).orderBy(desc(reports.createdAt));
  if (rows.length === 0) return [];
  const names = await db.select({ id: users.id, firstName: users.firstName }).from(users).where(inArray(users.id, rows.map((r) => r.reportedId)));
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    reportedName: names.find((n) => n.id === r.reportedId)?.firstName ?? "Member",
    reason: r.reason,
    details: r.details,
    status: r.status,
    resolvedAt: r.resolvedAt,
  }));
}
