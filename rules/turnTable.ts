import type { Side } from './types';

export interface TurnInfo {
  turn: number;
  period: 'night' | 'day';
  /** Hexes a Task Force may move. */
  move: number;
  transportsMove: boolean;
  recon: boolean;
  splits: boolean;
  initiative: Side;
  /** The dusk reset runs in this turn's Administrative state. */
  dusk: boolean;
  raidsBarred: boolean;
  clock: string;
}

export const LAST_TURN = 24;
export const DUSK_TURNS = [10, 22];

const isNight = (t: number) => t <= 2 || (t >= 11 && t <= 14) || t >= 23;

/** The app's only rules data; matches the printed turn track. */
export function turnInfo(turn: number): TurnInfo {
  if (!Number.isInteger(turn) || turn < 1 || turn > LAST_TURN) throw new Error(`Bad turn ${turn}`);
  const night = isNight(turn);
  const dusk = DUSK_TURNS.includes(turn);
  return {
    turn,
    period: night ? 'night' : 'day',
    move: night ? 2 : 1,
    transportsMove: night || turn % 2 === 1,
    recon: (turn >= 3 && turn <= 8) || (turn >= 15 && turn <= 20),
    splits: night,
    initiative: turn % 2 === 1 ? 'ijn' : 'allies',
    dusk,
    raidsBarred: night || dusk,
    clock: String(((turn - 1) * 2) % 24).padStart(2, '0') + ':00',
  };
}

export const nextTurn = (turn: number) => (turn % LAST_TURN) + 1;
