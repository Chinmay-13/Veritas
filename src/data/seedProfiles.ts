/**
 * SEED DATA — every person here is FICTIONAL.
 * ===========================================
 * 12 scripted demo profiles (6 women, 6 men) + 3 login personas (Arjun, Ananya, Rohan)
 * + 1 founder/admin account. Names, emails, eLitmus IDs and percentiles are invented.
 *
 * "Scripted" means: when a real visitor starts a Co-Op with the profile, it joins and
 * answers automatically, and sends short canned chat replies, so a single evaluator
 * can experience the whole product alone. This is labelled in the UI.
 *
 * `behavior: "goes_silent"` profiles join and answer the Co-Op but never reply in chat,
 * so an evaluator can see ghosting compensation with the Fast-forward demo tool.
 */
import type { NonNegotiables } from "@/data/nonNegotiables";

/** Password for every demo account. Shown on the login page in demo mode. */
export const DEMO_PASSWORD = "Veritas@123";

export type SeedProfile = {
  /** Stable key, stored in users.seed_key. */
  key: string;
  email: string;
  firstName: string;
  gender: "woman" | "man";
  interestedIn: "women" | "men" | "everyone";
  birthYear: number;
  batchYear: number;
  hub: string;
  roleFamily: string;
  thesis: string;
  nonNegotiables: NonNegotiables;
  /** Seeded Reliability Score history: [delta, reason, note]. The score is the sum of the deltas. */
  reliabilityHistory: [number, "initial" | "coop_completed" | "respectful_closure" | "ghosting", string][];
  elitmusId: string;
  phPercentile: number;
  /** "replies" = canned chat replies, "goes_silent" = never replies in chat. */
  behavior: "replies" | "goes_silent";
  /** Scripted Co-Op answers: scenario id -> [option id, optional short reason]. */
  coopAnswers: Record<string, [string, string]>;
  /** Canned chat replies, sent in order (the last one repeats). */
  chatReplies: string[];
};

/** Shorthand to build the four answers: value + whether it is "Must match". */
function nn(
  fin: string, finMust: boolean,
  relo: string, reloMust: boolean,
  fam: string, famMust: boolean,
  wk: string, wkMust: boolean,
): NonNegotiables {
  return {
    financialPhilosophy: { value: fin, mustMatch: finMust },
    relocationMobility: { value: relo, mustMatch: reloMust },
    familyStructure: { value: fam, mustMatch: famMust },
    weekendRhythm: { value: wk, mustMatch: wkMust },
  };
}

const GENERIC_REPLIES = [
  "That is fair. I think the Co-Op already told us more than a week of small talk would have.",
  "Agreed. What does a normal weekday evening look like for you?",
  "Ha, same here. Work has been heavy this sprint, so weekends are sacred.",
  "Good question. I would rather be honest early than polite for a month.",
  "I like that. Tell me one thing you are stubborn about.",
  "Makes sense. I am enjoying this conversation, for what it is worth.",
];

