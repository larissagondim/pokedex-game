/**
 * The league: eight original leaders, each with a themed team of three,
 * fought in order. Beating the next one moves you up; the last one makes you
 * league champion. Pure, no storage.
 */

export interface Leader {
  name: string;
  /** The team's theme (a type). */
  type: string;
  /** Dex numbers, the lead first. */
  team: readonly number[];
}

export const LEAGUE: readonly Leader[] = [
  { name: "PIPER", type: "normal", team: [20, 264, 400] },
  { name: "WREN", type: "bug", team: [12, 166, 402] },
  { name: "FERN", type: "grass", team: [182, 71, 192] },
  { name: "VOLTA", type: "electric", team: [26, 181, 310] },
  { name: "MARINA", type: "water", team: [121, 130, 134] },
  { name: "CINDER", type: "fire", team: [59, 157, 392] },
  { name: "SAGE", type: "psychic", team: [65, 196, 282] },
  { name: "TALON", type: "dragon", team: [149, 373, 445] },
];

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
