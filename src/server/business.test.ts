/**
 * INTEGRATION TESTS for sign-up, the store, data rights and moderation,
 * against the in-memory Postgres seeded with demo data.
 */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BUSINESS_RULES } from "@/config/businessRules";
import { SPARE_REGISTRY_IDS } from "@/data/seedProfiles";
import { db, ensureLocalDatabaseReady } from "@/db/client";
import { elitmusRegistry, matches, reports, users, type User } from "@/db/schema";
import { resetDemoData } from "@/db/seed";
import { demoOtpFor } from "@/lib/session";
import { deleteAccount, exportUserData, getAuditLog, updateConsents } from "./account";
import { getAdminDashboard, resolveReport } from "./admin";
import { getCohortOverview } from "./cohort";
import { getDiscoverFeed } from "./discover";
import { blockAndReport, startCoOp } from "./matches";
import { confirmVerification, currentSignupStep, saveConsent, saveNonNegotiables, saveProfile, startVerification } from "./onboarding";
import { bookMixer, getStoreView, purchaseCohortPass, purchaseTopUp } from "./store";
import { getBalance, getReliability, getUserById } from "./users";

const P = BUSINESS_RULES.pricing;
let people: Record<string, User> = {};
let counter = 0;

/** Walks a brand-new account through every sign-up step using a spare registry ID. */
async function signUp(options: { gender: string; interestedIn: string; hub: string; referralCode?: string; registryIndex: number }): Promise<User> {
  const [created] = await db.insert(users).values({ email: `real${Date.now()}_${counter++}@example.com`, passwordHash: "x", referralCode: `T-${Date.now()}-${counter}` }).returning();
  expect(currentSignupStep(created)).toBe("consent");
  expect((await saveConsent(created.id, { birthYear: 2000, marketing: false, badge: true })).ok).toBe(true);

  const elitmusId = SPARE_REGISTRY_IDS[options.registryIndex].elitmusId;
  expect((await startVerification(created.id, elitmusId)).ok).toBe(true);
  const pending = (await getUserById(created.id))!;
  expect(currentSignupStep(pending)).toBe("otp");
  expect((await confirmVerification(pending, "000000")).ok).toBe(false); // wrong code is rejected
  expect((await confirmVerification(pending, demoOtpFor(created.id, elitmusId))).ok).toBe(true);

  const verified = (await getUserById(created.id))!;
  expect(verified.batchYear).toBe(SPARE_REGISTRY_IDS[options.registryIndex].batchYear); // batch comes from the registry
  const profile = await saveProfile(verified, {
    firstName: "Evie",
    hub: options.hub,
    roleFamily: "sde",
    gender: options.gender,
    interestedIn: options.interestedIn,
    thesis: "Looking for someone steady and curious to build a calm life with.",
    showPercentile: false,
    referralCode: options.referralCode,
  });
  expect(profile.ok).toBe(true);
  await saveNonNegotiables((await getUserById(created.id))!, {
    financialPhilosophy: { value: "balanced", mustMatch: false },
    relocationMobility: { value: "open", mustMatch: false },
    familyStructure: { value: "flexible", mustMatch: false },
    weekendRhythm: { value: "social", mustMatch: false },
  });
  return (await getUserById(created.id))!;
}

beforeAll(async () => {
  await ensureLocalDatabaseReady();
});

beforeEach(async () => {
  await resetDemoData();
  // Remove accounts created by earlier tests and free their registry IDs.
  await db.delete(users).where(eq(users.isDemo, false));
  const all = await db.select().from(users);
  people = Object.fromEntries(all.filter((u) => u.seedKey).map((u) => [u.seedKey!, u]));
});

describe("sign-up (acceptance criterion 2)", () => {
  it("takes a new visitor from account to an active, scored Discover feed", async () => {
    const user = await signUp({ gender: "woman", interestedIn: "men", hub: "bengaluru", registryIndex: 0 });
    expect(currentSignupStep(user)).toBe("done");
    expect(user.status).toBe("active"); // demoBypassWaitlist
    expect(await getBalance(user.id)).toBe(BUSINESS_RULES.trust.initialCredits);
    expect(await getReliability(user.id)).toBe(BUSINESS_RULES.trust.maxReliability);
    const feed = await getDiscoverFeed(user, {});
    expect(feed.dossiers.length).toBeGreaterThan(0);
    expect(feed.dossiers[0].compatibility.total).toBeGreaterThan(0);
  });

  it("pays the referrer and rejects an eLitmus ID that is already claimed", async () => {
    const before = await getBalance(people.arjun.id);
    await signUp({ gender: "woman", interestedIn: "men", hub: "pune", referralCode: people.arjun.referralCode, registryIndex: 1 });
    expect(await getBalance(people.arjun.id)).toBe(before + BUSINESS_RULES.cohort.referralBoostCredits);
    expect((await getCohortOverview(people.arjun)).referralCount).toBe(3); // Tara and Vikram (seeded) + the new member

    const [other] = await db.insert(users).values({ email: `dup${Date.now()}@example.com`, passwordHash: "x", referralCode: `D-${Date.now()}` }).returning();
    expect((await startVerification(other.id, SPARE_REGISTRY_IDS[1].elitmusId)).ok).toBe(false);
    expect((await startVerification(other.id, "ELM-1999-000000")).ok).toBe(false); // not in the registry
  });

  it("lets two real accounts match each other for real (acceptance criterion 3)", async () => {
    const woman = await signUp({ gender: "woman", interestedIn: "men", hub: "pune", registryIndex: 2 });
    const man = await signUp({ gender: "man", interestedIn: "women", hub: "pune", registryIndex: 3 });
    const start = await startCoOp(woman, man.id);
    expect(start.ok).toBe(true);
    const [match] = await db.select().from(matches).where(eq(matches.requesterId, woman.id));
    expect(match).toMatchObject({ status: "coop_pending", targetDeposit: 0 }); // a real person is NOT auto-joined
  });
});

