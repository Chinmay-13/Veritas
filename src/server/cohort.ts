/**
 * COHORT (server only)
 * Loads the active pool and waitlist from the database and applies the pure
 * rules in src/lib/cohortEngine.ts.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { BUSINESS_RULES } from "@/config/businessRules";
import { HUBS } from "@/data/nonNegotiables";
import { db, type DbOrTx } from "@/db/client";
import { users, type User } from "@/db/schema";
import { admitFromWaitlist, genderMixForHub, type CohortMember, type GenderMix } from "@/lib/cohortEngine";

/** @returns Hub + gender of every active member with a finished profile. */
export async function getActivePool(q: DbOrTx = db): Promise<{ hub: string; gender: string }[]> {
  const rows = await q
    .select({ hub: users.hub, gender: users.gender })
    .from(users)
    .where(and(eq(users.status, "active"), eq(users.role, "user"), isNotNull(users.profileCompletedAt)));
  return rows.filter((r): r is { hub: string; gender: string } => r.hub !== null && r.gender !== null);
}

/** @returns Everyone on the waitlist, in the shape the cohort engine expects. */
async function getWaitlist(q: DbOrTx): Promise<CohortMember[]> {
  const rows = await q.select().from(users).where(and(eq(users.status, "waitlisted"), isNotNull(users.profileCompletedAt)));
  return rows
    .filter((u) => u.hub && u.gender)
    .map((u) => ({ id: u.id, hub: u.hub!, gender: u.gender!, joinedAt: u.waitlistedAt ?? u.createdAt, referred: u.referredById !== null }));
}

/**
 * Admits everyone on the waitlist who now fits (called after each new sign-up).
 * @returns The ids that were admitted.
 */
export async function runAdmissions(q: DbOrTx = db): Promise<string[]> {
  const [waitlist, pool] = await Promise.all([getWaitlist(q), getActivePool(q)]);
  if (waitlist.length === 0) return [];
  const result = admitFromWaitlist(waitlist, pool);
  for (const id of result.admittedIds) {
    await q.update(users).set({ status: "active", waitlistedAt: null }).where(eq(users.id, id));
  }
  return result.admittedIds;
}

export type CohortOverview = {
  hubs: (GenderMix & { label: string; areas: string; waiting: number })[];
  referralCount: number;
  waitlistPosition: number | null;
};

/** Everything the /cohort page shows, from real database counts. */
export async function getCohortOverview(user: User): Promise<CohortOverview> {
  const [pool, waitlist, referralRows] = await Promise.all([
    getActivePool(),
    getWaitlist(db),
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.referredById, user.id), isNotNull(users.profileCompletedAt))),
  ]);

  const hubs = HUBS.map((hub) => ({
    ...genderMixForHub(pool, hub.id, BUSINESS_RULES),
    label: hub.label,
    areas: hub.areas,
    waiting: waitlist.filter((w) => w.hub === hub.id).length,
  }));

  const sorted = [...waitlist].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  const index = sorted.findIndex((w) => w.id === user.id);
  return { hubs, referralCount: referralRows[0]?.n ?? 0, waitlistPosition: index === -1 ? null : index + 1 };
}
