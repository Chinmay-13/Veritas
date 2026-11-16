/**
 * PROFILE VOCABULARY
 * ------------------
 * The four Long-Term Non-Negotiables and their options, plus the fixed lists
 * used in profiles (metro hubs, role families, genders).
 *
 * To ADD A NEW DEALBREAKER OPTION: add one line to the `options` array of the
 * right dimension below. It appears in sign-up, the profile editor and scoring
 * automatically. If it should count as "close to" another option, also add the
 * pair to ADJACENT_OPTIONS in src/lib/matchingEngine.ts.
 */

/** The four dimensions a user answers. Batch proximity is a fifth scored dimension but is not an answer. */
export const DIMENSION_KEYS = ["financialPhilosophy", "relocationMobility", "familyStructure", "weekendRhythm"] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export type DimensionOption = {
  /** Stable id stored in the database. Never rename an id that is already in use. */
  id: string;
  /** Text shown to users. Safe to edit. */
  label: string;
  /** Short phrase used inside explanations, e.g. "You both prefer {phrase}". */
  phrase: string;
  /** If true this option is compatible with everything (scores ALIGNMENT_SCORES.flexible). */
  isFlexible?: boolean;
};

export type Dimension = {
  key: DimensionKey;
  label: string;
  question: string;
  /** Short topic used in "worth a conversation" explanations. */
  topic: string;
  options: DimensionOption[];
};

export const DIMENSIONS: Dimension[] = [
  {
    key: "financialPhilosophy",
    label: "Financial Philosophy",
    question: "How do you treat money in your twenties?",
    topic: "money",
    options: [
      { id: "saver", label: "Aggressive Saver / Loan Payoff", phrase: "saving hard and clearing loans first" },
      { id: "balanced", label: "Balanced Experience Spender", phrase: "balancing saving with experiences" },
      { id: "fire", label: "Long-Term Wealth / FIRE", phrase: "investing for long-term wealth" },
      { id: "flexible", label: "Flexible", phrase: "staying flexible about money", isFlexible: true },
    ],
  },
  {
    key: "relocationMobility",
    label: "Career & Relocation Mobility",
    question: "Where will your career take you?",
    topic: "careers and relocation",
    options: [
      { id: "anchored", label: "Anchored in Current Metro", phrase: "staying anchored in your current city" },
      { id: "open", label: "Open to Relocation / Onsite", phrase: "being open to relocating for work" },
      { id: "remote", label: "Remote / Flexible", phrase: "working remotely or flexibly", isFlexible: true },
    ],
  },
  {
    key: "familyStructure",
    label: "Family & Living Structure",
    question: "What does home look like long term?",
    topic: "living with family",
    options: [
      { id: "nuclear", label: "Independent Nuclear Setup", phrase: "an independent nuclear home" },
      { id: "multigenerational", label: "Multigenerational Support", phrase: "a multigenerational home" },
      { id: "flexible", label: "Flexible", phrase: "staying flexible about living arrangements", isFlexible: true },
    ],
  },
  {
    key: "weekendRhythm",
    label: "Weekend Rhythm",
    question: "What does a good weekend look like?",
    topic: "how weekends are spent",
    options: [
      { id: "quiet", label: "Quiet Recharge & Upskilling", phrase: "a quiet weekend recharge" },
      { id: "fitness", label: "Fitness & Outdoors", phrase: "fitness and the outdoors" },
      { id: "social", label: "Social & Cultural Exploring", phrase: "social and cultural exploring" },
    ],
  },
];

/** One user's answer for one dimension. */
export type NonNegotiableAnswer = { value: string; mustMatch: boolean };

/** One user's answers for all four dimensions. Stored as JSON on the user row. */
export type NonNegotiables = Record<DimensionKey, NonNegotiableAnswer>;

/**
 * Finds a dimension definition by key.
 * @param key Dimension key, e.g. "weekendRhythm".
 * @returns The dimension (throws if the key is unknown, which would be a programming error).
 */
export function getDimension(key: DimensionKey): Dimension {
  const dimension = DIMENSIONS.find((d) => d.key === key);
  if (!dimension) throw new Error(`Unknown dimension: ${key}`);
  return dimension;
}

/**
 * Finds an option inside a dimension.
 * @param key Dimension key.
 * @param optionId Option id, e.g. "saver".
 * @returns The option, or undefined if the id is not in the list.
 */
