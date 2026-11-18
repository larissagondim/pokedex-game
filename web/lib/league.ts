/**
 * The league: eight original leaders, each with a themed team of three, then
 * the champion with a full team of six, fought in order. Beating the next one
 * moves you up; the champion makes you the league champion. Pure, no storage.
 */

export interface Leader {
  name: string;
  /** "LEADER" for the eight, "CHAMPION" for the last one. */
  title: "LEADER" | "CHAMPION";
  /** The team's theme (a type, or "mixed"). */
  type: string;
  /** Dex numbers, the lead first: three for a leader, six for the champion. */
  team: readonly number[];
}

export const LEAGUE: readonly Leader[] = [
  { name: "PIPER", title: "LEADER", type: "normal", team: [20, 264, 400] },
  { name: "WREN", title: "LEADER", type: "bug", team: [12, 166, 402] },
  { name: "FERN", title: "LEADER", type: "grass", team: [182, 71, 192] },
  { name: "VOLTA", title: "LEADER", type: "electric", team: [26, 181, 310] },
  { name: "MARINA", title: "LEADER", type: "water", team: [121, 130, 134] },
  { name: "CINDER", title: "LEADER", type: "fire", team: [59, 157, 392] },
  { name: "SAGE", title: "LEADER", type: "psychic", team: [65, 196, 282] },
  { name: "TALON", title: "LEADER", type: "dragon", team: [149, 373, 445] },
  { name: "AURORA", title: "CHAMPION", type: "mixed", team: [248, 376, 94, 131, 448, 887] },
];

/** "LEADER WREN", "CHAMPION AURORA". */
export const trainerTitle = (leader: Leader) => `${leader.title} ${leader.name}`;

/** Coins for beating leader `index` the first time (on top of the battle reward). */
export const leagueBonus = (index: number) => 50 * (index + 1);

export type LeaderState = "beaten" | "next" | "locked";

/** `beaten` leaders are done; the one after them is next; the rest are locked. */
export function leaderState(index: number, beaten: number): LeaderState {
  return index < beaten ? "beaten" : index === beaten ? "next" : "locked";
}

/** Progress after a battle against leader `index`: only a win against the next one counts. */
export const afterLeague = (beaten: number, index: number, won: boolean) => (won && index === beaten ? Math.min(LEAGUE.length, beaten + 1) : beaten);

/** Whether a battle against leader `index` is allowed (beaten ones can be fought again). */
export const canChallenge = (index: number, beaten: number) => index <= beaten && index < LEAGUE.length;
