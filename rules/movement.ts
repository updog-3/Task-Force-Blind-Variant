import { contactCheck } from './contact';
import { getMap } from './maps';
import { addLog, applyOp, arrange, describeOp, moveAllowance, notify, type TFs } from './tf';
import { turnInfo } from './turnTable';
import {
  EXIT, fail, other, RuleError, SIDE_NAME, SIDES,
  type ArrangeOp, type GameState, type MoveOrder, type Side,
} from './types';

export const emptyMoveOrder = (): MoveOrder => ({ ops: [], moves: {} });

/** Check a whole draft. Returns the side's Task Forces as they stand after its splits and merges. */
export function validateMoveOrder(state: GameState, side: Side, order: MoveOrder): TFs {
  const map = getMap(state.mapId);
  const info = turnInfo(state.turn);
  if (!Array.isArray(order.ops) || typeof order.moves !== 'object' || !order.moves) fail('Bad order');
  const tfs = arrange(state.tfs[side], side, order.ops, info, state.flags);
  for (const [key, path] of Object.entries(order.moves)) {
    const tf = tfs[Number(key)];
    if (!tf || tf.status !== 'hidden') fail(`TF ${key} is not a hidden Task Force`);
    if (!Array.isArray(path)) fail('Bad path');
    const allowance = moveAllowance(tfs, tf, info, state.flags);
    if (path.length > allowance) {
      fail(`TF ${key} may move at most ${allowance} hex${allowance === 1 ? '' : 'es'} this turn`);
    }
    let at = tf.hex!;
    path.forEach((step, i) => {
      if (step === EXIT) {
        if (i !== path.length - 1) fail('Leaving the map must be the last step');
        if (!map.isEdge(at)) fail(`TF ${key} can leave the map only from an edge hex`);
      } else {
        if (!map.has(step)) fail(`Hex ${step} is not on the map`);
        if (!map.neighbors(at).includes(step)) fail(`Hex ${step} is not adjacent to ${at}`);
        if (map.isLand(step)) fail(`Hex ${step} is all land`);
        if (map.isBlocked(at, step)) fail(`Land or reef blocks the way from ${at} to ${step}`);
        at = step;
      }
    });
  }
  return tfs;
}

function applyOps(state: GameState, side: Side, ops: ArrangeOp[]) {
  const info = turnInfo(state.turn);
  for (const op of ops) {
    try {
      applyOp(state.tfs[side], side, op, info, state.flags, 'hidden');
      addLog(state, side, 'arrange', describeOp(op), 'own');
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      notify(state, side, 'skipped', `Change skipped (${describeOp(op)}): ${e.message}`);
    }
  }
}

function moveSide(state: GameState, side: Side) {
  const map = getMap(state.mapId);
  const info = turnInfo(state.turn);
  const tfs = state.tfs[side], enemy = state.tfs[other(side)];
  const enemyAt = (hex: string) =>
    Object.values(enemy).some((t) => t.status === 'hidden' && t.hex === hex);
  const numbers = Object.keys(state.moveOrders[side].moves).map(Number).sort((a, b) => a - b);
  for (const n of numbers) {
    const tf = tfs[n];
    if (!tf || tf.status !== 'hidden') continue; // revealed or merged away since it was drafted
    const path = state.moveOrders[side].moves[n].slice(0, moveAllowance(tfs, tf, info, state.flags));
    const trail = [tf.hex!];
    for (const step of path) {
      if (step === EXIT) {
        if (!map.isEdge(tf.hex!)) break;
        trail.push('off map');
        tf.status = 'gone';
        tf.lastHex = tf.hex;
        tf.hex = undefined;
        for (const m of tf.combinedWith) { tfs[m].status = 'gone'; tfs[m].combinedInto = undefined; }
        tf.combinedWith = [];
        const text = `A Task Force of the ${SIDE_NAME[side]} side left the map.`;
        notify(state, other(side), 'exit', text);
        notify(state, side, 'exit', `${text} (TF ${n})`);
        break;
      }
      if (!map.steps(tf.hex!).includes(step)) break;
      if (enemyAt(step)) {
        notify(state, side, 'blocked',
          `TF ${n} was blocked moving into ${step}: it stopped short at ${tf.hex} and lost the rest of its move.`);
        trail.push(`(blocked at ${step})`);
        break;
      }
      tf.hex = step;
      trail.push(step);
    }
    if (trail.length > 1) addLog(state, side, 'move', `TF ${n}: ${trail.join(' → ')}`, 'own');
  }
}

/**
 * Resolve Naval Movement once both sides have locked: splits and merges, then
 * the initiative player's moves, then the second player's, then the contact check.
 */
export function resolveMovement(state: GameState): void {
  const first = turnInfo(state.turn).initiative;
  for (const side of SIDES) applyOps(state, side, state.moveOrders[side].ops);
  moveSide(state, first);   // blocked by enemy starting hexes
  moveSide(state, other(first)); // blocked by the initiative player's final hexes
  contactCheck(state);
  state.stage = 'resolved';
}
