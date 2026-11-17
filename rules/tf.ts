import type { TurnInfo } from './turnTable';
import {
  fail, type ArrangeOp, type Flags, type GameState, type LogEntry, type Notice,
  type Side, type TaskForce, type TFType, type Visibility,
} from './types';

export type TFs = Record<number, TaskForce>;

export const isCarrierNumber = (n: number) => n >= 1 && n <= 6;
export const isFleetNumber = (n: number) => n >= 7 && n <= 13;
export const validNumber = (n: number) => Number.isInteger(n) && n >= 1 && n <= 13;
/** On the physical board: revealed, until the dusk reset. */
export const onBoard = (t: TaskForce) => t.status === 'revealed';

/** A number is free if it was never used or its Task Force is Gone. */
export const numberFree = (tfs: TFs, n: number) => !tfs[n] || tfs[n].status === 'gone';

/** Carrier if it is TF 1-6 with its carrier present, or is combined with one that is. */
export function trueType(tfs: TFs, tf: TaskForce): TFType {
  const has = (t?: TaskForce) => !!t && isCarrierNumber(t.number) && t.carrierPresent;
  return has(tf) || tf.combinedWith.some((n) => has(tfs[n])) ? 'carrier' : 'fleet';
}

export function hasTransports(tfs: TFs, tf: TaskForce): boolean {
  return tf.hasTransports || tf.combinedWith.some((n) => tfs[n]?.hasTransports);
}

export function moveAllowance(tfs: TFs, tf: TaskForce, info: TurnInfo, flags: Flags): number {
  if (flags.enforceTransports && hasTransports(tfs, tf)) return info.transportsMove ? 1 : 0;
  return info.move;
}

export function newTf(side: Side, number: number, flags: Flags): TaskForce {
  return {
    side, number, status: 'hidden',
    carrierPresent: isCarrierNumber(number),
    hasTransports: false,
    combinedWith: [],
    zoneCount: isCarrierNumber(number) ? flags.defaultZones[side] : 0,
  };
}

/**
 * Apply one split or merge to a side's Task Forces, mutating them.
 * ctx 'hidden' is the Naval Movement draft; ctx 'board' records a change made
 * to markers on the physical board.
 */
export function applyOp(
  tfs: TFs, side: Side, op: ArrangeOp, info: TurnInfo, flags: Flags, ctx: 'hidden' | 'board',
): void {
  const usable = (t: TaskForce | undefined): t is TaskForce =>
    !!t && (ctx === 'hidden' ? t.status === 'hidden' : onBoard(t));
  const where = ctx === 'hidden' ? 'hidden' : 'on the board';

  if (op.type === 'split') {
    if (!info.splits) fail('Splits are allowed on night turns only');
    const parent = tfs[op.from];
    if (!usable(parent)) fail(`TF ${op.from} is not ${where}`);
    if (parent.combinedWith.includes(op.to)) {
      // Split a combined Task Force back into its original numbers.
      const child = tfs[op.to];
      parent.combinedWith = parent.combinedWith.filter((n) => n !== op.to);
      child.status = parent.status;
      child.combinedInto = undefined;
      child.hex = parent.hex;
      child.lastHex = parent.lastHex;
      child.revealReason = parent.revealReason;
      return;
    }
    if (!isFleetNumber(op.to)) fail('A split needs a free number from 7 to 13');
    if (!numberFree(tfs, op.to)) fail(`TF ${op.to} is already in use`);
    tfs[op.to] = {
      ...newTf(side, op.to, flags),
      status: parent.status,
      hex: parent.hex,
      lastHex: parent.lastHex,
      revealReason: parent.revealReason,
    };
    return;
  }

  if (op.type === 'merge') {
    const keep = tfs[op.keep], gone = tfs[op.other];
    if (op.keep === op.other) fail('Pick two different Task Forces');
    if (!usable(keep)) fail(`TF ${op.keep} is not ${where}`);
    if (!usable(gone)) fail(`TF ${op.other} is not ${where}`);
    if (ctx === 'hidden' && keep.hex !== gone.hex) fail('Task Forces must share a hex to merge');
    const members = [gone.number, ...gone.combinedWith];
    if (op.mode === 'absorb') {
      if (isCarrierNumber(gone.number)) {
        fail(isCarrierNumber(keep.number)
          ? 'Two Carrier Task Forces can only combine (keep both formations)'
          : 'A Carrier Task Force cannot be absorbed into a Fleet Task Force');
      }
      keep.hasTransports = keep.hasTransports || gone.hasTransports;
      keep.combinedWith.push(...gone.combinedWith);
      for (const n of gone.combinedWith) tfs[n].combinedInto = keep.number;
      gone.status = 'gone';
    } else if (op.mode === 'combine') {
      keep.combinedWith.push(...members);
      for (const n of members) tfs[n].combinedInto = keep.number;
      gone.status = 'combined';
    } else fail('Unknown merge mode');
    gone.combinedWith = [];
    gone.hex = undefined;
    gone.lastHex = undefined;
    gone.revealReason = undefined;
    return;
  }
  fail('Unknown change');
}

/** Apply a list of changes to a copy of a side's Task Forces. Throws on the first illegal one. */
export function arrange(tfs: TFs, side: Side, ops: ArrangeOp[], info: TurnInfo, flags: Flags): TFs {
  const copy: TFs = structuredClone(tfs);
  for (const op of ops) applyOp(copy, side, op, info, flags, 'hidden');
  return copy;
}

export function describeOp(op: ArrangeOp): string {
  if (op.type === 'split') return `TF ${op.to} split off from TF ${op.from}`;
  return op.mode === 'absorb'
    ? `TF ${op.other} absorbed into TF ${op.keep} (TF ${op.other} is removed)`
    : `TF ${op.other} combined under TF ${op.keep} (both formations kept)`;
}

/** Mark a Task Force Gone, together with any formations combined under it. */
export function markGone(tfs: TFs, tf: TaskForce) {
  for (const n of [tf.number, ...tf.combinedWith]) {
    const t = tfs[n];
    t.status = 'gone';
    t.hex = undefined;
    t.combinedInto = undefined;
  }
  tf.combinedWith = [];
}

export function addLog(
  state: GameState, side: Side | null, action: string, detail: string, visibility: Visibility,
) {
  const entry: LogEntry = {
    seq: state.log.length + 1, day: state.day, turn: state.turn, phase: state.phase,
    side, action, detail, visibility,
  };
  state.log.push(entry);
}

/** A notice the recipient must acknowledge; it is also written to their log. */
export function notify(
  state: GameState, to: Side, kind: string, text: string, button: Notice['button'] = 'OK',
) {
  state.notices.push({ id: state.nextId++, to, kind, text, button, day: state.day, turn: state.turn });
  addLog(state, to, kind, text, 'own');
}

export const hiddenTfs = (tfs: TFs) =>
  Object.values(tfs).filter((t) => t.status === 'hidden').sort((a, b) => a.number - b.number);
