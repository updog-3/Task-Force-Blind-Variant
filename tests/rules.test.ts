import { describe, expect, it } from 'vitest';
import {
  applyAction, chitKind, CUP_SIZE, drawChit, getMap, hexDist, resolveZone, seededRng, turnInfo, viewFor,
  RuleError, type GameState, type Side, type Zone, type ZoneDraft,
} from '../rules';
import { act, advance, game, move, rng, tf, toBoard, toRecon } from './helpers';

const map = getMap('midway');
const zone = (center: string): Zone =>
  ({ id: 'allies-1', source: { kind: 'tf', number: 1 }, sourceHex: center, center });
const DETECTED = 5, MISDIRECT = 35, NO_CONTACT = 50;
/** Draws the cup's chits in the order listed. */
const inOrder = { int: () => 0 };

describe('hex grid', () => {
  it('2011 touches its six printed neighbours and is 2 from 2110', () => {
    for (const n of ['2010', '2012', '1911', '1912', '2111', '2112']) expect(hexDist('2011', n)).toBe(1);
    expect(hexDist('2011', '2110')).toBe(2);
    expect(map.neighbors('2011').sort()).toEqual(['1911', '1912', '2010', '2012', '2111', '2112']);
  });

  it('Midway has 536 hexes with the right corners', () => {
    expect(map.hexes.length).toBe(536);
    expect(map.has('0101')).toBe(false);
    expect(map.has('0120')).toBe(false);
    expect(map.has('0201')).toBe(true);
    expect(map.has('2919')).toBe(true);
    expect(map.isEdge('0201')).toBe(true);
    expect(map.isEdge('1409')).toBe(false);
  });
});

describe('turn table', () => {
  it('gives period, move, recon and initiative for all 24 turns', () => {
    const night = [1, 2, 11, 12, 13, 14, 23, 24];
    const recon = [3, 4, 5, 6, 7, 8, 15, 16, 17, 18, 19, 20];
    for (let t = 1; t <= 24; t++) {
      const i = turnInfo(t);
      expect(i.period, `turn ${t}`).toBe(night.includes(t) ? 'night' : 'day');
      expect(i.move, `turn ${t}`).toBe(night.includes(t) ? 2 : 1);
      expect(i.splits, `turn ${t}`).toBe(night.includes(t));
      expect(i.recon, `turn ${t}`).toBe(recon.includes(t));
      expect(i.initiative, `turn ${t}`).toBe(t % 2 ? 'ijn' : 'allies');
      expect(i.dusk, `turn ${t}`).toBe(t === 10 || t === 22);
      expect(i.transportsMove, `turn ${t}`).toBe(night.includes(t) || t % 2 === 1);
    }
  });
});

describe('movement', () => {
  it('night: the initiative player is blocked by an enemy starting hex and stops one hex short', () => {
    // Turn 1: IJN initiative. 1005 -> 1105 -> 1205, enemy starts in 1205.
    let s = game(1, { ijn: { 1: '1005' }, allies: { 1: '1205' } });
    s = move(s, { 1: ['1105', '1205'] }, {});
    expect(s.notices.some((n) => n.to === 'ijn' && n.kind === 'blocked')).toBe(true);
    expect(s.notices.some((n) => n.to === 'allies' && n.kind === 'blocked')).toBe(false);
    // It stopped at 1105, adjacent to the blocker, so the contact check revealed both.
    expect(tf(s, 'ijn', 1)).toMatchObject({ status: 'revealed', lastHex: '1105' });
    expect(tf(s, 'allies', 1)).toMatchObject({ status: 'revealed', lastHex: '1205' });
  });

  it('night: the second player is blocked by a hex the initiative player ended in', () => {
    let s = game(1, { ijn: { 1: '1005' }, allies: { 1: '1405' } });
    s = move(s, { 1: ['1105', '1205'] }, { 1: ['1305', '1205'] });
    expect(tf(s, 'ijn', 1).lastHex).toBe('1205');
    expect(tf(s, 'allies', 1).lastHex).toBe('1305');
    expect(s.notices.some((n) => n.to === 'allies' && n.kind === 'blocked')).toBe(true);
    expect(s.notices.some((n) => n.to === 'ijn' && n.kind === 'blocked')).toBe(false);
  });

  it('a swap: the initiative player is blocked, then the second player is blocked by its position', () => {
    let s = game(1, { ijn: { 1: '1005' }, allies: { 1: '1006' } });
    s = move(s, { 1: ['1006'] }, { 1: ['1005'] });
    expect(tf(s, 'ijn', 1).lastHex).toBe('1005');
    expect(tf(s, 'allies', 1).lastHex).toBe('1006');
    expect(s.notices.filter((n) => n.kind === 'blocked').map((n) => n.to).sort()).toEqual(['allies', 'ijn']);
  });

  it('passing through a hex the enemy vacated earlier in the same resolution is legal', () => {
    // Allies have the initiative on turn 2 and leave 1205; the IJN then passes through it.
    let s = game(2, { ijn: { 1: '1105' }, allies: { 1: '1205' } });
    s = move(s, { 1: ['1205', '1305'] }, { 1: ['1206', '1207'] });
    expect(s.notices.some((n) => n.kind === 'blocked')).toBe(false);
    expect(tf(s, 'ijn', 1)).toMatchObject({ status: 'hidden', hex: '1305' });
    expect(tf(s, 'allies', 1)).toMatchObject({ status: 'hidden', hex: '1207' });
  });

  it('path length follows the turn table; a Task Force may leave from an edge hex only', () => {
    const s = game(3, { ijn: { 1: '0201', 2: '1005' } });
    expect(() => act(s, 'ijn', { type: 'setMoveOrder', ops: [], moves: { 2: ['1105', '1205'] } })).toThrow(RuleError);
    expect(() => act(s, 'ijn', { type: 'setMoveOrder', ops: [], moves: { 2: ['1205'] } })).toThrow(/adjacent/);
    expect(() => act(s, 'ijn', { type: 'setMoveOrder', ops: [], moves: { 2: ['EXIT'] } })).toThrow(/edge/);
    const r = move(s, { 1: ['EXIT'] }, {});
    expect(tf(r, 'ijn', 1).status).toBe('gone');
    const told = r.notices.find((n) => n.to === 'allies' && n.kind === 'exit')!;
    expect(told.text).not.toMatch(/TF/);
  });

  it('enforceTransports limits flagged Task Forces', () => {
    let s = game(1, { ijn: { 7: '1005' } }, { enforceTransports: true });
    s = act(s, 'ijn', { type: 'editTf', number: 7, hasTransports: true });
    expect(() => act(s, 'ijn', { type: 'setMoveOrder', ops: [], moves: { 7: ['1105', '1205'] } })).toThrow(/at most 1/);
    let d = game(4, { ijn: { 7: '1005' } }, { enforceTransports: true });
    d = act(d, 'ijn', { type: 'editTf', number: 7, hasTransports: true });
    expect(() => act(d, 'ijn', { type: 'setMoveOrder', ops: [], moves: { 7: ['1105'] } })).toThrow(/at most 0/);
  });
});

