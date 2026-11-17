import { REASON_TEXT, revealTf } from './contact';
import { chitKind, drawChit } from './cup';
import { hexDist, type OptionalRule } from './hex';
import { getMap } from './maps';
import type { Rng } from './rng';
import { addLog, hiddenTfs, notify, trueType } from './tf';
import { turnInfo } from './turnTable';
import {
  fail, other, SIDE_NAME,
  type GameState, type RaidCheck, type RevealReason, type SearchResult, type SearchSource, type Side,
  type TaskForce, type Zone, type ZoneDraft,
} from './types';

export const ZONE_RANGE = 8;

const plural = (n: number, what: string) => `${n} ${what} Task Force${n === 1 ? '' : 's'}`;
const names = (numbers: number[]) => {
  const t = numbers.map((n) => `TF ${n}`);
  return t.length <= 1 ? t.join('') : `${t.slice(0, -1).join(', ')} and ${t.at(-1)}`;
};

/** "1 Carrier Task Force, 2 Fleet Task Forces", or null when nothing was reported. */
export function countText(carriers: number, fleets: number): string | null {
  const parts = [carriers ? plural(carriers, 'Carrier') : '', fleets ? plural(fleets, 'Fleet') : ''].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** How many zones a source may place this turn (0 if it is not a source). */
export function sourceCapacity(state: Pick<GameState, 'tfs' | 'bases' | 'sources'>, side: Side, src: SearchSource): number {
  if (src.kind === 'base') {
    const b = state.bases.find((x) => x.id === src.id && x.side === side);
    return b ? b.zoneCount : 0;
  }
  if (!state.sources[side].includes(src.number)) return 0;
  return state.tfs[side][src.number]?.zoneCount ?? 0;
}

/** The hex range is measured from, or null if the searcher must enter it from the board. */
export function sourceHex(state: Pick<GameState, 'tfs' | 'bases'>, side: Side, src: SearchSource): string | null {
  if (src.kind === 'base') return state.bases.find((x) => x.id === src.id && x.side === side)?.hex ?? null;
  let tf: TaskForce | undefined = state.tfs[side][src.number];
  if (tf?.status === 'combined' && tf.combinedInto) tf = state.tfs[side][tf.combinedInto];
  return tf?.status === 'hidden' ? tf.hex! : null;
}

export const sourceKey = (s: SearchSource) => (s.kind === 'tf' ? `tf${s.number}` : `base:${s.id}`);

export function validateZones(state: GameState, side: Side, drafts: ZoneDraft[]): Zone[] {
  const map = getMap(state.mapId);
  if (!Array.isArray(drafts)) fail('Bad zones');
  const used: Record<string, number> = {};
  return drafts.map((d, i) => {
    const src: SearchSource = d.source?.kind === 'base'
      ? { kind: 'base', id: String(d.source.id) }
      : { kind: 'tf', number: Number(d.source?.number) };
    const label = src.kind === 'tf' ? `TF ${src.number}` : src.id;
    const capacity = sourceCapacity(state, side, src);
    if (capacity <= 0) fail(`${label} cannot search this turn`);
    const key = sourceKey(src);
    used[key] = (used[key] ?? 0) + 1;
    if (used[key] > capacity) fail(`${label} may place at most ${capacity} zone${capacity === 1 ? '' : 's'}`);
    const from = sourceHex(state, side, src) ?? d.sourceHex;
    if (!from || !map.has(from)) fail(`Enter the current board hex of ${label}`);
    if (!map.has(d.center)) fail(`Hex ${d.center} is not on the map`);
    if (hexDist(from, d.center) > ZONE_RANGE) fail(`Zone centre ${d.center} is more than ${ZONE_RANGE} hexes from ${label}`);
    return { id: `${side}-${i + 1}`, source: src, sourceHex: from, center: d.center };
  });
}

/**
 * Resolve one zone: one chit for the whole zone. The searcher is told counts by
 * type and nothing else; no Task Force changes status.
 */
export function resolveZone(state: GameState, searcher: Side, zone: Zone, rng: Rng): SearchResult {
  const map = getMap(state.mapId);
  const owner = other(searcher);
  const tfs = state.tfs[owner];
  const chit = drawChit(state, rng); // drawn even if the zone turns out to be empty
  const kind = chitKind(chit);
  const hexes = new Set(map.zone(zone.center));
  const targets = hiddenTfs(tfs).filter((t) => hexes.has(t.hex!));
  const trueCarriers = targets.filter((t) => trueType(tfs, t) === 'carrier').length;
  const trueFleets = targets.length - trueCarriers;
  // The cap: the owner's hidden Carrier Task Forces anywhere on the map. Revealed carriers do not count.
  const cap = hiddenTfs(tfs).filter((t) => trueType(tfs, t) === 'carrier').length;

  let carriers = 0, fleets = 0;
  if (kind === 'detected') {
    carriers = trueCarriers;
    fleets = trueFleets;
  } else if (kind === 'misdirect') {
    // Every true carrier is counted as a Fleet; min(F, cap) of the true fleets are counted as Carriers.
    carriers = Math.min(trueFleets, cap);
    fleets = targets.length - carriers;
  }

  const result: SearchResult = {
    kind: 'zone', side: searcher, day: state.day, turn: state.turn, zoneId: zone.id, center: zone.center,
    chits: [chit], chitKind: kind, cap, carriers, fleets,
    targets: targets.map((t) => ({ number: t.number, hex: t.hex!, trueType: trueType(tfs, t), sighted: kind !== 'noContact' })),
  };
  state.results.push(result);
  if (carriers + fleets > 0) {
    state.pins[searcher].push({ side: searcher, day: state.day, turn: state.turn, kind: 'zone', center: zone.center, carriers, fleets });
  }
  addLog(state, searcher, 'search',
    `Zone ${zone.center}: chit ${chit ?? 'none (cup empty)'} = ${kind}, cap ${cap}; `
    + (targets.length
      ? `${result.targets.map((t) => `${SIDE_NAME[owner]} TF ${t.number} at ${t.hex} (${t.trueType})`).join(', ')}; reported ${countText(carriers, fleets) ?? 'no contact'}`
      : 'zone empty'),
    'end');
  return result;
}

/** Called when both sides have locked their zones: initiative player's zones first, in the order drafted. */
export function resolveRecon(state: GameState, rng: Rng) {
  const first = turnInfo(state.turn).initiative;
  for (const searcher of [first, other(first)]) {
    const zones = state.searchOrders[searcher];
    const lines: string[] = [];
    const sighted = new Set<number>();
    for (const zone of zones) {
      const r = resolveZone(state, searcher, zone, rng);
      const counts = countText(r.carriers, r.fleets);
      lines.push(`Zone ${zone.center}: ${counts ? `${counts} sighted` : 'No contact'}`);
      for (const t of r.targets) if (t.sighted) sighted.add(t.number);
    }
    if (zones.length) notify(state, searcher, 'results', `Search results\n${lines.join('\n')}`);
    if (sighted.size) notify(state, other(searcher), 'sighted', sightedText([...sighted]));
  }
  state.stage = 'resolved';
}

/** The owner learns only which of their own Task Forces were sighted: no type, no zone. */
function sightedText(numbers: number[]): string {
  const sorted = numbers.sort((a, b) => a - b);
  return `${names(sorted)} ${sorted.length === 1 ? 'was' : 'were'} sighted this turn. ${sorted.length === 1 ? 'It stays' : 'They stay'} hidden.`;
}

/** The optional-rule searches a side may run right now. */
export function availableSearches(state: GameState, side: Side): OptionalRule[] {
  if (state.phase !== 'board') return [];
  return (getMap(state.mapId).def.optionalRules ?? []).filter((r) =>
    state.optionalRules.includes(r.id) && r.side === side && r.turns.includes(state.turn) && !state.rulesUsed.includes(r.id));
}

/**
 * A scenario search switched on at session creation, e.g. Midway's PBY night
 * search: one chit per enemy hidden Task Force within the radius. A hit reports
 * "Fleet sighted" with the exact hex and no type. Nothing changes status.
 */
export function optionalSearch(state: GameState, side: Side, ruleId: string, rng: Rng): SearchResult {
  const rule = availableSearches(state, side).find((r) => r.id === ruleId);
  if (!rule) fail('That search is not available right now');
  const owner = other(side);
  const tfs = state.tfs[owner];
  const result: SearchResult = {
    kind: 'pby', side, day: state.day, turn: state.turn, center: rule.center, radius: rule.radius,
    chits: [], targets: [], carriers: 0, fleets: 0,
  };
  const seen: TaskForce[] = [];
  for (const t of hiddenTfs(tfs).filter((x) => hexDist(rule.center, x.hex!) <= rule.radius)) {
    const chit = drawChit(state, rng);
    const hit = chitKind(chit) !== 'noContact';
    result.chits.push(chit);
    result.targets.push({ number: t.number, hex: t.hex!, trueType: trueType(tfs, t), sighted: hit });
    if (hit) {
      seen.push(t);
      state.pins[side].push({ side, day: state.day, turn: state.turn, kind: 'pby', center: t.hex! });
    }
  }
  state.rulesUsed.push(rule.id);
  state.results.push(result);
  notify(state, side, 'pby',
    `${rule.label}\n${seen.length ? seen.map((t) => `Fleet sighted at ${t.hex}`).join('\n') : 'No sightings.'}`);
  notify(state, owner, 'pby',
    `The ${SIDE_NAME[side]} side ran its ${rule.label}. `
    + (seen.length ? sightedText(seen.map((t) => t.number)) : 'None of your Task Forces were sighted.'));
  addLog(state, side, 'pby',
    `${rule.label}, ${rule.center} radius ${rule.radius}: `
    + (result.targets.length
      ? result.targets.map((t, i) => `${SIDE_NAME[owner]} TF ${t.number} at ${t.hex}: chit ${result.chits[i] ?? 'none'} = ${chitKind(result.chits[i])}`).join('; ')
      : 'nothing in range, no chits drawn'),
    'end');
  return result;
}

/** A manual reveal by the owner: the marker goes on the board and the opponent is told. */
export function manualReveal(state: GameState, side: Side, number: number, reason: RevealReason) {
  const hex = revealTf(state, side, number, reason);
  const why = REASON_TEXT[reason];
  notify(state, other(side), 'reveal', `${SIDE_NAME[side]} TF ${number} is revealed at ${hex} (${why}).`);
  notify(state, side, 'reveal', `You revealed TF ${number} (${why}): place its marker numbered side up at ${hex}.`, 'Placed');
}

/**
 * The defender's lookup for a raided hex: their hidden Task Forces in the hex;
 * if none, those in the six adjacent hexes, grouped by hex.
 */
export function raidLookup(state: GameState, side: Side, hex: string): RaidCheck {
  const map = getMap(state.mapId);
  if (!map.has(hex)) fail(`Hex ${hex} is not on the map`);
  const at = (h: string) => hiddenTfs(state.tfs[side]).filter((t) => t.hex === h).map((t) => t.number);
  const here = at(hex);
  if (here.length) return { hex, adjacent: false, groups: [{ hex, numbers: here }] };
  const groups = map.neighbors(hex).sort().map((h) => ({ hex: h, numbers: at(h) })).filter((g) => g.numbers.length);
  return { hex, adjacent: true, groups };
}
