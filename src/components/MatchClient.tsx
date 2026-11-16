"use client";
/**
 * Client-side pieces of the match page: the Co-Op form, the polling chat,
 * the Honest Closure modal and the Block & Report modal.
 *
 * None of these decide anything. They collect input, call a server action, and
 * show what the server returned.
 */
import { Flag, Lock, Send, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { blockAndReportAction, closeMatchAction, sendMessageAction, submitCoOpAction } from "@/app/actions/matches";
import { FormMessage } from "@/components/ui/FormMessage";
import { Modal } from "@/components/ui/Modal";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { useServerForm } from "@/components/ui/useServerForm";
import { COOP_REASON_MAX_LENGTH, COOP_SCENARIOS } from "@/data/coopScenarios";
import { CLOSURE_TEMPLATES, REPORT_REASONS } from "@/data/copy";
import type { ChatState } from "@/server/matchViews";

/** How often the chat asks the server for new messages. Polling, because serverless hosting has no websockets. */
const CHAT_POLL_INTERVAL_MS = 4000;

// ---------------------------------------------------------------------------
// Co-Op form
// ---------------------------------------------------------------------------

export function CoOpForm({ matchId, submitLabel, joinNote }: { matchId: string; submitLabel: string; joinNote: string | null }) {
  const form = useServerForm(submitCoOpAction);
  return (
    <form onSubmit={form.onSubmit} className="space-y-5">
      <input type="hidden" name="matchId" value={matchId} />
      {COOP_SCENARIOS.map((scenario, index) => (
        <fieldset key={scenario.id} className="rounded-xl border border-line bg-surface p-4">
          <legend className="px-1 text-xs font-semibold tracking-wider text-ink-soft uppercase">
            Scenario {index + 1} of {COOP_SCENARIOS.length} · {scenario.title}
          </legend>
          <p className="font-serif text-lg text-ink">{scenario.prompt}</p>
          <div className="mt-3 grid gap-2">
            {scenario.options.map((option) => (
              <label key={option.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm has-checked:border-brand has-checked:bg-brand-soft">
                <input type="radio" name={`option_${scenario.id}`} value={option.id} required className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]" />
                {option.label}
              </label>
            ))}
          </div>
          <label htmlFor={`reason_${scenario.id}`} className="label mt-3">
            Why? <span className="font-normal text-ink-soft">(optional, {COOP_REASON_MAX_LENGTH} characters)</span>
          </label>
          <input id={`reason_${scenario.id}`} name={`reason_${scenario.id}`} maxLength={COOP_REASON_MAX_LENGTH} className="input" placeholder="One line your match will see next to your choice" />
        </fieldset>
      ))}
      {joinNote && <p className="rounded-lg border border-credit/30 bg-credit-soft px-3 py-2 text-sm text-credit-ink">{joinNote}</p>}
      <FormMessage state={form.state} />
      <SubmitButton pending={form.pending} pendingText="Locking in…">{submitLabel}</SubmitButton>
      <p className="text-xs text-ink-soft">Answers cannot be changed once submitted, and stay hidden from the other person until you have both answered.</p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Protected chat (polling)
// ---------------------------------------------------------------------------

export function Chat({ matchId, initial, canSend, partnerName }: { matchId: string; initial: ChatState; canSend: boolean; partnerName: string }) {
  const router = useRouter();
  const [chat, setChat] = useState<ChatState>(initial);
  const [sendState, sendAction, sending] = useActionState(sendMessageAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(initial.status);

  // Fresh data from the server (after a send or a page refresh) replaces what polling had.
  const [lastInitial, setLastInitial] = useState(initial);
  if (lastInitial !== initial) {
    setLastInitial(initial);
    setChat(initial);
  }

  // Poll for new messages. If the match status changed (closed, ghosted), reload the whole page.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`/api/matches/${matchId}/messages`, { cache: "no-store" });
        if (!response.ok) return;
        const next: ChatState = await response.json();
        if (next.status !== statusRef.current) {
          statusRef.current = next.status;
          router.refresh();
        }
        setChat((current) => (next.messages.length !== current.messages.length || next.status !== current.status ? next : current));
      } catch {
        // A failed poll is harmless: the next one will try again.
      }
    }, CHAT_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [matchId, router]);

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.messages.length]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (!String(formData.get("body") ?? "").trim()) return;
    formRef.current?.reset();
    startTransition(() => sendAction(formData));
  };

  return (
    <section aria-label={`Chat with ${partnerName}`} className="card overflow-hidden">
      <div className={`flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs font-medium ${chat.shieldActive ? "bg-credit-soft text-credit-ink" : "bg-verified-soft text-verified-ink"}`} role="status">
        {chat.shieldActive ? <Lock size={13} aria-hidden /> : <ShieldCheck size={13} aria-hidden />}
        <span data-testid="shield-status">Safety Shield · {chat.shieldText}</span>
      </div>

      <div ref={listRef} className="flex max-h-[28rem] min-h-48 flex-col gap-2 overflow-y-auto px-4 py-4" aria-live="polite">
        {chat.messages.length === 0 && <p className="m-auto text-sm text-ink-soft">No messages yet. Say hello: the Co-Op answers above are a good place to start.</p>}
        {chat.messages.map((message) =>
          message.kind === "system" ? (
            <p key={message.id} className="mx-auto my-1 max-w-md rounded-full bg-paper px-3 py-1 text-center text-xs text-ink-soft">{message.body}</p>
          ) : (
            <div key={message.id} className={`flex ${message.mine ? "justify-end" : "justify-start"}`}>
              <p
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap ${
                  message.mine ? "rounded-br-sm bg-brand-deep text-white" : "rounded-bl-sm border border-line bg-paper text-ink"
                } ${message.kind === "closure" ? "italic" : ""}`}
              >
                {message.kind === "closure" && <span className="mb-0.5 block text-[10px] font-semibold tracking-wider uppercase not-italic opacity-75">Honest Closure</span>}
                {message.body}
              </p>
            </div>
          ),
        )}
      </div>

      {canSend ? (
        <form ref={formRef} onSubmit={onSubmit} className="border-t border-line p-3">
          <input type="hidden" name="matchId" value={matchId} />
          <div className="flex items-end gap-2">
            <label htmlFor="chat-body" className="sr-only">Message</label>
            <textarea
              id="chat-body"
              name="body"
              rows={1}
              maxLength={1000}
              required
              placeholder={`Message ${partnerName}…`}
              className="input max-h-32 min-h-10 flex-1 resize-y"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button type="submit" className="btn-primary px-3" disabled={sending} aria-label="Send message">
              <Send size={16} aria-hidden />
            </button>
          </div>
          {sendState && !sendState.ok && <div className="mt-2"><FormMessage state={sendState} /></div>}
          {sendState?.ok && sendState.message !== "Sent." && <p className="mt-2 text-xs text-credit-ink" role="status">{sendState.message}</p>}
        </form>
      ) : (
        <p className="border-t border-line px-4 py-3 text-center text-sm text-ink-soft">This conversation is closed.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Honest Closure
// ---------------------------------------------------------------------------

export function ClosureButton({
  matchId,
  partnerName,
  respectful,
  outcomeLines,
  gateText,
  buttonLabel,
}: {
  matchId: string;
  partnerName: string;
  /** Whether closing right now passes the Minimum Effort Gate (decided on the server). */
  respectful: boolean;
  /** Exactly what the user gets back, generated on the server from the same function used for the real closure. */
  outcomeLines: string[];
  gateText: string;
  buttonLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<string>(CLOSURE_TEMPLATES[0].id);
  const form = useServerForm(closeMatchAction);
  const done = form.state?.ok === true;

  return (
    <>
      <button type="button" className="btn-secondary w-full" onClick={() => setOpen(true)}>{buttonLabel}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={respectful ? "Honest Closure" : "Close early?"}>
        {done ? (
          <div className="space-y-4">
            <FormMessage state={form.state} />
            <button type="button" className="btn-primary" onClick={() => setOpen(false)}>Done</button>
          </div>
        ) : (
          <form onSubmit={form.onSubmit} className="space-y-4">
            <input type="hidden" name="matchId" value={matchId} />
            <p className="text-sm text-ink-soft">Ending things clearly is kinder than fading out. {partnerName} will see your note and gets their own deposit back in full.</p>

            <div className={`rounded-lg border px-3 py-2.5 text-sm ${respectful ? "border-verified/20 bg-verified-soft text-verified-ink" : "border-credit/30 bg-credit-soft text-credit-ink"}`}>
              <p className="font-semibold">{respectful ? "You have passed the Minimum Effort Gate." : "You have not passed the Minimum Effort Gate yet."}</p>
              <p className="mt-0.5 text-xs">{gateText}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {outcomeLines.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>

            <fieldset>
              <legend className="label">Your closing note</legend>
              <div className="grid gap-2">
                {CLOSURE_TEMPLATES.map((option) => (
                  <label key={option.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-brand has-checked:bg-brand-soft">
                    <input type="radio" name="template" value={option.id} checked={template === option.id} onChange={() => setTemplate(option.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]" />
                    {option.text}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="closure-note" className="label">{template === "custom" ? "Your note" : "Add a personal line (optional)"}</label>
              <textarea id="closure-note" name="note" rows={2} maxLength={300} required={template === "custom"} className="input" />
            </div>

            <FormMessage state={form.state} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Keep talking</button>
              <SubmitButton pending={form.pending} pendingText="Closing…">{respectful ? "Send Honest Closure" : "Close early"}</SubmitButton>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Block & Report
// ---------------------------------------------------------------------------

export function ReportButton({ matchId, partnerName }: { matchId: string; partnerName: string }) {
  const [open, setOpen] = useState(false);
  const form = useServerForm(blockAndReportAction);
  return (
    <>
      <button type="button" className="btn-ghost w-full text-danger-ink hover:bg-danger-soft hover:text-danger-ink" onClick={() => setOpen(true)}>
        <Flag size={15} aria-hidden /> Block &amp; report
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Block and report ${partnerName}`}>
        <form onSubmit={form.onSubmit} className="space-y-4">
          <input type="hidden" name="matchId" value={matchId} />
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>You and {partnerName} will never see each other again.</li>
            <li>If this match is open it ends now, and both deposits are returned in full. Reporting never costs credits.</li>
            <li>The report goes to the review queue and appears in your Audit Log in the Safety Center.</li>
          </ul>
          <fieldset>
            <legend className="label">What happened?</legend>
            <div className="grid gap-2">
              {REPORT_REASONS.map((reason) => (
                <label key={reason.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-danger has-checked:bg-danger-soft">
                  <input type="radio" name="reason" value={reason.id} required className="h-4 w-4 shrink-0 accent-[var(--color-danger)]" />
                  {reason.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="report-details" className="label">Details <span className="font-normal text-ink-soft">(optional)</span></label>
            <textarea id="report-details" name="details" rows={3} maxLength={1000} className="input" placeholder="Anything that helps the reviewer understand." />
          </div>
          <FormMessage state={form.state} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <SubmitButton pending={form.pending} className="btn-danger" pendingText="Submitting…">Block and report</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