describe('contact', () => {
  it('adjacent opposing hidden Task Forces are both Revealed', () => {
    let s = game(3, { ijn: { 1: '1005', 7: '0303' }, allies: { 1: '1007', 8: '2510' } });
    s = move(s, { 1: ['1006'] }, {});
    expect(tf(s, 'ijn', 1)).toMatchObject({ status: 'revealed', lastHex: '1006' });
    expect(tf(s, 'ijn', 1).hex).toBeUndefined();
    expect(tf(s, 'allies', 1).status).toBe('revealed');
    expect(tf(s, 'ijn', 7).status).toBe('hidden');
    expect(tf(s, 'allies', 8).status).toBe('hidden');
    expect(s.notices.filter((n) => n.kind === 'contact' && n.button === 'Placed').length).toBe(2);
  });

  it('a hidden Task Force in an enemy base hex is Revealed', () => {
    let s = game(3, { ijn: { 7: '1408' }, allies: { 1: '1409' } });
    s.tfs.allies[1].hex = '2510'; // keep the Allied TF clear of the contact
    s = move(s, { 7: ['1409'] }, {});
    expect(tf(s, 'ijn', 7)).toMatchObject({ status: 'revealed', revealReason: 'base', lastHex: '1409' });
    expect(tf(s, 'allies', 1).status).toBe('hidden'); // own base does not reveal
  });
});

describe('splits and merges', () => {
  it('a split is rejected on day turns and when no number is free', () => {
    const day = game(3, { ijn: { 1: '1005' } });
    expect(() => act(day, 'ijn', { type: 'setMoveOrder', ops: [{ type: 'split', from: 1, to: 9 }], moves: {} }))
      .toThrow(/night/);
    const all = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [i + 1, '1005']));
    const night = game(1, { ijn: all });
    for (let to = 7; to <= 13; to++) {
      expect(() => act(night, 'ijn', { type: 'setMoveOrder', ops: [{ type: 'split', from: 1, to }], moves: {} }))
        .toThrow(/in use/);
    }
    expect(() => act(night, 'ijn', { type: 'setMoveOrder', ops: [{ type: 'split', from: 1, to: 6 }], moves: {} }))
      .toThrow(/7 to 13/);
  });

  it('a night split makes a new Task Force that gets its own move', () => {
    let s = game(1, { ijn: { 3: '1005' } });
    s = act(s, 'ijn', { type: 'setMoveOrder', ops: [{ type: 'split', from: 3, to: 9 }], moves: { 9: ['1105', '1205'] } });
    s = move2(s);
    expect(tf(s, 'ijn', 3).hex).toBe('1005');
    expect(tf(s, 'ijn', 9)).toMatchObject({ status: 'hidden', hex: '1205' });
  });

  it('absorbing a Carrier Task Force into a Fleet Task Force is rejected; carriers can only combine', () => {
    const s = game(3, { ijn: { 1: '1005', 2: '1005', 7: '1005', 8: '1005' } });
    const merge = (keep: number, o: number, mode: 'absorb' | 'combine') =>
      act(s, 'ijn', { type: 'setMoveOrder', ops: [{ type: 'merge', keep, other: o, mode }], moves: {} });
    expect(() => merge(7, 1, 'absorb')).toThrow(/cannot be absorbed/);
    expect(() => merge(1, 2, 'absorb')).toThrow(/only combine/);
    expect(() => merge(1, 2, 'combine')).not.toThrow();
    expect(() => merge(1, 7, 'absorb')).not.toThrow();
    let r = merge(7, 8, 'absorb');
    r = move2(r);
    expect(tf(r, 'ijn', 8).status).toBe('gone');
    // A Fleet TF combined with a carrier reports as a carrier, and can split back at night.
    let c = merge(7, 1, 'combine');
    c = move2(c);
    expect(tf(c, 'ijn', 1)).toMatchObject({ status: 'combined', combinedInto: 7 });
    expect(tf(c, 'ijn', 7).combinedWith).toEqual([1]);
  });

  it('merging needs a shared hex', () => {
    const s = game(3, { ijn: { 7: '1005', 8: '1006' } });
    expect(() => act(s, 'ijn', { type: 'setMoveOrder', ops: [{ type: 'merge', keep: 7, other: 8, mode: 'absorb' }], moves: {} }))
      .toThrow(/share a hex/);
  });
});

