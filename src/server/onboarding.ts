/**
 * ONBOARDING (server only)
 * The five sign-up steps after the account exists: consent, eLitmus verification
 * (SIMULATED), profile, non-negotiables, and activation.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { BUSINESS_RULES } from "@/config/businessRules";
import type { NonNegotiables } from "@/data/nonNegotiables";
import { db, type Tx } from "@/db/client";
import { creditTransactions, elitmusRegistry, reliabilityEvents, users, type User } from "@/db/schema";
import { decideSignupStatus, isEligibleBatch } from "@/lib/cohortEngine";
import { maskAllPii } from "@/lib/safetyFilter";
import { demoOtpFor } from "@/lib/session";
import { getActivePool, runAdmissions } from "./cohort";
import { logEvent } from "./users";

type Result = { ok: true } | { ok: false; error: string };

/** Which sign-up step a user is on, derived from facts on their row (nothing extra is stored). */
export type SignupStep = "consent" | "verify" | "otp" | "profile" | "nonNegotiables" | "done";

/** @returns The next unfinished sign-up step for a user. */
export function currentSignupStep(user: User): SignupStep {
  if (user.profileCompletedAt) return "done";
  if (!user.consentMatchingAt) return "consent";
  if (!user.elitmusId) return user.pendingElitmusId ? "otp" : "verify";
  if (!user.firstName) return "profile";
  return "nonNegotiables";
}

/**
 * Step 2: stores consent. Matching consent and the 18+ confirmation are required.
 * Only the birth YEAR is stored (data minimisation).
 */
export async function saveConsent(userId: string, input: { birthYear: number; marketing: boolean; badge: boolean }): Promise<Result> {
  const age = new Date().getFullYear() - input.birthYear;
  if (age < 18) return { ok: false, error: "You must be 18 or older to use this product." };
  if (age > 100) return { ok: false, error: "Please enter a valid birth year." };
  await db
    .update(users)
    .set({ consentMatchingAt: new Date(), consentMarketing: input.marketing, consentBadge: input.badge, birthYear: input.birthYear })
    .where(eq(users.id, userId));
  return { ok: true };
}

/**
 * Step 3a (SIMULATED): checks the eLitmus ID against the seeded registry and remembers it
 * until the OTP is confirmed. The work email is used only to "send" the OTP and is not stored.
 */
export async function startVerification(userId: string, elitmusId: string): Promise<Result> {
  const id = elitmusId.trim().toUpperCase();
  const rows = await db.select().from(elitmusRegistry).where(eq(elitmusRegistry.elitmusId, id)).limit(1);
  const record = rows[0];
  if (!record) return { ok: false, error: "We could not find that eLitmus ID. In this demo, use one of the sample IDs shown below." };
  if (record.claimedByUserId && record.claimedByUserId !== userId) return { ok: false, error: "That eLitmus ID is already linked to another account." };
  if (!isEligibleBatch(record.batchYear)) {
    return { ok: false, error: `Only ${BUSINESS_RULES.cohort.minBatchYear}–${BUSINESS_RULES.cohort.maxBatchYear} batches can join right now.` };
  }
  await db.update(users).set({ pendingElitmusId: id }).where(eq(users.id, userId));
  return { ok: true };
}

/** Step 3a (back button): forget the pending ID so the user can enter a different one. */
export async function cancelVerification(userId: string): Promise<void> {
  await db.update(users).set({ pendingElitmusId: null }).where(and(eq(users.id, userId), isNull(users.elitmusId)));
}

/**
 * Step 3b (SIMULATED): confirms the OTP and links the eLitmus record to the account.
 * The batch year comes from the registry, not from what the user types, so it is a verified fact.
 */
export async function confirmVerification(user: User, otp: string): Promise<Result> {
  const pendingId = user.pendingElitmusId;
  if (!pendingId) return { ok: false, error: "Enter your eLitmus ID first." };
  if (otp.trim() !== demoOtpFor(user.id, pendingId)) return { ok: false, error: "That code is not correct. In this demo the code is shown in the banner above." };

  return db.transaction(async (tx): Promise<Result> => {
    // Claim the ID only if nobody else has claimed it in the meantime.
    const claimed = await tx
      .update(elitmusRegistry)
      .set({ claimedByUserId: user.id })
      .where(and(eq(elitmusRegistry.elitmusId, pendingId), or(isNull(elitmusRegistry.claimedByUserId), eq(elitmusRegistry.claimedByUserId, user.id))))
      .returning();
    if (claimed.length === 0) return { ok: false, error: "That eLitmus ID was just linked to another account." };

    await tx
      .update(users)
      .set({ elitmusId: pendingId, pendingElitmusId: null, verifiedAt: new Date(), batchYear: claimed[0].batchYear, phPercentile: claimed[0].phPercentile })
      .where(eq(users.id, user.id));
    await logEvent(tx, user.id, "verified");
    return { ok: true };
  });
}

