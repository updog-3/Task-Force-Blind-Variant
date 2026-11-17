import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  applyAction, createGame, join, other, RuleError, SIDE_NAME, systemNotice, viewFor,
  type Action, type Rng, type SeatView, type Side,
} from '../rules';
import type { ClaimResponse, CreateRequest, CreateResponse } from './protocol';
import type { SessionRecord, Store } from './store';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(18).toString('base64url');
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export interface Subscriber {
  side: Side;
  view(view: SeatView): void;
  /** The seat's token was re-issued: drop the connection. */
  kick(message: string): void;
}

export class Sessions {
  private cache = new Map<string, SessionRecord>();
  private subs = new Map<string, Set<Subscriber>>();

  constructor(private store: Store, private rng: Rng) {}

  private get(id: string): SessionRecord {
    let rec = this.cache.get(id);
    if (!rec) {
      const loaded = typeof id === 'string' ? this.store.load(id) : null;
      if (!loaded) throw new HttpError(404, 'No such session. It may have expired.');
      rec = loaded;
      this.cache.set(id, rec);
    }
    return rec;
  }

  create(req: CreateRequest): CreateResponse {
    if (req.side !== 'ijn' && req.side !== 'allies') throw new HttpError(400, 'Pick a side');
    let state;
    try {
      state = createGame({
        scenarioId: req.scenarioId, mapId: req.mapId || undefined,
        startingTurn: req.startingTurn === undefined ? undefined : Number(req.startingTurn),
        flags: req.flags as never, optionalRules: req.optionalRules,
      });
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : 'Bad request');
    }
    const seatToken = newToken(), inviteToken = newToken();
    const now = Date.now();
    const rec: SessionRecord = {
      id: randomBytes(6).toString('base64url'),
      state,
      seats: { ijn: null, allies: null, [req.side]: hash(seatToken) } as Record<Side, string | null>,
      invite: { hash: hash(inviteToken), side: other(req.side) },
      createdAt: now, lastActive: now, savedLog: 0,
    };
    this.cache.set(rec.id, rec);
    this.store.save(rec);
    return { id: rec.id, side: req.side, seatToken, inviteToken };
  }

  /** The invite link claims the other seat on first open. */
  claim(id: string, inviteToken: string): ClaimResponse {
    const rec = this.get(id);
    if (!rec.invite || typeof inviteToken !== 'string' || !same(rec.invite.hash, hash(inviteToken))) {
      throw new HttpError(409, 'This invite has already been used. Open it on the device that first used it, or ask the other player to re-issue your seat from the menu.');
    }
    const side = rec.invite.side;
    const seatToken = newToken();
    rec.seats[side] = hash(seatToken);
    rec.invite = null;
    this.store.save(rec);
    return { side, seatToken };
  }

  auth(id: string, token: string): Side | null {
    const rec = this.get(id);
    if (typeof token !== 'string') return null;
    const h = hash(token);
    for (const side of ['ijn', 'allies'] as Side[]) {
      if (rec.seats[side] && same(rec.seats[side]!, h)) return side;
    }
    return null;
  }

  /** Attach a connection to a seat. Joining is what moves the game out of Waiting. */
  subscribe(id: string, sub: Subscriber): () => void {
    const rec = this.get(id);
    if (!this.subs.has(id)) this.subs.set(id, new Set());
    this.subs.get(id)!.add(sub);
    if (!rec.state.joined[sub.side]) {
      rec.state = join(rec.state, sub.side);
      this.store.save(rec);
      this.broadcast(id);
    } else {
      sub.view(viewFor(rec.state, sub.side));
    }
    return () => this.subs.get(id)?.delete(sub);
  }

  private broadcast(id: string) {
    const rec = this.get(id);
    for (const sub of this.subs.get(id) ?? []) sub.view(viewFor(rec.state, sub.side));
  }

  /** All rules run here. The state is saved after every accepted action. */
  act(id: string, side: Side, action: Action) {
    const rec = this.get(id);
    rec.state = applyAction(rec.state, side, action, this.rng); // throws RuleError and changes nothing
    this.store.save(rec);
    this.broadcast(id);
  }

  /** Re-issue a seat. The old token stops working and both players get a notice. */
  reissue(id: string, by: Side, seat: Side, keep?: Subscriber): string {
    if (seat !== 'ijn' && seat !== 'allies') throw new RuleError('Bad seat');
    const rec = this.get(id);
    const token = newToken();
    rec.seats[seat] = hash(token);
    if (rec.invite?.side === seat) rec.invite = null;
    rec.state = systemNotice(rec.state,
      `The ${SIDE_NAME[seat]} seat was re-issued by the ${SIDE_NAME[by]} player. Its old link no longer works.`);
    this.store.save(rec);
    for (const sub of [...(this.subs.get(id) ?? [])]) {
      if (sub.side === seat && sub !== keep) {
        this.subs.get(id)!.delete(sub);
        sub.kick('This seat was re-issued. Ask for the new seat link.');
      }
    }
    this.broadcast(id);
    return token;
  }
}
