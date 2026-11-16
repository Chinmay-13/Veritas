"use client";
import { cancelVerificationAction, consentAction, loginAction, otpAction, signupAction, verificationAction } from "@/app/actions/auth";
import { APP_NAME } from "@/config/brand";
import { FormMessage } from "@/components/ui/FormMessage";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { useServerForm } from "@/components/ui/useServerForm";

/** Email + password form used for both login and step 1 of sign-up. */
export function CredentialsForm({ mode }: { mode: "login" | "signup" }) {
  const form = useServerForm(mode === "login" ? loginAction : signupAction);
  return (
    <form onSubmit={form.onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" placeholder="you@example.com" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} className="input" />
        {mode === "signup" && <p className="help">At least 8 characters. Stored only as a one-way hash.</p>}
      </div>
      <FormMessage state={form.state} />
      <SubmitButton pending={form.pending} className="btn-primary w-full">{mode === "login" ? "Log in" : "Create account"}</SubmitButton>
    </form>
  );
}

/** Step 2: DPDP-style consent. One required consent, two optional ones, and the 18+ confirmation. */
export function ConsentForm() {
  const form = useServerForm(consentAction);
  const checkbox = "mt-1 h-4 w-4 shrink-0 accent-[var(--color-brand)]";
  return (
    <form onSubmit={form.onSubmit} className="space-y-5">
      <div className="rounded-lg border border-line bg-paper p-4 text-sm text-ink-soft">
        <p className="font-medium text-ink">What we collect and why</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Email and password hash: to log you in.</li>
          <li>eLitmus ID, batch year and metro hub: to verify you belong to the cohort and show a verified badge.</li>
          <li>Your four non-negotiables and Co-Op answers: to calculate compatibility and show it to people you match with.</li>
          <li>Birth year only (not your date of birth): to confirm you are an adult.</li>
        </ul>
        <p className="mt-2">We do not sell data, we do not use it for advertising, and you can download or delete everything from the Safety Center at any time.</p>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="matching" className={checkbox} required />
        <span>
          <span className="font-medium text-ink">Required.</span> I consent to {APP_NAME} using my profile, non-negotiables and Co-Op answers to match me with other verified members.
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="badge" className={checkbox} defaultChecked />
        <span>
          <span className="font-medium text-ink">Optional.</span> Show a &ldquo;Verified via eLitmus&rdquo; badge with my batch and hub on my profile.
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="marketing" className={checkbox} />
        <span>
          <span className="font-medium text-ink">Optional.</span> Email me about mixers and product updates. Off by default.
        </span>
      </label>

      <div className="hairline pt-4">
        <label htmlFor="birthYear" className="label">Birth year</label>
        <input id="birthYear" name="birthYear" type="number" inputMode="numeric" required min={1900} max={2100} placeholder="e.g. 2000" className="input max-w-40" />
        <label className="mt-3 flex items-start gap-3 text-sm">
          <input type="checkbox" name="adult" className={checkbox} required />
          <span>I confirm I am 18 years of age or older.</span>
        </label>
      </div>

      <FormMessage state={form.state} />
      <SubmitButton pending={form.pending}>Agree and continue</SubmitButton>
    </form>
  );
}

/** Step 3a (SIMULATED): eLitmus ID + work email. */
export function VerificationForm({ sampleIds }: { sampleIds: string[] }) {
  const form = useServerForm(verificationAction);
  return (
    <form onSubmit={form.onSubmit} className="space-y-4">
      <p className="demo-note">
        <strong>Simulated for this demo.</strong> There is no live connection to eLitmus. IDs are checked against a seeded sample registry. Use any of these unused sample IDs:{" "}
        {sampleIds.length > 0 ? sampleIds.map((id) => <code key={id} className="mx-0.5 rounded bg-white px-1 py-0.5 font-mono">{id}</code>) : "none left, ask the founder to re-seed."}
      </p>
      <div>
        <label htmlFor="elitmusId" className="label">eLitmus ID</label>
        <input id="elitmusId" name="elitmusId" required className="input font-mono uppercase" placeholder="ELM-2022-483920" defaultValue={sampleIds[0] ?? ""} />
        <p className="help">Your batch year is taken from your eLitmus record, so it cannot be mis-stated.</p>
      </div>
      <div>
        <label htmlFor="workEmail" className="label">Work email</label>
        <input id="workEmail" name="workEmail" type="email" required className="input" placeholder="you@company.com" />
        <p className="help">Used once to send a code. It is not stored and never shown to anyone. In this demo no email is actually sent.</p>
      </div>
      <FormMessage state={form.state} />
      <SubmitButton pending={form.pending}>Send verification code</SubmitButton>
    </form>
  );
}

/** Step 3b (SIMULATED): OTP. The demo code is shown in a labelled banner. */
export function OtpForm({ demoOtp, elitmusId }: { demoOtp: string; elitmusId: string }) {
  const form = useServerForm(otpAction);
  return (
    <div className="space-y-4">
      <p className="demo-note" data-testid="demo-otp">
        <strong>Simulated OTP.</strong> No email was sent. Your demo code for <code className="font-mono">{elitmusId}</code> is{" "}
        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-sm font-semibold tracking-widest">{demoOtp}</code>
      </p>
      <form onSubmit={form.onSubmit} className="space-y-4">
        <div>
          <label htmlFor="otp" className="label">6-digit code</label>
          <input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" required pattern="\d{6}" maxLength={6} className="input max-w-40 font-mono tracking-widest" />
        </div>
        <FormMessage state={form.state} />
        <SubmitButton pending={form.pending}>Verify</SubmitButton>
      </form>
      <form action={cancelVerificationAction}>
        <button type="submit" className="text-sm text-brand underline underline-offset-2">Use a different eLitmus ID</button>
      </form>
    </div>
  );
}
