import { getMap } from './maps';
import { addLog, hiddenTfs, notify } from './tf';
import { other, SIDE_NAME, SIDES, type GameState, type RevealReason, type Side } from './types';

export const REASON_TEXT: Record<RevealReason, string> = {
  contact: 'Contact', blocked: 'Blocked', raided: 'Raided', launched: 'Launched raid', voluntary: 'Voluntary', base: 'At enemy base',
};

/** Hidden -> Revealed. The marker goes on the board and the app forgets its position. */
export function revealTf(state: GameState, side: Side, number: number, reason: RevealReason): string {
  const tf = state.tfs[side][number];
  const hex = tf.hex!;
  tf.status = 'revealed';
  tf.lastHex = hex;
  tf.hex = undefined;
  tf.revealReason = reason;
  return hex;
}

/**
 * After movement: opposing hidden Task Forces in adjacent hexes are in contact,
 * and a hidden Task Force in an enemy base hex is found. All become Revealed.
 */
export function contactCheck(state: GameState): void {
  const map = getMap(state.mapId);
  const ijn = hiddenTfs(state.tfs.ijn), allies = hiddenTfs(state.tfs.allies);
  const pairs: [number, string, number, string][] = [];
  for (const a of ijn) for (const b of allies) {
    if (map.adjacentForContact(a.hex!, b.hex!)) pairs.push([a.number, a.hex!, b.number, b.hex!]);
  }
  const atBase: [Side, number, string, string][] = [];
  for (const side of SIDES) for (const tf of hiddenTfs(state.tfs[side])) {
    const base = state.bases.find((b) => b.side !== side && b.hex === tf.hex);
    if (base) atBase.push([side, tf.number, tf.hex!, base.name]);
  }

  const reveal = (side: Side, n: number, reason: RevealReason) => {
    if (state.tfs[side][n].status === 'hidden') revealTf(state, side, n, reason);
  };
  for (const [a, ah, b, bh] of pairs) {
    reveal('ijn', a, 'contact');
    reveal('allies', b, 'contact');
    const text = `Contact: IJN TF ${a} at ${ah} and Allied TF ${b} at ${bh}. Place both markers on the board, numbered side up.`;
    for (const s of SIDES) notify(state, s, 'contact', text, 'Placed');
  }
  for (const [side, n, hex, baseName] of atBase) {
    reveal(side, n, 'base');
    const text = `${SIDE_NAME[side]} TF ${n} is at the ${SIDE_NAME[other(side)]} base ${baseName} (${hex}) and is revealed. Place its marker numbered side up.`;
    for (const s of SIDES) notify(state, s, 'contact', text, 'Placed');
  }
  if (pairs.length + atBase.length === 0) addLog(state, null, 'contact', 'Contact check: no contacts', 'end');
}
