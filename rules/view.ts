import type { OptionalRule } from './scenarios';
import { availableSearches } from './recon';
import { turnInfo, type TurnInfo } from './turnTable';
import {
  other,
  type Base, type DuskEntry, type Flags, type LogEntry, type MoveOrder, type Notice, type Phase, type Pin,
  type RaidCheck, type SearchResult, type Side, type Stage, type TaskForce, type GameState, type Zone,
} from './types';

export interface SeatView {
  you: Side;
  scenarioId: string;
  mapId: string;
  startingTurn: number;
  day: number;
  turn: number;
  turnInfo: TurnInfo;
  phase: Phase;
  stage: Stage;
  flags: Flags;
  optionalRules: string[];
  joined: Record<Side, boolean>;
  /** Your own Task Forces only. */
  tfs: TaskForce[];
  /** Base positions are printed on the map; zone counts are sent for your own bases only. */
  bases: (Omit<Base, 'zoneCount'> & { zoneCount?: number })[];
  locked: { you: boolean; opponent: boolean };
  confirmed: { you: boolean; opponent: boolean };
  moveOrder: MoveOrder;
  searchOrder: Zone[];
  sources: number[];
  /** Your own sighting reports: counts per zone, or a PBY hex. Never the enemy's. */
  pins: Pin[];
  /** Your latest raid lookup this phase. Only you ever see it. */
  raidCheck: RaidCheck | null;
  /** Optional-rule searches you may run right now. */
  searches: Pick<OptionalRule, 'id' | 'label' | 'center' | 'radius'>[];
  dusk: Record<number, DuskEntry>;
  notices: Notice[];
  log: LogEntry[];
  endRequest: Side | null;
  /** Present only once the game has ended. */
  final?: { tfs: Record<Side, TaskForce[]>; results: SearchResult[] };
}

const list = (tfs: Record<number, TaskForce>) => Object.values(tfs).sort((a, b) => a.number - b.number);

/** The view filter: the only path from game state to the network. */
export function viewFor(state: GameState, side: Side): SeatView {
  const opp = other(side);
  const ended = state.phase === 'ended';
  const view: SeatView = {
    you: side,
    scenarioId: state.scenarioId,
    mapId: state.mapId,
    startingTurn: state.startingTurn,
    day: state.day,
    turn: state.turn,
    turnInfo: turnInfo(state.turn),
    phase: state.phase,
    stage: state.stage,
    flags: state.flags,
    optionalRules: state.optionalRules,
    joined: { ...state.joined },
    tfs: list(state.tfs[side]),
    bases: state.bases.map((b) => (b.side === side || ended ? { ...b } : { id: b.id, name: b.name, side: b.side, hex: b.hex })),
    locked: { you: state.locked[side], opponent: state.locked[opp] },
    confirmed: { you: state.confirmed[side], opponent: state.confirmed[opp] },
    moveOrder: state.moveOrders[side],
    searchOrder: state.searchOrders[side],
    sources: state.sources[side],
    pins: state.pins[side],
    raidCheck: state.raidCheck[side],
    searches: availableSearches(state, side).map(({ id, label, center, radius }) => ({ id, label, center, radius })),
    dusk: state.dusk[side],
    notices: state.notices.filter((n) => n.to === side),
    // Renumbered before the end, so gaps in the sequence cannot hint at how much the enemy did.
    log: ended
      ? state.log
      : state.log
        .filter((e) => e.visibility === 'both' || (e.visibility === 'own' && e.side === side))
        .map((e, i) => ({ ...e, seq: i + 1 })),
    endRequest: state.endRequest,
  };
  if (ended) {
    view.final = { tfs: { ijn: list(state.tfs.ijn), allies: list(state.tfs.allies) }, results: state.results };
  }
  return view;
}
