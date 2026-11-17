import { fullCup, refillCup } from './cup';
import { getMap } from './maps';
import { emptyMoveOrder, resolveMovement, validateMoveOrder } from './movement';
import { manualReveal, optionalSearch, raidLookup, resolveRecon, validateZones } from './recon';
import type { Rng } from './rng';
import { getScenario, getVariant } from './scenarios';
import {
  addLog, applyOp, describeOp, isCarrierNumber, markGone, newTf, notify, onBoard, validNumber,
} from './tf';
import { nextTurn, turnInfo } from './turnTable';
import {
  fail, other, SIDE_NAME, SIDES,
  type Action, type Flags, type GameState, type Side,
} from './types';

const both = <T>(f: () => T): Record<Side, T> => ({ ijn: f(), allies: f() });

export function createGame(opts: {
  scenarioId: string;
  /** Needed only when the scenario offers a choice of map. */
  mapId?: string;
  startingTurn?: number;
  flags?: Partial<Flags>;
  /** Ids of the scenario's optional rules to enable. Leave out to take the scenario's defaults. */
  optionalRules?: string[];
}): GameState {
  const scenario = getScenario(opts.scenarioId);
  const variant = getVariant(scenario, opts.mapId);
  const map = getMap(variant.mapId);
  const startingTurn = opts.startingTurn ?? scenario.startingTurn;
  turnInfo(startingTurn); // validates 1-24
  const f = opts.flags ?? {};
  const zones = (v: unknown, d: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 9 ? (v as number) : d);
  const flags: Flags = {
    enforceTransports: !!f.enforceTransports,
    cupEmpty: f.cupEmpty === 'noContact' ? 'noContact' : 'reshuffle',
    defaultZones: {
      ijn: zones(f.defaultZones?.ijn, scenario.defaultZones.ijn),
      allies: zones(f.defaultZones?.allies, scenario.defaultZones.allies),
    },
  };
  // Only rules this scenario lists can be switched on.
  const wanted = Array.isArray(opts.optionalRules) ? opts.optionalRules : null;
  const optionalRules = scenario.optionalRules.filter((r) => (wanted ? wanted.includes(r.id) : r.default)).map((r) => r.id);
  const bases = variant.bases.map((b) => {
    const site = map.def.sites.find((s) => s.id === b.site) ?? fail(`No base site ${b.site} on ${map.def.name}`);
    return { id: site.id, name: site.name, side: b.side, hex: site.hex, zoneCount: b.zones };
  });
  return {
    v: 3, scenarioId: scenario.id, mapId: variant.mapId, startingTurn, day: 1, turn: startingTurn,
    phase: 'waiting', stage: '', flags, optionalRules, rulesUsed: [], cup: fullCup(),
    tfs: both(() => ({})),
    bases,
    joined: both(() => false), locked: both(() => false), confirmed: both(() => false),
    moveOrders: both(emptyMoveOrder), searchOrders: both(() => []),
    pins: both(() => []), raidCheck: both(() => null),
    sources: both(() => []), dusk: both(() => ({})),
    results: [], notices: [], log: [], nextId: 1, endRequest: null,
  };
}

/** A seat opened its link. The game leaves Waiting when both seats have joined. */
export function join(state: GameState, side: Side): GameState {
  if (state.joined[side]) return state;
  const s = structuredClone(state);
  s.joined[side] = true;
  addLog(s, null, 'join', `The ${SIDE_NAME[side]} player joined.`, 'both');
  if (s.phase === 'waiting' && s.joined.ijn && s.joined.allies) s.phase = 'setup';
  return s;
}

/** A notice to both players that is not tied to a rule, e.g. a re-issued seat. */
export function systemNotice(state: GameState, text: string): GameState {
  const s = structuredClone(state);
  for (const side of SIDES) notify(s, side, 'system', text);
  return s;
}

function resetPhase(state: GameState) {
  state.raidCheck = both(() => null);
  state.locked = both(() => false);
  state.confirmed = both(() => false);
}

