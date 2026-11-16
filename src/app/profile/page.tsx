import type { Metadata } from "next";
import { Avatar } from "@/components/Avatar";
import { NonNegotiablesForm, ProfileForm } from "@/components/forms/ProfileForms";
import { PageHeader } from "@/components/PageHeader";
import { avatarFor } from "@/lib/avatar";
import { verifiedBadgeText } from "@/lib/rulesCopy";
import { requireMember } from "@/server/auth";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireMember();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader eyebrow="Profile" title="Your profile" description="Changes apply immediately: compatibility scores are recalculated from your answers every time a feed loads." />

      <section className="card flex items-center gap-4 p-5">
        <Avatar avatar={avatarFor(user.id, true)} size={72} label="Your avatar" />
        <div>
          <p className="font-serif text-xl font-semibold">{user.firstName}</p>
          <p className="pill-verified mt-1">{verifiedBadgeText(user)}</p>
          <p className="mt-2 text-xs text-ink-soft">Avatars are generated illustrations. We never ask for or show real photos in this demo.</p>
        </div>
      </section>

      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="profile-details">
        <h2 id="profile-details" className="mb-4 text-xl font-semibold">Details</h2>
        <ProfileForm
          isSignup={false}
          batchYear={user.batchYear}
          phPercentile={user.phPercentile}
          defaults={{
            firstName: user.firstName ?? "",
            hub: user.hub ?? "",
            roleFamily: user.roleFamily ?? "",
            gender: user.gender ?? "",
            interestedIn: user.interestedIn ?? "",
            thesis: user.thesis ?? "",
            showPercentile: user.showPercentile,
          }}
        />
      </section>

      <section className="mt-6" aria-labelledby="non-negotiables">
        <h2 id="non-negotiables" className="mb-4 text-xl font-semibold">Long-term non-negotiables</h2>
        <NonNegotiablesForm isSignup={false} defaults={user.nonNegotiables} />
      </section>
    </main>
  );
}
