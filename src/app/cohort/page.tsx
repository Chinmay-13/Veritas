import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { CopyButton } from "@/components/ui/CopyButton";
import { APP_NAME } from "@/config/brand";
import { COHORT_BALANCING_RULES, DEMO_SETTINGS } from "@/config/businessRules";
import { GENDERS, hubLabel } from "@/data/nonNegotiables";
import { requireMember } from "@/server/auth";
import { getCohortOverview } from "@/server/cohort";

export const metadata: Metadata = { title: "Cohort" };

const GENDER_BAR_COLOURS: Record<string, string> = { woman: "bg-brand", man: "bg-verified", nonbinary: "bg-credit" };

export default async function CohortPage() {
  const user = await requireMember();
  const cohort = await getCohortOverview(user);
  const c = COHORT_BALANCING_RULES;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader
        eyebrow="Cohort"
        title="A balanced room, built by referral"
        description={`Dating products die of two things: empty rooms and lopsided rooms. ${APP_NAME} admits people hub by hub and keeps any one gender at or below ${c.maxActivePoolGenderSkewPercent}% of the active pool.`}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="hub-balance">
          <h2 id="hub-balance" className="mb-3 text-2xl font-semibold">Active pool by metro hub</h2>
          <p className="mb-3 text-sm text-ink-soft">Live counts from the database (seeded demo profiles plus anyone who has signed up).</p>
          <ul className="space-y-3">
            {cohort.hubs.map((hub) => (
              <li key={hub.hub} className="card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-sans text-base font-semibold">
                    {hub.label} <span className="font-normal text-ink-soft">· {hub.areas}</span>
                    {hub.hub === user.hub && <span className="pill-brand ml-2">your hub</span>}
                  </h3>
                  <span className={hub.total === 0 ? "pill-neutral" : hub.balanced ? "pill-verified" : "pill-credit"}>
                    {hub.total === 0 ? "Not open yet" : hub.balanced ? "Balanced" : `Skewed: ${hub.maxSharePercent}% one gender`}
                  </span>
                </div>
                <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-line" role="img" aria-label={`${hub.label}: ${GENDERS.map((g) => `${hub.counts[g.id] ?? 0} ${g.plural.toLowerCase()}`).join(", ")}`}>
                  {GENDERS.map((g) => ((hub.counts[g.id] ?? 0) > 0 ? <div key={g.id} className={GENDER_BAR_COLOURS[g.id]} style={{ width: `${((hub.counts[g.id] ?? 0) / hub.total) * 100}%` }} /> : null))}
                </div>
                <p className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                  {GENDERS.filter((g) => g.id !== "nonbinary" || (hub.counts[g.id] ?? 0) > 0).map((g) => (
                    <span key={g.id} className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${GENDER_BAR_COLOURS[g.id]}`} aria-hidden /> {g.plural}: {hub.counts[g.id] ?? 0} ({hub.percents[g.id] ?? 0}%)
                    </span>
                  ))}
                  <span>Waitlist: {hub.waiting}</span>
                </p>
                {!hub.balanced && hub.total > 0 && (
                  <p className="mt-2 text-xs text-credit-ink">
                    New sign-ups of the majority gender wait here until the hub is back within {c.maxActivePoolGenderSkewPercent}%. Referred batchmates of the under-represented gender are admitted first.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-4">
          <section className="card p-5" aria-labelledby="your-status">
            <p className="eyebrow" id="your-status">Your status</p>
            {user.status === "waitlisted" ? (
              <>
                <p className="mt-2 font-serif text-2xl font-semibold text-credit-ink">On the waitlist</p>
                <p className="mt-1 text-sm text-ink-soft">
                  Position {cohort.waitlistPosition ?? "—"} overall. You will be admitted to {hubLabel(user.hub ?? "")} as soon as it keeps the hub within {c.maxActivePoolGenderSkewPercent}%.
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 font-serif text-2xl font-semibold text-verified-ink">Active in {hubLabel(user.hub ?? "")}</p>
                <p className="mt-1 text-sm text-ink-soft">You are in the active pool and visible to compatible members of your hub.</p>
              </>
            )}
            {DEMO_SETTINGS.demoBypassWaitlist && (
              <p className="demo-note mt-3">
                Demo setting: new sign-ups skip the waitlist so evaluators are never stuck. The queue logic is real and tested; turn off <code className="font-mono">demoBypassWaitlist</code> to see it.
              </p>
            )}
          </section>

          <section className="card p-5" aria-labelledby="referral">
            <p className="eyebrow" id="referral">Your referral code</p>
            <p className="tnum mt-2 font-mono text-2xl font-semibold tracking-wider text-brand-deep" data-testid="referral-code">{user.referralCode}</p>
            <div className="mt-3"><CopyButton text={user.referralCode} label="Copy code" /></div>
            <p className="tnum mt-3 text-sm text-ink-soft">
              Verified batchmates referred: <span className="font-semibold text-ink">{cohort.referralCount}</span>
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-soft">
              <li>You receive {c.referralBoostCredits} Trust Credits when a referred batchmate finishes sign-up.</li>
              {c.referralSkipsWaitlist && <li>They skip the waitlist: you have vouched for them.</li>}
              <li>They still have to verify their own eLitmus ID. A code is not a way around verification.</li>
            </ul>
          </section>
        </aside>
      </div>

      <section className="mt-8 grid gap-5 md:grid-cols-3" aria-label="How admission works">
        {[
          { title: "1. Verified first", body: `Only eLitmus-verified ${c.minBatchYear}–${c.maxBatchYear} graduates can join. Every profile you see belongs to a real, verified batchmate.` },
          { title: "2. Balanced admission", body: `Each hub admits people in the order they arrived, but pauses a gender once it would exceed ${c.maxActivePoolGenderSkewPercent}% of that hub. Admitting someone from the other side unlocks the queue again.` },
          { title: "3. Referrals solve the cold start", body: "A new city starts empty. The fastest way to fill it with people worth meeting is to let verified members invite verified batchmates, and reward them for it." },
        ].map((step) => (
          <article key={step.title} className="border-t border-line pt-4">
            <h3 className="text-lg font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
