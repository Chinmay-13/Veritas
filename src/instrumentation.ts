/**
 * Runs once when the Next.js server starts.
 * In local mode (DATABASE_URL=pglite://memory) it creates the tables and seeds the demo data.
 * With a real Neon database it does nothing: use `npm run db:push` and `npm run db:seed`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureLocalDatabaseReady } = await import("@/db/client");
  await ensureLocalDatabaseReady();
}
