/**
 * DISCOVER (server only) — the anti-swipe dossier feed
 * Loads eligible people, scores each with the pure matching engine, hides
 * dealbreaker conflicts by default, and returns at most dailyDossierLimit dossiers.
 */
import { and, eq, isNotNull, ne, or } from "drizzle-orm";
import { BUSINESS_RULES } from "@/config/businessRules";
import { HUBS, isInterestedIn } from "@/data/nonNegotiables";
import { SEED_PROFILES } from "@/data/seedProfiles";
import { db } from "@/db/client";
import { blocks, matches, users, type User } from "@/db/schema";
import { avatarFor, type AvatarData } from "@/lib/avatar";
import { calculateCompatibility, detectDealbreakerConflicts, type CompatibilityResult, type DealbreakerConflict } from "@/lib/matchingEngine";
import { reliabilityBadgeText, verifiedBadgeText } from "@/lib/rulesCopy";
import { canStartCoOp } from "@/lib/trustEngine";
import { poolVisibility, type VisibilityReason } from "@/lib/visibility";
import { getUnlockedHubs } from "./entitlements";
import { countOpenMatches, getBalance, getGhostingCounts, getOpenReportCounts, getReliabilityMap } from "./users";

export type Dossier = {
  id: string;
  firstName: string;
  /** Approximate age from birth year (we never store a full date of birth). */
  age: number | null;
  hub: string;
  batchYear: number;
  badgeText: string | null;
  reliabilityText: string;
  thesis: string;
  avatar: AvatarData;
  compatibility: CompatibilityResult;
  conflicts: DealbreakerConflict[];
  /** Shown only if the person opted in. */
  phPercentile: number | null;
  scripted: "replies" | "goes_silent" | null;
};

export type DiscoverFilters = { hub: string; batchYear: number | null; showConflicts: boolean };

export type DiscoverFeed = {
  dossiers: Dossier[];
  /** People hidden because of a dealbreaker conflict (shown as a count next to the toggle). */
  hiddenConflictCount: number;
  /** Eligible people beyond today's limit. */
  beyondLimitCount: number;
  filters: DiscoverFilters;
  hubOptions: { id: string; label: string; unlocked: boolean }[];
  /** True if the selected hub needs a Relocation Cohort Pass the viewer does not have. */
  hubLocked: boolean;
  /** Why the viewer themself is hidden from others ("ok" if visible). */
  viewerVisibility: VisibilityReason;
  viewerReliability: number;
  /** Whether the viewer could start a Co-Op right now (ignoring who with), and why not. */
  viewerCanStart: { ok: boolean; reason?: string };
};

/**
 * Builds the Discover feed for a viewer.
 * Reads: MATCHING_RULES.dailyDossierLimit (+ everything the matching engine reads).
 *
 * @param viewer The logged-in member.
 * @param requested Filters from the URL. An unknown hub falls back to the viewer's own hub.
 */
