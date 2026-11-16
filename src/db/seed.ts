/**
 * SEEDING (idempotent: safe to run any number of times)
 * =====================================================
 *   seedDatabase()   -> registry + demo accounts + demo state.   `npm run db:seed`
 *   resetDemoData()  -> restores ONLY the seeded demo accounts.  `npm run db:reset-demo`
 *                       and the "Reset Demo Data" button.
 *
 * resetDemoData never touches accounts created by real sign-ups: it only removes
 * matches where BOTH people are demo accounts, and ledger rows of demo accounts
 * that are not tied to a match with a real user.
 */
import bcrypt from "bcryptjs";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { BUSINESS_RULES } from "@/config/businessRules";
import { COOP_SCENARIOS } from "@/data/coopScenarios";
import { ARJUN_SEED_CHAT, DEMO_PASSWORD, SEED_ADMIN, SEED_PROFILES, SPARE_REGISTRY_IDS } from "@/data/seedProfiles";
import { db, type Tx } from "./client";
import { blocks, coopAnswers, creditTransactions, elitmusRegistry, events, matches, messages, mixerBookings, orders, reliabilityEvents, reports, users } from "./schema";

const HOUR_MS = 60 * 60 * 1000;
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR_MS);

/** Builds the sorted pair key used to guarantee one match per pair. */
export function pairKeyFor(a: string, b: string): string {
  return [a, b].sort().join(":");
}

/** Creates or refreshes every seeded account and returns a map of seed key -> user id. */
async function upsertSeedUsers(tx: Tx): Promise<Record<string, string>> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const now = new Date();
  const idByKey: Record<string, string> = {};

  for (const p of SEED_PROFILES) {
    const profile = {
      passwordHash,
      role: "user",
      status: "active",
      isDemo: true,
      isScripted: true,
      seedKey: p.key,
      consentMatchingAt: now,
      consentMarketing: false,
      consentBadge: true,
      birthYear: p.birthYear,
      pendingElitmusId: null,
      elitmusId: p.elitmusId,
      verifiedAt: now,
      phPercentile: p.phPercentile,
      showPercentile: false,
      firstName: p.firstName,
      batchYear: p.batchYear,
      hub: p.hub,
      roleFamily: p.roleFamily,
      gender: p.gender,
      interestedIn: p.interestedIn,
      thesis: p.thesis,
      nonNegotiables: p.nonNegotiables,
      profileCompletedAt: now,
      referralCode: `${p.firstName.toUpperCase()}${String(p.batchYear).slice(2)}`,
      referredById: null,
      waitlistedAt: null,
    };
    const rows = await tx.insert(users).values({ email: p.email, ...profile }).onConflictDoUpdate({ target: users.email, set: profile }).returning({ id: users.id });
    idByKey[p.key] = rows[0].id;
    await tx
      .insert(elitmusRegistry)
      .values({ elitmusId: p.elitmusId, batchYear: p.batchYear, phPercentile: p.phPercentile, claimedByUserId: rows[0].id })
      .onConflictDoUpdate({ target: elitmusRegistry.elitmusId, set: { claimedByUserId: rows[0].id } });
  }

  // Founder / admin: no consumer profile.
  const admin = { passwordHash, role: "admin", status: "active", isDemo: true, isScripted: false, seedKey: SEED_ADMIN.key, firstName: SEED_ADMIN.firstName, referralCode: "FOUNDER" };
  const adminRows = await tx.insert(users).values({ email: SEED_ADMIN.email, ...admin }).onConflictDoUpdate({ target: users.email, set: admin }).returning({ id: users.id });
  idByKey[SEED_ADMIN.key] = adminRows[0].id;

  // Spare IDs that evaluators can use to sign up. Never overwrites an ID someone already claimed.
  await tx.insert(elitmusRegistry).values(SPARE_REGISTRY_IDS).onConflictDoNothing();
  return idByKey;
}