export function getOption(key: DimensionKey, optionId: string): DimensionOption | undefined {
  return getDimension(key).options.find((o) => o.id === optionId);
}

// ---------------------------------------------------------------------------
// Fixed profile lists
// ---------------------------------------------------------------------------

/** Metro hubs. The `id` is stored in the database; `areas` is display-only. */
export const HUBS = [
  { id: "bengaluru", label: "Bengaluru", areas: "HSR / Bellandur / ORR" },
  { id: "hyderabad", label: "Hyderabad", areas: "Gachibowli / HITEC City" },
  { id: "pune", label: "Pune", areas: "Hinjewadi / Kharadi" },
  { id: "delhi-ncr", label: "Delhi NCR", areas: "Gurugram / Noida" },
] as const;
export type HubId = (typeof HUBS)[number]["id"];
export const HUB_IDS = HUBS.map((h) => h.id) as [HubId, ...HubId[]];

/** Role families. Deliberately NOT an "employer tier": we verify the cohort, we do not rank employers. */
export const ROLE_FAMILIES = [
  { id: "sde", label: "SDE", cohortLabel: "SDE Cohort" },
  { id: "backend", label: "Backend Developer", cohortLabel: "Backend Cohort" },
  { id: "data", label: "Data / Analytics", cohortLabel: "Data Cohort" },
  { id: "product", label: "Product / Business Analyst", cohortLabel: "Product Cohort" },
  { id: "qa", label: "QA / SDET", cohortLabel: "QA Cohort" },
  { id: "devops", label: "DevOps / Cloud", cohortLabel: "DevOps Cohort" },
  { id: "design", label: "Design / UX", cohortLabel: "Design Cohort" },
  { id: "consulting", label: "Consulting / Support", cohortLabel: "Consulting Cohort" },
] as const;
export type RoleFamilyId = (typeof ROLE_FAMILIES)[number]["id"];
export const ROLE_FAMILY_IDS = ROLE_FAMILIES.map((r) => r.id) as [RoleFamilyId, ...RoleFamilyId[]];

export const GENDERS = [
  { id: "woman", label: "Woman", plural: "Women" },
  { id: "man", label: "Man", plural: "Men" },
  { id: "nonbinary", label: "Non-binary", plural: "Non-binary people" },
] as const;
export type GenderId = (typeof GENDERS)[number]["id"];
export const GENDER_IDS = GENDERS.map((g) => g.id) as [GenderId, ...GenderId[]];

export const INTERESTED_IN = [
  { id: "women", label: "Women" },
  { id: "men", label: "Men" },
  { id: "everyone", label: "Everyone" },
] as const;
export type InterestedInId = (typeof INTERESTED_IN)[number]["id"];
export const INTERESTED_IN_IDS = INTERESTED_IN.map((g) => g.id) as [InterestedInId, ...InterestedInId[]];

/** @returns Display label for a hub id, e.g. "Bengaluru". */
export function hubLabel(hubId: string): string {
  return HUBS.find((h) => h.id === hubId)?.label ?? hubId;
}

/** @returns Display label with areas, e.g. "Bengaluru (HSR / Bellandur / ORR)". */
export function hubLabelWithAreas(hubId: string): string {
  const hub = HUBS.find((h) => h.id === hubId);
  return hub ? `${hub.label} (${hub.areas})` : hubId;
}

/** @returns Cohort label for a role family id, e.g. "SDE Cohort". */
export function roleCohortLabel(roleFamilyId: string): string {
  return ROLE_FAMILIES.find((r) => r.id === roleFamilyId)?.cohortLabel ?? "Verified Cohort";
}

/** @returns Display label for a role family id, e.g. "Backend Developer". */
export function roleLabel(roleFamilyId: string): string {
  return ROLE_FAMILIES.find((r) => r.id === roleFamilyId)?.label ?? roleFamilyId;
}

/**
 * Whether person A's "interested in" setting includes person B's gender.
 * @param interestedIn A's setting ("women" | "men" | "everyone").
 * @param gender B's gender ("woman" | "man" | "nonbinary").
 */
export function isInterestedIn(interestedIn: string, gender: string): boolean {
  if (interestedIn === "everyone") return true;
  if (interestedIn === "women") return gender === "woman";
  if (interestedIn === "men") return gender === "man";
  return false;
}
