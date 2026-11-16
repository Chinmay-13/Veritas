/**
 * STORE (server only) — ethical monetisation; payments are SIMULATED
 * ==================================================================
 * Three products. Each purchase: check the rule -> charge through the
 * PaymentProvider interface -> write the order and make the entitlement real.
 *
 * Reads: MONETIZATION_PRICING (prices, cohortPassDays, maxTopUpsPerMonth, mixerSeatsPerGender).
 */
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { BUSINESS_RULES } from "@/config/businessRules";
import { MIXERS, nextMixerDateLabel, type Mixer } from "@/data/mixers";
import { GENDERS, HUBS, hubLabel } from "@/data/nonNegotiables";
import { db } from "@/db/client";
import { creditTransactions, mixerBookings, orders, type Order, type User } from "@/db/schema";
import { getPaymentProvider } from "@/lib/payments";
import { getActiveCohortPasses, type CohortPass } from "./entitlements";
import { logEvent } from "./users";

type Result = { ok: true; message: string } | { ok: false; error: string };
const DAY_MS = 24 * 60 * 60 * 1000;

/** @returns How many Trust Credit Top-Ups the user bought in the last 30 days. */
async function topUpsInLastMonth(userId: string): Promise<number> {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.userId, userId), eq(orders.product, "credit_topup"), gt(orders.createdAt, since)));
  return rows[0]?.n ?? 0;
}

/**
 * Relocation Cohort Pass: unlocks ONE other hub in Discover for cohortPassDays days.
 * Reads: relocationCohortPassInr, cohortPassDays.
 */
export async function purchaseCohortPass(user: User, hub: string): Promise<Result> {
  if (!HUBS.some((h) => h.id === hub)) return { ok: false, error: "Choose a metro hub." };
  if (hub === user.hub) return { ok: false, error: "Your own hub is always free. Choose the hub you are relocating to." };
  const active = await getActiveCohortPasses(user.id);
  if (active.some((p) => p.hub === hub)) return { ok: false, error: `You already have an active pass for ${hubLabel(hub)}.` };

  const price = BUSINESS_RULES.pricing.relocationCohortPassInr;
  const provider = getPaymentProvider();
  const charge = await provider.charge({ userId: user.id, amountInr: price, description: `Relocation Cohort Pass: ${hubLabel(hub)}` });
  if (!charge.ok) return { ok: false, error: charge.error };

  await db.transaction(async (tx) => {
    await tx.insert(orders).values({ userId: user.id, product: "cohort_pass", amountInr: price, provider: provider.name, providerReference: charge.reference, meta: { hub } });
    await logEvent(tx, user.id, "paid");
  });
  return { ok: true, message: `${hubLabel(hub)} is unlocked in Discover for ${BUSINESS_RULES.pricing.cohortPassDays} days.` };
}

/**
 * Trust Credit Top-Up: non-withdrawable utility credits, capped per month.
 * Credits NEVER raise maxConcurrentCoOps: they only replace credits lost to fees or forfeits.
 * Reads: trustCreditPackInr, trustCreditPackCredits, maxTopUpsPerMonth.
 */
export async function purchaseTopUp(user: User): Promise<Result> {
  const p = BUSINESS_RULES.pricing;
  if ((await topUpsInLastMonth(user.id)) >= p.maxTopUpsPerMonth) {
    return { ok: false, error: `You have reached the limit of ${p.maxTopUpsPerMonth} top-ups in 30 days. The cap stops anyone buying their way past the consequences of ghosting.` };
  }
  const provider = getPaymentProvider();
  const charge = await provider.charge({ userId: user.id, amountInr: p.trustCreditPackInr, description: `Trust Credit Top-Up: ${p.trustCreditPackCredits} credits` });
  if (!charge.ok) return { ok: false, error: charge.error };

  await db.transaction(async (tx) => {
    await tx.insert(orders).values({ userId: user.id, product: "credit_topup", amountInr: p.trustCreditPackInr, provider: provider.name, providerReference: charge.reference, meta: {} });
    await tx.insert(creditTransactions).values({ userId: user.id, amount: p.trustCreditPackCredits, reason: "topup", note: `Trust Credit Top-Up (${provider.isSimulated ? "demo payment" : "paid"}).` });
    await logEvent(tx, user.id, "paid");
  });
  return { ok: true, message: `${p.trustCreditPackCredits} Trust Credits added to your wallet.` };
}

