import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/config/brand";

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-24">
      <p className="eyebrow">{APP_NAME}</p>
      <h1 className="mt-3 text-4xl leading-tight font-semibold sm:text-5xl">{APP_TAGLINE}</h1>
      <p className="mt-5 text-lg text-ink-soft">{APP_DESCRIPTION}</p>
    </main>
  );
}
