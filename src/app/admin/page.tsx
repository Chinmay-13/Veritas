import type { Metadata } from "next";
import { resolveReportAction } from "@/app/actions/account";
import { PageHeader } from "@/components/PageHeader";
import { MONETIZATION_PRICING, SAFETY_RULES } from "@/config/businessRules";
import { reportReasonLabel } from "@/data/copy";
import { GENDERS } from "@/data/nonNegotiables";
import { formatInr } from "@/lib/rulesCopy";
import { getAdminDashboard } from "@/server/admin";
import { requireAdmin } from "@/server/auth";

export const metadata: Metadata = { title: "Founder Dashboard" };

const PRODUCT_LABELS: Record<string, string> = { cohort_pass: "Relocation Cohort Pass", mixer_seat: "Weekend Coffee Mixer", credit_topup: "Trust Credit Top-Up" };
const formatDate = (date: Date) => date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  await requireAdmin(); // role-gated: non-admins are redirected away
  const params = await searchParams;
  const data = await getAdminDashboard();
  const topOfFunnel = Math.max(1, data.funnel[0]?.count ?? 1);
  const maxBucket = Math.max(1, ...data.reliabilityBuckets.map((b) => b.count));
  const netOfGst = Math.round(data.totalGrossInr / (1 + MONETIZATION_PRICING.gstPercent / 100));
  const openReports = data.reports.filter((r) => r.status === "open");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader eyebrow="Founder Dashboard" title="Is the thesis working?" description="The numbers a founder would check every morning: the funnel, revenue, whether each hub is balanced, how reliable the pool is, and what the safety queue looks like." />
      {params.reset && <p className="reveal mb-4 rounded-lg border border-verified/20 bg-verified-soft px-4 py-3 text-sm text-verified-ink">Demo data has been reset to its starting state.</p>}
      <p className="demo-note mb-6 text-sm">Includes seeded demo events and orders (marked below) so the dashboard is not empty. Real sign-ups and purchases made on this site are added live.</p>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Totals">
        {[
          { label: "Members", value: data.totals.users, note: `${data.totals.active} active · ${data.totals.waitlisted} waitlisted · ${data.totals.suspended} suspended` },
          { label: "Gross revenue (simulated)", value: formatInr(data.totalGrossInr), note: `${formatInr(netOfGst)} net of ${MONETIZATION_PRICING.gstPercent}% GST` },
          { label: "Completed Co-Ops", value: data.funnel.find((f) => f.type === "coop_completed")?.count ?? 0, note: "North-star input: counted per person" },
          { label: "Open reports", value: openReports.length, note: `${SAFETY_RULES.maxReportsBeforeAutoHide} open reports auto-hide a profile` },
        ].map((card) => (
          <div key={card.label} className="card p-5">
            <p className="eyebrow">{card.label}</p>
            <p className="tnum mt-2 font-serif text-3xl font-semibold">{card.value}</p>
            <p className="mt-1 text-xs text-ink-soft">{card.note}</p>
          </div>
        ))}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="funnel">
          <h2 id="funnel" className="mb-3 text-2xl font-semibold">Funnel</h2>
          <ul className="card space-y-3 p-5">
            {data.funnel.map((step, index) => {
              const previous = index > 0 ? data.funnel[index - 1].count : null;
              return (
                <li key={step.type}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{step.label}</span>
                    <span className="tnum text-ink-soft">
                      <span className="font-semibold text-ink">{step.count}</span>
                      {previous ? ` · ${Math.round((step.count / previous) * 100)}% of previous step` : ""}
                      {step.seeded > 0 ? ` · ${step.seeded} seeded` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                    <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (step.count / topOfFunnel) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="revenue">
          <h2 id="revenue" className="mb-3 text-2xl font-semibold">Orders and revenue</h2>
          <div className="table-wrap">
            <table className="ledger min-w-0">
              <thead><tr><th>Product</th><th className="text-right">Orders</th><th className="text-right">Gross</th></tr></thead>
              <tbody>
                {data.revenue.map((row) => (
                  <tr key={row.product}>
                    <td className="font-medium">
                      {PRODUCT_LABELS[row.product]}
                      {row.seededOrders > 0 && <span className="block text-xs font-normal text-ink-soft">{row.seededOrders} seeded demo order{row.seededOrders === 1 ? "" : "s"}</span>}
                    </td>
                    <td className="tnum text-right">{row.orders}</td>
                    <td className="tnum text-right">{formatInr(row.grossInr)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="font-semibold">Total</td>
                  <td className="tnum text-right font-semibold">{data.revenue.reduce((sum, r) => sum + r.orders, 0)}</td>
                  <td className="tnum text-right font-semibold">{formatInr(data.totalGrossInr)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-soft">All payments are simulated. Forfeited deposits never appear here: they are not revenue.</p>
        </section>

        <section aria-labelledby="hub-balance">
          <h2 id="hub-balance" className="mb-3 text-2xl font-semibold">Gender balance by hub</h2>
          <div className="table-wrap">
            <table className="ledger min-w-0">
              <thead><tr><th>Hub</th>{GENDERS.map((g) => <th key={g.id} className="text-right">{g.plural}</th>)}<th>Status</th></tr></thead>
              <tbody>
                {data.hubs.map((hub) => (
                  <tr key={hub.hub}>
                    <td className="font-medium">{hub.label}</td>
                    {GENDERS.map((g) => <td key={g.id} className="tnum text-right">{hub.counts[g.id] ?? 0}</td>)}
                    <td><span className={hub.total === 0 ? "pill-neutral" : hub.balanced ? "pill-verified" : "pill-credit"}>{hub.total === 0 ? "Empty" : hub.balanced ? "Balanced" : `${hub.maxSharePercent}% skew`}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="reliability">
          <h2 id="reliability" className="mb-3 text-2xl font-semibold">Reliability distribution</h2>
          <ul className="card space-y-3 p-5">
            {data.reliabilityBuckets.map((bucket) => (
              <li key={bucket.label}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{bucket.label}</span>
                  <span className="tnum font-semibold">{bucket.count}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                  <div className="h-full rounded-full bg-verified" style={{ width: `${(bucket.count / maxBucket) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-8" aria-labelledby="reports">
        <h2 id="reports" className="mb-3 text-2xl font-semibold">Reports queue</h2>
        {data.reports.length === 0 ? (
          <p className="card p-6 text-center text-sm text-ink-soft">No reports yet. To see this queue in action, log in as Arjun, open a match and use Block &amp; report.</p>
        ) : (
          <div className="table-wrap">
            <table className="ledger">
              <thead><tr><th>Filed</th><th>Reporter</th><th>Reported</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {data.reports.map((report) => (
                  <tr key={report.id}>
                    <td className="whitespace-nowrap text-ink-soft">{formatDate(report.createdAt)}</td>
                    <td>{report.reporterName}</td>
                    <td className="font-medium">
                      {report.reportedName}
                      {report.reportedStatus === "suspended" && <span className="pill-danger ml-2">suspended</span>}
                    </td>
                    <td>
                      {reportReasonLabel(report.reason)}
                      {report.details && <span className="block max-w-xs text-xs text-ink-soft">{report.details}</span>}
                    </td>
                    <td><span className={report.status === "open" ? "pill-credit" : "pill-neutral"}>{report.status}</span></td>
                    <td>
                      <form action={resolveReportAction} className="flex flex-wrap gap-1.5">
                        <input type="hidden" name="reportId" value={report.id} />
                        {report.status === "open" ? (
                          <>
                            <SubmitButtonWithValue value="dismiss" label="Dismiss" className="btn-secondary min-h-8 px-2.5 py-1 text-xs" />
                            <SubmitButtonWithValue value="warn" label="Warn" className="btn-secondary min-h-8 px-2.5 py-1 text-xs" />
                            <SubmitButtonWithValue value="suspend" label="Suspend" className="btn-danger min-h-8 px-2.5 py-1 text-xs" />
                          </>
                        ) : report.reportedStatus === "suspended" && report.status === "suspended" ? (
                          <SubmitButtonWithValue value="reinstate" label="Reinstate" className="btn-secondary min-h-8 px-2.5 py-1 text-xs" />
                        ) : (
                          <span className="text-xs text-ink-soft">Resolved</span>
                        )}
                      </form>
                    </td>
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

/** A submit button that sends `action=<value>` with the form. */
function SubmitButtonWithValue({ value, label, className }: { value: string; label: string; className: string }) {
  return (
    <button type="submit" name="action" value={value} className={className}>
      {label}
    </button>
  );
}
