import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConsentForm, CredentialsForm, OtpForm, VerificationForm } from "@/components/forms/AuthForms";
import { NonNegotiablesForm, ProfileForm } from "@/components/forms/ProfileForms";
import { APP_NAME } from "@/config/brand";
import { COHORT_BALANCING_RULES, DEMO_SETTINGS, TRUST_AND_DEPOSIT_RULES } from "@/config/businessRules";
import { demoOtpFor } from "@/lib/session";
import { getCurrentUser } from "@/server/auth";
import { currentSignupStep, getSampleElitmusIds, type SignupStep } from "@/server/onboarding";

export const metadata: Metadata = { title: "Sign up" };

const STEPS: { id: SignupStep | "account"; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "consent", label: "Consent" },
  { id: "verify", label: "Verify" },
  { id: "profile", label: "Profile" },
  { id: "nonNegotiables", label: "Non-negotiables" },
];

/** The progress indicator at the top of the wizard. */
function Stepper({ activeIndex }: { activeIndex: number }) {
  return (
    <ol className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Sign-up progress">
      {STEPS.map((step, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <li key={step.id} className={`flex items-center gap-1.5 ${active ? "font-semibold text-brand-deep" : done ? "text-verified-ink" : "text-ink-soft"}`} aria-current={active ? "step" : undefined}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${active ? "border-brand bg-brand-soft" : done ? "border-verified/40 bg-verified-soft" : "border-line"}`}>
              {done ? <Check size={11} aria-hidden /> : index + 1}
            </span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user?.role === "admin") redirect("/admin");

  const step: SignupStep | "account" = user ? currentSignupStep(user) : "account";
  if (step === "done") redirect("/discover");
  const activeIndex = STEPS.findIndex((s) => s.id === (step === "otp" ? "verify" : step));

  const headings: Record<string, { title: string; intro: string }> = {
    account: { title: `Join ${APP_NAME}`, intro: `For eLitmus-verified ${COHORT_BALANCING_RULES.minBatchYear}–${COHORT_BALANCING_RULES.maxBatchYear} graduates. Takes about three minutes.` },
    consent: { title: "Your data, your call", intro: "Before anything else: exactly what we collect, why, and what is optional." },
    verify: { title: "Verify your eLitmus identity", intro: "Verification is what keeps the pool real. Every member has passed this step." },
    otp: { title: "Enter your verification code", intro: "One last check that the eLitmus record is yours." },
    profile: { title: "Your profile", intro: "Short on purpose. The Co-Op does the real talking." },
    nonNegotiables: { title: "Your four long-term non-negotiables", intro: `These drive your compatibility scores. You start with ${TRUST_AND_DEPOSIT_RULES.initialCredits} Trust Credits when you finish.` },
  };
  const heading = headings[step];

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Stepper activeIndex={activeIndex} />
      <h1 className="text-3xl font-semibold">{heading.title}</h1>
      <p className="mt-2 text-ink-soft">{heading.intro}</p>

      <div className="card mt-6 p-5 sm:p-6">
        {step === "account" && <CredentialsForm mode="signup" />}
        {step === "consent" && <ConsentForm />}
        {step === "verify" && <VerificationForm sampleIds={DEMO_SETTINGS.demoMode ? await getSampleElitmusIds() : []} />}
        {step === "otp" && user?.pendingElitmusId && <OtpForm demoOtp={demoOtpFor(user.id, user.pendingElitmusId)} elitmusId={user.pendingElitmusId} />}
        {step === "profile" && user && (
          <ProfileForm
            isSignup
            batchYear={user.batchYear}
            phPercentile={user.phPercentile}
            defaults={{ firstName: "", hub: "", roleFamily: "", gender: "", interestedIn: "", thesis: "", showPercentile: false }}
          />
        )}
        {step === "nonNegotiables" && user && <NonNegotiablesForm isSignup defaults={user.nonNegotiables} />}
      </div>

      {step === "account" && (
        <p className="mt-4 text-sm text-ink-soft">
          Already have an account? <Link href="/login" className="font-medium text-brand underline underline-offset-2">Log in</Link>
        </p>
      )}
    </main>
  );
}
