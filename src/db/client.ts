/**
 * DATABASE CLIENT
 * ===============
 * One exported `db` used by everything in src/server.
 *
 * Two modes, chosen by the DATABASE_URL environment variable:
 *   1. postgresql://...   -> Neon serverless Postgres (production, Vercel).
 *   2. pglite://memory    -> PGlite: a real Postgres compiled to WebAssembly, running
 *                            in-process and in memory. Zero setup, used for local
 *                            runs and for the integration tests. Data resets on restart.
 *
 * Both speak the same SQL through Drizzle, so no other file knows which one is in use.
 */
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type Db = NeonDatabase<typeof schema>;
/** The `tx` object inside db.transaction(...). Has the same query methods as `db`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything you can run queries on: the database itself or an open transaction. */
export type DbOrTx = Db | Tx;

// Kept on globalThis so Next.js hot reload (dev) reuses one connection instead of opening many.
const globalStore = globalThis as unknown as { __veritasDb?: Db; __veritasLocalReady?: Promise<void> };

/** @returns true when the app is running on the local in-memory database. */
export function isLocalDatabase(): boolean {
  return (process.env.DATABASE_URL ?? "").startsWith("pglite:");
}

/** Creates the real connection. Called once, on first use. */
function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string, or use DATABASE_URL=pglite://memory for a zero-setup local run.");
  }
  if (isLocalDatabase()) {
    // Same query API as Neon; the cast only tells TypeScript to treat both drivers alike.
    return drizzlePglite(new PGlite(), { schema }) as unknown as Db;
  }
  return drizzleNeon(new Pool({ connectionString: url }), { schema });
}

/** @returns The shared database connection, creating it on first use. */
function getDb(): Db {
  if (!globalStore.__veritasDb) globalStore.__veritasDb = createDb();
  return globalStore.__veritasDb;
}

/**
 * The database handle. It is a thin Proxy so the connection is opened on FIRST USE
 * rather than at import time: that lets `next build` succeed on a machine that has
 * no DATABASE_URL, while a missing variable still fails loudly on the first query.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, property) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[property];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/**
 * LOCAL MODE ONLY: creates the tables (from the SQL in ./drizzle) and seeds the
 * demo data the first time it is called. Safe to call many times.
 * Called from src/instrumentation.ts when the server starts, and from the tests.
 */
export function ensureLocalDatabaseReady(): Promise<void> {
  if (!isLocalDatabase()) return Promise.resolve();
  if (!globalStore.__veritasLocalReady) {
    globalStore.__veritasLocalReady = (async () => {
      const local = getDb() as unknown as Parameters<typeof migrate>[0];
      await migrate(local, { migrationsFolder: path.join(process.cwd(), "drizzle") });
      const { seedDatabase } = await import("./seed");
      await seedDatabase();
    })();
  }
  return globalStore.__veritasLocalReady;
}
