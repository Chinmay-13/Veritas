# Veritas

High-trust, anti-ghosting matchmaking for verified 2020–2023 graduates. Veritas replaces swipe volume with transparent dealbreaker alignment, a three-step Co-Op scenario, protected chat, and a refundable commitment deposit.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The app uses PGlite for local/serverless-safe persistence. The included scripts are:

```bash
npm run build       # production build and TypeScript validation
npm run typecheck   # TypeScript only
npm test            # focused unit and business-rule tests
```

## Demo accounts

The login page provides one-click access to the fictional seeded personas. Every demo account uses `Veritas@123`:

| Persona | Email | Purpose |
| --- | --- | --- |
| Arjun | `arjun.2022@elitmus-demo.in` | High-trust Bengaluru user with an active Co-Op |
| Ananya | `ananya.2023@elitmus-demo.in` | Relocating product analyst |
| Rohan | `rohan.2021@elitmus-demo.in` | 58% reliability restriction edge case |

Use the **Demo** menu in the navbar to switch personas, fast-forward a match for ghosting settlement, or reset the seeded demo data.

## Product flows

- `/discover` shows curated editorial dossiers, explainable compatibility dimensions, and dealbreaker warnings.
- `/matches` runs the three practical Co-Op scenarios before protected chat unlocks.
- `/store` demonstrates relocation passes, curated mixers, and capped non-withdrawable Trust Credit top-ups.
- `/safety` demonstrates PII masking, consent/data rights, Block & Report, and the report audit log.
- `/evaluator` is the founder walkthrough for acquisition, unit economics, safety, and live code edits.

## Architecture guide

The business rules are intentionally easy to change during a technical interview:

- [`src/config/businessRules.ts`](src/config/businessRules.ts) is the single source of truth for matching weights, deposit rules, cohort balancing, pricing, and safety thresholds.
- [`src/lib/matchingEngine.ts`](src/lib/matchingEngine.ts) is a pure, explainable compatibility and dealbreaker engine.
- [`src/lib/trustEngine.ts`](src/lib/trustEngine.ts) calculates deposit outcomes, reliability changes, minimum-effort closure, and ghosting settlement.
- [`src/lib/safetyFilter.ts`](src/lib/safetyFilter.ts) masks phone numbers, emails, UPI IDs, handles, and contact links before messages are stored.
- [`src/data/seedProfiles.ts`](src/data/seedProfiles.ts) contains the fictional scripted demo cohort.
- `src/server/` contains the authorised persistence and application workflows; `src/app/actions/` contains server actions.

The app is designed for serverless deployment: it does not depend on native SQLite or a writable server filesystem. PII filtering happens server-side, session cookies are httpOnly, and all member actions check ownership before mutating data.