function move2(s: GameState): GameState {
  s = act(s, 'ijn', { type: 'lock', value: true });
  return act(s, 'allies', { type: 'lock', value: true });
}

describe('reconnaissance', () => {
  const draft = (center: string): ZoneDraft => ({ source: { kind: 'tf', number: 1 }, center });

  it('a zone centre 9 hexes from its source is rejected; 8 is accepted', () => {
    const s = toRecon(game(3, { ijn: { 7: '0219' }, allies: { 1: '2010' } }));
    expect(hexDist('2010', '1210')).toBe(8);
    expect(hexDist('2010', '1110')).toBe(9);
    expect(() => act(s, 'allies', { type: 'setSearchOrder', zones: [draft('1110')] })).toThrow(/more than 8/);
    const ok = act(s, 'allies', { type: 'setSearchOrder', zones: [draft('1210')] });
    expect(ok.searchOrders.allies.length).toBe(1);
    // No more zones than the source's count (Allies default 3).
    expect(() => act(s, 'allies', { type: 'setSearchOrder', zones: [1, 2, 3, 4].map(() => draft('1210')) })).toThrow(/at most 3/);
    // A Fleet Task Force is not a source.
    expect(() => act(s, 'ijn', { type: 'setSearchOrder', zones: [{ source: { kind: 'tf', number: 7 }, center: '0218' }] }))
      .toThrow(/cannot search/);
  });

  // Worked examples: the IJN has hidden carriers TF 1, TF 2 and hidden fleets TF 7, 8, 9 unless stated.
  // TF 7, 8, 9 sit inside the zone around 1005; the carriers are far away.
  const base = () => game(3, {
    ijn: { 1: '0303', 2: '0305', 7: '1005', 8: '1006', 9: '1105' },
    allies: { 1: '1607' },
  });
  /** Resolve one Allied zone around 1005 with the chit forced; nothing may change status or hex. */
  const run = (s: GameState, chit: number) => {
    s.cup = [chit];
    const before = JSON.stringify(s.tfs);
    const r = resolveZone(s, 'allies', zone('1005'), rng());
    expect(JSON.stringify(s.tfs), 'every target is still Hidden at the same hex').toBe(before);
    expect(s.cup.length).toBe(0);
    return r;
  };
  const away = (s: GameState, ...numbers: number[]) => { numbers.forEach((n, i) => { s.tfs.ijn[n].hex = `03${10 + i * 2}`; }); return s; };

  it('example 1: three fleets, Detected: 3 Fleets', () => {
    expect(run(base(), DETECTED)).toMatchObject({ carriers: 0, fleets: 3 });
  });
  it('example 2: three fleets, Misdirect, cap 2: 2 Carriers, 1 Fleet', () => {
    expect(run(base(), MISDIRECT)).toMatchObject({ cap: 2, carriers: 2, fleets: 1 });
  });
  it('example 3: TF 1 and TF 7, Detected: 1 Carrier, 1 Fleet', () => {
    const s = away(base(), 8, 9);
    s.tfs.ijn[1].hex = '1006';
    expect(run(s, DETECTED)).toMatchObject({ carriers: 1, fleets: 1 });
  });
  it('example 4: TF 1 and TF 7, Misdirect, cap 2: 1 Carrier, 1 Fleet', () => {
    const s = away(base(), 8, 9);
    s.tfs.ijn[1].hex = '1006';
    expect(run(s, MISDIRECT)).toMatchObject({ cap: 2, carriers: 1, fleets: 1 });
  });
  it('example 5: TF 1 alone, Misdirect, cap 2: 1 Fleet', () => {
    const s = away(base(), 7, 8, 9);
    s.tfs.ijn[1].hex = '1006';
    expect(run(s, MISDIRECT)).toMatchObject({ cap: 2, carriers: 0, fleets: 1 });
  });
  it('example 6: TF 7 and TF 8, both carriers Revealed on the board, Misdirect, cap 0: 2 Fleets', () => {
    let s = away(base(), 9);
    s = act(s, 'ijn', { type: 'reveal', number: 1, reason: 'voluntary' });
    s = act(s, 'ijn', { type: 'reveal', number: 2, reason: 'launched' });
    expect(run(s, MISDIRECT)).toMatchObject({ cap: 0, carriers: 0, fleets: 2 });
  });
  it('example 7: TF 7, No Contact: no contact', () => {
    const r = run(away(base(), 8, 9), NO_CONTACT);
    expect(r).toMatchObject({ carriers: 0, fleets: 0 });
    expect(r.targets).toMatchObject([{ number: 7, sighted: false }]);
  });

  /** The real phase flow: the Allies place zones, both lock, chits come out in the order given. */
  function search(s: GameState, centers: string[], chits: number[]) {
    s = toRecon(s);
    s = act(s, 'allies', { type: 'setSearchOrder', zones: centers.map(draft) });
    s.cup = [...chits];
    s = act(s, 'allies', { type: 'lock', value: true }, inOrder);
    s = act(s, 'ijn', { type: 'lock', value: true }, inOrder);
    expect(s.stage).toBe('resolved');
    return s;
  }
  const results = (s: GameState, side: 'ijn' | 'allies' = 'allies') => s.notices.find((n) => n.to === side && n.kind === 'results')?.text;

  it('example 8: an empty zone reads "No contact" and the chit is still spent', () => {
    for (const chit of [DETECTED, MISDIRECT, NO_CONTACT]) {
      const s = search(base(), ['2008'], [chit, 54]);
      expect(s.cup).toEqual([54]);
      expect(results(s)).toBe('Search results\nZone 2008: No contact');
      expect(s.notices.filter((n) => n.to === 'ijn').length).toBe(0);
      expect(s.pins.allies).toEqual([]);
    }
    // An empty zone and a No Contact read the same.
    expect(results(search(base(), ['1005'], [NO_CONTACT]))).toBe('Search results\nZone 1005: No contact');
  });

  it('the Misdirect cap counts hidden carriers only; a Revealed carrier does not raise it', () => {
    let s = base();
    expect(run(structuredClone(s), MISDIRECT).cap).toBe(2);
    s = act(s, 'ijn', { type: 'reveal', number: 2, reason: 'voluntary' });
    expect(run(s, MISDIRECT)).toMatchObject({ cap: 1, carriers: 1, fleets: 2 });
  });

  it('a Misdirect never reports more Carriers than the cap, across 1,000 seeded runs', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const r = seededRng(seed);
      const s = game(3, { ijn: { 13: '0219' }, allies: { 1: '2510' } });
      const hexes = map.zone('1806');
      const ijn = s.tfs.ijn;
      // Random mix: each of TF 1-13 is hidden in the zone, hidden elsewhere, revealed, or absent.
      for (let n = 1; n <= 13; n++) {
        const roll = r.int(4);
        delete ijn[n];
        if (roll === 3) continue;
        ijn[n] = { side: 'ijn', number: n, status: roll === 2 ? 'revealed' : 'hidden',
          hex: roll === 0 ? hexes[r.int(hexes.length)] : roll === 1 ? '0303' : undefined,
          carrierPresent: n <= 6 && r.int(4) > 0, hasTransports: false, combinedWith: [], zoneCount: 0 };
      }
      s.cup = [31 + r.int(12)];
      const res = resolveZone(s, 'allies', zone('1806'), r);
      expect(res.chitKind).toBe('misdirect');
      const hiddenCarriers = Object.values(ijn).filter((t) => t.status === 'hidden' && t.number <= 6 && t.carrierPresent).length;
      expect(res.cap).toBe(hiddenCarriers);
      expect(res.carriers).toBeLessThanOrEqual(res.cap!);
      const fleets = res.targets.filter((t) => t.trueType === 'fleet').length;
      expect(res.carriers).toBe(Math.min(fleets, res.cap!));
      expect(res.carriers + res.fleets).toBe(res.targets.length);
      expect(res.targets.every((t) => ijn[t.number].status === 'hidden')).toBe(true);
    }
  });

  it('two overlapping zones over one Task Force draw two chits and resolve independently', () => {
    const one = () => game(3, { ijn: { 7: '1005' }, allies: { 1: '1607' } });
    const both = search(one(), ['1005', '1006'], [DETECTED, DETECTED, 54]);
    expect(both.cup).toEqual([54]);
    expect(results(both)).toBe('Search results\nZone 1005: 1 Fleet Task Force sighted\nZone 1006: 1 Fleet Task Force sighted');
    const first = search(one(), ['1005', '1006'], [MISDIRECT, NO_CONTACT]);
    expect(results(first)).toBe('Search results\nZone 1005: 1 Fleet Task Force sighted\nZone 1006: No contact');
    const second = search(one(), ['1005', '1006'], [NO_CONTACT, DETECTED]);
    expect(results(second)).toBe('Search results\nZone 1005: No contact\nZone 1006: 1 Fleet Task Force sighted');
    const neither = search(one(), ['1005', '1006'], [NO_CONTACT, NO_CONTACT]);
    expect(neither.notices.filter((n) => n.to === 'ijn')).toEqual([]);
    for (const s of [both, first, second, neither]) expect(tf(s, 'ijn', 7)).toMatchObject({ status: 'hidden', hex: '1005' });
  });

  it("the searcher's view of a result contains counts only: no numbers, no hexes inside the zone, no chit", () => {
    // TF 1 (carrier) at 1006 and TF 7, TF 8 at 1105: inside the zone around 1005, but not at its centre.
    const s = search(game(3, { ijn: { 1: '1006', 7: '1105', 8: '1105', 9: '0312' }, allies: { 1: '1607' } }), ['1005'], [DETECTED]);
    const view = viewFor(s, 'allies');
    expect(results(s)).toBe('Search results\nZone 1005: 1 Carrier Task Force, 2 Fleet Task Forces sighted');
    expect(view.pins).toEqual([{ side: 'allies', day: 1, turn: 3, kind: 'zone', center: '1005', carriers: 1, fleets: 2 }]);
    const json = JSON.stringify(view);
    for (const hex of ['1006', '1105', '0312']) expect(json).not.toContain(hex);
    expect(json).not.toMatch(/TF [789]\b/);
    expect(json).not.toMatch(/chit \d|"chits"|chitKind|cap \d|trueType|"targets"/);
    // Pins go only to the side that owns them.
    expect(viewFor(s, 'ijn').pins).toEqual([]);
  });

  it("the owner's notice lists exactly the Task Forces in a zone whose chit was Detected or Misdirect", () => {
    // Zone 1005 holds TF 7 and TF 8 (Detected); zone 0905 holds TF 9 (No Contact); zone 1008 holds TF 1 (Misdirect).
    const s = search(
      game(3, { ijn: { 1: '1008', 2: '0303', 7: '1005', 8: '1006', 9: '0804' }, allies: { 1: '1607' } }),
      ['1005', '0905', '1008'], [DETECTED, NO_CONTACT, MISDIRECT],
    );
    expect(map.zone('0905')).toContain('0804');
    expect(map.zone('1005')).not.toContain('0804');
    const told = s.notices.filter((n) => n.to === 'ijn');
    expect(told.length).toBe(1);
    expect(told[0].text).toMatch(/^TF 1, TF 7 and TF 8 were sighted this turn\./);
    expect(told[0].text).not.toMatch(/TF 9|TF 2|Carrier|Fleet|1005|1008|0905/);
    expect(told[0].text).toBe('TF 1, TF 7 and TF 8 were sighted this turn. They stay hidden.');
    // The IJN owner sees no pins and nothing about where the zones were.
    expect(JSON.stringify(viewFor(s, 'ijn'))).not.toContain('0905');
  });
});

