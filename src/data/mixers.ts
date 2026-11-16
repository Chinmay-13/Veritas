/**
 * CURATED MIXERS (simulated events for the demo)
 * Small-group, in-person meetups for verified 2020–2023 grads with strict seat
 * balancing per gender (MONETIZATION_PRICING.mixerSeatsPerGender).
 * Venues and dates are illustrative: no real events are being organised.
 */
export type Mixer = { id: string; hub: string; title: string; venue: string; weekday: 6 | 0; time: string };

export const MIXERS: Mixer[] = [
  { id: "blr-coffee", hub: "bengaluru", title: "Weekend Coffee Mixer · Bengaluru", venue: "A specialty cafe in Indiranagar", weekday: 6, time: "11:00 am" },
  { id: "hyd-coffee", hub: "hyderabad", title: "Weekend Coffee Mixer · Hyderabad", venue: "A cafe near Durgam Cheruvu", weekday: 0, time: "11:00 am" },
  { id: "pune-coffee", hub: "pune", title: "Weekend Coffee Mixer · Pune", venue: "A cafe in Baner", weekday: 6, time: "4:30 pm" },
];

/**
 * The next date a mixer runs on (the coming Saturday or Sunday), formatted for display.
 * @param mixer The mixer.
 * @param from The date to count from (defaults to now; injectable for tests).
 * @returns e.g. "Sat, 21 Nov · 11:00 am".
 */
export function nextMixerDateLabel(mixer: Mixer, from: Date = new Date()): string {
  const date = new Date(from);
  const daysAhead = (mixer.weekday - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + daysAhead);
  return `${date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · ${mixer.time}`;
}
