/**
 * `npm run db:reset-demo` — restores only the seeded demo accounts to their starting state.
 * Accounts created by real sign-ups are never touched.
 */
import "dotenv/config";
import { resetDemoData } from "../src/db/seed";

resetDemoData()
  .then(() => {
    console.log("Demo data reset.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Reset failed:", error);
    process.exit(1);
  });