describe('the cup', () => {
  it('chit ranges', () => {
    expect([1, 30, 31, 42, 43, 54].map(chitKind))
      .toEqual(['detected', 'detected', 'misdirect', 'misdirect', 'noContact', 'noContact']);
  });

  it('never yields the same chit twice between refills', () => {
    const s = game(3, {});
    const r = seededRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < CUP_SIZE; i++) seen.add(drawChit(s, r)!);
    expect(seen.size).toBe(54);
    expect(s.cup.length).toBe(0);
    expect(drawChit(s, r)).not.toBeNull(); // reshuffle
    expect(s.cup.length).toBe(53);
    const n = game(3, {}, { cupEmpty: 'noContact' });
    n.cup = [];
    expect(drawChit(n, r)).toBeNull();
    expect(chitKind(null)).toBe('noContact');
  });

  it('refills at dusk and after night turns, but not after ordinary day turns', () => {
    const turn = (s: GameState) => {
      s = advance(move(s, {}, {})); // -> board
      s = advance(s); // -> recon, dusk or the next turn
      if (s.phase === 'recon') {
        s = act(act(s, 'ijn', { type: 'lock', value: true }), 'allies', { type: 'lock', value: true });
        s = advance(s);
      }
      return s;
    };
    let night = game(2, {});
    night.cup = [1, 2, 3];
    night = turn(night);
    expect(night.turn).toBe(3);
    expect(night.cup.length).toBe(54);
    let day = game(5, {});
    day.cup = [1, 2, 3];
    day = turn(day);
    expect(day.turn).toBe(6);
    expect(day.cup.length).toBe(3);
    let dusk = game(10, {});
    dusk.cup = [1, 2, 3];
    dusk = turn(dusk);
    expect(dusk.turn).toBe(11);
    expect(dusk.cup.length).toBe(54);
    let wrap = game(24, {});
    wrap = turn(wrap);
    expect([wrap.turn, wrap.day]).toEqual([1, 2]);
  });
});

