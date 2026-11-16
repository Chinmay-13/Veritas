"use client";
import { useState } from "react";
import { startCoOpAction } from "@/app/actions/matches";
import { FormMessage } from "@/components/ui/FormMessage";
import { Modal } from "@/components/ui/Modal";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { useServerForm } from "@/components/ui/useServerForm";

/**
 * The Discover call-to-action. Opens a confirm modal that explains the deposit rules.
 * All the text comes in as props generated from config (src/lib/rulesCopy.ts), and
 * the server re-checks every rule when the form is submitted.
 */
export function StartCoOpButton({
  targetId,
  targetName,
  ctaText,
  rulesText,
  fairnessLines,
  disabledReason,
  scripted,
}: {
  targetId: string;
  targetName: string;
  ctaText: string;
  rulesText: string;
  fairnessLines: string[];
  /** If set, the viewer cannot start right now: the button is disabled and this is shown. */
  disabledReason: string | null;
  scripted: "replies" | "goes_silent" | null;
}) {
  const [open, setOpen] = useState(false);
  const form = useServerForm(startCoOpAction);

  if (disabledReason) {
    return (
      <div>
        <button type="button" className="btn-primary w-full" disabled>{ctaText}</button>
        <p className="mt-2 text-xs text-danger-ink">{disabledReason}</p>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="btn-primary w-full" onClick={() => setOpen(true)}>{ctaText}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Start a Co-Op with ${targetName}?`}>
        <p className="text-sm leading-relaxed text-ink-soft">{rulesText}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ink-soft">
          {fairnessLines.map((line) => <li key={line}>{line}</li>)}
        </ul>
        {scripted && (
          <p className="demo-note mt-3">
            <strong>Demo profile.</strong> {targetName} is fictional and scripted: they join and answer the Co-Op straight away
            {scripted === "goes_silent" ? ", then never reply in chat, so you can see ghosting compensation with the Fast-forward demo tool." : " and send short canned chat replies."}
          </p>
        )}
        <form onSubmit={form.onSubmit} className="mt-4 space-y-3">
          <input type="hidden" name="targetId" value={targetId} />
          <FormMessage state={form.state} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Not now</button>
            <SubmitButton pending={form.pending} pendingText="Placing deposit…">{ctaText}</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