function startTurn(state: GameState) {
  state.phase = 'movement';
  state.stage = 'draft';
  resetPhase(state);
  state.moveOrders = both(emptyMoveOrder);
  state.searchOrders = both(() => []);
  state.rulesUsed = [];
  for (const side of SIDES) {
    state.sources[side] = Object.values(state.tfs[side])
      .filter((t) => isCarrierNumber(t.number) && t.carrierPresent && t.status !== 'gone')
      .map((t) => t.number);
  }
  const info = turnInfo(state.turn);
  addLog(state, null, 'turn', `Turn ${state.turn} (${info.period}) begins. ${SIDE_NAME[info.initiative]} initiative.`, 'both');
}

function enterBoard(state: GameState) {
  state.phase = 'board';
  state.stage = '';
  resetPhase(state);
}

function enterRecon(state: GameState) {
  state.phase = 'recon';
  state.stage = 'draft';
  resetPhase(state);
  state.searchOrders = both(() => []);
}

/** The Administrative state: dusk reset on turns 10 and 22, cup refill, next turn. */
function administrative(state: GameState) {
  const info = turnInfo(state.turn);
  const anyOnBoard = SIDES.some((s) => Object.values(state.tfs[s]).some(onBoard));
  if (info.dusk && anyOnBoard) {
    state.phase = 'dusk';
    state.stage = '';
    resetPhase(state);
    state.dusk = both(() => ({}));
    for (const s of SIDES) {
      // A side with nothing on the board has nothing to enter.
      if (!Object.values(state.tfs[s]).some(onBoard)) state.confirmed[s] = true;
    }
    return;
  }
  finishTurn(state);
}

function finishTurn(state: GameState) {
  const info = turnInfo(state.turn);
  if (info.dusk || info.period === 'night') {
    refillCup(state);
    addLog(state, null, 'cup', 'The chit cup was refilled to 54.', 'both');
  }
  state.turn = nextTurn(state.turn);
  if (state.turn === 1) state.day += 1;
  startTurn(state);
}

function duskProblems(state: GameState, side: Side): string | null {
  const map = getMap(state.mapId);
  for (const tf of Object.values(state.tfs[side]).filter(onBoard)) {
    const e = state.dusk[side][tf.number];
    if (e?.gone) continue;
    if (!e?.hex || !map.has(e.hex)) return `Enter the board hex of TF ${tf.number}, or mark it Gone`;
  }
  return null;
}

function applyDusk(state: GameState) {
  for (const side of SIDES) {
    const tfs = state.tfs[side];
    for (const tf of Object.values(tfs).filter(onBoard)) {
      const e = state.dusk[side][tf.number];
      if (e.gone) {
        markGone(tfs, tf);
        addLog(state, side, 'dusk', `TF ${tf.number} marked Gone at the dusk reset.`, 'own');
        continue;
      }
      tf.status = 'hidden';
      tf.hex = e.hex;
      tf.lastHex = undefined;
      tf.revealReason = undefined;
      if (isCarrierNumber(tf.number) && typeof e.carrierPresent === 'boolean') tf.carrierPresent = e.carrierPresent;
      addLog(state, side, 'dusk', `TF ${tf.number} returned to hidden at ${e.hex}.`, 'own');
    }
    state.dusk[side] = {};
  }
  addLog(state, null, 'dusk', 'Dusk reset: all Task Force markers come off the board.', 'both');
}

function hasNotices(state: GameState, side: Side) {
  return state.notices.some((n) => n.to === side);
}

function confirm(state: GameState, side: Side, value: boolean, rng: Rng) {
  if (!value) {
    state.confirmed[side] = false;
    return;
  }
  if (hasNotices(state, side)) fail('Acknowledge your notices first');
  switch (state.phase) {
    case 'setup':
      if (Object.keys(state.tfs[side]).length === 0) fail('Place at least one Task Force first');
      break;
    case 'movement':
    case 'recon':
      if (state.stage !== 'resolved') fail('Not resolved yet');
      break;
    case 'board':
      break;
    case 'dusk': {
      const problem = duskProblems(state, side);
      if (problem) fail(problem);
      break;
    }
    default:
      fail('Nothing to confirm');
  }
  state.confirmed[side] = true;
  if (!state.confirmed[other(side)]) return;

  switch (state.phase) {
    case 'setup':
      for (const s of SIDES) for (const tf of Object.values(state.tfs[s])) {
        addLog(state, s, 'setup', `TF ${tf.number} placed at ${tf.hex}.`, 'own');
      }
      addLog(state, null, 'setup', 'Setup complete.', 'both');
      startTurn(state);
      break;
    case 'movement':
      enterBoard(state);
      break;
    case 'board':
      if (turnInfo(state.turn).recon) enterRecon(state);
      else administrative(state);
      break;
    case 'recon':
      administrative(state);
      break;
    case 'dusk':
      applyDusk(state);
      finishTurn(state);
      break;
  }
  void rng;
}

