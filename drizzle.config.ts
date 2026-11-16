import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Used by `npm run db:push` (applies src/db/schema.ts to the Neon database)
// and `npm run db:generate` (writes SQL into ./drizzle for the local PGlite database).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
