import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { getMap, hexDist, parseHex, seededRng, type Action, type SeatView, type Side } from '../rules';
import { startServer } from '../server/index';
import type { ServerMsg } from '../server/protocol';

type Server = Awaited<ReturnType<typeof startServer>>;
const map = getMap('midway');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfb-e2e-'));
const dbPath = path.join(dir, 'e2e.sqlite');
let server: Server;
let base = '';

const boot = async () => {
  server = await startServer({ port: 0, dbPath, clientDir: path.join(dir, 'none'), rng: seededRng(2026) });
  base = `http://localhost:${server.port}`;
};

async function until(cond: () => boolean, what: string) {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/** One player's device: a WebSocket holding that seat's latest view. */
class Seat {
  view!: SeatView;
  fatal: string | null = null;
  private ws!: WebSocket;
  private next = 1;
  private waiting = new Map<number, { resolve: (m: ServerMsg) => void; reject: (e: Error) => void }>();

  constructor(readonly session: string, public token: string) {}

  async connect() {
    this.ws = new WebSocket(`ws://localhost:${server.port}/ws`);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as ServerMsg;
      if (m.t === 'view') this.view = m.view;
      else if (m.t === 'ok') this.waiting.get(m.id)?.resolve(m);
      else if (m.id !== undefined) this.waiting.get(m.id)?.reject(new Error(m.message));
      else if (m.fatal) this.fatal = m.message;
    });
    await new Promise((r) => this.ws.once('open', r));
    this.ws.send(JSON.stringify({ t: 'hello', session: this.session, token: this.token }));
    await until(() => !!this.view || !!this.fatal, 'first view');
    return this;
  }

  private request(msg: object): Promise<ServerMsg> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ ...msg, id }));
    });
  }
  do(action: Action) { return this.request({ t: 'action', action }); }
  reissue(seat: Side) { return this.request({ t: 'reissue', seat }); }
  close() { this.ws.close(); }
  tf(n: number) { return this.view.tfs.find((t) => t.number === n)!; }
}