describe('raid check', () => {
  const setup = () => toBoard(game(3, { ijn: { 7: '1005', 8: '1005', 9: '1006', 1: '0303' }, allies: { 1: '2510' } }));

  it('lists hidden Task Forces in the tapped hex; if none, those in adjacent hexes; if none, nothing', () => {
    const s = setup();
    expect(act(s, 'ijn', { type: 'raidCheck', hex: '1005' }).raidCheck.ijn)
      .toEqual({ hex: '1005', adjacent: false, groups: [{ hex: '1005', numbers: [7, 8] }] });
    // 1106 touches both 1005 and 1006; the raided hex itself is empty.
    expect(map.neighbors('1106')).toEqual(expect.arrayContaining(['1005', '1006']));
    expect(act(s, 'ijn', { type: 'raidCheck', hex: '1106' }).raidCheck.ijn)
      .toEqual({ hex: '1106', adjacent: true, groups: [{ hex: '1005', numbers: [7, 8] }, { hex: '1006', numbers: [9] }] });
    expect(act(s, 'ijn', { type: 'raidCheck', hex: '2015' }).raidCheck.ijn).toEqual({ hex: '2015', adjacent: true, groups: [] });
    expect(() => act(s, 'ijn', { type: 'raidCheck', hex: '0101' })).toThrow(/not on the map/);
    expect(() => act(game(3, {}), 'ijn', { type: 'raidCheck', hex: '1005' })).toThrow(/Board phases/);
  });

  it('alone sends nothing to the opponent; Reveal all reveals each listed Task Force as Raided', () => {
    const s = setup();
    const before = JSON.stringify(viewFor(s, 'allies'));
    let c = act(s, 'ijn', { type: 'raidCheck', hex: '1106' });
    expect(JSON.stringify(viewFor(c, 'allies'))).toBe(before);
    expect(viewFor(c, 'ijn').raidCheck!.groups.length).toBe(2);
    expect(c.log.at(-1)).toMatchObject({ action: 'raidcheck', visibility: 'end' });
    expect(() => act(s, 'ijn', { type: 'raidReveal' })).toThrow(/raid check first/);
    c = act(c, 'ijn', { type: 'raidReveal' });
    for (const n of [7, 8, 9]) expect(tf(c, 'ijn', n)).toMatchObject({ status: 'revealed', revealReason: 'raided' });
    expect(tf(c, 'ijn', 7).lastHex).toBe('1005');
    expect(tf(c, 'ijn', 1).status).toBe('hidden');
    const told = c.notices.filter((n) => n.to === 'allies').map((n) => n.text);
    expect(told).toEqual([
      'IJN TF 7 is revealed at 1005 (Raided).', 'IJN TF 8 is revealed at 1005 (Raided).', 'IJN TF 9 is revealed at 1006 (Raided).',
    ]);
    expect(c.raidCheck.ijn).toBeNull();
    // Launching a raid reveals the launching Task Force.
    const l = act(c, 'ijn', { type: 'reveal', number: 1, reason: 'launched' });
    expect(l.notices.at(-2)!.text).toBe('IJN TF 1 is revealed at 0303 (Launched raid).');
  });
});