/** Removes the demo accounts' state (see the file header for exactly what is and is not touched). */
async function clearDemoState(tx: Tx, demoIds: string[]): Promise<void> {
  const demoMatches = await tx.select({ id: matches.id }).from(matches).where(and(inArray(matches.requesterId, demoIds), inArray(matches.targetId, demoIds)));
  const matchIds = demoMatches.map((m) => m.id);
  if (matchIds.length > 0) {
    await tx.delete(creditTransactions).where(inArray(creditTransactions.matchId, matchIds));
    await tx.delete(reliabilityEvents).where(inArray(reliabilityEvents.matchId, matchIds));
    await tx.delete(matches).where(inArray(matches.id, matchIds)); // cascades to answers and messages
  }
  await tx.delete(creditTransactions).where(and(inArray(creditTransactions.userId, demoIds), isNull(creditTransactions.matchId)));
  await tx.delete(reliabilityEvents).where(and(inArray(reliabilityEvents.userId, demoIds), isNull(reliabilityEvents.matchId)));
  await tx.delete(mixerBookings).where(inArray(mixerBookings.userId, demoIds));
  await tx.delete(orders).where(inArray(orders.userId, demoIds));
  await tx.delete(reports).where(and(inArray(reports.reporterId, demoIds), inArray(reports.reportedId, demoIds)));
  await tx.delete(blocks).where(and(inArray(blocks.blockerId, demoIds), inArray(blocks.blockedId, demoIds)));
  await tx.delete(events).where(eq(events.isSeed, true));
}

/** Writes the seeded demo state: grants, reliability history, Arjun's two matches, sample orders and funnel events. */
async function writeDemoState(tx: Tx, idByKey: Record<string, string>): Promise<void> {
  const t = BUSINESS_RULES.trust;
  const stake = t.stakeRequiredToConnect;

  // 1. Every profile: starting credits + reliability history.
  for (const p of SEED_PROFILES) {
    const userId = idByKey[p.key];
    await tx.insert(creditTransactions).values({ userId, amount: t.initialCredits, reason: "initial_grant", note: "Welcome credits.", createdAt: hoursAgo(24 * 30) });
    await tx.insert(reliabilityEvents).values(
      p.reliabilityHistory.map(([delta, reason, note], i) => ({ userId, delta, reason, note, createdAt: hoursAgo(24 * (30 - i * 7)) })),
    );
  }

  // 2. Arjun referred two batchmates (Tara and Vikram): two referral bonuses.
  const arjun = idByKey.arjun;
  for (const key of ["tara", "vikram"]) {
    await tx.update(users).set({ referredById: arjun }).where(eq(users.id, idByKey[key]));
    await tx.insert(creditTransactions).values({
      userId: arjun,
      amount: BUSINESS_RULES.cohort.referralBoostCredits,
      reason: "referral_bonus",
      note: "A verified batchmate you referred completed sign-up (seeded demo history).",
      createdAt: hoursAgo(24 * 20),
    });
  }

  // 3. Arjun + Meera: Co-Op in progress. Meera has answered, Arjun has not.
  const meera = idByKey.meera;
  const [pending] = await tx
    .insert(matches)
    .values({ requesterId: arjun, targetId: meera, pairKey: pairKeyFor(arjun, meera), status: "coop_pending", requesterDeposit: stake, targetDeposit: stake, createdAt: hoursAgo(5) })
    .returning({ id: matches.id });
  await lockSeedDeposits(tx, pending.id, [arjun, meera], stake, 5);
  await insertSeedAnswers(tx, pending.id, meera, "meera", 4);

  // 4. Arjun + Kavya: Co-Op complete, chat open with exactly 4 messages (the last one from Kavya).
  const kavya = idByKey.kavya;
  const [chat] = await tx
    .insert(matches)
    .values({ requesterId: arjun, targetId: kavya, pairKey: pairKeyFor(arjun, kavya), status: "chat_open", requesterDeposit: stake, targetDeposit: stake, createdAt: hoursAgo(26), coopCompletedAt: hoursAgo(20) })
    .returning({ id: matches.id });
  await lockSeedDeposits(tx, chat.id, [arjun, kavya], stake, 26);
  await insertSeedAnswers(tx, chat.id, arjun, "arjun", 21);
  await insertSeedAnswers(tx, chat.id, kavya, "kavya", 20);
  await tx.insert(messages).values({ matchId: chat.id, senderId: null, kind: "system", body: "Co-Op complete. Answers revealed and protected chat is open.", createdAt: hoursAgo(20) });
  await tx.insert(messages).values(
    ARJUN_SEED_CHAT.map((m, i) => ({ matchId: chat.id, senderId: idByKey[m.from], kind: "text", body: m.body, createdAt: new Date(hoursAgo(m.hoursAgo).getTime() + i * 1000) })),
  );

  // 5. A few seeded demo orders so the founder dashboard is not empty (labelled as seeded in /admin).
  const p = BUSINESS_RULES.pricing;
  const seededOrders: { userId: string; product: string; amountInr: number; meta: Record<string, string> }[] = [
    { userId: idByKey.vikram, product: "mixer_seat", amountInr: p.weekendCuratedMixerInr, meta: { mixerId: "blr-coffee", seeded: "true" } },
    { userId: idByKey.tara, product: "mixer_seat", amountInr: p.weekendCuratedMixerInr, meta: { mixerId: "blr-coffee", seeded: "true" } },
    { userId: idByKey.riya, product: "cohort_pass", amountInr: p.relocationCohortPassInr, meta: { hub: "bengaluru", seeded: "true" } },
    { userId: idByKey.sameer, product: "credit_topup", amountInr: p.trustCreditPackInr, meta: { seeded: "true" } },
  ];
  for (const order of seededOrders) {
    const [row] = await tx.insert(orders).values({ ...order, providerReference: "seeded-demo-order", createdAt: hoursAgo(24 * 3) }).returning({ id: orders.id });
    if (order.product === "mixer_seat") {
      const gender = SEED_PROFILES.find((s) => idByKey[s.key] === order.userId)?.gender ?? "man";
      await tx.insert(mixerBookings).values({ userId: order.userId, mixerId: "blr-coffee", gender, status: "confirmed", orderId: row.id });
    }
    if (order.product === "credit_topup") {
      await tx.insert(creditTransactions).values({ userId: order.userId, amount: p.trustCreditPackCredits, reason: "topup", note: "Trust Credit Top-Up (seeded demo order).", createdAt: hoursAgo(24 * 3) });
    }
  }

  // 6. Funnel events. Real events for the seeded accounts, plus synthetic drop-off so the funnel has a shape.
  const funnel: { userId: string | null; type: string }[] = [];
  for (const s of SEED_PROFILES) for (const type of ["signup", "verified", "profile_complete"]) funnel.push({ userId: idByKey[s.key], type });
  for (let i = 0; i < 14; i++) funnel.push({ userId: null, type: "signup" });
  for (let i = 0; i < 6; i++) funnel.push({ userId: null, type: "verified" });
  for (const key of ["arjun", "arjun", "meera", "kavya", "vikram", "tara", "riya", "karthik"]) funnel.push({ userId: idByKey[key], type: "coop_started" });
  for (const key of ["arjun", "kavya", "vikram", "riya", "karthik"]) funnel.push({ userId: idByKey[key], type: "coop_completed" });
  for (const order of seededOrders) funnel.push({ userId: order.userId, type: "paid" });
  await tx.insert(events).values(funnel.map((e) => ({ ...e, isSeed: true, createdAt: hoursAgo(24 * 5) })));
}

