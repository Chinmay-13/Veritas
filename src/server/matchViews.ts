/**
 * MATCH VIEW MODELS (server only)
 * Builds exactly the data each matches page is allowed to show. Anything the
 * viewer must not see yet (the partner's Co-Op answers, the real avatar) is
 * simply not included, so there is nothing to un-hide in the browser.
 */
import { and, asc, desc, eq, or } from "drizzle-orm";
import { BUSINESS_RULES } from "@/config/businessRules";
import { COOP_SCENARIOS, compareCoOpAnswers } from "@/data/coopScenarios";
import { SEED_PROFILES } from "@/data/seedProfiles";
import { db } from "@/db/client";
import { coopAnswers, creditTransactions, matches, messages, reliabilityEvents, type Match, type User } from "@/db/schema";
import { avatarFor, type AvatarData } from "@/lib/avatar";
import { calculateCompatibility, type CompatibilityResult } from "@/lib/matchingEngine";
import { MATCH_STATUS_LABELS, reliabilityBadgeText, shieldProgressText, verifiedBadgeText } from "@/lib/rulesCopy";
import { isShieldActive } from "@/lib/safetyFilter";
import { isOpenStatus, type ClosureOutcome, type MatchStatus } from "@/lib/trustEngine";
import { countPersonMessages, getMatchForUser, getUsersByIds, loadMatchFacts, previewClosure, settleExpiredMatchesFor } from "./matches";
import { getGhostingCounts, getReliabilityMap } from "./users";

const HOUR_MS = 60 * 60 * 1000;

export type PartnerView = {
  id: string;
  firstName: string;
  avatar: AvatarData;
  badgeText: string | null;
  reliabilityText: string;
  /** "replies" / "goes_silent" for scripted demo profiles, null for real people. */
  scripted: "replies" | "goes_silent" | null;
};

/** What the viewer has to do next on a match (drives the badges on /matches). */
export type NextAction = "join" | "answer" | "wait_partner" | "reply" | "wait_reply" | "say_hello" | null;

export type MatchListItem = {
  id: string;
  status: MatchStatus;
  statusLabel: string;
  isOpen: boolean;
  partner: PartnerView;
  nextAction: NextAction;
  lastMessagePreview: string | null;
  createdAt: Date;
};

/** @returns How a scripted demo profile behaves, or null for real people. */
function scriptedBehavior(user: User): "replies" | "goes_silent" | null {
  if (!user.isScripted) return null;
  return SEED_PROFILES.find((p) => p.key === user.seedKey)?.behavior ?? "replies";
}

/** Builds the partner card. The avatar is revealed only once the Co-Op is complete (decided here, on the server). */
function partnerView(partner: User, revealed: boolean, reliability: number, ghostingCount: number): PartnerView {
  return {
    id: partner.id,
    firstName: partner.firstName ?? "Member",
    avatar: avatarFor(partner.id, revealed),
    badgeText: partner.consentBadge ? verifiedBadgeText(partner) : null,
    reliabilityText: reliabilityBadgeText(reliability, ghostingCount),
    scripted: scriptedBehavior(partner),
  };
}

/** Everything on /matches: the viewer's matches, newest first, after lazy settlement. */
export async function listMatches(user: User): Promise<{ items: MatchListItem[]; settledNow: number }> {
  const settledNow = await settleExpiredMatchesFor(user.id);
  const rows = await db.select().from(matches).where(or(eq(matches.requesterId, user.id), eq(matches.targetId, user.id))).orderBy(desc(matches.createdAt));
  // A blocked match disappears for both people.
  const visible = rows.filter((m) => m.status !== "blocked");

  const partnerIds = visible.map((m) => (m.requesterId === user.id ? m.targetId : m.requesterId));
  const [partners, reliability, ghosting] = await Promise.all([getUsersByIds(partnerIds), getReliabilityMap(partnerIds), getGhostingCounts(partnerIds)]);

  const items = await Promise.all(
    visible.map(async (match): Promise<MatchListItem | null> => {
      const partnerId = match.requesterId === user.id ? match.targetId : match.requesterId;
      const partner = partners[partnerId];
      if (!partner) return null;
      const status = match.status as MatchStatus;
      const [nextAction, last] = await Promise.all([
        computeNextAction(match, user.id),
        db.select({ body: messages.body }).from(messages).where(eq(messages.matchId, match.id)).orderBy(desc(messages.createdAt)).limit(1),
      ]);
      return {
        id: match.id,
        status,
        statusLabel: MATCH_STATUS_LABELS[status] ?? status,
        isOpen: isOpenStatus(status),
        partner: partnerView(partner, match.coopCompletedAt !== null, reliability[partnerId], ghosting[partnerId] ?? 0),
        nextAction,
        lastMessagePreview: last[0]?.body ?? null,
        createdAt: match.createdAt,
      };
    }),
  );
  return { items: items.filter((i): i is MatchListItem => i !== null), settledNow };
}

