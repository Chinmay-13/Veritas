import { ArrowLeft, BadgeCheck, CheckCircle2, Clock, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { declineInvitationAction } from "@/app/actions/matches";
import { Avatar } from "@/components/Avatar";
import { CompatibilityBars, CompatibilityRing } from "@/components/Compatibility";
import { Chat, ClosureButton, CoOpForm, ReportButton } from "@/components/MatchClient";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { TRUST_AND_DEPOSIT_RULES } from "@/config/businessRules";
import { COOP_SCENARIOS } from "@/data/coopScenarios";
import { CREDIT_REASON_LABELS, RELIABILITY_REASON_LABELS, depositRulesText, joinCtaText } from "@/lib/rulesCopy";
import { uuidSchema } from "@/lib/validation";
import { requireMember } from "@/server/auth";
import { getChatState, getMatchDetail, type MatchDetail } from "@/server/matchViews";

export const metadata: Metadata = { title: "Co-Op" };

/** Plain-language lines describing exactly what closing now returns. Built from the server's closure outcome. */
function closureLines(detail: MatchDetail): string[] {
  const c = detail.closure;
  if (c.respectful) {
    return [`Your ${c.refund}-credit deposit comes back.`, `Plus a ${c.bonus}-credit bonus.`, `Plus up to ${c.reliabilityBonus} reliability points (the score is capped at ${TRUST_AND_DEPOSIT_RULES.maxReliability}%).`, `Total back: ${c.netCredits} credits.`];
  }
  return [`Your ${c.refund}-credit deposit comes back, minus a ${c.fee}-credit early-exit fee.`, "No bonus and no reliability change.", `Total back: ${c.netCredits} credits.`];
}

/** Side-by-side answers, shown only once both people have answered. */
function CoOpReveal({ detail }: { detail: MatchDetail }) {
  if (!detail.reveal) return null;
  const aligned = detail.reveal.filter((r) => r.verdict === "aligned").length;
  return (
    <section aria-labelledby="coop-reveal">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="coop-reveal" className="text-2xl font-semibold">Co-Op answers, side by side</h2>
        <p className="text-sm text-ink-soft">Aligned on {aligned} of {detail.reveal.length}</p>
      </div>
      <ol className="space-y-4">
        {detail.reveal.map((row, index) => (
          <li key={row.scenarioId} className={`card reveal p-4 ${index === 1 ? "reveal-delay-1" : index >= 2 ? "reveal-delay-2" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-serif text-lg">{row.prompt}</p>
              {row.verdict === "aligned" ? (
                <span className="pill-verified"><CheckCircle2 size={12} aria-hidden /> Aligned</span>
              ) : (
                <span className="pill-credit"><MessageCircleQuestion size={12} aria-hidden /> Worth discussing</span>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[{ who: "You", answer: row.mine }, { who: detail.partner.firstName, answer: row.theirs }].map(({ who, answer }) => (
                <div key={who} className="rounded-lg border border-line bg-paper p-3">
                  <p className="eyebrow">{who}</p>
                  <p className="mt-1 text-sm font-medium text-ink">{answer.label}</p>
                  {answer.reason && <p className="mt-1 text-sm text-ink-soft italic">&ldquo;{answer.reason}&rdquo;</p>}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const detail = await getMatchDetail(user, id);
  if (!detail) notFound(); // also covers "not your match": ids cannot be probed
  const chat = detail.status === "coop_pending" ? null : await getChatState(user.id, id);
  const t = TRUST_AND_DEPOSIT_RULES;
  const partner = detail.partner;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/matches" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> All matches
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Stage 1: the Co-Op */}
          {detail.status === "coop_pending" && !detail.iHaveAnswered && (
            <section aria-labelledby="coop-stage">
              <p className="eyebrow">Stage 1 of 2 · Co-Op</p>
              <h1 id="coop-stage" className="mt-1 text-3xl font-semibold">
                {detail.needsToJoin ? `${partner.firstName} invited you to a Co-Op` : `Your Co-Op with ${partner.firstName}`}
              </h1>
              <p className="mt-2 text-ink-soft">
                {COOP_SCENARIOS.length} practical scenarios. {detail.partnerHasAnswered ? `${partner.firstName} has already answered: submit yours to reveal both sets side by side.` : `Answer now; ${partner.firstName} will be asked the same.`}
              </p>
              {detail.needsToJoin && <p className="mt-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-soft">{depositRulesText()}</p>}
              <div className="mt-5">
                <CoOpForm
                  matchId={detail.id}
                  submitLabel={detail.needsToJoin ? joinCtaText() : "Lock in my answers"}
                  joinNote={detail.needsToJoin ? `Submitting places your own ${t.stakeRequiredToConnect}-credit commitment deposit, matching the one ${partner.firstName} already placed.` : null}
                />
              </div>
              {detail.needsToJoin && (
                <form action={declineInvitationAction} className="mt-4">
                  <input type="hidden" name="matchId" value={detail.id} />
                  <SubmitButton className="btn-ghost" pendingText="Declining…">Not for me: decline (no cost to either of you)</SubmitButton>
                </form>
              )}
            </section>
          )}

          {detail.status === "coop_pending" && detail.iHaveAnswered && (
            <section className="card p-8 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-brand-deep"><Clock size={20} aria-hidden /></span>
              <h1 className="mt-4 text-2xl font-semibold">Your answers are locked in</h1>
              <p className="mt-2 text-sm text-ink-soft">Waiting for {partner.firstName}. The moment they answer, both sets are revealed side by side and chat opens.</p>
            </section>
          )}

          {detail.reveal && (
            <>
              {detail.status === "chat_open" && (
                <div>
                  <p className="eyebrow">Stage 2 of 2 · Protected chat</p>
                  <h1 className="mt-1 text-3xl font-semibold">You and {partner.firstName}</h1>
                </div>
              )}
              {!detail.isOpen && <h1 className="text-3xl font-semibold">You and {partner.firstName}</h1>}
              <CoOpReveal detail={detail} />
            </>
          )}

          {chat && (detail.reveal || chat.messages.length > 0) && <Chat matchId={detail.id} initial={chat} canSend={detail.status === "chat_open"} partnerName={partner.firstName} />}
          {!detail.isOpen && !detail.reveal && chat && chat.messages.length === 0 && (
            <section className="card p-8 text-center">
              <h1 className="text-2xl font-semibold">{detail.statusLabel}</h1>
              <p className="mt-2 text-sm text-ink-soft">This Co-Op ended before it was completed.</p>
            </section>
          )}
        </div>

        {/* Sidebar: who, status, compatibility, actions */}
        <aside className="space-y-4">
          <section className="card p-4">
            <div className="flex items-center gap-3">
              <Avatar avatar={partner.avatar} size={56} label={partner.firstName} />
              <div className="min-w-0">
                <p className="font-serif text-xl font-semibold">{partner.firstName}</p>
                <span className={detail.isOpen ? "pill-verified" : "pill-neutral"}>{detail.statusLabel}</span>
              </div>
            </div>
            <div className="mt-3 flex flex-col items-start gap-1.5">
              {partner.badgeText && <span className="pill-verified whitespace-normal"><BadgeCheck size={12} className="shrink-0" aria-hidden /> {partner.badgeText}</span>}
              <span className="pill-neutral whitespace-normal"><ShieldCheck size={12} className="shrink-0" aria-hidden /> {partner.reliabilityText}</span>
              {partner.scripted && <span className="pill-credit whitespace-normal">Demo profile · {partner.scripted === "goes_silent" ? "never replies in chat" : "scripted replies"}</span>}
            </div>
            {partner.avatar.variant === "abstract" && <p className="mt-3 text-xs text-ink-soft">The avatar unlocks for both of you when the Co-Op is complete.</p>}
            {detail.deadlineText && detail.isOpen && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft"><Clock size={13} className="mt-0.5 shrink-0" aria-hidden /> {detail.deadlineText}</p>
            )}
          </section>

          {detail.compatibility && (
            <section className="card p-4" aria-label="Compatibility">
              <div className="mb-3 flex items-center justify-between">
                <p className="eyebrow">Compatibility</p>
                <CompatibilityRing total={detail.compatibility.total} size={52} />
              </div>
              <CompatibilityBars result={detail.compatibility} />
            </section>
          )}

          {(detail.myLedger.length > 0 || detail.myReliabilityChanges.length > 0) && (
            <section className="card p-4" aria-label="Your deposit on this match" data-testid="settlement">
              <p className="eyebrow mb-2">{detail.isOpen ? "Your deposit" : "How this was settled for you"}</p>
              <ul className="space-y-1.5 text-sm">
                {detail.myLedger.map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-3">
                    <span>{CREDIT_REASON_LABELS[row.reason] ?? row.reason}</span>
                    <span className={`tnum font-semibold ${row.amount > 0 ? "text-verified-ink" : row.amount < 0 ? "text-danger-ink" : "text-ink-soft"}`}>{row.amount > 0 ? `+${row.amount}` : row.amount} credits</span>
                  </li>
                ))}
                {detail.myReliabilityChanges.map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-3">
                    <span>{RELIABILITY_REASON_LABELS[row.reason] ?? row.reason}</span>
                    <span className={`tnum font-semibold ${row.delta >= 0 ? "text-verified-ink" : "text-danger-ink"}`}>{row.delta > 0 ? `+${row.delta}` : row.delta} reliability</span>
                  </li>
                ))}
              </ul>
              <Link href="/wallet" className="mt-2 inline-block text-xs text-brand underline underline-offset-2">Full ledger in Wallet</Link>
            </section>
          )}

          {detail.isOpen && !detail.needsToJoin && (
            <section className="card space-y-2 p-4" aria-label="Actions">
              <p className="text-xs text-ink-soft">
                Deposit locked: <span className="tnum font-semibold text-ink">{detail.myDeposit} credits</span>
                {detail.status === "chat_open" && (
                  <>
                    {" "}· Messages you have sent: <span className="tnum font-semibold text-ink">{detail.messagesSentByMe}/{t.minMessagesForFreeClosure}</span> for a free closure
                  </>
                )}
              </p>
              <ClosureButton
                matchId={detail.id}
                partnerName={partner.firstName}
                respectful={detail.closure.respectful}
                outcomeLines={closureLines(detail)}
                gateText={`The gate: complete the Co-Op and send at least ${t.minMessagesForFreeClosure} messages. You have sent ${detail.messagesSentByMe}.`}
                buttonLabel={detail.closure.respectful ? "Honest Closure" : "Close early"}
              />
              <ReportButton matchId={detail.id} partnerName={partner.firstName} />
            </section>
          )}
          {(!detail.isOpen || detail.needsToJoin) && (
            <section className="card p-4" aria-label="Safety">
              <ReportButton matchId={detail.id} partnerName={partner.firstName} />
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
