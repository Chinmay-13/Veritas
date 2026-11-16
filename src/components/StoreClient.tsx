"use client";
import { CreditCard } from "lucide-react";
import { useState } from "react";
import { checkoutAction } from "@/app/actions/store";
import { FormMessage } from "@/components/ui/FormMessage";
import { Modal } from "@/components/ui/Modal";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { useServerForm } from "@/components/ui/useServerForm";

/**
 * A "Buy" button that opens the demo checkout modal.
 * No card details are requested or stored: the payment is simulated behind the
 * PaymentProvider interface in src/lib/payments.ts.
 */
export function CheckoutButton({
  product,
  title,
  priceLabel,
  buttonLabel,
  summaryLines,
  hubOptions,
  defaultHub,
  mixerId,
  secondary = false,
}: {
  product: "cohort_pass" | "mixer_seat" | "credit_topup";
  title: string;
  priceLabel: string;
  buttonLabel: string;
  summaryLines: string[];
  /** Cohort pass only: hubs the user can choose. */
  hubOptions?: { id: string; label: string }[];
  defaultHub?: string;
  /** Mixer only. */
  mixerId?: string;
  secondary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const form = useServerForm(checkoutAction);
  const done = form.state?.ok === true;

  return (
    <>
      <button type="button" className={`${secondary ? "btn-secondary" : "btn-primary"} w-full`} onClick={() => setOpen(true)}>{buttonLabel}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        {done ? (
          <div className="space-y-4">
            <FormMessage state={form.state} />
            <button type="button" className="btn-primary" onClick={() => setOpen(false)}>Done</button>
          </div>
        ) : (
          <form onSubmit={form.onSubmit} className="space-y-4">
            <input type="hidden" name="product" value={product} />
            {mixerId && <input type="hidden" name="mixerId" value={mixerId} />}
            <p className="demo-note text-sm">
              <strong>Demo payment, no real money.</strong> No card or UPI details are requested or stored. Confirming simulates a successful payment so you can see the entitlement take effect.
            </p>
            {hubOptions && (
              <div>
                <label htmlFor="pass-hub" className="label">Which hub are you relocating to?</label>
                <select id="pass-hub" name="hub" required defaultValue={defaultHub ?? hubOptions[0]?.id} className="input">
                  {hubOptions.map((hub) => <option key={hub.id} value={hub.id}>{hub.label}</option>)}
                </select>
              </div>
            )}
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
              {summaryLines.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <div className="flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2.5">
              <span className="text-sm text-ink-soft">Total</span>
              <span className="tnum font-serif text-xl font-semibold">{priceLabel}</span>
            </div>
            <FormMessage state={form.state} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <SubmitButton pending={form.pending} pendingText="Processing…"><CreditCard size={16} aria-hidden /> Pay {priceLabel} (demo)</SubmitButton>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