describe("store (acceptance criterion 6)", () => {
  it("Cohort Pass unlocks another hub's pool in Discover", async () => {
    expect((await getDiscoverFeed(people.ananya, { hub: "hyderabad" })).hubLocked).toBe(true);
    expect((await purchaseCohortPass(people.ananya, "bengaluru")).ok).toBe(false); // own hub is free
    expect((await purchaseCohortPass(people.ananya, "hyderabad")).ok).toBe(true);
    const feed = await getDiscoverFeed(people.ananya, { hub: "hyderabad" });
    expect(feed.hubLocked).toBe(false);
    expect(feed.dossiers.map((d) => d.firstName)).toEqual(["Karthik"]); // Rohan hidden (reliability), Sameer hidden (dealbreaker)
    expect((await purchaseCohortPass(people.ananya, "hyderabad")).ok).toBe(false); // already active
    expect((await startCoOp(people.ananya, people.karthik.id)).ok).toBe(true); // and the pass makes the Co-Op possible
  });

  it("Top-Up adds credits and is capped per month", async () => {
    for (let i = 0; i < P.maxTopUpsPerMonth; i++) expect((await purchaseTopUp(people.ananya)).ok).toBe(true);
    expect(await getBalance(people.ananya.id)).toBe(100 + P.maxTopUpsPerMonth * P.trustCreditPackCredits);
    expect((await purchaseTopUp(people.ananya)).ok).toBe(false);
  });

  it("Mixer reserves a seat once and records the order", async () => {
    expect((await bookMixer(people.ananya, "blr-coffee")).ok).toBe(true);
    expect((await bookMixer(people.ananya, "blr-coffee")).ok).toBe(false);
    const store = await getStoreView(people.ananya);
    expect(store.mixers.find((m) => m.id === "blr-coffee")).toMatchObject({ myBooking: "confirmed", seatsTaken: { woman: 2, man: 1 } }); // Tara + Ananya, Vikram
    expect(store.orders).toHaveLength(1);
    expect(store.paymentsSimulated).toBe(true);
  });
});

describe("data rights (acceptance criterion 8)", () => {
  it("exports the user's data without the password hash", async () => {
    const data = await exportUserData(people.arjun);
    expect(data.account.email).toBe(people.arjun.email);
    expect(data.creditLedger.length).toBeGreaterThan(0);
    expect(data.messagesSent).toHaveLength(2);
    expect(JSON.stringify(data)).not.toContain(people.arjun.passwordHash);
  });

  it("hard-deletes a real account, refunds the partner and releases the eLitmus ID", async () => {
    const user = await signUp({ gender: "woman", interestedIn: "men", hub: "bengaluru", registryIndex: 4 });
    await startCoOp(user, people.vikram.id);
    expect(await getBalance(people.vikram.id)).toBe(100 - BUSINESS_RULES.trust.stakeRequiredToConnect);

    expect((await deleteAccount(user)).ok).toBe(true);
    expect(await getUserById(user.id)).toBeNull();
    expect(await getBalance(people.vikram.id)).toBe(100); // partner made whole
    const [record] = await db.select().from(elitmusRegistry).where(eq(elitmusRegistry.elitmusId, SPARE_REGISTRY_IDS[4].elitmusId));
    expect(record.claimedByUserId).toBeNull();
  });

  it("refuses to delete a shared demo account", async () => {
    expect((await deleteAccount(people.arjun)).ok).toBe(false);
  });

  it("withdrawing matching consent hides the user from feeds", async () => {
    await updateConsents(people.vikram, { matching: false, marketing: false, badge: true });
    expect((await getDiscoverFeed(people.ananya, {})).dossiers.map((d) => d.firstName)).not.toContain("Vikram");
  });
});

describe("moderation (acceptance criterion 7)", () => {
  it("a report appears in the reporter's audit log and the admin queue, and Suspend takes effect", async () => {
    const [match] = await db.select().from(matches).where(eq(matches.targetId, people.kavya.id));
    await blockAndReport(people.arjun, match.id, "harassment", "Rude messages.");
    expect(await getAuditLog(people.arjun.id)).toMatchObject([{ reportedName: "Kavya", reason: "harassment", status: "open" }]);

    const dashboard = await getAdminDashboard();
    expect(dashboard.reports).toMatchObject([{ reporterName: "Arjun", reportedName: "Kavya", status: "open" }]);
    expect(dashboard.funnel.map((f) => f.type)).toEqual(["signup", "verified", "profile_complete", "coop_started", "coop_completed", "paid"]);
    expect(dashboard.totalGrossInr).toBeGreaterThan(0);

    const [report] = await db.select().from(reports);
    expect((await resolveReport(report.id, "suspend")).ok).toBe(true);
    expect((await getUserById(people.kavya.id))?.status).toBe("suspended");
    expect((await getAuditLog(people.arjun.id))[0].status).toBe("suspended");
    expect((await resolveReport(report.id, "reinstate")).ok).toBe(true);
    expect((await getUserById(people.kavya.id))?.status).toBe("active");
  });
});
