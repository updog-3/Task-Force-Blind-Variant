import {
  applyAction, createGame, join, seededRng,
  type Action, type GameState, type Rng, type Side, type TaskForce, type Flags,
} from '../rules';

export const rng = () => seededRng(42);

/** A game past setup, at Naval Movement of the given turn, with the given hidden Task Forces. */
export function game(
  turn: number,
  place: { ijn?: Record<number, string>; allies?: Record<number, string> },
  flags?: Partial<Flags>,
  optionalRules: string[] = [],
  mapId = 'midway',
): GameState {
  // A map id picks the scenario normally played on it; a scenario id can be given directly.
  const scenarioId = ({ midway: 'sc6', coralSea: 'sc5', easternSolomons: 'sc7', fleetVsFleet: 'sc8' } as Record<string, string>)[mapId] ?? mapId;
  let s = createGame({ scenarioId, startingTurn: turn, flags, optionalRules });
  s = join(join(s, 'ijn'), 'allies');
  const r = rng();
  for (const side of ['ijn', 'allies'] as Side[]) {
    const entries = Object.entries(place[side] ?? {});
    // Every side needs one Task Force to finish setup; park a spare far away if none was given.
    if (!entries.length) entries.push(['13', side === 'ijn' ? '0219' : s.mapId === 'fleetVsFleet' ? '2125' : '2919']);
    for (const [n, hex] of entries) s = applyAction(s, side, { type: 'placeTf', number: Number(n), hex }, r);
  }
  s = applyAction(s, 'ijn', { type: 'confirm', value: true }, r);
  s = applyAction(s, 'allies', { type: 'confirm', value: true }, r);
  return s;
}

export function act(s: GameState, side: Side, action: Action, r: Rng = rng()): GameState {
  return applyAction(s, side, action, r);
}

/** Draft moves for both sides, lock both, and return the resolved state. */
export function move(
  s: GameState, ijn: Record<number, string[]>, allies: Record<number, string[]>, r: Rng = rng(),
): GameState {
  s = act(s, 'ijn', { type: 'setMoveOrder', ops: [], moves: ijn }, r);
  s = act(s, 'allies', { type: 'setMoveOrder', ops: [], moves: allies }, r);
  s = act(s, 'ijn', { type: 'lock', value: true }, r);
  return act(s, 'allies', { type: 'lock', value: true }, r);
}

/** Acknowledge everything and have both sides confirm the current state. */
export function advance(s: GameState, r: Rng = rng()): GameState {
  for (const side of ['ijn', 'allies'] as Side[]) {
    s = act(s, side, { type: 'ack', id: 'all' }, r);
  }
  s = act(s, 'ijn', { type: 'confirm', value: true }, r);
  if (s.confirmed.ijn || s.phase !== 'ended') {
    try { s = act(s, 'allies', { type: 'confirm', value: true }, r); } catch { /* already advanced */ }
  }
  return s;
}

export const tf = (s: GameState, side: Side, n: number): TaskForce => s.tfs[side][n];

/** Jump to the Board phases of the current turn. */
export function toBoard(s: GameState): GameState {
  s = advance(move(s, {}, {}));
  if (s.phase !== 'board') throw new Error(`expected board, got ${s.phase}`);
  return s;
}

/** Jump straight to the Reconnaissance draft of the current turn. */
export function toRecon(s: GameState): GameState {
  s = move(s, {}, {});
  s = advance(s); // -> board
  s = advance(s); // -> recon
  if (s.phase !== 'recon') throw new Error(`expected recon, got ${s.phase}`);
  return s;
}
