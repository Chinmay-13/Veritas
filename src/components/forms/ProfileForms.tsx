"use client";
import { nonNegotiablesAction, profileAction } from "@/app/actions/auth";
import { COHORT_BALANCING_RULES } from "@/config/businessRules";
import { DIMENSIONS, GENDERS, HUBS, INTERESTED_IN, ROLE_FAMILIES, type NonNegotiables } from "@/data/nonNegotiables";
import { FormMessage } from "@/components/ui/FormMessage";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { useServerForm } from "@/components/ui/useServerForm";

export type ProfileDefaults = {
  firstName: string;
  hub: string;
  roleFamily: string;
  gender: string;
  interestedIn: string;
  thesis: string;
  showPercentile: boolean;
};

/** Step 4 of sign-up and the profile editor. */
export function ProfileForm({ defaults, batchYear, phPercentile, isSignup }: { defaults: ProfileDefaults; batchYear: number | null; phPercentile: number | null; isSignup: boolean }) {
  const form = useServerForm(profileAction);
  return (
    <form onSubmit={form.onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className="label">First name</label>
          <input id="firstName" name="firstName" required maxLength={40} defaultValue={defaults.firstName} className="input" autoComplete="given-name" />
          <p className="help">Only your first name is ever shown.</p>
        </div>
        <div>
          <span className="label">Batch (verified)</span>
          <p className="input flex items-center bg-paper text-ink-soft">{batchYear ?? "—"} · from your eLitmus record</p>
        </div>
        <div>
          <label htmlFor="hub" className="label">Metro hub</label>
          <select id="hub" name="hub" required defaultValue={defaults.hub} className="input">
            <option value="" disabled>Choose…</option>
            {HUBS.map((h) => <option key={h.id} value={h.id}>{h.label} ({h.areas})</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="roleFamily" className="label">Role family</label>
          <select id="roleFamily" name="roleFamily" required defaultValue={defaults.roleFamily} className="input">
            <option value="" disabled>Choose…</option>
            {ROLE_FAMILIES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <p className="help">We show a role family, never an employer or salary tier.</p>
        </div>
        <div>
          <label htmlFor="gender" className="label">I am a</label>
          <select id="gender" name="gender" required defaultValue={defaults.gender} className="input">
            <option value="" disabled>Choose…</option>
            {GENDERS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="interestedIn" className="label">Interested in</label>
          <select id="interestedIn" name="interestedIn" required defaultValue={defaults.interestedIn} className="input">
            <option value="" disabled>Choose…</option>
            {INTERESTED_IN.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="thesis" className="label">Relationship thesis</label>
        <textarea id="thesis" name="thesis" required minLength={30} maxLength={400} rows={4} defaultValue={defaults.thesis} className="input" placeholder="In two or three sentences: what are you building towards, and what kind of partner fits that?" />
        <p className="help">30–400 characters. Contact details are automatically hidden here.</p>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="showPercentile" defaultChecked={defaults.showPercentile} className="mt-1 h-4 w-4 accent-[var(--color-brand)]" />
        <span>Show my pH percentile{phPercentile ? ` (${phPercentile})` : ""} on my dossier. Hidden by default: compatibility is not a ranking.</span>
      </label>

      {isSignup && (
        <div>
          <label htmlFor="referralCode" className="label">Referral code <span className="font-normal text-ink-soft">(optional)</span></label>
          <input id="referralCode" name="referralCode" maxLength={20} className="input max-w-56 font-mono uppercase" placeholder="e.g. ARJUN22" />
          <p className="help">
            From a verified batchmate. They receive {COHORT_BALANCING_RULES.referralBoostCredits} Trust Credits
            {COHORT_BALANCING_RULES.referralSkipsWaitlist ? " and you skip the waitlist." : "."}
          </p>
        </div>
      )}

      <FormMessage state={form.state} />
      <SubmitButton pending={form.pending}>{isSignup ? "Continue" : "Save profile"}</SubmitButton>
    </form>
  );
}

/** Step 5 of sign-up and the profile editor: four answers, each "Must match" or "Preferred". */
export function NonNegotiablesForm({ defaults, isSignup }: { defaults: NonNegotiables | null; isSignup: boolean }) {
  const form = useServerForm(nonNegotiablesAction);
  return (
    <form onSubmit={form.onSubmit} className="space-y-6">
      {DIMENSIONS.map((dimension, index) => {
        const current = defaults?.[dimension.key];
        return (
          <fieldset key={dimension.key} className="rounded-xl border border-line bg-surface p-4">
            <legend className="px-1 text-sm font-semibold text-ink">
              {index + 1}. {dimension.label}
            </legend>
            <p className="text-sm text-ink-soft">{dimension.question}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {dimension.options.map((option) => (
                <label key={option.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm has-checked:border-brand has-checked:bg-brand-soft">
                  <input type="radio" name={dimension.key} value={option.id} required defaultChecked={current?.value === option.id} className="h-4 w-4 accent-[var(--color-brand)]" />
                  {option.label}
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" role="radiogroup" aria-label={`How strict is ${dimension.label}?`}>
              <span className="text-ink-soft">How strict?</span>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name={`${dimension.key}_must`} value="preferred" defaultChecked={!current?.mustMatch} className="h-4 w-4 accent-[var(--color-brand)]" />
                Preferred
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name={`${dimension.key}_must`} value="must" defaultChecked={Boolean(current?.mustMatch)} className="h-4 w-4 accent-[var(--color-brand)]" />
                Must match <span className="text-ink-soft">(conflicts are hidden from your feed)</span>
              </label>
            </div>
          </fieldset>
        );
      })}
      <FormMessage state={form.state} />
      <SubmitButton pending={form.pending}>{isSignup ? "Finish and see my matches" : "Save non-negotiables"}</SubmitButton>
    </form>
  );
}
