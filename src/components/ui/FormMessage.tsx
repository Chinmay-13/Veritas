"use client";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ActionState } from "@/lib/actionState";

/** Shows the result of a server action: an inline error, or a success confirmation. */
export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p role="status" className="reveal flex items-start gap-2 rounded-lg border border-verified/20 bg-verified-soft px-3 py-2 text-sm text-verified-ink">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger-ink">
      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
      {state.message}
    </p>
  );
}
