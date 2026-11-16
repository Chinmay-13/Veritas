import { AlertTriangle, BadgeCheck, Lock, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { CompatibilityBars, CompatibilityRing } from "@/components/Compatibility";
import { PageHeader } from "@/components/PageHeader";
import { StartCoOpButton } from "@/components/StartCoOpButton";
import { MATCHING_RULES, MONETIZATION_PRICING, SAFETY_RULES, TRUST_AND_DEPOSIT_RULES } from "@/config/businessRules";
import { hubLabel, hubLabelWithAreas } from "@/data/nonNegotiables";
import { eligibleBatchYears } from "@/lib/cohortEngine";
import { depositCtaText, depositFairnessLines, depositRulesText, priceLabel } from "@/lib/rulesCopy";
import { coOpsNeededToRecover } from "@/lib/trustEngine";
import { requireMember } from "@/server/auth";
import { getDiscoverFeed, type Dossier } from "@/server/discover";

export const metadata: Metadata = { title: "Discover" };

type SearchParams = Promise<{ hub?: string; batch?: string; conflicts?: string; welcome?: string; reset?: string }>;

/** One editorial dossier card. */
function DossierCard({ dossier, disabledReason }: { dossier: Dossier; disabledReason: string | null }) {
  return (
    <article className="card flex flex-col p-5">
      <header className="flex items-start gap-4">
        <Avatar avatar={dossier.avatar} size={64} label={dossier.firstName} />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold">
            {dossier.firstName}
            {dossier.age && <span className="font-sans text-base font-normal text-ink-soft">, {dossier.age}</span>}
          </h2>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {dossier.badgeText && (
              <span className="pill-verified whitespace-normal">
                <BadgeCheck size={12} className="shrink-0" aria-hidden /> {dossier.badgeText}
              </span>
            )}
            <span className="pill-neutral whitespace-normal">
              <ShieldCheck size={12} className="shrink-0" aria-hidden /> {dossier.reliabilityText}
            </span>
            {dossier.phPercentile && <span className="pill-brand">pH {dossier.phPercentile} percentile</span>}
            {dossier.scripted && <span className="pill-credit">Demo profile · scripted</span>}
          </div>
        </div>
        <CompatibilityRing total={dossier.compatibility.total} />
      </header>

      <blockquote className="mt-4 border-l-2 border-brand/30 pl-3 font-serif text-[15px] leading-relaxed text-ink italic">&ldquo;{dossier.thesis}&rdquo;</blockquote>

      {dossier.conflicts.map((conflict) => (
        <p key={conflict.key} className="mt-3 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger-ink">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {conflict.message}
        </p>
      ))}

      <div className="hairline mt-4 pt-4">
        <p className="eyebrow mb-3">Why this score</p>
        <CompatibilityBars result={dossier.compatibility} />
      </div>

      <div className="mt-5">
        <StartCoOpButton
          targetId={dossier.id}
          targetName={dossier.firstName}
          ctaText={depositCtaText()}
          rulesText={depositRulesText()}
          fairnessLines={depositFairnessLines()}
          disabledReason={disabledReason}
          scripted={dossier.scripted}
        />
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-soft">
          <Lock size={12} aria-hidden /> The avatar unlocks for both of you once the Co-Op is complete.
        </p>
      </div>
    </article>
  );
}

export default async function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireMember();
  const params = await searchParams;
  const batchYear = Number(params.batch);
  const feed = await getDiscoverFeed(user, {
    hub: params.hub,
    batchYear: eligibleBatchYears().includes(batchYear) ? batchYear : undefined,
    showConflicts: params.conflicts === "show",
  });
  const disabledReason = feed.viewerCanStart.ok ? null : (feed.viewerCanStart.reason ?? "You cannot start a Co-Op right now.");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        eyebrow="Discover"
        title="Today's dossiers"
        description={`No swiping. Up to ${MATCHING_RULES.dailyDossierLimit} curated people a day, ranked by how well your long-term non-negotiables fit, with the reasons shown.`}
      />

      {params.welcome && (
        <p className="reveal mb-4 rounded-lg border border-verified/20 bg-verified-soft px-4 py-3 text-sm text-verified-ink">
          Welcome to the cohort. You have {TRUST_AND_DEPOSIT_RULES.initialCredits} Trust Credits and a Reliability Score of {TRUST_AND_DEPOSIT_RULES.maxReliability}%.
        </p>
      )}
      {params.reset && <p className="reveal mb-4 rounded-lg border border-verified/20 bg-verified-soft px-4 py-3 text-sm text-verified-ink">Demo data has been reset to its starting state.</p>}

      {feed.viewerVisibility === "low_reliability" && (
        <section className="mb-5 rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger-ink" aria-label="Restricted account">
          <p className="font-semibold">Your Reliability Score is {feed.viewerReliability}%, below the {SAFETY_RULES.minReliabilityScoreForActivePool}% needed for the active pool.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>You are hidden from other people&apos;s feeds and cannot start new Co-Ops.</li>
            <li>
              To recover: complete a Co-Op you have already been invited to (+{TRUST_AND_DEPOSIT_RULES.reliabilityRecoveryPerCompletedCoOp} each, you need {coOpsNeededToRecover(feed.viewerReliability)}) and close conversations with an Honest Closure (+
              {TRUST_AND_DEPOSIT_RULES.respectfulClosureReliabilityBonus} each).
            </li>
          </ul>
          <Link href="/matches" className="btn-secondary mt-3">Go to my invitations</Link>
        </section>
      )}
      {feed.viewerVisibility === "waitlisted" && (
        <p className="mb-5 rounded-xl border border-credit/30 bg-credit-soft p-4 text-sm text-credit-ink">
          You are on the waitlist for {hubLabel(user.hub ?? "")}. We admit people in a gender-balanced order. <Link href="/cohort" className="font-medium underline">See your position and how referrals skip the line.</Link>
        </p>
      )}
      {feed.viewerVisibility === "suspended" && <p className="mb-5 rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger-ink">Your account is suspended following a report review. Contact the Grievance Officer from the Safety Center.</p>}
      {feed.viewerVisibility === "no_consent" && (
        <p className="mb-5 rounded-xl border border-credit/30 bg-credit-soft p-4 text-sm text-credit-ink">
          You have withdrawn consent to matching, so you are hidden from everyone. <Link href="/safety" className="font-medium underline">Manage consent</Link>
        </p>
      )}

      {/* Filters: a plain GET form, so the feed is shareable and works without JavaScript. */}
      <form method="get" className="card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <label htmlFor="hub" className="label">Metro hub</label>
          <select id="hub" name="hub" defaultValue={feed.filters.hub} className="input sm:w-56">
            {feed.hubOptions.map((hub) => (
              <option key={hub.id} value={hub.id}>
                {hub.label}{hub.id === user.hub ? " (your hub)" : hub.unlocked ? " (pass active)" : " (needs Cohort Pass)"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="batch" className="label">Batch year</label>
          <select id="batch" name="batch" defaultValue={feed.filters.batchYear ?? ""} className="input sm:w-36">
            <option value="">All batches</option>
            {eligibleBatchYears().map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="conflicts" className="label">Dealbreaker alignment</label>
          <select id="conflicts" name="conflicts" defaultValue={feed.filters.showConflicts ? "show" : "hide"} className="input sm:w-64">
            <option value="hide">Hide dealbreaker conflicts</option>
            <option value="show">Show everyone, with warnings</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">Apply filters</button>
      </form>

      {feed.hubLocked ? (
        <section className="card mx-auto max-w-xl p-8 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-brand-deep"><Lock size={20} aria-hidden /></span>
          <h2 className="mt-4 text-2xl font-semibold">{hubLabelWithAreas(feed.filters.hub)} is another hub</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Relocating? The Relocation Cohort Pass opens one other hub&apos;s verified pool for {MONETIZATION_PRICING.cohortPassDays} days ({priceLabel(MONETIZATION_PRICING.relocationCohortPassInr)}). Your own hub is always free.
          </p>
          <Link href={`/store?hub=${feed.filters.hub}`} className="btn-primary mt-5">See the Relocation Cohort Pass</Link>
        </section>
      ) : feed.dossiers.length === 0 ? (
        <section className="card mx-auto max-w-xl p-8 text-center">
          <h2 className="text-2xl font-semibold">No new dossiers right now</h2>
          <p className="mt-2 text-sm text-ink-soft">
            You have seen everyone who fits these filters in {hubLabel(feed.filters.hub)}.
            {feed.hiddenConflictCount > 0 && ` ${feed.hiddenConflictCount} ${feed.hiddenConflictCount === 1 ? "person is" : "people are"} hidden because of a dealbreaker conflict.`}
          </p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            {feed.hiddenConflictCount > 0 && <Link href={`/discover?hub=${feed.filters.hub}&conflicts=show`} className="btn-secondary">Show them with warnings</Link>}
            <Link href="/cohort" className="btn-secondary">Invite a batchmate</Link>
          </div>
        </section>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            {feed.dossiers.map((dossier) => <DossierCard key={dossier.id} dossier={dossier} disabledReason={disabledReason} />)}
          </div>
          <p className="mt-6 text-center text-sm text-ink-soft">
            Showing {feed.dossiers.length} of today&apos;s {MATCHING_RULES.dailyDossierLimit}.
            {feed.beyondLimitCount > 0 && ` ${feed.beyondLimitCount} more will appear as you close or start Co-Ops.`}
            {feed.hiddenConflictCount > 0 && (
              <>
                {" "}{feed.hiddenConflictCount} hidden for a dealbreaker conflict.{" "}
                <Link href={`/discover?hub=${feed.filters.hub}&conflicts=show`} className="font-medium text-brand underline underline-offset-2">Show with warnings</Link>
              </>
            )}
          </p>
        </>
      )}
    </main>
  );
}