export async function getDiscoverFeed(viewer: User, requested: { hub?: string; batchYear?: number; showConflicts?: boolean }): Promise<DiscoverFeed> {
  const unlockedHubs = await getUnlockedHubs(viewer);
  const hub = HUBS.some((h) => h.id === requested.hub) ? requested.hub! : (viewer.hub ?? HUBS[0].id);
  const filters: DiscoverFilters = { hub, batchYear: requested.batchYear ?? null, showConflicts: Boolean(requested.showConflicts) };
  const hubLocked = !unlockedHubs.includes(hub);

  const [viewerReliabilityMap, viewerReports, availableCredits, activeCoOps] = await Promise.all([
    getReliabilityMap([viewer.id]),
    getOpenReportCounts([viewer.id]),
    getBalance(viewer.id),
    countOpenMatches(viewer.id),
  ]);
  const viewerReliability = viewerReliabilityMap[viewer.id];
  const viewerVisibility = poolVisibility({
    status: viewer.status,
    profileComplete: true,
    consentMatching: viewer.consentMatchingAt !== null,
    reliability: viewerReliability,
    openReports: viewerReports[viewer.id] ?? 0,
  }).reason;
  const viewerCanStart =
    viewer.status !== "active"
      ? { ok: false, reason: viewer.status === "waitlisted" ? "You are on the waitlist." : "Your account is suspended." }
      : canStartCoOp({ reliability: viewerReliability, availableCredits, activeCoOps, hasExistingMatch: false, isBlocked: false, targetVisible: true });

  const base = {
    filters,
    hubOptions: HUBS.map((h) => ({ id: h.id, label: h.label, unlocked: unlockedHubs.includes(h.id) })),
    hubLocked,
    viewerVisibility,
    viewerReliability,
    viewerCanStart,
  };
  if (hubLocked || !viewer.nonNegotiables || !viewer.batchYear) return { dossiers: [], hiddenConflictCount: 0, beyondLimitCount: 0, ...base };

  // 1. Candidates in the selected hub with a finished profile.
  const candidates = await db
    .select()
    .from(users)
    .where(and(eq(users.hub, hub), eq(users.role, "user"), ne(users.id, viewer.id), isNotNull(users.profileCompletedAt), filters.batchYear ? eq(users.batchYear, filters.batchYear) : undefined));
  const candidateIds = candidates.map((c) => c.id);

  // 2. Facts needed to filter them: existing matches, blocks, reliability, open reports.
  const [existingMatches, blockRows, reliability, reportCounts, ghosting] = await Promise.all([
    db.select({ requesterId: matches.requesterId, targetId: matches.targetId }).from(matches).where(or(eq(matches.requesterId, viewer.id), eq(matches.targetId, viewer.id))),
    db.select().from(blocks).where(or(eq(blocks.blockerId, viewer.id), eq(blocks.blockedId, viewer.id))),
    getReliabilityMap(candidateIds),
    getOpenReportCounts(candidateIds),
    getGhostingCounts(candidateIds),
  ]);
  const alreadyMatched = new Set(existingMatches.map((m) => (m.requesterId === viewer.id ? m.targetId : m.requesterId)));
  const blocked = new Set(blockRows.map((b) => (b.blockerId === viewer.id ? b.blockedId : b.blockerId)));

  // 3. Keep only people the viewer may see, then score them.
  const viewerProfile = { batchYear: viewer.batchYear, nonNegotiables: viewer.nonNegotiables };
  const scored: Dossier[] = [];
  for (const c of candidates) {
    if (!c.nonNegotiables || !c.batchYear || alreadyMatched.has(c.id) || blocked.has(c.id)) continue;
    if (!isInterestedIn(viewer.interestedIn ?? "", c.gender ?? "") || !isInterestedIn(c.interestedIn ?? "", viewer.gender ?? "")) continue;
    const visibility = poolVisibility({ status: c.status, profileComplete: true, consentMatching: c.consentMatchingAt !== null, reliability: reliability[c.id], openReports: reportCounts[c.id] ?? 0 });
    if (!visibility.visible) continue;

    const candidateProfile = { batchYear: c.batchYear, nonNegotiables: c.nonNegotiables };
    scored.push({
      id: c.id,
      firstName: c.firstName ?? "Member",
      age: c.birthYear ? new Date().getFullYear() - c.birthYear : null,
      hub: c.hub ?? hub,
      batchYear: c.batchYear,
      badgeText: c.consentBadge ? verifiedBadgeText(c) : null,
      reliabilityText: reliabilityBadgeText(reliability[c.id], ghosting[c.id] ?? 0),
      thesis: c.thesis ?? "",
      avatar: avatarFor(c.id, false), // never revealed in Discover: the Co-Op comes first
      compatibility: calculateCompatibility(viewerProfile, candidateProfile),
      conflicts: detectDealbreakerConflicts(viewerProfile, candidateProfile),
      phPercentile: c.showPercentile ? c.phPercentile : null,
      scripted: c.isScripted ? (SEED_PROFILES.find((p) => p.key === c.seedKey)?.behavior ?? "replies") : null,
    });
  }

  // 4. Hide dealbreaker conflicts by default, rank by compatibility, apply the daily limit.
  const withConflicts = scored.filter((d) => d.conflicts.length > 0);
  const shown = (filters.showConflicts ? scored : scored.filter((d) => d.conflicts.length === 0)).sort((a, b) => b.compatibility.total - a.compatibility.total);
  const limit = BUSINESS_RULES.matching.dailyDossierLimit;

  return {
    dossiers: shown.slice(0, limit),
    hiddenConflictCount: filters.showConflicts ? 0 : withConflicts.length,
    beyondLimitCount: Math.max(0, shown.length - limit),
    ...base,
  };
}