/** Works out what the viewer needs to do next on one match. */
async function computeNextAction(match: Match, userId: string): Promise<NextAction> {
  if (match.status === "coop_pending") {
    if (match.targetId === userId && match.targetDeposit === 0) return "join";
    const mine = await db.select({ id: coopAnswers.id }).from(coopAnswers).where(and(eq(coopAnswers.matchId, match.id), eq(coopAnswers.userId, userId))).limit(1);
    return mine.length === 0 ? "answer" : "wait_partner";
  }
  if (match.status === "chat_open") {
    const facts = await loadMatchFacts(match);
    if (!facts.lastMessage) return "say_hello";
    return facts.lastMessage.senderId === userId ? "wait_reply" : "reply";
  }
  return null;
}

export type CoOpRevealRow = {
  scenarioId: string;
  title: string;
  prompt: string;
  mine: { label: string; reason: string | null };
  theirs: { label: string; reason: string | null };
  verdict: "aligned" | "discuss";
};

export type MatchDetail = {
  id: string;
  status: MatchStatus;
  statusLabel: string;
  isOpen: boolean;
  partner: PartnerView;
  compatibility: CompatibilityResult | null;
  /** Viewer was invited and has not placed their deposit yet. */
  needsToJoin: boolean;
  iHaveAnswered: boolean;
  partnerHasAnswered: boolean;
  /** Side-by-side answers. Null until BOTH have answered: the partner's answers never leave the server before that. */
  reveal: CoOpRevealRow[] | null;
  myDeposit: number;
  totalMessages: number;
  shieldActive: boolean;
  shieldText: string;
  closure: ClosureOutcome;
  messagesSentByMe: number;
  /** Plain-language deadline for whatever is pending, or null. */
  deadlineText: string | null;
  /** The viewer's own ledger rows for this match: exactly what happened to their deposit. */
  myLedger: { id: string; reason: string; amount: number; note: string }[];
  /** The viewer's own reliability changes caused by this match. */
  myReliabilityChanges: { id: string; reason: string; delta: number }[];
};

/** @returns "in 46 hours" style text for a deadline. */
function hoursLeftText(deadline: Date): string {
  const hours = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / HOUR_MS));
  return hours <= 1 ? "within the hour" : `in ${hours} hours`;
}

/**
 * Everything on /matches/[id]. Returns null if the viewer is not a participant
 * (the page then shows a 404, so match ids cannot be probed).
 */