describe('Midway PBY search (optional rule)', () => {
  const place = { ijn: { 1: '1401', 2: '1009', 7: '1411', 8: '0102' }, allies: { 1: '2510' } };

  it('with the option off, no PBY action exists on any turn', () => {
    for (let turn = 1; turn <= 24; turn++) {
      const s = toBoard(game(turn, place));
      expect(viewFor(s, 'allies').searches).toEqual([]);
      expect(viewFor(s, 'ijn').searches).toEqual([]);
      expect(() => act(s, 'allies', { type: 'optionalSearch', ruleId: 'midwayPby' })).toThrow(/not available/);
    }
  });

  it('with it on, the action exists only for the Allied side on turns 1 and 2, once per turn', () => {
    for (let turn = 1; turn <= 24; turn++) {
      const s = game(turn, place, undefined, ['midwayPby', 'notARule']);
      expect(s.optionalRules).toEqual(['midwayPby']);
      expect(viewFor(s, 'allies').searches, 'only in the Board phases').toEqual([]);
      const b = toBoard(s);
      expect(viewFor(b, 'ijn').searches).toEqual([]);
      expect(viewFor(b, 'allies').searches.map((r) => r.id)).toEqual(turn <= 2 ? ['midwayPby'] : []);
      expect(() => act(b, 'ijn', { type: 'optionalSearch', ruleId: 'midwayPby' })).toThrow(/not available/);
    }
    let s = toBoard(game(1, place, undefined, ['midwayPby']));
    s = act(s, 'allies', { type: 'optionalSearch', ruleId: 'midwayPby' });
    expect(viewFor(s, 'allies').searches).toEqual([]);
    expect(() => act(s, 'allies', { type: 'optionalSearch', ruleId: 'midwayPby' })).toThrow(/not available/);
    s = toBoard(advance(s)); // it can also be skipped; either way turn 2 offers it again
    expect(s.turn).toBe(2);
    expect(viewFor(s, 'allies').searches.length).toBe(1);
  });

  it('draws one chit per IJN hidden Task Force within 8 hexes of 1409, reports exact hexes with no type, and leaves all Hidden', () => {
    let s = toBoard(game(1, place, undefined, ['midwayPby']));
    s = act(s, 'ijn', { type: 'reveal', number: 7, reason: 'voluntary' }); // a board marker in range is not a target
    s = act(act(s, 'ijn', { type: 'ack', id: 'all' }), 'allies', { type: 'ack', id: 'all' });
    s.tfs.ijn[9] = { ...s.tfs.ijn[8], number: 9, hex: '1509' };
    expect(['1401', '1009', '1509'].every((h) => hexDist('1409', h) <= 8)).toBe(true);
    expect(hexDist('1409', '0102')).toBeGreaterThan(8);
    s.cup = [DETECTED, MISDIRECT, NO_CONTACT, 54];
    const before = JSON.stringify(s.tfs);
    s = act(s, 'allies', { type: 'optionalSearch', ruleId: 'midwayPby' }, inOrder);
    expect(JSON.stringify(s.tfs)).toBe(before);
    expect(s.cup).toEqual([54]);
    expect(s.results.at(-1)).toMatchObject({ kind: 'pby', chits: [DETECTED, MISDIRECT, NO_CONTACT] });
    const told = s.notices.find((n) => n.to === 'allies' && n.kind === 'pby')!.text;
    expect(told).toBe('PBY night search (Midway scenario 6.5.2)\nFleet sighted at 1401\nFleet sighted at 1009');
    expect(viewFor(s, 'allies').pins).toEqual([
      { side: 'allies', day: 1, turn: 1, kind: 'pby', center: '1401' },
      { side: 'allies', day: 1, turn: 1, kind: 'pby', center: '1009' },
    ]);
    const owner = s.notices.find((n) => n.to === 'ijn' && n.kind === 'pby')!.text;
    expect(owner).toMatch(/TF 1 and TF 2 were sighted this turn/);
    expect(owner).not.toMatch(/TF 9|TF 8|TF 7/);
    // The IJN is told a search ran even when it finds nothing.
    let none = toBoard(game(2, { ijn: { 8: '0102' }, allies: { 1: '2510' } }, undefined, ['midwayPby']));
    none = act(none, 'allies', { type: 'optionalSearch', ruleId: 'midwayPby' });
    expect(none.cup.length).toBe(54);
    expect(none.notices.find((n) => n.to === 'ijn')!.text).toMatch(/ran its PBY night search.*None of your Task Forces were sighted/);
    expect(none.notices.find((n) => n.to === 'allies')!.text).toMatch(/No sightings/);
  });
});

