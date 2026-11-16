import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-3xl font-semibold">This page does not exist</h1>
      <p className="mt-3 text-ink-soft">It may have been closed, or the link is wrong.</p>
      <Link href="/" className="btn-primary mt-6">Back to the start</Link>
    </main>
  );
}