export const SEED_PROFILES: SeedProfile[] = [
  // ----------------------------------------------------------------- LOGIN PERSONAS
  {
    key: "arjun",
    email: "arjun.2022@elitmus-demo.in",
    firstName: "Arjun",
    gender: "man",
    interestedIn: "women",
    birthYear: 2000,
    batchYear: 2022,
    hub: "bengaluru",
    roleFamily: "sde",
    thesis: "I want a partner who treats money and time as shared projects. I would rather plan a decade together than a weekend apart.",
    nonNegotiables: nn("fire", true, "anchored", false, "nuclear", false, "fitness", false),
    reliabilityHistory: [
      [96, "initial", "Starting score (seeded demo history)."],
      [2, "respectful_closure", "Closed respectfully (seeded demo history)."],
    ],
    elitmusId: "ELM-2022-483920",
    phPercentile: 94,
    behavior: "replies",
    coopAnswers: {
      "long-weekend": ["split", "A short trip, and the rest goes into the index fund."],
      "the-hike": ["negotiate", "An offer is leverage. Use it before moving."],
      "sunday-chores": ["outsource", "Time is the scarcest thing we have."],
    },
    chatReplies: GENERIC_REPLIES,
  },
  {
    key: "ananya",
    email: "ananya.2023@elitmus-demo.in",
    firstName: "Ananya",
    gender: "woman",
    interestedIn: "men",
    birthYear: 2001,
    batchYear: 2023,
    hub: "bengaluru",
    roleFamily: "product",
    thesis: "Relocating to Hyderabad this year for a new role. Looking for someone who sees a move as an adventure, not a threat.",
    nonNegotiables: nn("balanced", false, "open", true, "flexible", false, "social", false),
    reliabilityHistory: [[96, "initial", "Starting score (seeded demo history)."]],
    elitmusId: "ELM-2023-517264",
    phPercentile: 91,
    behavior: "replies",
    coopAnswers: {
      "long-weekend": ["trip", "Memories compound too."],
      "the-hike": ["take-move", "We go together or we plan the gap properly."],
      "sunday-chores": ["by-strength", "I cook, you do dishes. No spreadsheet."],
    },
    chatReplies: GENERIC_REPLIES,
  },
  {
    key: "rohan",
    email: "rohan.2021@elitmus-demo.in",
    firstName: "Rohan",
    gender: "man",
    interestedIn: "women",
    birthYear: 1999,
    batchYear: 2021,
    hub: "hyderabad",
    roleFamily: "backend",
    thesis: "Family comes first for me. I went quiet on a couple of people last year and I am working on doing better.",
    nonNegotiables: nn("saver", false, "anchored", false, "multigenerational", true, "quiet", false),
    reliabilityHistory: [
      [88, "initial", "Starting score (seeded demo history)."],
      [-15, "ghosting", "No reply within the chat window (seeded demo history)."],
      [-15, "ghosting", "No reply within the chat window (seeded demo history)."],
    ],
    elitmusId: "ELM-2021-306815",
    phPercentile: 88,
    behavior: "replies",
    coopAnswers: {
      "long-weekend": ["family", "Home first, always."],
      "the-hike": ["decline", "Parents are here. That decides it."],
      "sunday-chores": ["split-evenly", "Fair is fair."],
    },
    chatReplies: GENERIC_REPLIES,
  },

  // ----------------------------------------------------------------- BENGALURU (4 women, 2 men)
  {
    key: "meera",
    email: "meera.2022@elitmus-demo.in",
    firstName: "Meera",
    gender: "woman",
    interestedIn: "men",
    birthYear: 2000,
    batchYear: 2022,
    hub: "bengaluru",
    roleFamily: "data",
    thesis: "Data analyst, index-fund loyalist, homebody. I want a calm partnership where we both get quietly better every year.",
    nonNegotiables: nn("fire", true, "anchored", false, "nuclear", false, "quiet", false),
    reliabilityHistory: [[100, "initial", "Starting score (seeded demo history)."]],
    elitmusId: "ELM-2022-442107",
    phPercentile: 96,
    behavior: "replies",
    coopAnswers: {
      "long-weekend": ["save", "One great dinner beats four rushed days."],
      "the-hike": ["negotiate", "Ask for remote first. Then decide."],
      "sunday-chores": ["outsource", "I will happily pay to keep Sunday."],
    },
    chatReplies: [
      "I liked that we both reached for the offer-as-leverage answer. Most people pick a side straight away.",
      "Quiet weekends, mostly. A long walk, a book, one course module if I am feeling ambitious. You?",
      ...GENERIC_REPLIES,
    ],
  },
  {
    key: "kavya",
    email: "kavya.2021@elitmus-demo.in",
    firstName: "Kavya",
    gender: "woman",
    interestedIn: "men",
    birthYear: 1999,
    batchYear: 2021,
    hub: "bengaluru",
    roleFamily: "design",
    thesis: "UX designer who runs at Cubbon on Saturdays. I spend on experiences and save on things. Remote-first, so geography is negotiable.",
    nonNegotiables: nn("balanced", false, "remote", false, "nuclear", true, "fitness", false),
    reliabilityHistory: [[94, "initial", "Starting score (seeded demo history)."]],
    elitmusId: "ELM-2021-358642",
    phPercentile: 89,
    behavior: "replies",
    coopAnswers: {
      "long-weekend": ["trip", "A trek and one very good meal."],
      "the-hike": ["take-distance", "Fixed period, with an end date we both agree on."],
      "sunday-chores": ["outsource", "Outsourcing is self-care."],
    },
    chatReplies: [
      "Saturday is a long run and then a slow breakfast. Sunday is for doing nothing well. What about you?",
      "That sounds like a good rhythm. I would join the run, not the 6 am part.",
      ...GENERIC_REPLIES,
    ],
  },
  {
    key: "isha",
    email: "isha.2023@elitmus-demo.in",
    firstName: "Isha",
    gender: "woman",
    interestedIn: "men",
    birthYear: 2001,
    batchYear: 2023,
    hub: "bengaluru",
    roleFamily: "sde",
    thesis: "New to Bengaluru, close to my family, always at a gig or a gallery. Building wealth slowly and loudly enjoying the rest.",
    nonNegotiables: nn("fire", false, "anchored", false, "multigenerational", false, "social", false),
    reliabilityHistory: [[90, "initial", "Starting score (seeded demo history)."]],
    elitmusId: "ELM-2023-571390",
    phPercentile: 87,
    behavior: "goes_silent",
    coopAnswers: {
      "long-weekend": ["family", "Home is two hours away. Easy choice."],
      "the-hike": ["take-distance", "We can manage a year apart."],
      "sunday-chores": ["by-strength", "Whoever hates it less does it."],
    },
    chatReplies: [],
  },
  {
    key: "tara",
    email: "tara.2022@elitmus-demo.in",
    firstName: "Tara",
    gender: "woman",
    interestedIn: "men",
    birthYear: 2000,
    batchYear: 2022,
    hub: "bengaluru",
    roleFamily: "product",
    thesis: "Business analyst, weekend cyclist, firmly settled in Bengaluru. I want an equal: someone with their own goals and room for mine.",
    nonNegotiables: nn("balanced", false, "anchored", true, "nuclear", false, "fitness", false),
    reliabilityHistory: [[98, "initial", "Starting score (seeded demo history)."]],
    elitmusId: "ELM-2022-429853",
    phPercentile: 92,
    behavior: "replies",
    coopAnswers: {
      "long-weekend": ["split", "Coorg for two days, the rest stays in the bank."],
      "the-hike": ["negotiate", "I would push hard for a counter-offer here."],
      "sunday-chores": ["split-evenly", "Morning blitz, then the day is ours."],
    },
    chatReplies: [
      "Okay, your chores answer made me laugh. We might actually survive a shared kitchen.",
      "Nandi Hills ride most Saturdays, then filter coffee. Do you cycle or is that a dealbreaker?",
      ...GENERIC_REPLIES,
    ],
  },
  {
    key: "vikram",
    email: "vikram.2022@elitmus-demo.in",
    firstName: "Vikram",
    gender: "man",
    interestedIn: "women",
    birthYear: 2000,
    batchYear: 2022,
    hub: "bengaluru",
    roleFamily: "devops",
    thesis: "Cloud engineer with an onsite opportunity on the horizon. I want a partner who is curious about new cities and new food.",
    nonNegotiables: nn("balanced", false, "open", false, "flexible", false, "social", false),
    reliabilityHistory: [[96, "initial", "Starting score (seeded demo history)."]],
    elitmusId: "ELM-2022-460218",
    phPercentile: 90,
    behavior: "replies",
    coopAnswers: {
      "long-weekend": ["trip", "Somewhere neither of us has been."],
      "the-hike": ["take-move", "A new city is easier with two people."],
      "sunday-chores": ["by-strength", "I will take laundry. Please take dishes."],
    },
    chatReplies: [
      "We matched on the move question, which is rare. Most people want the hike but not the city.",
      "Hyderabad would be an easy yes for me, honestly. The food alone settles it.",
      ...GENERIC_REPLIES,
    ],
  },
  {
    key: "dev",
    email: "dev.2020@elitmus-demo.in",
    firstName: "Dev",
    gender: "man",
    interestedIn: "women",
    birthYear: 1998,
    batchYear: 2020,
    hub: "bengaluru",
    roleFamily: "consulting",
    thesis: "Consultant, mostly remote, mostly at the climbing gym. Planning to be financially independent by forty.",
    nonNegotiables: nn("fire", false, "remote", false, "nuclear", false, "fitness", false),
    reliabilityHistory: [[86, "initial", "Starting score (seeded demo history)."]],
    elitmusId: "ELM-2020-214576",
    phPercentile: 93,
    behavior: "goes_silent",
    coopAnswers: {
      "long-weekend": ["save", "Invest it. Cook something good at home."],
      "the-hike": ["negotiate", "Remote solves this."],
      "sunday-chores": ["weekday", "Sunday is for climbing."],
    },
    chatReplies: [],
  },

  // ----------------------------------------------------------------- HYDERABAD (1 woman, 2 men + Rohan)
  {
    key: "nandini",
    email: "nandini.2021@elitmus-demo.in",
    firstName: "Nandini",
    gender: "woman",
    interestedIn: "men",
    birthYear: 1999,
    batchYear: 2021,
    hub: "hyderabad",
    roleFamily: "qa",
    thesis: "SDET, careful saver, lives with her parents and likes it that way. Looking for someone steady who values family as much as I do.",
    nonNegotiables: nn("saver", false, "anchored", true, "multigenerational", true, "quiet", false),
    reliabilityHistory: [[100, "initial", "Starting score (seeded demo history)."]],
    elitmusId: "ELM-2021-337409",
    phPercentile: 85,
    behavior: "replies",
    coopAnswers: {
      "long-weekend": ["family", "Family time is never wasted."],
      "the-hike": ["decline", "Roots matter more than a raise."],
      "sunday-chores": ["split-evenly", "Together and done by noon."],
    },
    chatReplies: GENERIC_REPLIES,
  },
  {
    key: "karthik",
    email: "karthik.2023@elitmus-demo.in",
    firstName: "Karthik",
    gender: "man",
    interestedIn: "women",
    birthYear: 2001,
    batchYear: 2023,
    hub: "hyderabad",
    roleFamily: "sde",
    thesis: "SDE in Gachibowli, new enough to the city to still be exploring it. Happy to show a newcomer around, happier to get lost together.",
    nonNegotiables: nn("balanced", false, "open", false, "nuclear", false, "social", false),
    reliabilityHistory: [[95, "initial", "Starting score (seeded demo history)."]],
    elitmusId: "ELM-2023-538871",
    phPercentile: 90,
    behavior: "replies",
    coopAnswers: {
      "long-weekend": ["trip", "Hampi. Non-negotiable."],
      "the-hike": ["take-move", "Move together, figure it out there."],
      "sunday-chores": ["by-strength", "Play to strengths."],
    },
    chatReplies: [
      "Welcome to Hyderabad in advance. First rule: you need a strong opinion on biryani by week two.",
      "Weekends are usually a new cafe and a long walk around Durgam Cheruvu. What are you most nervous about with the move?",
      ...GENERIC_REPLIES,
    ],
  },
  {
    key: "sameer",
    email: "sameer.2021@elitmus-demo.in",
    firstName: "Sameer",
    gender: "man",
    interestedIn: "women",
    birthYear: 1999,
    batchYear: 2021,
    hub: "hyderabad",
    roleFamily: "data",
    thesis: "Data engineer, paying off an education loan early, living with family in Kukatpally. Slow mornings, long reads.",
    nonNegotiables: nn("saver", true, "anchored", false, "multigenerational", false, "quiet", false),
    reliabilityHistory: [[92, "initial", "Starting score (seeded demo history)."]],
    elitmusId: "ELM-2021-319264",
    phPercentile: 86,
    behavior: "replies",
    coopAnswers: {
      "long-weekend": ["save", "Loan first. Then fun."],
      "the-hike": ["decline", "Not worth uprooting everything."],
      "sunday-chores": ["split-evenly", "Half each, no debate."],
    },
    chatReplies: GENERIC_REPLIES,
  },

  // ----------------------------------------------------------------- PUNE (1 woman, 1 man)
  {
    key: "riya",
    email: "riya.2020@elitmus-demo.in",
    firstName: "Riya",
    gender: "woman",
    interestedIn: "men",
    birthYear: 1998,
    batchYear: 2020,
    hub: "pune",
    roleFamily: "backend",
    thesis: "Backend developer, trekker, three years into a FIRE plan. Open to moving for the right team or the right person.",
    nonNegotiables: nn("fire", false, "open", false, "nuclear", false, "fitness", false),
    reliabilityHistory: [[97, "initial", "Starting score (seeded demo history)."]],
    elitmusId: "ELM-2020-205933",
    phPercentile: 95,
    behavior: "replies",
    coopAnswers: {
      "long-weekend": ["split", "A Sahyadri trek costs almost nothing."],
      "the-hike": ["take-distance", "A year apart with a plan is fine."],
      "sunday-chores": ["weekday", "Chores on Thursday, trails on Sunday."],
    },
    chatReplies: GENERIC_REPLIES,
  },
  {
    key: "aditya",
    email: "aditya.2022@elitmus-demo.in",
    firstName: "Aditya",
    gender: "man",
    interestedIn: "women",
    birthYear: 2000,
    batchYear: 2022,
    hub: "pune",
    roleFamily: "sde",
    thesis: "SDE in Hinjewadi, amateur cook, plays in a weekend football league. Flexible about most things except honesty.",
    nonNegotiables: nn("flexible", false, "anchored", false, "flexible", false, "social", false),
    reliabilityHistory: [[93, "initial", "Starting score (seeded demo history)."]],
    elitmusId: "ELM-2022-475120",
    phPercentile: 84,
    behavior: "replies",
    coopAnswers: {
      "long-weekend": ["split", "Goa off-season, then savings."],
      "the-hike": ["negotiate", "Always ask before you leap."],
      "sunday-chores": ["by-strength", "I cook. Everything else is negotiable."],
    },
    chatReplies: GENERIC_REPLIES,
  },

  // ----------------------------------------------------------------- DELHI NCR (1 man: shows an unbalanced hub on /cohort)
  {
    key: "kabir",
    email: "kabir.2021@elitmus-demo.in",
    firstName: "Kabir",
    gender: "man",
    interestedIn: "women",
    birthYear: 1999,
    batchYear: 2021,
    hub: "delhi-ncr",
    roleFamily: "consulting",
    thesis: "Consultant in Gurugram, theatre regular, saving for a home near my parents in Noida.",
    nonNegotiables: nn("saver", false, "anchored", false, "multigenerational", false, "social", false),
    reliabilityHistory: [[91, "initial", "Starting score (seeded demo history)."]],
    elitmusId: "ELM-2021-342688",
    phPercentile: 88,
    behavior: "replies",
    coopAnswers: {
      "long-weekend": ["family", "Drive home, eat well."],
      "the-hike": ["decline", "Delhi is home."],
      "sunday-chores": ["outsource", "Help is affordable here. Use it."],
    },
    chatReplies: GENERIC_REPLIES,
  },
];

