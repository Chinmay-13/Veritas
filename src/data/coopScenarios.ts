/**
 * CO-OP SCENARIOS
 * ---------------
 * The three practical life scenarios both people answer before chat opens.
 * Answers stay hidden until BOTH have answered, then are revealed side by side.
 *
 * To change a scenario: edit the text below. To add an option: add a line to `options`.
 * `closeTo` lists option ids that are different but compatible; anything else that
 * differs is shown as "Worth discussing".
 */

export type CoOpOption = {
  id: string;
  label: string;
  /** Other option ids in the same scenario that count as "Aligned" with this one. */
  closeTo?: string[];
};

export type CoOpScenario = {
  id: string;
  title: string;
  prompt: string;
  options: CoOpOption[];
};

/** Maximum length of the optional free-text reason on each scenario answer. */
export const COOP_REASON_MAX_LENGTH = 140;

export const COOP_SCENARIOS: CoOpScenario[] = [
  {
    id: "long-weekend",
    title: "The long weekend",
    prompt: "We have 4 days off and ₹35,000. How do we allocate it?",
    options: [
      { id: "trip", label: "Spend most of it on one memorable trip", closeTo: ["split"] },
      { id: "split", label: "A short, cheap getaway and save the rest", closeTo: ["trip", "save"] },
      { id: "save", label: "Stay in, invest most of it, one nice dinner", closeTo: ["split"] },
      { id: "family", label: "Visit family and put the money towards home" },
    ],
  },
  {
    id: "the-hike",
    title: "The 40% hike",
    prompt: "One of us gets a 40% hike in another city. How do we decide?",
    options: [
      { id: "take-move", label: "Take it and both move: the other finds a role there", closeTo: ["take-distance"] },
      { id: "take-distance", label: "Take it and do long distance for a fixed period", closeTo: ["take-move", "negotiate"] },
      { id: "negotiate", label: "Use the offer to negotiate remote work or a counter-offer", closeTo: ["take-distance", "decline"] },
      { id: "decline", label: "Decline it: staying together in this city matters more", closeTo: ["negotiate"] },
    ],
  },
  {
    id: "sunday-chores",
    title: "Sunday in a metro apartment",
    prompt: "Splitting Sunday chores vs. rest in a metro apartment.",
    options: [
      { id: "split-evenly", label: "Split chores 50/50 in the morning, rest together after", closeTo: ["by-strength"] },
      { id: "by-strength", label: "Each takes the chores they mind least, no scorekeeping", closeTo: ["split-evenly"] },
      { id: "outsource", label: "Pay for help and protect the whole day for rest", closeTo: ["weekday"] },
      { id: "weekday", label: "Do chores on weekday evenings so Sunday stays free", closeTo: ["outsource"] },
    ],
  },
];

/**
 * Compares two people's choices for one scenario.
 * @param scenarioId Scenario id from COOP_SCENARIOS.
 * @param optionA First person's option id.
 * @param optionB Second person's option id.
 * @returns "aligned" if the options are the same or listed as close, otherwise "discuss".
 */
export function compareCoOpAnswers(scenarioId: string, optionA: string, optionB: string): "aligned" | "discuss" {
  if (optionA === optionB) return "aligned";
  const scenario = COOP_SCENARIOS.find((s) => s.id === scenarioId);
  const option = scenario?.options.find((o) => o.id === optionA);
  return option?.closeTo?.includes(optionB) ? "aligned" : "discuss";
}