describe('dusk reset', () => {
  it('every Task Force that was on the board is Hidden at the entered hex', () => {
    let s = game(10, { ijn: { 1: '0303', 7: '0305', 8: '0307' }, allies: { 1: '2510', 9: '2512' } });
    s = act(s, 'ijn', { type: 'reveal', number: 1, reason: 'launched' });
    s = act(s, 'ijn', { type: 'reveal', number: 7, reason: 'voluntary' });
    s = act(s, 'allies', { type: 'reveal', number: 9, reason: 'raided' });
    s = move(s, {}, {});
    s = advance(s); // -> board
    s = advance(s); // turn 10 has no recon -> dusk
    expect(s.phase).toBe('dusk');
    expect(() => act(s, 'ijn', { type: 'confirm', value: true })).toThrow(/TF 1/);
    s = act(s, 'ijn', { type: 'setDusk', number: 1, entry: { hex: '0606', carrierPresent: false } });
    s = act(s, 'ijn', { type: 'setDusk', number: 7, entry: { hex: '0707' } });
    s = act(s, 'allies', { type: 'setDusk', number: 9, entry: { gone: true } });
    s = act(s, 'ijn', { type: 'confirm', value: true });
    s = act(s, 'allies', { type: 'confirm', value: true });
    expect([s.turn, s.phase]).toEqual([11, 'movement']);
    expect(tf(s, 'ijn', 1)).toMatchObject({ status: 'hidden', hex: '0606', carrierPresent: false });
    expect(tf(s, 'ijn', 1).revealReason).toBeUndefined();
    expect(tf(s, 'ijn', 7)).toMatchObject({ status: 'hidden', hex: '0707' });
    expect(tf(s, 'ijn', 8)).toMatchObject({ status: 'hidden', hex: '0307' });
    expect(tf(s, 'allies', 9).status).toBe('gone');
    expect(s.cup.length).toBe(54);
    // TF 1 lost its carrier, so it is no longer a search source.
    expect(s.sources.ijn).toEqual([]);
  });
});