export type ProfileInput = {
  firstName: string;
  hub: string;
  roleFamily: string;
  gender: string;
  interestedIn: string;
  thesis: string;
  showPercentile: boolean;
  /** Only used during sign-up. */
  referralCode?: string;
};

/**
 * Step 4 (and the /profile editor): saves the profile.
 * The thesis is public text, so contact details in it are ALWAYS masked.
 */
export async function saveProfile(user: User, input: ProfileInput): Promise<Result> {
  let referredById = user.referredById;

  // A referral code can only be applied once, during sign-up.
  const code = input.referralCode?.trim().toUpperCase();
  if (code && !user.profileCompletedAt) {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, code)).limit(1);
    if (rows.length === 0 || rows[0].id === user.id) return { ok: false, error: "That referral code is not valid. Leave it empty to continue without one." };
    referredById = rows[0].id;
  }

  await db
    .update(users)
    .set({
      firstName: input.firstName.trim(),
      hub: input.hub,
      roleFamily: input.roleFamily,
      gender: input.gender,
      interestedIn: input.interestedIn,
      thesis: maskAllPii(input.thesis.trim()).text,
      showPercentile: input.showPercentile,
      referredById,
    })
    .where(eq(users.id, user.id));
  return { ok: true };
}

/**
 * Step 5 (and the /profile editor): saves the four non-negotiables.
 * The first time this is saved, the account is activated (see activateAccount).
 */
export async function saveNonNegotiables(user: User, nonNegotiables: NonNegotiables): Promise<Result> {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ nonNegotiables }).where(eq(users.id, user.id));
    if (!user.profileCompletedAt) await activateAccount(tx, user.id);
  });
  return { ok: true };
}

/**
 * Finishes sign-up exactly once:
 *   - decides "active" vs "waitlisted" (cohort engine: demo bypass, referral, gender balance)
 *   - grants the welcome credits and the starting Reliability Score
 *   - pays the referral bonus to the referrer
 *
 * Reads: initialCredits, maxReliability, referralBoostCredits, cohort rules, demoBypassWaitlist.
 */
async function activateAccount(tx: Tx, userId: string): Promise<void> {
  const rows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user || user.profileCompletedAt || !user.hub || !user.gender) return;

  const pool = await getActivePool(tx);
  const decision = decideSignupStatus({ hub: user.hub, gender: user.gender, referred: user.referredById !== null }, pool);
  const now = new Date();

  await tx
    .update(users)
    .set({ profileCompletedAt: now, status: decision.status, waitlistedAt: decision.status === "waitlisted" ? now : null })
    .where(eq(users.id, userId));

  await tx.insert(creditTransactions).values({ userId, amount: BUSINESS_RULES.trust.initialCredits, reason: "initial_grant", note: "Welcome credits." });
  await tx.insert(reliabilityEvents).values({ userId, delta: BUSINESS_RULES.trust.maxReliability, reason: "initial", note: "Starting score." });

  if (user.referredById) {
    await tx.insert(creditTransactions).values({
      userId: user.referredById,
      amount: BUSINESS_RULES.cohort.referralBoostCredits,
      reason: "referral_bonus",
      note: "A verified batchmate you referred completed sign-up.",
    });
  }

  await logEvent(tx, userId, "profile_complete");
  // A new active member can change the balance and unlock people who were waiting.
  if (decision.status === "active") await runAdmissions(tx);
}

/**
 * Up to five unclaimed IDs from the simulated registry, shown as a hint in demo mode.
 * Queried live so the hint never shows an ID that has already been used.
 */
export async function getSampleElitmusIds(): Promise<string[]> {
  const rows = await db.select({ elitmusId: elitmusRegistry.elitmusId }).from(elitmusRegistry).where(isNull(elitmusRegistry.claimedByUserId)).orderBy(elitmusRegistry.elitmusId).limit(40);
  // Spread the samples across batches instead of showing five from the same year.
  const step = Math.max(1, Math.floor(rows.length / 5));
  return rows.filter((_, i) => i % step === 0).slice(0, 5).map((r) => r.elitmusId);
}
