import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { APP_NAME } from "@/config/brand";
import { SAFETY_RULES, TRUST_AND_DEPOSIT_RULES } from "@/config/businessRules";
import { CREDIT_REASON_LABELS, RELIABILITY_REASON_LABELS, fastForwardHours } from "@/lib/rulesCopy";
import { coOpsNeededToRecover } from "@/lib/trustEngine";
import { requireMember } from "@/server/auth";
import { settleExpiredMatchesFor } from "@/server/matches";
import { getWallet } from "@/server/wallet";

export const metadata: Metadata = { title: "Wallet" };

const formatDate = (date: Date) => date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ fastforward?: string }> }) {
  const user = await requireMember();
  const params = await searchParams;
  await settleExpiredMatchesFor(user.id);
  const wallet = await getWallet(user.id);
  const t = TRUST_AND_DEPOSIT_RULES;
  const threshold = SAFETY_RULES.minReliabilityScoreForActivePool;
  const low = wallet.reliability < threshold;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader eyebrow="Wallet" title="Trust Credits and Reliability" description="Every credit movement is a row in a ledger you can read. Nothing is hidden and nothing is edited after the fact." />

      {params.fastforward !== undefined && (
        <p className="demo-note mb-5 text-sm">
          <strong>Demo time travel:</strong> your open matches were moved {fastForwardHours()} hours into the past.{" "}
          {Number(params.fastforward) > 0 ? `${params.fastforward} ${Number(params.fastforward) === 1 ? "match was" : "matches were"} settled: see the newest rows below.` : "Nothing was due yet."}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Summary">
        <div className="card p-5">
          <p className="eyebrow">Available credits</p>
          <p className="tnum mt-2 font-serif text-4xl font-semibold text-credit-ink">{wallet.available}</p>
          <p className="mt-1 text-xs text-ink-soft">Enough for {Math.floor(wallet.available / Math.max(1, t.stakeRequiredToConnect))} deposits of {t.stakeRequiredToConnect}.</p>
        </div>
        <div className="card p-5">
          <p className="eyebrow">Locked in deposits</p>
          <p className="tnum mt-2 font-serif text-4xl font-semibold">{wallet.locked}</p>
          <p className="mt-1 text-xs text-ink-soft">Returned when each Co-Op closes respectfully.</p>
        </div>
        <div className="card p-5" id="reliability">
          <p className="eyebrow">Reliability Score</p>
          <p className={`tnum mt-2 font-serif text-4xl font-semibold ${low ? "text-danger-ink" : "text-verified-ink"}`}>{wallet.reliability}%</p>
          <p className="mt-1 text-xs text-ink-soft">{low ? `Below the ${threshold}% needed for the active pool.` : `Active pool needs ${threshold}% or more.`}</p>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="ledger">
        <h2 id="ledger" className="mb-3 text-2xl font-semibold">Credit ledger</h2>
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr><th>When</th><th>Reason</th><th>With</th><th className="text-right">Amount</th><th className="text-right">Balance after</th></tr>
            </thead>
            <tbody>
              {wallet.ledger.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-ink-soft">{formatDate(row.createdAt)}</td>
                  <td>
                    <span className="font-medium">{CREDIT_REASON_LABELS[row.reason] ?? row.reason}</span>
                    {row.note && <span className="block text-xs text-ink-soft">{row.note}</span>}
                  </td>
                  <td>{row.matchId && row.partnerName ? <Link href={`/matches/${row.matchId}`} className="text-brand underline underline-offset-2">{row.partnerName}</Link> : <span className="text-ink-soft">—</span>}</td>
                  <td className={`tnum text-right font-semibold ${row.amount > 0 ? "text-verified-ink" : row.amount < 0 ? "text-danger-ink" : "text-ink-soft"}`}>{signed(row.amount)}</td>
                  <td className="tnum text-right">{row.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Trust Credits are a utility inside {APP_NAME}: they have no cash value, cannot be withdrawn or transferred, and are never won or wagered. <Link href="/safety#legal" className="underline">Why that matters</Link>
        </p>
      </section>

      <section className="mt-8" aria-labelledby="reliability-history">
        <h2 id="reliability-history" className="mb-3 text-2xl font-semibold">Reliability history</h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="table-wrap">
            <table className="ledger">
              <thead><tr><th>When</th><th>Event</th><th className="text-right">Change</th><th className="text-right">Score after</th></tr></thead>
              <tbody>
                {wallet.reliabilityHistory.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-ink-soft">{formatDate(row.createdAt)}</td>
                    <td>
                      <span className="font-medium">{RELIABILITY_REASON_LABELS[row.reason] ?? row.reason}</span>
                      {row.note && <span className="block text-xs text-ink-soft">{row.note}</span>}
                    </td>
                    <td className={`tnum text-right font-semibold ${row.delta >= 0 ? "text-verified-ink" : "text-danger-ink"}`}>{row.reason === "initial" ? "—" : signed(row.delta)}</td>
                    <td className="tnum text-right">{row.scoreAfter}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card p-4 text-sm">
            <p className="eyebrow">How the score moves</p>
            <ul className="mt-2 space-y-1.5 text-ink-soft">
              <li><span className="tnum font-semibold text-verified-ink">+{t.reliabilityRecoveryPerCompletedCoOp}</span> for every completed Co-Op</li>
              <li><span className="tnum font-semibold text-verified-ink">+{t.respectfulClosureReliabilityBonus}</span> for every Honest Closure</li>
              <li><span className="tnum font-semibold text-danger-ink">−{t.ghostingPenaltyReliability}</span> for leaving a message unanswered for {t.chatWindowHours} hours</li>
              <li>Capped at {t.maxReliability}%.</li>
            </ul>
            {low && (
              <p className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-danger-ink">
                To get back above {threshold}%: complete {coOpsNeededToRecover(wallet.reliability)} Co-Op{coOpsNeededToRecover(wallet.reliability) === 1 ? "" : "s"} you have been invited to. <Link href="/matches" className="font-medium underline">See invitations</Link>
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