function lock(state: GameState, side: Side, value: boolean, rng: Rng) {
  const draftable = (state.phase === 'movement' || state.phase === 'recon') && state.stage === 'draft';
  if (!draftable) fail('Nothing to lock right now');
  state.locked[side] = value;
  if (!state.locked.ijn || !state.locked.allies) return;
  if (state.phase === 'movement') resolveMovement(state);
  else {
    for (const s of SIDES) for (const z of state.searchOrders[s]) {
      addLog(state, s, 'zone',
        `Zone placed at ${z.center} from ${z.source.kind === 'tf' ? `TF ${z.source.number}` : z.source.id} (${z.sourceHex}).`,
        'own');
    }
    resolveRecon(state, rng);
  }
}

const inPlay = (state: GameState) => ['movement', 'board', 'recon', 'dusk'].includes(state.phase);

/** Apply one player action. Returns a new state, or throws RuleError and leaves the old one untouched. */
export function applyAction(prev: GameState, side: Side, action: Action, rng: Rng): GameState {
  const state = structuredClone(prev);
  const map = getMap(state.mapId);
  const tfs = state.tfs[side];
  const info = turnInfo(state.turn);
  if (state.phase === 'ended') fail('The game has ended');

  switch (action.type) {
    case 'placeTf': {
      if (state.phase !== 'setup') fail('Task Forces are placed during setup');
      if (state.confirmed[side]) fail('Undo "Setup complete" to change your setup');
      if (!validNumber(action.number)) fail('Task Force numbers run from 1 to 13');
      if (!map.has(action.hex)) fail(`Hex ${action.hex} is not on the map`);
      if (map.isLand(action.hex)) fail(`Hex ${action.hex} is all land`);
      tfs[action.number] ??= newTf(side, action.number, state.flags);
      tfs[action.number].hex = action.hex;
      break;
    }
    case 'removeTf': {
      if (state.phase !== 'setup') fail('Task Forces are removed during setup');
      if (state.confirmed[side]) fail('Undo "Setup complete" to change your setup');
      delete tfs[action.number];
      break;
    }
    case 'editTf': {
      const tf = tfs[action.number];
      if (!tf || tf.status === 'gone') fail(`TF ${action.number} is not in play`);
      if (action.zoneCount !== undefined) {
        if (!isCarrierNumber(tf.number)) fail('Only Carrier Task Forces have search zones');
        if (!Number.isInteger(action.zoneCount) || action.zoneCount < 0 || action.zoneCount > 12) fail('Bad zone count');
        tf.zoneCount = action.zoneCount;
      }
      if (action.hasTransports !== undefined) tf.hasTransports = !!action.hasTransports;
      if (action.carrierPresent !== undefined) {
        if (!isCarrierNumber(tf.number)) fail('Only TF 1-6 carry the carrier flag');
        tf.carrierPresent = !!action.carrierPresent;
        if (state.phase !== 'setup') {
          addLog(state, side, 'edit', `TF ${tf.number}: carrier ${tf.carrierPresent ? 'present' : 'no longer present'}.`, 'own');
        }
      }
      break;
    }
    case 'editBase': {
      const base = state.bases.find((b) => b.id === action.baseId && b.side === side);
      if (!base) fail('Not your base');
      if (!Number.isInteger(action.zoneCount) || action.zoneCount < 0 || action.zoneCount > 12) fail('Bad zone count');
      base.zoneCount = action.zoneCount;
      break;
    }
    case 'confirm':
      confirm(state, side, !!action.value, rng);
      break;
    case 'setMoveOrder': {
      if (state.phase !== 'movement' || state.stage !== 'draft') fail('Moves are drafted in Naval Movement');
      if (state.locked[side]) fail('Unlock to change your moves');
      const order = { ops: action.ops, moves: action.moves };
      validateMoveOrder(state, side, order);
      state.moveOrders[side] = order;
      break;
    }
    case 'lock':
      lock(state, side, !!action.value, rng);
      break;
    case 'ack':
      state.notices = state.notices.filter((n) => n.to !== side || (action.id !== 'all' && n.id !== action.id));
      break;
    case 'reveal': {
      if (!['movement', 'board', 'recon'].includes(state.phase)) fail('Nothing can be revealed right now');
      const tf = tfs[action.number];
      if (!tf || tf.status !== 'hidden') fail(`TF ${action.number} is not hidden`);
      if (!['contact', 'blocked', 'raided', 'launched', 'voluntary'].includes(action.reason)) fail('Pick a reason');
      manualReveal(state, side, action.number, action.reason);
      break;
    }
    case 'boardMark': {
      if (!inPlay(state)) fail('Not available right now');
      const tf = tfs[action.number];
      if (!tf || !onBoard(tf)) fail(`TF ${action.number} is not on the board`);
      if (action.to !== 'gone') fail('Bad status');
      markGone(tfs, tf);
      addLog(state, side, 'board', `TF ${action.number} marked Gone on the board.`, 'own');
      break;
    }
    case 'boardOp': {
      if (!inPlay(state)) fail('Not available right now');
      applyOp(tfs, side, action.op, info, state.flags, 'board');
      addLog(state, side, 'board', `On the board: ${describeOp(action.op)}.`, 'own');
      break;
    }
    case 'raidCheck': {
      // A private lookup: nothing goes to the opponent, but each use is logged for the end-of-game review.
      if (state.phase !== 'board') fail('Raid checks are made during the Board phases');
      const check = raidLookup(state, side, action.hex);
      state.raidCheck[side] = check;
      const found = check.groups.map((g) => `${g.numbers.map((n) => `TF ${n}`).join(', ')} at ${g.hex}`).join('; ');
      addLog(state, side, 'raidcheck',
        `Raid check at ${check.hex}: ${found ? `${check.adjacent ? 'hex empty; adjacent: ' : ''}${found}` : 'nothing in or next to the hex'}.`,
        'end');
      break;
    }
    case 'raidReveal': {
      const last = state.raidCheck[side];
      if (state.phase !== 'board' || !last) fail('Run a raid check first');
      const check = raidLookup(state, side, last.hex);
      for (const g of check.groups) for (const n of g.numbers) manualReveal(state, side, n, 'raided');
      state.raidCheck[side] = null;
      break;
    }
    case 'optionalSearch':
      optionalSearch(state, side, action.ruleId, rng);
      break;
    case 'setSearchOrder': {
      if (state.phase !== 'recon' || state.stage !== 'draft') fail('Zones are drafted in Reconnaissance');
      if (state.locked[side]) fail('Unlock to change your zones');
      state.searchOrders[side] = validateZones(state, side, action.zones);
      break;
    }
    case 'setDusk': {
      if (state.phase !== 'dusk') fail('The dusk reset is not running');
      if (state.confirmed[side]) fail('Undo "Dusk complete" to change your entries');
      const tf = tfs[action.number];
      if (!tf || !onBoard(tf)) fail(`TF ${action.number} is not on the board`);
      const e = action.entry ?? {};
      if (e.hex && !map.has(e.hex)) fail(`Hex ${e.hex} is not on the map`);
      if (e.hex && map.isLand(e.hex)) fail(`Hex ${e.hex} is all land`);
      state.dusk[side][action.number] = {
        hex: e.hex || undefined,
        gone: !!e.gone,
        carrierPresent: typeof e.carrierPresent === 'boolean' ? e.carrierPresent : undefined,
      };
      break;
    }
    case 'requestEnd':
      if (state.phase === 'waiting') fail('The game has not started');
      if (!state.endRequest) {
        state.endRequest = side;
        addLog(state, null, 'end', `The ${SIDE_NAME[side]} player asked to end the game.`, 'both');
      }
      break;
    case 'cancelEnd':
      if (state.endRequest) {
        state.endRequest = null;
        addLog(state, null, 'end', 'The request to end the game was withdrawn.', 'both');
      }
      break;
    case 'confirmEnd':
      if (state.endRequest !== other(side)) fail('Your opponent has not asked to end the game');
      addLog(state, null, 'end', 'Both players agreed to end the game. Everything is revealed.', 'both');
      state.phase = 'ended';
      state.stage = '';
      state.endRequest = null;
      state.notices = [];
      break;
    default:
      fail('Unknown action');
  }
  return state;
}
