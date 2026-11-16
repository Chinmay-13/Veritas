"use client";

/** Friendly error state for any page that throws. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-semibold">We could not load this page</h1>
      <p className="mt-3 text-ink-soft">Nothing was charged or lost. Please try again.</p>
      <button type="button" onClick={reset} className="btn-primary mt-6">Try again</button>
    </main>
  );
}
