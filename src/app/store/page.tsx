import { Coffee, Coins, MapPinned } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { CheckoutButton } from "@/components/StoreClient";
import { APP_NAME } from "@/config/brand";
import { COHORT_BALANCING_RULES, MONETIZATION_PRICING, TRUST_AND_DEPOSIT_RULES } from "@/config/businessRules";
import { GENDERS, HUBS, hubLabel, hubLabelWithAreas } from "@/data/nonNegotiables";
import { formatInr, priceLabel } from "@/lib/rulesCopy";
import { requireMember } from "@/server/auth";
import { getStoreView } from "@/server/store";

export const metadata: Metadata = { title: "Store" };

const PRODUCT_LABELS: Record<string, string> = { cohort_pass: "Relocation Cohort Pass", mixer_seat: "Weekend Coffee Mixer seat", credit_topup: "Trust Credit Top-Up" };
const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export default async function StorePage({ searchParams }: { searchParams: Promise<{ hub?: string }> }) {
  const user = await requireMember();
  const params = await searchParams;
  const store = await getStoreView(user);
  const p = MONETIZATION_PRICING;
  const otherHubs = HUBS.filter((h) => h.id !== user.hub && !store.passes.some((pass) => pass.hub === h.id)).map((h) => ({ id: h.id, label: `${h.label} (${h.areas})` }));
  const topUpsLeft = Math.max(0, p.maxTopUpsPerMonth - store.topUpsUsed);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        eyebrow="Store"
        title="Things that help you meet"
        description={`${APP_NAME} never sells likes, boosts or more simultaneous conversations. Everyone is capped at ${TRUST_AND_DEPOSIT_RULES.maxConcurrentCoOps} open Co-Ops, paid or not.`}
      />
      {store.paymentsSimulated && (
        <p className="demo-note mb-6 text-sm">
          <strong>Payments are simulated in this demo.</strong> No real money moves and no payment details are collected. Orders are stored and the entitlements really take effect.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* 1. Relocation Cohort Pass */}
        <section className="card flex flex-col p-5" aria-labelledby="product-pass">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand-deep"><MapPinned size={20} aria-hidden /></span>
          <h2 id="product-pass" className="mt-4 text-2xl font-semibold">Relocation Cohort Pass</h2>
          <p className="tnum mt-1 font-serif text-xl">{priceLabel(p.relocationCohortPassInr)} <span className="font-sans text-sm text-ink-soft">· {p.cohortPassDays} days</span></p>
          <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-soft">
            Moving cities for work? Unlock one other metro hub&apos;s verified pool in Discover, for example {hubLabelWithAreas("hyderabad")}, and start Co-Ops before you land.
          </p>
          {store.passes.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {store.passes.map((pass) => (
                <li key={pass.hub} className="pill-verified whitespace-normal">Active: {hubLabel(pass.hub)} until {formatDate(pass.expiresAt)}</li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            {otherHubs.length > 0 ? (
              <CheckoutButton
                product="cohort_pass"
                title="Relocation Cohort Pass"
                priceLabel={priceLabel(p.relocationCohortPassInr)}
                buttonLabel={`Get the pass · ${formatInr(p.relocationCohortPassInr)}`}
                hubOptions={otherHubs}
                defaultHub={otherHubs.some((h) => h.id === params.hub) ? params.hub : undefined}
                summaryLines={[`Unlocks one hub in Discover for ${p.cohortPassDays} days.`, "Your own hub stays free, always.", `It does not raise the limit of ${TRUST_AND_DEPOSIT_RULES.maxConcurrentCoOps} open Co-Ops.`]}
              />
            ) : (
              <p className="text-sm text-ink-soft">You have an active pass for every other hub.</p>
            )}
          </div>
        </section>

        {/* 2. Weekend Coffee Mixer */}
        <section className="card flex flex-col p-5" aria-labelledby="product-mixer">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand-deep"><Coffee size={20} aria-hidden /></span>
          <h2 id="product-mixer" className="mt-4 text-2xl font-semibold">Weekend Coffee Mixer</h2>
          <p className="tnum mt-1 font-serif text-xl">{priceLabel(p.weekendCuratedMixerInr)} <span className="font-sans text-sm text-ink-soft">· per seat</span></p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            A small, curated in-person meetup for verified {COHORT_BALANCING_RULES.minBatchYear}–{COHORT_BALANCING_RULES.maxBatchYear} grads. Strictly {p.mixerSeatsPerGender} seats per gender, so the room is always balanced.
          </p>
          <p className="demo-note mt-3">Simulated events: venues and dates are illustrative and nothing is actually being organised.</p>
          <ul className="mt-4 flex-1 space-y-3">
            {store.mixers.map((mixer) => (
              <li key={mixer.id} className="rounded-lg border border-line p-3">
                <p className="text-sm font-semibold">{mixer.title}</p>
                <p className="text-xs text-ink-soft">{mixer.dateLabel} · {mixer.venue}</p>
                <p className="tnum mt-1.5 text-xs text-ink-soft">
                  {GENDERS.filter((g) => g.id !== "nonbinary" || mixer.seatsTaken[g.id] > 0).map((g) => `${g.plural}: ${mixer.seatsTaken[g.id]}/${p.mixerSeatsPerGender}`).join(" · ")}
                </p>
                <div className="mt-2">
                  {mixer.myBooking === "confirmed" ? (
                    <span className="pill-verified">Your seat is reserved</span>
                  ) : mixer.myBooking === "waitlisted" ? (
                    <span className="pill-credit">You are on the waitlist</span>
                  ) : (
                    <CheckoutButton
                      secondary
                      product="mixer_seat"
                      mixerId={mixer.id}
                      title={mixer.title}
                      priceLabel={mixer.seatAvailableForMe ? priceLabel(p.weekendCuratedMixerInr) : "₹0"}
                      buttonLabel={mixer.seatAvailableForMe ? `Reserve a seat · ${formatInr(p.weekendCuratedMixerInr)}` : "Join the waitlist (free)"}
                      summaryLines={
                        mixer.seatAvailableForMe
                          ? [`${mixer.dateLabel}, ${mixer.venue}.`, `${p.mixerSeatsPerGender} seats per gender. The exact venue is shared after booking.`]
                          : ["Seats for your gender are full.", "Joining the waitlist is free: you are only charged if a seat opens and you confirm."]
                      }
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 3. Trust Credit Top-Up */}
        <section className="card flex flex-col p-5" aria-labelledby="product-topup">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-credit-soft text-credit-ink"><Coins size={20} aria-hidden /></span>
          <h2 id="product-topup" className="mt-4 text-2xl font-semibold">Trust Credit Top-Up</h2>
          <p className="tnum mt-1 font-serif text-xl">{priceLabel(p.trustCreditPackInr)} <span className="font-sans text-sm text-ink-soft">· {p.trustCreditPackCredits} credits</span></p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            For when fees or a forfeit have left you short of a deposit. Most people never need this: respectful behaviour earns credits back.
          </p>
          <ul className="mt-3 flex-1 list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
            <li><strong className="text-ink">Never increases the number of simultaneous Co-Ops.</strong> The cap of {TRUST_AND_DEPOSIT_RULES.maxConcurrentCoOps} applies to everyone.</li>
            <li>Maximum {p.maxTopUpsPerMonth} top-ups every 30 days ({topUpsLeft} left for you).</li>
            <li>Credits are a utility: no cash value, not withdrawable, not transferable.</li>
            <li>Credits cannot repair a Reliability Score. Only showing up does.</li>
          </ul>
          <div className="mt-4">
            {topUpsLeft > 0 ? (
              <CheckoutButton
                product="credit_topup"
                title="Trust Credit Top-Up"
                priceLabel={priceLabel(p.trustCreditPackInr)}
                buttonLabel={`Add ${p.trustCreditPackCredits} credits · ${formatInr(p.trustCreditPackInr)}`}
                summaryLines={[`${p.trustCreditPackCredits} Trust Credits added to your wallet immediately.`, "Non-withdrawable and non-transferable.", `Does not raise the limit of ${TRUST_AND_DEPOSIT_RULES.maxConcurrentCoOps} open Co-Ops.`]}
              />
            ) : (
              <p className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-soft">You have used all {p.maxTopUpsPerMonth} top-ups for this 30-day period.</p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-10" aria-labelledby="orders">
        <h2 id="orders" className="mb-3 text-2xl font-semibold">Your orders</h2>
        {store.orders.length === 0 ? (
          <p className="card p-6 text-center text-sm text-ink-soft">No orders yet. Nothing here is required to use {APP_NAME}.</p>
        ) : (
          <div className="table-wrap">
            <table className="ledger">
              <thead><tr><th>Date</th><th>Product</th><th>Details</th><th>Payment</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {store.orders.map((order) => (
                  <tr key={order.id}>
                    <td className="whitespace-nowrap text-ink-soft">{formatDate(order.createdAt)}</td>
                    <td className="font-medium">{PRODUCT_LABELS[order.product] ?? order.product}</td>
                    <td className="text-ink-soft">{order.meta.hub ? hubLabel(order.meta.hub) : order.meta.mixerId ? (store.mixers.find((m) => m.id === order.meta.mixerId)?.title ?? "") : `${p.trustCreditPackCredits} credits`}</td>
                    <td className="text-ink-soft">{order.provider === "demo" ? "Simulated (demo)" : order.provider}</td>
                    <td className="tnum text-right">{priceLabel(order.amountInr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
