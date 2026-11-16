import { FileLock2, Gavel, LifeBuoy, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ConsentManager, DataRights, ShieldTryout } from "@/components/SafetyClient";
import { APP_NAME, SUPPORT_CONTACTS } from "@/config/brand";
import { COHORT_BALANCING_RULES, SAFETY_RULES, TRUST_AND_DEPOSIT_RULES } from "@/config/businessRules";
import { reportReasonLabel } from "@/data/copy";
import { getAuditLog } from "@/server/account";
import { getCurrentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Safety and Legal Center" };

const formatDate = (date: Date) => date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const STATUS_LABELS: Record<string, { text: string; className: string }> = {
  open: { text: "Under review", className: "pill-credit" },
  dismissed: { text: "Reviewed: no action", className: "pill-neutral" },
  warned: { text: "Reviewed: user warned", className: "pill-brand" },
  suspended: { text: "Reviewed: user suspended", className: "pill-danger" },
};

export default async function SafetyPage({ searchParams }: { searchParams: Promise<{ reported?: string }> }) {
  // This page is public (the legal text must be readable without an account).
  // The account sections only render for a logged-in member.
  const user = await getCurrentUser();
  const member = user && user.role === "user" && user.profileCompletedAt ? user : null;
  const params = await searchParams;
  const auditLog = member ? await getAuditLog(member.id) : [];
  const s = SAFETY_RULES;
  const t = TRUST_AND_DEPOSIT_RULES;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader eyebrow="Safety and Legal Center" title="Safe by design, honest about limits" description="How we protect you, what the law asks of a product like this, and the controls you have over your own data." />

      <p className="mb-6 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
        <strong className="text-ink">This is product design, not legal advice. Counsel should review before launch.</strong> Where we mention a law, we describe how the product is{" "}
        <em>designed to align with</em> it. Nothing here is a certification.
      </p>

      {params.reported && (
        <p className="reveal mb-6 rounded-lg border border-verified/20 bg-verified-soft px-4 py-3 text-sm text-verified-ink" role="status">
          Report received. The other person is blocked, any open match has ended, and both deposits were returned in full. You can follow the report in your Audit Log below.
        </p>
      )}

      {/* 1. Safety Shield */}
      <section className="card p-5 sm:p-6" aria-labelledby="shield">
        <h2 id="shield" className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck size={22} className="text-verified" aria-hidden /> Try the Safety Shield</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Until a Co-Op is complete and {s.messagesRequiredToUnmaskPII} messages have been exchanged, phone numbers, emails, UPI IDs, social handles and chat links are replaced <strong className="text-ink">on our server, before the message is saved</strong>. The original text is never stored, so it cannot leak later.
        </p>
        <div className="mt-4"><ShieldTryout /></div>
        <p className="mt-3 text-xs text-ink-soft">
          Honest limit: pattern matching is a first line of defence, not a perfect one. Someone determined can still find a way to pass a number along. That is why Block &amp; Report exists, and why the shield is paired with a refundable deposit instead of trying to be a wall.
        </p>
      </section>

      {/* 2. Your data: consent + rights */}
      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="your-data">
        <h2 id="your-data" className="flex items-center gap-2 text-2xl font-semibold"><FileLock2 size={22} className="text-brand" aria-hidden /> Your data and your rights</h2>
        <div className="prose-veritas text-sm">
          <ul>
            <li><strong>What we collect:</strong> email, a password hash, your eLitmus ID with batch and percentile, birth year (not date of birth), first name, metro hub, role family, gender, who you are interested in, your thesis, four non-negotiables, Co-Op answers, messages, the credit ledger and orders.</li>
            <li><strong>What we deliberately do not collect:</strong> photos, surname, employer, salary, exact location, contacts, or the work email used for verification (it is used once and not stored).</li>
            <li><strong>Why:</strong> to verify you, match you and keep you safe. We do not sell data or use it for advertising.</li>
            <li><strong>Who sees what:</strong> other members see your first name, approximate age, hub, batch, role family, thesis and compatibility. Your percentile is hidden unless you opt in. Your real avatar is shown only after a completed Co-Op.</li>
          </ul>
        </div>
        {member ? (
          <div className="mt-5 space-y-6">
            <div>
              <h3 className="mb-2 font-sans text-base font-semibold">Consent management</h3>
              <ConsentManager defaults={{ matching: member.consentMatchingAt !== null, marketing: member.consentMarketing, badge: member.consentBadge }} />
            </div>
            <div className="hairline pt-5">
              <h3 className="mb-1 font-sans text-base font-semibold">Access, correction and erasure</h3>
              <p className="mb-3 text-sm text-ink-soft">
                Download everything we hold about you, correct it in your <Link href="/profile" className="text-brand underline underline-offset-2">profile</Link>, or delete your account permanently.
              </p>
              <DataRights isDemoAccount={member.isDemo} />
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink-soft">
            <Link href="/login" className="font-medium text-brand underline underline-offset-2">Log in</Link> to manage consent, download your data or delete your account.
          </p>
        )}
      </section>

      {/* 3. Audit log */}
      {member && (
        <section className="mt-6" aria-labelledby="audit-log">
          <h2 id="audit-log" className="mb-3 scroll-mt-20 text-2xl font-semibold">Your report audit log</h2>
          {auditLog.length === 0 ? (
            <p className="card p-6 text-center text-sm text-ink-soft">You have not reported anyone. If someone makes you uncomfortable, use Block &amp; report on the match page: it never costs credits.</p>
          ) : (
            <div className="table-wrap">
              <table className="ledger">
                <thead><tr><th>Filed</th><th>About</th><th>Reason</th><th>Status</th><th>Resolved</th></tr></thead>
                <tbody>
                  {auditLog.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap text-ink-soft">{formatDate(row.createdAt)}</td>
                      <td className="font-medium">{row.reportedName}</td>
                      <td>
                        {reportReasonLabel(row.reason)}
                        {row.details && <span className="block text-xs text-ink-soft">{row.details}</span>}
                      </td>
                      <td><span className={STATUS_LABELS[row.status]?.className ?? "pill-neutral"}>{STATUS_LABELS[row.status]?.text ?? row.status}</span></td>
                      <td className="whitespace-nowrap text-ink-soft">{row.resolvedAt ? formatDate(row.resolvedAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 4. Grievance officer */}
      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="grievance">
        <h2 id="grievance" className="flex items-center gap-2 text-2xl font-semibold"><LifeBuoy size={22} className="text-brand" aria-hidden /> Grievance Officer</h2>
        <p className="demo-note mt-3">Fictional contact details for this demo. A real launch must appoint and publish a named Grievance Officer resident in India.</p>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
          <dt className="text-ink-soft">Name</dt><dd>{SUPPORT_CONTACTS.grievanceOfficerName}</dd>
          <dt className="text-ink-soft">Email</dt><dd className="break-all">{SUPPORT_CONTACTS.grievanceOfficerEmail}</dd>
          <dt className="text-ink-soft">Address</dt><dd>{SUPPORT_CONTACTS.registeredAddress}</dd>
          <dt className="text-ink-soft">Our target</dt>
          <dd>Acknowledge within {SUPPORT_CONTACTS.grievanceAcknowledgeHours} hours, resolve within {SUPPORT_CONTACTS.grievanceResolveDays} days. In-app reports go to the same review queue.</dd>
        </dl>
      </section>

      {/* 5. Terms in plain English */}
      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="terms">
        <h2 id="terms" className="text-2xl font-semibold">Terms, in plain English</h2>
        <div className="prose-veritas text-sm">
          <ul>
            <li>You must be 18 or older and an eLitmus-verified graduate of the {COHORT_BALANCING_RULES.minBatchYear}–{COHORT_BALANCING_RULES.maxBatchYear} batches. One account per person.</li>
            <li>Be honest and be kind. No harassment, hate, sexual content sent without consent, solicitation, or asking anyone for money.</li>
            <li>Starting or joining a Co-Op locks a refundable commitment deposit of {t.stakeRequiredToConnect} Trust Credits. Going silent for {t.chatWindowHours} hours forfeits it. Closing honestly returns it.</li>
            <li>Trust Credits are a feature of the service. They have no cash value and cannot be withdrawn, redeemed, sold or transferred.</li>
            <li>We may hide or suspend accounts that are reported and found to break these rules. {s.maxReportsBeforeAutoHide} unresolved reports hide a profile automatically until a person has reviewed them.</li>
            <li>You can leave at any time and take your data with you.</li>
            <li>{APP_NAME} helps people meet; it does not run background checks. Meet in public places and tell a friend where you are going.</li>
          </ul>
        </div>
      </section>

      {/* 6. Legal positioning */}
      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="legal">
        <h2 id="legal" className="flex scroll-mt-20 items-center gap-2 text-2xl font-semibold"><Gavel size={22} className="text-brand" aria-hidden /> Legal positioning</h2>
        <p className="mt-2 text-sm text-ink-soft">The three areas of Indian law that shape this product most, what each asks for, and what we built in response. Our understanding as product builders, to be confirmed by counsel.</p>

        <div className="mt-5 space-y-6 text-sm">
          <article>
            <h3 className="font-sans text-base font-semibold">1. Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025</h3>
            <p className="mt-1 text-ink-soft">
              The Rules were notified in November 2025 and the main obligations for companies phase in through 2027. The product is designed to align with them from day one instead of retrofitting later:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
              <li><strong className="text-ink">Notice and consent:</strong> a plain-language notice and itemised consent before any profile data is collected. Optional consents are separate and off-by-default where they benefit us.</li>
              <li><strong className="text-ink">Purpose limitation:</strong> eLitmus candidates gave their data for hiring tests, not for dating. So nobody is auto-enrolled: joining {APP_NAME} needs a fresh, specific opt-in.</li>
              <li><strong className="text-ink">Data minimisation:</strong> birth year instead of date of birth, first name only, no photos, work email not stored.</li>
              <li><strong className="text-ink">User rights:</strong> access (download), correction (profile editor), erasure (delete account), withdrawal of consent, and a grievance channel, all working in this build.</li>
              <li><strong className="text-ink">Adults only:</strong> an 18+ confirmation at sign-up, so no children&apos;s data is processed.</li>
              <li><strong className="text-ink">Security and breach readiness:</strong> hashed passwords, httpOnly session cookies, server-side authorisation on every action. A written breach-response and notification runbook is on the roadmap, not in this demo.</li>
            </ul>
          </article>

          <article>
            <h3 className="font-sans text-base font-semibold">2. IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021</h3>
            <p className="mt-1 text-ink-soft">Members message each other, which makes the platform an intermediary. The product is designed to align with the due-diligence expectations:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
              <li>Published terms and privacy notice (this page), in plain language.</li>
              <li>A Grievance Officer with stated acknowledgement and resolution targets.</li>
              <li>An in-app report and takedown flow with an audit log for the reporter and a review queue with Dismiss, Warn and Suspend actions for the safety team.</li>
            </ul>
          </article>

          <article>
            <h3 className="font-sans text-base font-semibold">3. Promotion and Regulation of Online Gaming Act, 2025</h3>
            <p className="mt-1 text-ink-soft">
              This Act prohibits &ldquo;online money games&rdquo;: games played by paying money or other stakes in the expectation of winning money or other enrichment, whether based on skill or chance. The commitment deposit is designed so that it should fall outside that definition:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
              <li>There is no game, contest, score or outcome of skill or chance. Whether your deposit returns depends only on your own conduct: showing up and closing honestly.</li>
              <li>Trust Credits are non-redeemable and non-transferable and have no cash value. Nothing is ever won or wagered, and credits cannot be turned back into money.</li>
              <li>A forfeited deposit is never company revenue: {t.forfeitedDepositToWrongedUserPercent}% goes to the person who was ghosted and the rest is burned.</li>
              <li>We say &ldquo;commitment deposit&rdquo; everywhere because that is what it is.</li>
            </ul>
            <p className="mt-2 rounded-lg border border-credit/30 bg-credit-soft px-3 py-2 text-credit-ink">
              <strong>The honest risk:</strong> the Act&apos;s idea of &ldquo;other stakes&rdquo; is broad, and credits that can be bought (the Top-Up) and can increase (bonus, compensation) are the part most likely to draw questions. This is the first thing we would put in front of counsel. The model survives the strictest answer: Top-Ups and compensation credits can both be removed without touching the deposit mechanic or the revenue products.
            </p>
          </article>

          <article>
            <h3 className="font-sans text-base font-semibold">Also in the design</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
              <li>Prices are shown inclusive of GST, with no hidden fees and no pre-ticked paid add-ons.</li>
              <li>No dark patterns: no fake urgency, no shaming copy on the &ldquo;no&rdquo; button, and leaving is as easy as joining.</li>
              <li>Nothing can be bought that increases how many people you can talk to at once.</li>
            </ul>
          </article>
        </div>
      </section>
    </main>
  );
}