describe('state machine', () => {
  it('locks can be undone until both have locked; notices block the confirm button', () => {
    let s = game(3, { ijn: { 1: '1005' }, allies: { 1: '1007' } });
    s = act(s, 'ijn', { type: 'setMoveOrder', ops: [], moves: { 1: ['1006'] } });
    s = act(s, 'ijn', { type: 'lock', value: true });
    expect(() => act(s, 'ijn', { type: 'setMoveOrder', ops: [], moves: {} })).toThrow(/Unlock/);
    s = act(s, 'ijn', { type: 'lock', value: false });
    s = act(s, 'ijn', { type: 'lock', value: true });
    s = act(s, 'allies', { type: 'lock', value: true });
    expect(s.stage).toBe('resolved');
    expect(() => act(s, 'ijn', { type: 'confirm', value: true })).toThrow(/notices/);
    s = advance(s);
    expect(s.phase).toBe('board');
  });

  it('ending the game needs both players', () => {
    let s = game(3, { ijn: { 1: '1005' }, allies: { 1: '2510' } });
    expect(() => act(s, 'ijn', { type: 'confirmEnd' })).toThrow();
    s = act(s, 'ijn', { type: 'requestEnd' });
    expect(() => act(s, 'ijn', { type: 'confirmEnd' })).toThrow();
    s = act(s, 'allies', { type: 'confirmEnd' });
    expect(s.phase).toBe('ended');
    const v = viewFor(s, 'allies');
    expect(v.final!.tfs.ijn[0]).toMatchObject({ number: 1, hex: '1005' });
  });
});

describe('viewFor', () => {
  it('never leaks the other side\'s hidden hexes, hidden count, draft orders or chit numbers before the end', () => {
    // IJN data uses hexes and numbers that appear nowhere in Allied data.
    const secretHexes = ['0303', '0404', '0606', '0403'];
    let s = game(3, { ijn: { 2: '0303', 5: '0404', 11: '0404' }, allies: { 1: '2510', 8: '2512' } });
    const snapshots: GameState[] = [];
    const snap = (x: GameState) => { snapshots.push(x); return x; };
    snap(s);
    s = snap(act(s, 'ijn', { type: 'setMoveOrder', ops: [{ type: 'merge', keep: 5, other: 11, mode: 'combine' }], moves: { 2: ['0403'] } }));
    s = snap(act(s, 'ijn', { type: 'lock', value: true }));
    s = snap(act(s, 'allies', { type: 'lock', value: true }));
    s = snap(advance(s));
    s = snap(advance(s));
    expect(s.phase).toBe('recon');
    s = snap(act(s, 'ijn', { type: 'setSearchOrder', zones: [{ source: { kind: 'tf', number: 2 }, center: '0606' }] }));
    s = snap(act(s, 'allies', { type: 'setSearchOrder', zones: [{ source: { kind: 'tf', number: 1 }, center: '2010' }] }));
    s = act(s, 'ijn', { type: 'lock', value: true });
    s = snap(act(s, 'allies', { type: 'lock', value: true }));
    expect(s.results.length).toBe(2);

    for (const st of snapshots) {
      const view = viewFor(st, 'allies');
      const json = JSON.stringify(view);
      for (const hex of secretHexes) expect(json, `hex ${hex} in ${st.phase}/${st.stage}`).not.toContain(`"${hex}"`);
      expect(json).not.toMatch(/chit \d|"chits"|chitKind|cap \d/);
      expect(view.log.map((e) => e.seq)).toEqual(view.log.map((_, i) => i + 1)); // no gaps to count
      expect(json).not.toContain('"cup"');
      expect(view.tfs.every((t) => t.side === 'allies')).toBe(true);
      expect(view.tfs.length).toBe(2); // only own Task Forces: no count of the enemy's
      expect(view.final).toBeUndefined();
      expect(JSON.stringify(view.moveOrder)).not.toContain('merge');
      expect(view.searchOrder.every((z) => z.id.startsWith('allies'))).toBe(true);
      expect(view.log.every((e) => e.visibility === 'both' || e.side === 'allies')).toBe(true);
      // The only thing known about enemy orders is whether they are locked.
      expect(Object.keys(view).sort()).toEqual([
        'bases', 'confirmed', 'day', 'dusk', 'endRequest', 'flags', 'joined', 'locked', 'log', 'mapId', 'moveOrder',
        'notices', 'optionalRules', 'phase', 'pins', 'raidCheck', 'searchOrder', 'searches', 'sources', 'stage',
        'startingTurn', 'tfs', 'turn', 'turnInfo', 'you',
      ]);
    }
    // And the other way round.
    for (const st of snapshots) {
      const json = JSON.stringify(viewFor(st, 'ijn'));
      for (const hex of ['2510', '2512', '2010']) expect(json).not.toContain(`"${hex}"`);
    }
    // After the end, everything is shown.
    s = act(act(s, 'ijn', { type: 'requestEnd' }), 'allies', { type: 'confirmEnd' });
    const end = JSON.stringify(viewFor(s, 'allies'));
    expect(end).toContain('"0403"');
    expect(end).toMatch(/chit \d/);
  });

  it('sends the base zone count to its owner only', () => {
    const s = game(3, {});
    expect(viewFor(s, 'allies').bases[0].zoneCount).toBe(0);
    expect('zoneCount' in viewFor(s, 'ijn').bases[0]).toBe(false);
  });
});

void (0 as unknown as Side);
void applyAction;
