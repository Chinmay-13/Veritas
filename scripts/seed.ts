/**
 * `npm run db:seed` — creates the simulated eLitmus registry, the fictional demo
 * accounts and their starting state. Safe to run repeatedly.
 * Requires DATABASE_URL (run `npm run db:push` first to create the tables).
 */
import "dotenv/config";
import { seedDatabase } from "../src/db/seed";

seedDatabase()
  .then(() => {
    console.log("Seed complete: demo accounts and registry are ready.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
