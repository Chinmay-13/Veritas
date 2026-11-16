import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { TRUST_AND_DEPOSIT_RULES } from "@/config/businessRules";
import { requireMember } from "@/server/auth";
import { listMatches, type MatchListItem, type NextAction } from "@/server/matchViews";

export const metadata: Metadata = { title: "Matches" };

const ACTION_BADGES: Record<Exclude<NextAction, null>, { text: string; className: string }> = {
  join: { text: "Invitation: join or decline", className: "pill-brand" },
  answer: { text: "Your turn: answer the Co-Op", className: "pill-brand" },
  wait_partner: { text: "Waiting for their answers", className: "pill-neutral" },
  reply: { text: "Your turn to reply", className: "pill-credit" },
  wait_reply: { text: "Waiting for their reply", className: "pill-neutral" },
  say_hello: { text: "Chat open: say hello", className: "pill-brand" },
};

function MatchRow({ item }: { item: MatchListItem }) {
  const badge = item.nextAction ? ACTION_BADGES[item.nextAction] : null;
  return (
    <li>
      <Link href={`/matches/${item.id}`} className="card flex items-center gap-4 p-4 transition-colors hover:border-brand/40">
        <Avatar avatar={item.partner.avatar} size={52} label={item.partner.firstName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-serif text-lg font-semibold">{item.partner.firstName}</h3>
            <span className={item.isOpen ? "pill-verified" : "pill-neutral"}>{item.statusLabel}</span>
            {badge && <span className={badge.className}>{badge.text}</span>}
          </div>
          {item.lastMessagePreview && <p className="mt-1 truncate text-sm text-ink-soft">{item.lastMessagePreview}</p>}
        </div>
        <ArrowRight size={18} className="shrink-0 text-ink-soft" aria-hidden />
      </Link>
    </li>
  );
}

export default async function MatchesPage() {
  const user = await requireMember();
  const { items, settledNow } = await listMatches(user);
  const open = items.filter((i) => i.isOpen);
  const closed = items.filter((i) => !i.isOpen);
  const max = TRUST_AND_DEPOSIT_RULES.maxConcurrentCoOps;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader eyebrow="Matches" title="Your Co-Ops" description={`${open.length} of ${max} open. The limit of ${max} is the same for everyone and cannot be bought.`} />

      {settledNow > 0 && (
        <p className="reveal mb-4 rounded-lg border border-credit/30 bg-credit-soft px-4 py-3 text-sm text-credit-ink">
          {settledNow} {settledNow === 1 ? "match was" : "matches were"} settled because a time limit passed. See the details in your <Link href="/wallet" className="font-medium underline">Wallet</Link>.
        </p>
      )}

      <section aria-labelledby="open-matches">
        <h2 id="open-matches" className="eyebrow mb-3">Open</h2>
        {open.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="font-serif text-xl">Nothing open right now</p>
            <p className="mt-2 text-sm text-ink-soft">Pick a dossier and start a Co-Op. Three short scenarios, then you both see how the other thinks.</p>
            <Link href="/discover" className="btn-primary mt-4">Go to Discover</Link>
          </div>
        ) : (
          <ul className="space-y-3">{open.map((item) => <MatchRow key={item.id} item={item} />)}</ul>
        )}
      </section>

      {closed.length > 0 && (
        <section aria-labelledby="closed-matches" className="mt-8">
          <h2 id="closed-matches" className="eyebrow mb-3">Closed</h2>
          <ul className="space-y-3">{closed.map((item) => <MatchRow key={item.id} item={item} />)}</ul>
        </section>
      )}
    </main>
  );
}
