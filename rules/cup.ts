import type { Rng } from './rng';
import type { ChitKind, GameState } from './types';

export const CUP_SIZE = 54;

export const fullCup = (): number[] => Array.from({ length: CUP_SIZE }, (_, i) => i + 1);

export function chitKind(n: number | null): ChitKind {
  if (n === null) return 'noContact';
  if (n <= 30) return 'detected';
  if (n <= 42) return 'misdirect';
  return 'noContact';
}

/** Draw one chit. A drawn chit stays out until the cup refills. */
export function drawChit(state: GameState, rng: Rng): number | null {
  if (state.cup.length === 0) {
    if (state.flags.cupEmpty === 'noContact') return null;
    state.cup = fullCup();
  }
  const i = rng.int(state.cup.length);
  return state.cup.splice(i, 1)[0];
}

export function refillCup(state: GameState) {
  state.cup = fullCup();
}
