/**
 * FOUNDER DASHBOARD (server only, admin-gated by the page)
 * Funnel, revenue, cohort balance, reliability distribution and the reports queue.
 */
import { desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { BUSINESS_RULES } from "@/config/businessRules";
import { HUBS } from "@/data/nonNegotiables";
import { db } from "@/db/client";
import { events, orders, reports, users } from "@/db/schema";
import { genderMixForHub, type GenderMix } from "@/lib/cohortEngine";
import { getActivePool } from "./cohort";
import { endOpenMatchesWithRefund } from "./matches";
import { getReliabilityMap } from "./users";

/** Funnel steps in order. The `type` values are written by logEvent() across src/server. */
export const FUNNEL_STEPS = [
  { type: "signup", label: "Signed up" },
  { type: "verified", label: "eLitmus verified" },
  { type: "profile_complete", label: "Profile complete" },
  { type: "coop_started", label: "Co-Op started" },
  { type: "coop_completed", label: "Co-Op completed" },
  { type: "paid", label: "Paid order" },
];

export type ReportQueueRow = {
  id: string;
  createdAt: Date;
  reporterName: string;
  reportedId: string;
  reportedName: string;
  reportedStatus: string;
  reason: string;
  details: string;
  status: string;
};

export type AdminDashboard = {
  funnel: { type: string; label: string; count: number; seeded: number }[];
  revenue: { product: string; orders: number; grossInr: number; seededOrders: number }[];
  totalGrossInr: number;
  hubs: (GenderMix & { label: string })[];
  reliabilityBuckets: { label: string; count: number }[];
  reports: ReportQueueRow[];
  totals: { users: number; active: number; waitlisted: number; suspended: number };
};

/** Loads everything the founder dashboard shows. */
export async function getAdminDashboard(): Promise<AdminDashboard> {
  const [eventRows, orderRows, pool, members, reportRows] = await Promise.all([
    db.select({ type: events.type, isSeed: events.isSeed, n: sql<number>`count(*)::int` }).from(events).groupBy(events.type, events.isSeed),
    db.select().from(orders),
    getActivePool(),
    db.select({ id: users.id, status: users.status }).from(users).where(isNotNull(users.profileCompletedAt)),
    db.select().from(reports).orderBy(desc(reports.createdAt)).limit(100),
  ]);

  const funnel = FUNNEL_STEPS.map((step) => {
    const rows = eventRows.filter((e) => e.type === step.type);
    return { ...step, count: rows.reduce((sum, r) => sum + r.n, 0), seeded: rows.filter((r) => r.isSeed).reduce((sum, r) => sum + r.n, 0) };
  });

  const revenue = ["cohort_pass", "mixer_seat", "credit_topup"].map((product) => {
    const rows = orderRows.filter((o) => o.product === product);
    return { product, orders: rows.length, grossInr: rows.reduce((sum, o) => sum + o.amountInr, 0), seededOrders: rows.filter((o) => o.meta.seeded === "true").length };
  });

  // Reliability distribution of members, bucketed around the active-pool threshold.
  const reliability = await getReliabilityMap(members.map((m) => m.id));
  const threshold = BUSINESS_RULES.safety.minReliabilityScoreForActivePool;
  const scores = Object.values(reliability);
  const reliabilityBuckets = [
    { label: `Below ${threshold}% (hidden)`, count: scores.filter((s) => s < threshold).length },
    { label: `${threshold}–79%`, count: scores.filter((s) => s >= threshold && s < 80).length },
    { label: "80–89%", count: scores.filter((s) => s >= 80 && s < 90).length },
    { label: "90–100%", count: scores.filter((s) => s >= 90).length },
  ];

  // Names for the reports queue.
  const personIds = [...new Set(reportRows.flatMap((r) => [r.reporterId, r.reportedId]))];
  const people = personIds.length > 0 ? await db.select({ id: users.id, firstName: users.firstName, status: users.status }).from(users).where(inArray(users.id, personIds)) : [];
  const person = (id: string) => people.find((p) => p.id === id);

  return {
    funnel,
    revenue,
    totalGrossInr: revenue.reduce((sum, r) => sum + r.grossInr, 0),
    hubs: HUBS.map((hub) => ({ ...genderMixForHub(pool, hub.id), label: hub.label })),
    reliabilityBuckets,
    reports: reportRows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      reporterName: person(r.reporterId)?.firstName ?? "Member",
      reportedId: r.reportedId,
      reportedName: person(r.reportedId)?.firstName ?? "Member",
      reportedStatus: person(r.reportedId)?.status ?? "active",
      reason: r.reason,
      details: r.details,
      status: r.status,
    })),
    totals: {
      users: members.length,
      active: members.filter((m) => m.status === "active").length,
      waitlisted: members.filter((m) => m.status === "waitlisted").length,
      suspended: members.filter((m) => m.status === "suspended").length,
    },
  };
}

export type ReportAction = "dismiss" | "warn" | "suspend" | "reinstate";

/**
 * Resolves a report from the admin queue.
 *   dismiss   -> no action against the reported user
 *   warn      -> recorded as a warning
 *   suspend   -> the reported user is suspended (hidden, cannot start Co-Ops) and their
 *                open matches end with full refunds for everyone
 *   reinstate -> lifts a suspension
 */
export async function resolveReport(reportId: string, action: ReportAction): Promise<{ ok: boolean; error?: string }> {
  const rows = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  const report = rows[0];
  if (!report) return { ok: false, error: "Report not found." };

  await db.transaction(async (tx) => {
    const now = new Date();
    if (action === "suspend") {
      await endOpenMatchesWithRefund(tx, report.reportedId, "This match was ended by the safety team. Your deposit is returned in full.");
      await tx.update(users).set({ status: "suspended" }).where(eq(users.id, report.reportedId));
      await tx.update(reports).set({ status: "suspended", resolvedAt: now }).where(eq(reports.id, reportId));
    } else if (action === "reinstate") {
      await tx.update(users).set({ status: "active" }).where(eq(users.id, report.reportedId));
      await tx.update(reports).set({ status: "warned", resolvedAt: now }).where(eq(reports.id, reportId));
    } else {
      await tx.update(reports).set({ status: action === "warn" ? "warned" : "dismissed", resolvedAt: now }).where(eq(reports.id, reportId));
    }
  });
  return { ok: true };
}
