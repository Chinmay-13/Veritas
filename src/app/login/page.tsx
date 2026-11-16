import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { demoLoginAction } from "@/app/actions/auth";
import { CredentialsForm } from "@/components/forms/AuthForms";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { APP_NAME } from "@/config/brand";
import { DEMO_SETTINGS } from "@/config/businessRules";
import { DEMO_PASSWORD, DEMO_PERSONAS } from "@/data/seedProfiles";
import { getCurrentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : user.profileCompletedAt ? "/discover" : "/signup");

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 lg:grid-cols-[minmax(0,380px)_1fr]">
      <section>
        <p className="eyebrow">Welcome back</p>
        <h1 className="mt-1 text-3xl font-semibold">Log in to {APP_NAME}</h1>
        <div className="card mt-6 p-5">
          <CredentialsForm mode="login" />
        </div>
        <p className="mt-4 text-sm text-ink-soft">
          New here? <Link href="/signup" className="font-medium text-brand underline underline-offset-2">Create a profile</Link>
        </p>
      </section>

      {DEMO_SETTINGS.demoMode && (
        <section aria-labelledby="demo-logins">
          <p className="eyebrow">For evaluators</p>
          <h2 id="demo-logins" className="mt-1 text-2xl font-semibold">One-click demo logins</h2>
          <p className="mt-2 text-sm text-ink-soft">
            All four accounts are fictional seed data. The password for each is <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-ink">{DEMO_PASSWORD}</code>.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {DEMO_PERSONAS.map((persona) => (
              <form key={persona.key} action={demoLoginAction} className="card flex flex-col p-4">
                <input type="hidden" name="persona" value={persona.key} />
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-sans text-base font-semibold">{persona.label}</h3>
                  <span className="pill-brand">{persona.tag}</span>
                </div>
                <p className="mt-1 font-mono text-xs break-all text-ink-soft">{persona.email}</p>
                <p className="mt-2 flex-1 text-sm text-ink-soft">{persona.blurb}</p>
                <SubmitButton className="btn-secondary mt-3 w-full" pendingText="Logging in…">Log in as {persona.label}</SubmitButton>
              </form>
            ))}
          </div>
          <p className="demo-note mt-4">
            Demo accounts are shared by everyone using this link. If something looks odd, open the <strong>Demo</strong> menu in the top bar and choose <strong>Reset Demo Data</strong>.
          </p>
        </section>
      )}
    </main>
  );
}
