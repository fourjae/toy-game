/** Bits every two-player engine after Lost Cities shares: a rule error type, shuffling, and a log line shape. */

export class RuleError extends Error {}
export function fail(message: string): never {
  throw new RuleError(message);
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export interface LogEntry { id: number; playerId: string; text: string; round: number }

export function pushLog(state: { log: LogEntry[]; round?: number }, playerId: string, text: string) {
  state.log.push({ id: (state.log.at(-1)?.id ?? 0) + 1, playerId, text, round: state.round ?? 1 });
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

export const otherPlayer = (playerIds: readonly [string, string], id: string) => playerIds[0] === id ? playerIds[1] : playerIds[0];

/** The game status the duel server cares about. */
export type DuelStatus = 'playing' | 'round-over' | 'finished';
