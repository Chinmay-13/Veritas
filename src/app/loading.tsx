/** Skeleton shown while a page's server data loads. */
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton mt-3 h-9 w-72" />
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="skeleton h-56" />
        <div className="skeleton h-56" />
      </div>
    </main>
  );
}
