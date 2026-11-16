"use client";
/** Client-side pieces of the Safety and Legal Center. */
import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { consentsAction, deleteAccountAction } from "@/app/actions/account";
import { FormMessage } from "@/components/ui/FormMessage";
import { Modal } from "@/components/ui/Modal";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { useServerForm } from "@/components/ui/useServerForm";
import { SAFETY_RULES } from "@/config/businessRules";
import { maskPii } from "@/lib/safetyFilter";

/**
 * "Try the Safety Shield": runs the SAME pure maskPii() function the server uses
 * for chat, so what you see here is exactly what would be stored.
 */
export function ShieldTryout() {
  const [text, setText] = useState("Sure! Call me on 98765 43210, or UPI me at arjun@okhdfc. Insta: @arjun.codes");
  const threshold = SAFETY_RULES.messagesRequiredToUnmaskPII;
  const early = maskPii(text, { totalMessages: 0, coOpComplete: true });
  const late = maskPii(text, { totalMessages: threshold, coOpComplete: true });

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="shield-input" className="label">Type a message with a phone number, email, UPI ID or @handle</label>
        <textarea id="shield-input" rows={2} className="input" value={text} onChange={(event) => setText(event.target.value)} maxLength={500} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-credit/30 bg-credit-soft p-3">
          <p className="eyebrow text-credit-ink">Before {threshold} messages: what is stored and shown</p>
          <p className="mt-1.5 text-sm break-words whitespace-pre-wrap text-ink" data-testid="shield-early">{early.text || "…"}</p>
          <p className="mt-2 text-xs text-credit-ink">{early.masked ? `Hidden: ${early.reasons.join(", ")}.` : "Nothing to hide in this message."}</p>
        </div>
        <div className="rounded-lg border border-verified/20 bg-verified-soft p-3">
          <p className="eyebrow text-verified-ink">After {threshold} messages and a completed Co-Op</p>
          <p className="mt-1.5 text-sm break-words whitespace-pre-wrap text-ink" data-testid="shield-late">{late.text || "…"}</p>
          <p className="mt-2 text-xs text-verified-ink">The shield has lifted: sharing contact details is now your choice.</p>
        </div>
      </div>
    </div>
  );
}

/** Consent management: every consent can be changed after sign-up, and the change is saved. */
export function ConsentManager({ defaults }: { defaults: { matching: boolean; marketing: boolean; badge: boolean } }) {
  const form = useServerForm(consentsAction);
  const checkbox = "mt-1 h-4 w-4 shrink-0 accent-[var(--color-brand)]";
  return (
    <form onSubmit={form.onSubmit} className="space-y-3">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="matching" defaultChecked={defaults.matching} className={checkbox} />
        <span>
          <span className="font-medium text-ink">Matching.</span> Use my profile, non-negotiables and Co-Op answers to match me. Turning this off hides you from everyone; your open Co-Ops continue so nobody is left hanging.
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="badge" defaultChecked={defaults.badge} className={checkbox} />
        <span><span className="font-medium text-ink">Verified badge.</span> Show &ldquo;Verified via eLitmus&rdquo; with my batch and hub on my dossier.</span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="marketing" defaultChecked={defaults.marketing} className={checkbox} />
        <span><span className="font-medium text-ink">Marketing.</span> Email me about mixers and product updates.</span>
      </label>
      <FormMessage state={form.state} />
      <SubmitButton pending={form.pending} className="btn-secondary">Save consent preferences</SubmitButton>
    </form>
  );
}

/** Data rights: download everything as JSON, or permanently delete the account. */
export function DataRights({ isDemoAccount }: { isDemoAccount: boolean }) {
  const [open, setOpen] = useState(false);
  const form = useServerForm(deleteAccountAction);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {/* A plain link: the route sets Content-Disposition so the browser downloads a JSON file. */}
      <a href="/api/me/export" className="btn-secondary" download>
        <Download size={16} aria-hidden /> Download my data (JSON)
      </a>
      <button type="button" className="btn-danger" onClick={() => setOpen(true)}>
        <Trash2 size={16} aria-hidden /> Delete my account
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete your account?">
        <form onSubmit={form.onSubmit} className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>Your profile, answers, messages, ledger, orders and reports are permanently deleted. This cannot be undone.</li>
            <li>Any open Co-Ops end now and the other person gets their deposit back in full.</li>
            <li>Your eLitmus ID is released so it is no longer linked to this account.</li>
          </ul>
          {isDemoAccount && <p className="demo-note">This is a shared demo account, so deletion is blocked. Sign up with your own account to try it for real.</p>}
          <div>
            <label htmlFor="delete-confirm" className="label">Type DELETE to confirm</label>
            <input id="delete-confirm" name="confirm" className="input max-w-48 font-mono" autoComplete="off" required />
          </div>
          <FormMessage state={form.state} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Keep my account</button>
            <SubmitButton pending={form.pending} className="btn-danger" pendingText="Deleting…">Permanently delete</SubmitButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