/** The founder / admin account (no consumer profile). */
export const SEED_ADMIN = { key: "founder", email: "founder@elitmus-demo.in", firstName: "Founder" };

/** The demo logins shown on /login and in the navbar persona switcher. */
export const DEMO_PERSONAS = [
  { key: "arjun", label: "Arjun", tag: "High Trust", email: "arjun.2022@elitmus-demo.in", blurb: "One Co-Op waiting for his answers and one open chat with 4 messages. Try the Safety Shield here." },
  { key: "ananya", label: "Ananya", tag: "Relocating Grad", email: "ananya.2023@elitmus-demo.in", blurb: "No matches yet. Start a fresh Co-Op and buy the Relocation Cohort Pass." },
  { key: "rohan", label: "Rohan", tag: "Low Reliability", email: "rohan.2021@elitmus-demo.in", blurb: "Below the reliability threshold: hidden from feeds and cannot start new Co-Ops." },
  { key: "founder", label: "Founder", tag: "Admin", email: "founder@elitmus-demo.in", blurb: "Founder dashboard: funnel, revenue, reports queue." },
] as const;

/**
 * Spare, unclaimed eLitmus IDs for evaluators who sign up themselves.
 * Format: ELM-<batch year>-<6 digits>. Eight per batch.
 */
export const SPARE_REGISTRY_IDS: { elitmusId: string; batchYear: number; phPercentile: number }[] = [2020, 2021, 2022, 2023].flatMap((year, y) =>
  Array.from({ length: 8 }, (_, i) => ({
    elitmusId: `ELM-${year}-${String(600100 + y * 1000 + i * 37).padStart(6, "0")}`,
    batchYear: year,
    phPercentile: 80 + ((y * 5 + i * 3) % 19),
  })),
);

/**
 * Seeded matches for Arjun (the "High Trust" persona):
 *   1. A Co-Op in progress with Meera: she has answered, Arjun has not.
 *   2. An open chat with Kavya with exactly 4 messages, the last one from Kavya.
 */
export const ARJUN_SEED_CHAT: { from: "arjun" | "kavya"; body: string; hoursAgo: number }[] = [
  { from: "kavya", body: "Okay, I did not expect us to agree on the chores question. Outsourcing is self-care.", hoursAgo: 19 },
  { from: "arjun", body: "Completely. The 40% hike one was harder, I went back and forth on it.", hoursAgo: 18 },
  { from: "arjun", body: "Your long-distance-for-a-fixed-period answer is honestly more mature than mine.", hoursAgo: 18 },
  { from: "kavya", body: "Ha. The fixed period is the important part. What does a normal Saturday look like for you?", hoursAgo: 2 },
];
