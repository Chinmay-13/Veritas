"use client";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

/** A submit button that disables itself and shows a spinner while its form's server action runs. */
export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText,
  pending: pendingProp,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  /** Pass `form.pending` from useServerForm. Plain <form action> forms can omit it. */
  pending?: boolean;
  disabled?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