/**
 * Weekend Curated Mixer: reserves a seat. Seats are balanced per gender; when a gender's
 * seats are full the user joins a free waitlist instead of being charged.
 * Reads: weekendCuratedMixerInr, mixerSeatsPerGender.
 */
export async function bookMixer(user: User, mixerId: string): Promise<Result> {
  const mixer = MIXERS.find((m) => m.id === mixerId);
  if (!mixer || !user.gender) return { ok: false, error: "This mixer is not available." };

  const existing = await db.select().from(mixerBookings).where(and(eq(mixerBookings.userId, user.id), eq(mixerBookings.mixerId, mixerId))).limit(1);
  if (existing.length > 0) return { ok: false, error: existing[0].status === "confirmed" ? "You already have a seat at this mixer." : "You are already on the waitlist for this mixer." };

  const p = BUSINESS_RULES.pricing;
  const taken = await db.select({ n: sql<number>`count(*)::int` }).from(mixerBookings).where(and(eq(mixerBookings.mixerId, mixerId), eq(mixerBookings.gender, user.gender), eq(mixerBookings.status, "confirmed")));
  if ((taken[0]?.n ?? 0) >= p.mixerSeatsPerGender) {
    await db.insert(mixerBookings).values({ userId: user.id, mixerId, gender: user.gender, status: "waitlisted" });
    return { ok: true, message: "Seats for your gender are full, so you are on the waitlist. You were not charged." };
  }

  const provider = getPaymentProvider();
  const charge = await provider.charge({ userId: user.id, amountInr: p.weekendCuratedMixerInr, description: mixer.title });
  if (!charge.ok) return { ok: false, error: charge.error };

  await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({ userId: user.id, product: "mixer_seat", amountInr: p.weekendCuratedMixerInr, provider: provider.name, providerReference: charge.reference, meta: { mixerId } })
      .returning({ id: orders.id });
    await tx.insert(mixerBookings).values({ userId: user.id, mixerId, gender: user.gender!, status: "confirmed", orderId: order.id });
    await logEvent(tx, user.id, "paid");
  });
  return { ok: true, message: `Seat reserved at ${mixer.title}.` };
}

export type MixerView = Mixer & {
  dateLabel: string;
  /** Seats taken per gender id. */
  seatsTaken: Record<string, number>;
  myBooking: "confirmed" | "waitlisted" | null;
  /** True if the viewer's gender still has a free seat. */
  seatAvailableForMe: boolean;
};

export type StoreView = {
  passes: CohortPass[];
  topUpsUsed: number;
  mixers: MixerView[];
  orders: Order[];
  paymentsSimulated: boolean;
};

/** Everything on /store for one user. */
export async function getStoreView(user: User): Promise<StoreView> {
  const [passes, topUpsUsed, bookings, myOrders] = await Promise.all([
    getActiveCohortPasses(user.id),
    topUpsInLastMonth(user.id),
    db.select().from(mixerBookings),
    db.select().from(orders).where(eq(orders.userId, user.id)).orderBy(desc(orders.createdAt)),
  ]);

  const mixers = MIXERS.map((mixer): MixerView => {
    const forMixer = bookings.filter((b) => b.mixerId === mixer.id);
    const seatsTaken: Record<string, number> = {};
    for (const gender of GENDERS) seatsTaken[gender.id] = forMixer.filter((b) => b.gender === gender.id && b.status === "confirmed").length;
    const mine = forMixer.find((b) => b.userId === user.id);
    return {
      ...mixer,
      dateLabel: nextMixerDateLabel(mixer),
      seatsTaken,
      myBooking: mine ? (mine.status as "confirmed" | "waitlisted") : null,
      seatAvailableForMe: (seatsTaken[user.gender ?? ""] ?? 0) < BUSINESS_RULES.pricing.mixerSeatsPerGender,
    };
  });

  return { passes, topUpsUsed, mixers, orders: myOrders, paymentsSimulated: getPaymentProvider().isSimulated };
}
