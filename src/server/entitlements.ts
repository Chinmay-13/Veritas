/**
 * ENTITLEMENTS (server only)
 * What a user has paid for, derived at read time from the orders table + config.
 * Nothing like "pass expires at" is stored, so changing cohortPassDays takes effect immediately.
 */
import { and, eq, gt } from "drizzle-orm";
import { BUSINESS_RULES } from "@/config/businessRules";
import { db, type DbOrTx } from "@/db/client";
import { orders, type User } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CohortPass = { hub: string; expiresAt: Date };

/**
 * Active Relocation Cohort Passes for a user.
 * Reads: MONETIZATION_PRICING.cohortPassDays.
 */
export async function getActiveCohortPasses(userId: string, q: DbOrTx = db): Promise<CohortPass[]> {
  const days = BUSINESS_RULES.pricing.cohortPassDays;
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await q.select().from(orders).where(and(eq(orders.userId, userId), eq(orders.product, "cohort_pass"), gt(orders.createdAt, since)));
  return rows.filter((o) => typeof o.meta.hub === "string").map((o) => ({ hub: o.meta.hub, expiresAt: new Date(o.createdAt.getTime() + days * DAY_MS) }));
}

/** @returns Hub ids the user may browse in Discover: their own hub plus any hub with an active pass. */
export async function getUnlockedHubs(user: User, q: DbOrTx = db): Promise<string[]> {
  const passes = await getActiveCohortPasses(user.id, q);
  return [...new Set([user.hub ?? "", ...passes.map((p) => p.hub)])].filter(Boolean);
}
