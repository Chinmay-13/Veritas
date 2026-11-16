import { BadgeCheck, HandCoins, MessagesSquare, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { APP_NAME, APP_TAGLINE } from "@/config/brand";
import { COHORT_BALANCING_RULES, DEMO_SETTINGS, MATCHING_RULES, TRUST_AND_DEPOSIT_RULES } from "@/config/businessRules";
import { COOP_SCENARIOS } from "@/data/coopScenarios";
import { getCurrentUser } from "@/server/auth";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : user.profileCompletedAt ? "/discover" : "/signup");

  const t = TRUST_AND_DEPOSIT_RULES;
  const mechanics = [
    {
      icon: BadgeCheck,
      title: "A verified cohort",
      body: `Only eLitmus-verified ${COHORT_BALANCING_RULES.minBatchYear}–${COHORT_BALANCING_RULES.maxBatchYear} graduates. No bots, no fake profiles, and a gender-balanced pool in every metro hub.`,
    },
    {
      icon: MessagesSquare,
      title: "Co-Op instead of swipe",
      body: `A match starts with ${COOP_SCENARIOS.length} practical life scenarios. You both answer, then see each other's choices side by side. Compatibility is shown by decisions, not photos.`,
    },
    {
      icon: HandCoins,
      title: "A commitment deposit",
      body: `Starting a Co-Op locks ${t.stakeRequiredToConnect} Trust Credits. Show up and close respectfully and they come back with a bonus. Go silent for ${t.chatWindowHours} hours and they are forfeited.`,
    },
  ];

  return (
    <main>
      <section className="mx-auto max-w-4xl px-4 pt-16 pb-12 text-center sm:pt-24">
        <p className="pill-verified mx-auto">
          <ShieldCheck size={12} aria-hidden /> For eLitmus-verified {COHORT_BALANCING_RULES.minBatchYear}–{COHORT_BALANCING_RULES.maxBatchYear} graduates
        </p>
        <h1 className="mt-5 text-4xl leading-[1.1] font-semibold sm:text-6xl">{APP_TAGLINE}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-soft">
          {APP_NAME} is matchmaking without the swipe. At most {MATCHING_RULES.dailyDossierLimit} curated dossiers a day, compatibility on the things that decide long-term
          partnerships, and a refundable deposit that makes ghosting cost something.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/signup" className="btn-primary w-full sm:w-auto">Create your profile</Link>
          <Link href="/login" className="btn-secondary w-full sm:w-auto">{DEMO_SETTINGS.demoMode ? "Log in or try a demo account" : "Log in"}</Link>
        </div>
        <p className="mt-4 text-sm text-ink-soft">
          Evaluating this assignment? Start with the{" "}
          <Link href="/evaluator" className="font-medium text-brand underline underline-offset-2">Evaluator &amp; Founder Guide</Link>.
        </p>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 md:grid-cols-3" aria-label="How it is different">
        {mechanics.map(({ icon: Icon, title, body }) => (
          <article key={title} className="card p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-deep">
              <Icon size={18} aria-hidden />
            </span>
            <h2 className="mt-4 text-xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
          </article>
        ))}
      </section>

      <section className="mx-auto mt-12 max-w-3xl px-4">
        <div className="hairline pt-8">
          <p className="eyebrow">What we refuse to sell</p>
          <p className="mt-3 font-serif text-2xl leading-snug text-ink">
            You can never pay to talk to more people at once. Everyone is capped at {t.maxConcurrentCoOps} open Co-Ops, and forfeited deposits are never kept as revenue.
          </p>
          <p className="mt-3 text-sm text-ink-soft">Revenue comes from relocation passes and small curated mixers: things that help people meet, not things that keep them scrolling.</p>
        </div>
      </section>
    </main>
  );
}