/** Ledger rows for seeded deposits. */
async function lockSeedDeposits(tx: Tx, matchId: string, userIds: string[], stake: number, hours: number): Promise<void> {
  await tx.insert(creditTransactions).values(
    userIds.map((userId) => ({ userId, amount: -stake, reason: "deposit_locked", note: `Commitment deposit of ${stake} credits locked for this Co-Op.`, matchId, createdAt: hoursAgo(hours) })),
  );
}

/** Inserts one seeded person's scripted answers for all scenarios. */
async function insertSeedAnswers(tx: Tx, matchId: string, userId: string, seedKey: string, hours: number): Promise<void> {
  const profile = SEED_PROFILES.find((p) => p.key === seedKey);
  if (!profile) return;
  await tx.insert(coopAnswers).values(
    COOP_SCENARIOS.map((scenario) => {
      const [optionId, reason] = profile.coopAnswers[scenario.id] ?? [scenario.options[0].id, ""];
      return { matchId, userId, scenarioId: scenario.id, optionId, reason: reason || null, createdAt: hoursAgo(hours) };
    }),
  );
}

/**
 * Restores the seeded demo accounts to their starting state.
 * Never touches accounts created by real sign-ups.
 */
export async function resetDemoData(): Promise<void> {
  await db.transaction(async (tx) => {
    const idByKey = await upsertSeedUsers(tx);
    await clearDemoState(tx, Object.values(idByKey));
    await writeDemoState(tx, idByKey);
  });
}

/** Seeds the registry, the demo accounts and the demo state. Idempotent. */
export async function seedDatabase(): Promise<void> {
  await resetDemoData();
}