const post = async (url: string, body: unknown) => {
  const res = await fetch(base + url, { method: 'POST', body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() as any };
};

describe('a scripted two-seat Midway game, turns 1-11', () => {
  let ijn: Seat, allies: Seat;
  const seats = () => [ijn, allies];
  const inPhase = (phase: string, turn: number) =>
    until(() => seats().every((s) => s.view.phase === phase && s.view.turn === turn), `${phase} of turn ${turn}`);

  beforeAll(boot);
  afterAll(async () => {
    seats().forEach((s) => s?.close());
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Acknowledge notices and press the state's confirm button on both devices. */
  async function confirmBoth() {
    for (const s of seats()) {
      await until(() => s.view !== undefined, 'view');
      if (s.view.notices.length) await s.do({ type: 'ack', id: 'all' });
    }
    await ijn.do({ type: 'confirm', value: true });
    await allies.do({ type: 'confirm', value: true });
  }

  /** IJN TF 1 steams east, drifting north; everything else holds position. */
  function eastward(from: string, steps: number): string[] {
    const path: string[] = [];
    let at = from;
    for (let i = 0; i < steps; i++) {
      const col = parseHex(at)!.col;
      at = map.neighbors(at).filter((h) => parseHex(h)!.col === col + 1).sort()[0];
      path.push(at);
    }
    return path;
  }

  it('creates a session, hands out seats and rejects a reused invite', async () => {
    const info = await (await fetch(base + '/api/info')).json() as any;
    // Optional rules are listed per map, so the create form shows them only for the map that has them.
    expect(info.maps).toEqual([{
      id: 'midway', name: 'Midway',
      optionalRules: [{ id: 'midwayPby', label: 'PBY night search (Midway scenario 6.5.2)' }],
    }]);
    const made = await post('/api/sessions', { mapId: 'midway', startingTurn: 1, side: 'ijn', optionalRules: ['midwayPby'] });
    expect(made.status).toBe(200);
    ijn = await new Seat(made.body.id, made.body.seatToken).connect();
    expect(ijn.view.phase).toBe('waiting');
    expect(ijn.view.you).toBe('ijn');
    expect(ijn.view.optionalRules).toEqual(['midwayPby']);

    const claimed = await post(`/api/sessions/${made.body.id}/claim`, { invite: made.body.inviteToken });
    expect(claimed.body.side).toBe('allies');
    expect((await post(`/api/sessions/${made.body.id}/claim`, { invite: made.body.inviteToken })).status).toBe(409);
    const stranger = await new Seat(made.body.id, 'not-a-token').connect();
    expect(stranger.fatal).toMatch(/no longer valid/);

    allies = await new Seat(made.body.id, claimed.body.seatToken).connect();
    await until(() => ijn.view.phase === 'setup', 'setup');
    expect(allies.view.phase).toBe('setup');
  });

  it('runs setup', async () => {
    await ijn.do({ type: 'placeTf', number: 1, hex: '0308' });
    await ijn.do({ type: 'placeTf', number: 2, hex: '1806' });
    await ijn.do({ type: 'placeTf', number: 7, hex: '0312' });
    await allies.do({ type: 'placeTf', number: 1, hex: '2408' });
    await allies.do({ type: 'placeTf', number: 7, hex: '2410' });
    await expect(ijn.do({ type: 'placeTf', number: 3, hex: '0101' })).rejects.toThrow(/not on the map/);
    await expect(ijn.do({ type: 'placeTf', number: 14, hex: '0201' })).rejects.toThrow();
    expect(ijn.tf(1).zoneCount).toBe(2);
    expect(allies.tf(1).zoneCount).toBe(3);
    await ijn.do({ type: 'confirm', value: true });
    await until(() => allies.view.confirmed.opponent, 'opponent confirmed');
    await ijn.do({ type: 'confirm', value: false }); // undo is allowed until the other has pressed it
    await ijn.do({ type: 'confirm', value: true });
    await allies.do({ type: 'confirm', value: true });
    await inPhase('movement', 1);
  });

  it('plays turns 1 to 10 and reaches Naval Movement of turn 11', async () => {
    /** The turn on which IJN recon first sighted Allied TF 7, and where it was then. */
    let sighted: { turn: number; hex: string } | null = null;
    let raided = false;
    for (let turn = 1; turn <= 10; turn++) {
      await inPhase('movement', turn);
      const info = ijn.view.turnInfo;
      expect(info.initiative).toBe(turn % 2 ? 'ijn' : 'allies');

      // Naval Movement: draft, lock, resolve, acknowledge.
      const tf1 = ijn.tf(1);
      await ijn.do({ type: 'setMoveOrder', ops: [], moves: { 1: eastward(tf1.hex!, info.move) } });
      if (turn === 1) {
        await expect(ijn.do({ type: 'setMoveOrder', ops: [], moves: { 1: eastward(tf1.hex!, 3) } })).rejects.toThrow(/at most 2/);
        // A night split: TF 9 leaves TF 7 and moves on its own.
        await ijn.do({ type: 'setMoveOrder', ops: [{ type: 'split', from: 7, to: 9 }], moves: { 1: eastward(tf1.hex!, 2), 9: ['0313'] } });
      }
      // The turn after it was sighted, Allied TF 7 slips one hex away, still hidden.
      const raidTurn = !!sighted && sighted.turn === turn - 1;
      if (raidTurn) {
        expect(allies.tf(7)).toMatchObject({ status: 'hidden', hex: sighted!.hex });
        await allies.do({ type: 'setMoveOrder', ops: [], moves: { 7: ['2411'] } });
      }
      await ijn.do({ type: 'lock', value: true });
      await until(() => allies.view.locked.opponent, 'lock seen');
      expect(allies.view.stage).toBe('draft');
      await allies.do({ type: 'lock', value: true });
      await until(() => seats().every((s) => s.view.stage === 'resolved'), 'movement resolved');
      expect(ijn.tf(1).hex).toBe(eastward(tf1.hex!, info.move).at(-1));
      if (turn === 1) expect(ijn.tf(9)).toMatchObject({ status: 'hidden', hex: '0313' });
      await confirmBoth();
      await inPhase('board', turn);

      // Board phases.
      if (turn <= 2) {
        // The optional Midway PBY night search: IJN TF 2 at 1806 is the only Task Force within 8 hexes of 1409.
        expect(ijn.view.searches).toEqual([]);
        expect(allies.view.searches.map((r) => r.id)).toEqual(['midwayPby']);
        await allies.do({ type: 'optionalSearch', ruleId: 'midwayPby' });
        await until(() => ijn.view.notices.some((n) => n.kind === 'pby'), 'PBY notice');
        await expect(allies.do({ type: 'optionalSearch', ruleId: 'midwayPby' })).rejects.toThrow(/not available/);
        const told = allies.view.notices.find((n) => n.kind === 'pby')!.text;
        const owner = ijn.view.notices.find((n) => n.kind === 'pby')!.text;
        // Whatever was sighted is one of the IJN's hidden Task Forces within 8 hexes of 1409, reported by exact hex.
        const inRange = ijn.view.tfs.filter((t) => t.status === 'hidden' && hexDist('1409', t.hex!) <= 8);
        expect(inRange.map((t) => t.number)).toEqual(turn === 1 ? [2] : [1, 2]);
        const hexes = [...told.matchAll(/Fleet sighted at (\d{4})/g)].map((m) => m[1]);
        const seen = inRange.filter((t) => hexes.includes(t.hex!));
        expect(seen.length).toBe(hexes.length);
        expect(told).not.toMatch(/TF|Carrier/);
        for (const t of inRange) expect(new RegExp(`TF ${t.number}\\b`).test(owner)).toBe(seen.includes(t));
        expect(owner).toMatch(/^The Allied side ran its PBY night search/);
        expect(/None of your Task Forces were sighted/.test(owner)).toBe(seen.length === 0);
        expect(allies.view.pins.filter((p) => p.kind === 'pby' && p.turn === turn).map((p) => p.center)).toEqual(hexes);
        expect(ijn.tf(2)).toMatchObject({ status: 'hidden', hex: '1806' }); // a sighting changes nothing
      } else {
        expect(allies.view.searches).toEqual([]);
      }
      if (turn === 5) {
        await ijn.do({ type: 'reveal', number: 7, reason: 'launched' });
        await until(() => allies.view.notices.some((n) => n.kind === 'reveal'), 'reveal notice');
        expect(allies.view.notices.find((n) => n.kind === 'reveal')!.text).toMatch(/IJN TF 7 is revealed at 0312 \(Launched raid\)/);
        expect(ijn.tf(7)).toMatchObject({ status: 'revealed', lastHex: '0312' });
      }
      if (raidTurn) {
        // The IJN raids the hex it sighted last turn. It is empty now, so the Allied raid check finds TF 7 next door.
        const seenByIjn = JSON.stringify(ijn.view);
        await allies.do({ type: 'raidCheck', hex: sighted!.hex });
        expect(allies.view.raidCheck).toEqual({ hex: sighted!.hex, adjacent: true, groups: [{ hex: '2411', numbers: [7] }] });
        await allies.do({ type: 'raidCheck', hex: '1808' });
        expect(allies.view.raidCheck!.groups).toEqual([]);
        await allies.do({ type: 'raidCheck', hex: sighted!.hex });
        await new Promise((r) => setTimeout(r, 30));
        expect(JSON.stringify(ijn.view)).toBe(seenByIjn); // the lookup alone tells the opponent nothing
        expect(ijn.view.raidCheck).toBeNull();
        await allies.do({ type: 'raidReveal' });
        await until(() => ijn.view.notices.some((n) => n.kind === 'reveal'), 'raid reveal notice');
        expect(ijn.view.notices.find((n) => n.kind === 'reveal')!.text).toBe('Allied TF 7 is revealed at 2411 (Raided).');
        expect(allies.tf(7)).toMatchObject({ status: 'revealed', lastHex: '2411', revealReason: 'raided' });
        raided = true;
      }
      await confirmBoth();

      // Reconnaissance, on the turns the table allows.
      if (info.recon) {
        await inPhase('recon', turn);
        // IJN TF 2 searches around Allied TF 7 while it is still hidden.
        const target = allies.tf(7);
        const zone = { source: { kind: 'tf' as const, number: 2 }, center: '2410' };
        await ijn.do({ type: 'setSearchOrder', zones: [zone] });
        await expect(ijn.do({ type: 'setSearchOrder', zones: [zone, zone, zone] })).rejects.toThrow(/at most 2/);
        await allies.do({ type: 'setSearchOrder', zones: [{ source: { kind: 'tf', number: 1 }, center: '1808' }] });
        await ijn.do({ type: 'lock', value: true });
        await allies.do({ type: 'lock', value: true });
        await until(() => seats().every((s) => s.view.stage === 'resolved'), 'recon resolved');
        const results = ijn.view.notices.find((n) => n.kind === 'results')!.text;
        const hit = /Zone 2410: 1 (Carrier|Fleet) Task Force sighted/.test(results);
        if (!hit) expect(results).toBe('Search results\nZone 2410: No contact');
        // The owner hears only that TF 7 was sighted; the searcher gets a count and a pin, never a number or hex.
        expect(allies.view.notices.some((n) => n.kind === 'sighted' && /^TF 7 was sighted this turn/.test(n.text)))
          .toBe(hit && target.status === 'hidden');
        expect(results).not.toMatch(/TF \d/);
        expect(ijn.view.pins.some((p) => p.kind === 'zone' && p.turn === turn && p.center === '2410')).toBe(hit);
        expect(allies.view.pins.filter((p) => p.kind === 'zone')).toEqual([]);
        expect(allies.tf(7).status).toBe(target.status); // a sighting never moves a Task Force to the board
        expect(allies.tf(7).hex).toBe(target.hex);
        if (hit && !sighted) sighted = { turn, hex: target.hex! };
        expect(allies.view.notices.find((n) => n.kind === 'results')!.text).toBe('Search results\nZone 1808: No contact');
        expect(JSON.stringify(ijn.view)).not.toMatch(/chit \d|"chits"|cap \d|trueType/);
        await confirmBoth();
      }

      // Secrecy on the wire: a seat's view holds only its own Task Forces.
      for (const s of seats()) expect(s.view.tfs.every((t) => t.side === s.view.you)).toBe(true);
      // The Allies know an IJN hex only where a PBY sighting legitimately reported it.
      const known = allies.view.pins.filter((p) => p.kind === 'pby').map((p) => p.center);
      if (!known.includes(ijn.tf(1).hex!)) expect(JSON.stringify(allies.view)).not.toContain(`"${ijn.tf(1).hex}"`);
      expect(JSON.stringify(allies.view)).not.toContain('"0313"'); // IJN TF 9 is never in PBY range

      if (turn === 6) {
        // A restart loses nothing: stop the server, start it on the same database, reconnect with the same tokens.
        await inPhase('movement', 7);
        const before = { ijn: ijn.view, allies: allies.view };
        seats().forEach((s) => s.close());
        await server.close();
        await boot();
        ijn = await new Seat(ijn.session, ijn.token).connect();
        allies = await new Seat(allies.session, allies.token).connect();
        expect(ijn.view).toEqual(before.ijn);
        expect(allies.view).toEqual(before.allies);
      }
    }

    // Turn 10 ends with the dusk reset: IJN TF 7 was revealed on turn 5, so there are markers on the board.
    await until(() => seats().every((s) => s.view.phase === 'dusk'), 'dusk');
    for (const s of seats()) {
      for (const t of s.view.tfs.filter((x) => x.status === 'revealed')) {
        await s.do({ type: 'setDusk', number: t.number, entry: { hex: t.lastHex, carrierPresent: t.number <= 6 ? true : undefined } });
      }
      if (!s.view.confirmed.you) await s.do({ type: 'confirm', value: true });
    }
    await inPhase('movement', 11);
    for (const s of seats()) {
      expect(s.view.tfs.filter((t) => t.status === 'revealed')).toEqual([]);
    }
    expect(ijn.tf(7)).toMatchObject({ status: 'hidden', hex: '0312' });
    expect(ijn.view.turnInfo).toMatchObject({ period: 'night', move: 2, splits: true });
    expect(ijn.tf(1).hex).toBe(eastward('0308', 12).at(-1));
    // Sighted on one turn, moved, and found by a raid check on the next; back to hidden after dusk.
    expect(sighted).not.toBeNull();
    expect(raided).toBe(true);
    expect(allies.tf(7)).toMatchObject({ status: 'hidden', hex: '2411' });
  });

  it('re-issues a seat: the old token stops working and both players are told', async () => {
    const old = allies.token;
    const res = await ijn.reissue('allies') as Extract<ServerMsg, { t: 'ok' }>;
    await until(() => allies.fatal !== null, 'old connection dropped');
    expect((await new Seat(ijn.session, old).connect()).fatal).toMatch(/no longer valid/);
    allies = await new Seat(ijn.session, res.reissued!.token).connect();
    expect(allies.view.you).toBe('allies');
    for (const s of seats()) expect(s.view.notices.some((n) => /seat was re-issued/.test(n.text))).toBe(true);
  });

  it('ends the game only when both confirm, then shows everything', async () => {
    await allies.do({ type: 'requestEnd' });
    await until(() => ijn.view.endRequest === 'allies', 'end request');
    expect(ijn.view.final).toBeUndefined();
    await ijn.do({ type: 'confirmEnd' });
    await until(() => seats().every((s) => s.view.phase === 'ended'), 'ended');
    expect(allies.view.final!.tfs.ijn.find((t) => t.number === 1)!.hex).toBe(ijn.tf(1).hex);
    expect(allies.view.log.some((e) => /chit \d+/.test(e.detail))).toBe(true);
    expect(allies.view.log).toEqual(ijn.view.log);
  });
});