export async function getMatchDetail(user: User, matchId: string): Promise<MatchDetail | null> {
  await settleExpiredMatchesFor(user.id);
  const match = await getMatchForUser(user.id, matchId);
  if (!match || match.status === "blocked") return null;

  const partnerId = match.requesterId === user.id ? match.targetId : match.requesterId;
  const [partners, reliability, ghosting, answers, facts, totalMessages, myLedger, myReliabilityChanges] = await Promise.all([
    getUsersByIds([partnerId]),
    getReliabilityMap([partnerId]),
    getGhostingCounts([partnerId]),
    db.select().from(coopAnswers).where(eq(coopAnswers.matchId, matchId)),
    loadMatchFacts(match),
    countPersonMessages(matchId),
    db.select().from(creditTransactions).where(and(eq(creditTransactions.matchId, matchId), eq(creditTransactions.userId, user.id))).orderBy(asc(creditTransactions.createdAt)),
    db.select().from(reliabilityEvents).where(and(eq(reliabilityEvents.matchId, matchId), eq(reliabilityEvents.userId, user.id))).orderBy(asc(reliabilityEvents.createdAt)),
  ]);
  const partner = partners[partnerId];
  if (!partner) return null;

  const mine = answers.filter((a) => a.userId === user.id);
  const theirs = answers.filter((a) => a.userId === partnerId);
  const bothAnswered = mine.length >= COOP_SCENARIOS.length && theirs.length >= COOP_SCENARIOS.length;

  const reveal = bothAnswered
    ? COOP_SCENARIOS.map((scenario): CoOpRevealRow => {
        const myAnswer = mine.find((a) => a.scenarioId === scenario.id);
        const theirAnswer = theirs.find((a) => a.scenarioId === scenario.id);
        const label = (optionId?: string) => scenario.options.find((o) => o.id === optionId)?.label ?? "No answer";
        return {
          scenarioId: scenario.id,
          title: scenario.title,
          prompt: scenario.prompt,
          mine: { label: label(myAnswer?.optionId), reason: myAnswer?.reason ?? null },
          theirs: { label: label(theirAnswer?.optionId), reason: theirAnswer?.reason ?? null },
          verdict: compareCoOpAnswers(scenario.id, myAnswer?.optionId ?? "", theirAnswer?.optionId ?? ""),
        };
      })
    : null;

  const status = match.status as MatchStatus;
  const t = BUSINESS_RULES.trust;
  let deadlineText: string | null = null;
  if (status === "coop_pending") {
    deadlineText = `This Co-Op expires ${hoursLeftText(new Date(match.createdAt.getTime() + t.coOpAnswerWindowHours * HOUR_MS))} if it is not completed. Everyone is refunded in full.`;
  } else if (status === "chat_open" && facts.lastMessage) {
    const deadline = hoursLeftText(new Date(facts.lastMessage.at.getTime() + t.chatWindowHours * HOUR_MS));
    deadlineText = facts.lastMessage.senderId === user.id ? `${partner.firstName} has to reply ${deadline}, or it counts as ghosting.` : `Reply ${deadline}, or it counts as ghosting and your deposit is forfeited.`;
  }

  const coOpComplete = match.coopCompletedAt !== null;
  return {
    id: match.id,
    status,
    statusLabel: MATCH_STATUS_LABELS[status] ?? status,
    isOpen: isOpenStatus(status),
    partner: partnerView(partner, coOpComplete, reliability[partnerId], ghosting[partnerId] ?? 0),
    compatibility: user.nonNegotiables && partner.nonNegotiables && user.batchYear && partner.batchYear
      ? calculateCompatibility({ batchYear: user.batchYear, nonNegotiables: user.nonNegotiables }, { batchYear: partner.batchYear, nonNegotiables: partner.nonNegotiables })
      : null,
    needsToJoin: status === "coop_pending" && match.targetId === user.id && match.targetDeposit === 0,
    iHaveAnswered: mine.length >= COOP_SCENARIOS.length,
    partnerHasAnswered: theirs.length >= COOP_SCENARIOS.length,
    reveal,
    myDeposit: match.requesterId === user.id ? match.requesterDeposit : match.targetDeposit,
    totalMessages,
    shieldActive: isShieldActive({ totalMessages, coOpComplete }),
    shieldText: shieldProgressText(totalMessages),
    closure: previewClosure(match, facts, user.id),
    messagesSentByMe: facts.messagesSentBy[user.id] ?? 0,
    deadlineText,
    myLedger: myLedger.map((row) => ({ id: row.id, reason: row.reason, amount: row.amount, note: row.note })),
    myReliabilityChanges: myReliabilityChanges.map((row) => ({ id: row.id, reason: row.reason, delta: row.delta })),
  };
}

export type ChatMessageView = { id: string; kind: string; mine: boolean; body: string; wasMasked: boolean; createdAt: string };

export type ChatState = {
  status: MatchStatus;
  messages: ChatMessageView[];
  totalMessages: number;
  shieldActive: boolean;
  shieldText: string;
};

/**
 * The chat transcript + shield state. Used by the page and by the polling API route.
 * Returns null if the viewer is not a participant.
 */
export async function getChatState(userId: string, matchId: string): Promise<ChatState | null> {
  const match = await getMatchForUser(userId, matchId);
  if (!match || match.status === "blocked") return null;
  const rows = await db.select().from(messages).where(eq(messages.matchId, matchId)).orderBy(asc(messages.createdAt));
  const totalMessages = rows.filter((m) => m.senderId !== null && m.kind !== "system").length;
  return {
    status: match.status as MatchStatus,
    messages: rows.map((m) => ({ id: m.id, kind: m.kind, mine: m.senderId === userId, body: m.body, wasMasked: m.wasMasked, createdAt: m.createdAt.toISOString() })),
    totalMessages,
    shieldActive: isShieldActive({ totalMessages, coOpComplete: match.coopCompletedAt !== null }),
    shieldText: shieldProgressText(totalMessages),
  };
}
