/**
 * DATABASE SCHEMA (Postgres, via Drizzle ORM)
 * ===========================================
 * Design rule: the database stores only FACTS (who, when, how many).
 * It never stores a threshold or a derived state such as "is unmasked" or
 * "is visible". Those are computed at read time from src/config/businessRules.ts,
 * so editing a rule never leaves stale data behind.
 *
 * Two ledgers follow the same idea:
 *   credit_transactions  -> a user's credit balance is SUM(amount)
 *   reliability_events   -> a user's Reliability Score is SUM(delta)
 */
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { NonNegotiables } from "@/data/nonNegotiables";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** People. One row per account (consumer, scripted demo profile, or admin). */
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** "user" or "admin". */
  role: text("role").notNull().default("user"),
  /** "active", "waitlisted" or "suspended". */
  status: text("status").notNull().default("active"),

  // --- demo flags (seed data only) ---
  /** True for every seeded account. "Reset Demo Data" only ever touches these. */
  isDemo: boolean("is_demo").notNull().default(false),
  /** True if this profile auto-answers Co-Ops and sends canned chat replies. */
  isScripted: boolean("is_scripted").notNull().default(false),
  /** Key into src/data/seedProfiles.ts (null for real sign-ups). */
  seedKey: text("seed_key").unique(),

  // --- consent (DPDP-style) ---
  consentMatchingAt: timestamp("consent_matching_at", { withTimezone: true }),
  consentMarketing: boolean("consent_marketing").notNull().default(false),
  consentBadge: boolean("consent_badge").notNull().default(true),
  /** Birth YEAR only (data minimisation): enough to confirm 18+. */
  birthYear: integer("birth_year"),

  // --- eLitmus verification (simulated in this demo) ---
  pendingElitmusId: text("pending_elitmus_id"),
  elitmusId: text("elitmus_id").unique(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  phPercentile: integer("ph_percentile"),
  showPercentile: boolean("show_percentile").notNull().default(false),

  // --- profile ---
  firstName: text("first_name"),
  batchYear: integer("batch_year"),
  hub: text("hub"),
  roleFamily: text("role_family"),
  gender: text("gender"),
  interestedIn: text("interested_in"),
  thesis: text("thesis"),
  nonNegotiables: jsonb("non_negotiables").$type<NonNegotiables>(),
  profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),

  // --- referrals and waitlist ---
  referralCode: text("referral_code").notNull().unique(),
  referredById: uuid("referred_by_id"),
  waitlistedAt: timestamp("waitlisted_at", { withTimezone: true }),

  createdAt: createdAt(),
});

/** Simulated eLitmus candidate registry: the IDs that are allowed to sign up. */
export const elitmusRegistry = pgTable("elitmus_registry", {
  elitmusId: text("elitmus_id").primaryKey(),
  batchYear: integer("batch_year").notNull(),
  phPercentile: integer("ph_percentile").notNull(),
  claimedByUserId: uuid("claimed_by_user_id").references(() => users.id, { onDelete: "set null" }),
});

/** A Co-Op / chat between two people. */
export const matches = pgTable(
  "matches",
  {
    id: id(),
    requesterId: uuid("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetId: uuid("target_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** The two user ids sorted and joined. UNIQUE, so two people can only ever have one match. */
    pairKey: text("pair_key").notNull(),
    /** One of MATCH_STATUSES in src/lib/trustEngine.ts. */
    status: text("status").notNull().default("coop_pending"),
    /** Credits each person locked (a fact: the amount at the time, even if the rule changes later). */
    requesterDeposit: integer("requester_deposit").notNull().default(0),
    targetDeposit: integer("target_deposit").notNull().default(0),
    createdAt: createdAt(),
    coopCompletedAt: timestamp("coop_completed_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedById: uuid("closed_by_id"),
  },
  (t) => [uniqueIndex("matches_pair_key_unique").on(t.pairKey), index("matches_requester_idx").on(t.requesterId), index("matches_target_idx").on(t.targetId)],
);

/** One person's answer to one Co-Op scenario. */
export const coopAnswers = pgTable(
  "coop_answers",
  {
    id: id(),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scenarioId: text("scenario_id").notNull(),
    optionId: text("option_id").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("coop_answers_unique").on(t.matchId, t.userId, t.scenarioId)],
);

/** Chat messages. `body` is ALREADY MASKED by the Safety Shield: the original text is never stored. */
export const messages = pgTable(
  "messages",
  {
    id: id(),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    /** Null for system messages (e.g. "Co-Op complete"). */
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "cascade" }),
    /** "text", "closure" (an Honest Closure note) or "system". */
    kind: text("kind").notNull().default("text"),
    body: text("body").notNull(),
    wasMasked: boolean("was_masked").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("messages_match_idx").on(t.matchId, t.createdAt)],
);

/** CREDIT LEDGER. Balance = SUM(amount). Rows are only ever inserted, never edited. */
export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** Signed. Negative = credits leave the available balance (e.g. a locked deposit). */
    amount: integer("amount").notNull(),
    /** One of CREDIT_REASONS in src/lib/trustEngine.ts. */
    reason: text("reason").notNull(),
    note: text("note").notNull().default(""),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("credit_tx_user_idx").on(t.userId, t.createdAt)],
);

/** RELIABILITY LEDGER. Score = SUM(delta). */
export const reliabilityEvents = pgTable(
  "reliability_events",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    /** One of RELIABILITY_REASONS in src/lib/trustEngine.ts. */
    reason: text("reason").notNull(),
    note: text("note").notNull().default(""),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("reliability_user_idx").on(t.userId, t.createdAt)],
);

/** A blocks B: they never see each other again. */
export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

/** User reports. Shown in the reporter's Audit Log and the admin reports queue. */
export const reports = pgTable("reports", {
  id: id(),
  reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reportedId: uuid("reported_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  /** "open", "dismissed", "warned" or "suspended". */
  status: text("status").notNull().default("open"),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/** Store orders. Payments are SIMULATED: provider is always "demo". */
export const orders = pgTable("orders", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** "cohort_pass", "mixer_seat" or "credit_topup". */
  product: text("product").notNull(),
  amountInr: integer("amount_inr").notNull(),
  provider: text("provider").notNull().default("demo"),
  providerReference: text("provider_reference").notNull().default(""),
  /** Product-specific facts, e.g. { hub: "hyderabad" } or { mixerId: "blr-coffee" }. */
  meta: jsonb("meta").$type<Record<string, string>>().notNull().default({}),
  createdAt: createdAt(),
});

/** Seat reservations for curated mixers. */
export const mixerBookings = pgTable(
  "mixer_bookings",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    mixerId: text("mixer_id").notNull(),
    gender: text("gender").notNull(),
    /** "confirmed" (paid seat) or "waitlisted" (free, that gender's seats are full). */
    status: text("status").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("mixer_booking_unique").on(t.userId, t.mixerId)],
);

/** Funnel analytics events for the founder dashboard. No personal content, only event names. */
export const events = pgTable(
  "events",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** "signup", "verified", "profile_complete", "coop_started", "coop_completed", "paid". */
    type: text("type").notNull(),
    /** True for synthetic events created by the seed script (so "Reset Demo Data" can remove them). */
    isSeed: boolean("is_seed").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("events_type_idx").on(t.type)],
);

export type User = typeof users.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type ReliabilityEvent = typeof reliabilityEvents.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Order = typeof orders.$inferSelect;
