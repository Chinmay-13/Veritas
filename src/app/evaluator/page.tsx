import { BadgeCheck, Coins, GitBranch, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { COHORT_BALANCING_RULES, MONETIZATION_PRICING, SAFETY_RULES, TRUST_AND_DEPOSIT_RULES } from "@/config/businessRules";
import { DEMO_PASSWORD, DEMO_PERSONAS } from "@/data/seedProfiles";

export const metadata: Metadata = { title: "Evaluator and Founder Guide" };

const architecture = [
  ["Business rules", "src/config/businessRules.ts", "The single source of truth for weights, deposits, cohort admission, pricing and safety thresholds."],
  ["Matching engine", "src/lib/matchingEngine.ts", "Pure compatibility scoring with explainable dimensions and dealbreaker conflict warnings."],
  ["Trust engine", "src/lib/trustEngine.ts", "Deposit ledger outcomes, the minimum-effort gate, respectful closure and ghosting settlement."],
  ["Safety shield", "src/lib/safetyFilter.ts", "Server-side masking for phone numbers, emails, UPI IDs, handles and contact links."],
];

export default function EvaluatorPage() {
  const t = TRUST_AND_DEPOSIT_RULES;
  const c = COHORT_BALANCING_RULES;
  const s = SAFETY_RULES;
  const p = MONETIZATION_PRICING;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader
        eyebrow="Evaluator & Founder Guide"
        title="The product thesis behind Veritas"
        description="A walkthrough of the acquisition loop, trust mechanics, revenue model and the code paths an evaluator can edit live."
      />

      <section className="grid gap-4 md:grid-cols-3" aria-label="Product thesis">
        {[
          { icon: Users, title: "Fill the room", body: `Start with verified ${c.minBatchYear}–${c.maxBatchYear} graduates, admit hub by hub, and reward referrals with ${c.referralBoostCredits} Trust Credits.` },
          { icon: Coins, title: "Charge for intent", body: `Revenue comes from a ${p.relocationCohortPassInr} relocation pass and ${p.weekendCuratedMixerInr} curated mixer, not unlimited swipes.` },
          { icon: ShieldCheck, title: "Make showing up normal", body: `A ${t.stakeRequiredToConnect}-credit commitment deposit is returned for participation and honest closure; ghosting is costly, never profitable for Veritas.` },
        ].map(({ icon: Icon, title, body }) => (
          <article key={title} className="card p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-deep"><Icon size={18} aria-hidden /></span>
            <h2 className="mt-4 text-xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
          </article>
        ))}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="card p-5 sm:p-6" aria-labelledby="acquisition">
          <h2 id="acquisition" className="flex items-center gap-2 text-2xl font-semibold"><Users size={21} className="text-brand" aria-hidden /> Acquisition and cold start</h2>
          <div className="prose-veritas text-sm">
            <ul>
              <li>Invite a verified batchmate rather than importing a broad, low-intent audience.</li>
              <li>Keep each metro hub balanced: no gender may exceed {c.maxActivePoolGenderSkewPercent}% of its active pool.</li>
              <li>Give the under-represented side priority and let valid referrals skip the waitlist.</li>
              <li>Use the cohort page as a visible, measurable explanation of why a room is open or waitlisted.</li>
            </ul>
          </div>
          <Link href="/cohort" className="btn-secondary mt-4">Open live cohort view</Link>
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="economics">
          <h2 id="economics" className="flex items-center gap-2 text-2xl font-semibold"><Coins size={21} className="text-credit-ink" aria-hidden /> Unit economics and incentives</h2>
          <div className="prose-veritas text-sm">
            <ul>
              <li>Relocation Cohort Pass: ₹{p.relocationCohortPassInr} for one other hub for {p.cohortPassDays} days.</li>
              <li>Weekend Curated Mixer: ₹{p.weekendCuratedMixerInr} per seat with {p.mixerSeatsPerGender} seats per gender.</li>
              <li>Credit top-ups are capped and never increase the {t.maxConcurrentCoOps}-Co-Op limit.</li>
              <li>Forfeited deposits are split or burned, never counted as company revenue.</li>
            </ul>
          </div>
          <Link href="/store" className="btn-secondary mt-4">Open the simulated store</Link>
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="safety">
          <h2 id="safety" className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck size={21} className="text-verified" aria-hidden /> Privacy and safety</h2>
          <div className="prose-veritas text-sm">
            <ul>
              <li>Contact details are masked on the server until the Co-Op is complete and {s.messagesRequiredToUnmaskPII} messages are exchanged.</li>
              <li>Only the minimum profile data is shown: first name, approximate age, hub, batch and role family.</li>
              <li>Block and Report ends the match and writes an auditable report for the member and founder dashboard.</li>
              <li>The Safety Center covers DPDP Act 2023, IT Rules 2021, consent, export and erasure controls.</li>
            </ul>
          </div>
          <Link href="/safety" className="btn-secondary mt-4">Open Safety Center</Link>
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="architecture">
          <h2 id="architecture" className="flex items-center gap-2 text-2xl font-semibold"><GitBranch size={21} className="text-brand" aria-hidden /> Live-edit architecture</h2>
          <p className="mt-2 text-sm text-ink-soft">Change a value in the rules file, rebuild, and the server enforcement, calculations and explanatory copy move together.</p>
          <ul className="mt-4 space-y-3">
            {architecture.map(([title, path, description]) => (
              <li key={path} className="border-t border-line pt-3">
                <p className="font-sans text-sm font-semibold">{title} <code className="ml-1 rounded bg-paper px-1.5 py-0.5 text-xs font-normal text-brand-deep">{path}</code></p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{description}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="demo">
        <h2 id="demo" className="flex items-center gap-2 text-2xl font-semibold"><BadgeCheck size={21} className="text-verified" aria-hidden /> Suggested evaluator path</h2>
        <ol className="mt-4 grid gap-3 text-sm text-ink-soft md:grid-cols-2">
          <li><span className="font-semibold text-ink">1. Login:</span> use any one-click persona below; the password for each is <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-xs text-ink">{DEMO_PASSWORD}</code>.</li>
          <li><span className="font-semibold text-ink">2. Discover:</span> inspect the transparent score and start a Co-Op with a scripted profile.</li>
          <li><span className="font-semibold text-ink">3. Matches:</span> answer the three scenarios, compare answers, then try the protected chat and closure gate.</li>
          <li><span className="font-semibold text-ink">4. Safety:</span> send a phone number or handle in chat, then review the report audit log.</li>
        </ol>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {DEMO_PERSONAS.slice(0, 3).map((persona) => (
            <div key={persona.key} className="rounded-lg border border-line bg-paper p-3">
              <p className="font-sans text-sm font-semibold">{persona.label}</p>
              <p className="mt-1 break-all font-mono text-xs text-ink-soft">{persona.email}</p>
              <p className="mt-2 text-xs text-ink-soft">{persona.blurb}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-ink-soft">All seed data is fictional. Reset the shared demo state from the navbar&apos;s Demo menu.</p>
      </section>
    </main>
  );
}
