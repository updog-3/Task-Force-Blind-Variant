export type Side = 'ijn' | 'allies';
export const SIDES: Side[] = ['ijn', 'allies'];
export const other = (s: Side): Side => (s === 'ijn' ? 'allies' : 'ijn');
export const SIDE_NAME: Record<Side, string> = { ijn: 'IJN', allies: 'Allied' };

/** 'combined' is internal: the formation rides under another Task Force's marker (rulebook 3.7.1). */
export type TFStatus = 'hidden' | 'revealed' | 'gone' | 'combined';
export type TFType = 'carrier' | 'fleet';
export type RevealReason = 'contact' | 'blocked' | 'raided' | 'launched' | 'voluntary' | 'base';

export interface TaskForce {
  side: Side;
  number: number;
  status: TFStatus;
  /** Present only while hidden. */
  hex?: string;
  /** Hex at the moment it was revealed and went onto the board. */
  lastHex?: string;
  carrierPresent: boolean;
  hasTransports: boolean;
  combinedWith: number[];
  combinedInto?: number;
  zoneCount: number;
  revealReason?: RevealReason;
}

export interface Flags {
  enforceTransports: boolean;
  cupEmpty: 'reshuffle' | 'noContact';
  defaultZones: Record<Side, number>;
}

export const DEFAULT_FLAGS: Flags = {
  enforceTransports: false,
  cupEmpty: 'reshuffle',
  defaultZones: { ijn: 2, allies: 3 },
};

export interface Base {
  id: string;
  name: string;
  side: Side;
  hex: string;
  zoneCount: number;
}

export type ArrangeOp =
  | { type: 'split'; from: number; to: number }
  | { type: 'merge'; keep: number; other: number; mode: 'absorb' | 'combine' };

export const EXIT = 'EXIT';

export interface MoveOrder {
  ops: ArrangeOp[];
  /** Task Force number -> path of hex ids; the last step may be EXIT. */
  moves: Record<number, string[]>;
}

export type SearchSource = { kind: 'tf'; number: number } | { kind: 'base'; id: string };

export interface ZoneDraft {
  source: SearchSource;
  /** Needed only when the source is on the board. */
  sourceHex?: string;
  center: string;
}

export interface Zone extends ZoneDraft {
  id: string;
  sourceHex: string;
}

export type ChitKind = 'detected' | 'misdirect' | 'noContact';

export interface SearchTarget {
  number: number;
  hex: string;
  trueType: TFType;
  /** Whether this Task Force was part of what the searcher was told. */
  sighted: boolean;
}

/** The full record of a search. Never sent to a player before the end of the game. */
export interface SearchResult {
  kind: 'zone' | 'pby' | 'area';
  side: Side;
  day: number;
  turn: number;
  zoneId?: string;
  areaId?: string;
  center: string;
  radius?: number;
  /** One entry per draw. null means the cup was empty under the noContact flag. */
  chits: (number | null)[];
  chitKind?: ChitKind;
  cap?: number;
  targets: SearchTarget[];
  /** The counts reported to the searcher (zone searches). */
  carriers: number;
  fleets: number;
}

/** A one-time report kept on the searcher's own map. Holds only what the searcher was told. */
export interface Pin {
  side: Side;
  day: number;
  turn: number;
  kind: 'zone' | 'pby' | 'area';
  /** Zone centre, the exact hex of a PBY "Fleet sighted", or the first hex of a scenario search area. */
  center: string;
  /** For kind 'area': the scenario's area search this report came from. */
  areaId?: string;
  carriers?: number;
  fleets?: number;
}

/** The defender's private raid lookup. */
export interface RaidCheck {
  hex: string;
  /** True when the raided hex was empty and the groups are adjacent hexes. */
  adjacent: boolean;
  groups: { hex: string; numbers: number[] }[];
}

export interface DuskEntry {
  hex?: string;
  carrierPresent?: boolean;
  gone?: boolean;
}

export interface Notice {
  id: number;
  to: Side;
  kind: string;
  text: string;
  button: 'Placed' | 'OK';
  day: number;
  turn: number;
}

export type Visibility = 'own' | 'both' | 'end';

export interface LogEntry {
  seq: number;
  day: number;
  turn: number;
  phase: Phase;
  side: Side | null;
  action: string;
  detail: string;
  visibility: Visibility;
}

export type Phase = 'waiting' | 'setup' | 'movement' | 'board' | 'recon' | 'dusk' | 'ended';
export type Stage = '' | 'draft' | 'resolved';

export interface GameState {
  v: 3;
  scenarioId: string;
  mapId: string;
  startingTurn: number;
  day: number;
  turn: number;
  phase: Phase;
  stage: Stage;
  flags: Flags;
  /** Ids of the scenario's optional rules enabled at creation. */
  optionalRules: string[];
  /** Optional-rule searches already run this turn. */
  rulesUsed: string[];
  cup: number[];
  tfs: Record<Side, Record<number, TaskForce>>;
  bases: Base[];
  joined: Record<Side, boolean>;
  locked: Record<Side, boolean>;
  confirmed: Record<Side, boolean>;
  moveOrders: Record<Side, MoveOrder>;
  searchOrders: Record<Side, Zone[]>;
  pins: Record<Side, Pin[]>;
  raidCheck: Record<Side, RaidCheck | null>;
  /** Carrier numbers of each side able to search this turn (snapshot at the start of the turn). */
  sources: Record<Side, number[]>;
  dusk: Record<Side, Record<number, DuskEntry>>;
  results: SearchResult[];
  notices: Notice[];
  log: LogEntry[];
  nextId: number;
  endRequest: Side | null;
}

export type Action =
  | { type: 'placeTf'; number: number; hex: string }
  | { type: 'removeTf'; number: number }
  | { type: 'editTf'; number: number; zoneCount?: number; hasTransports?: boolean; carrierPresent?: boolean }
  | { type: 'editBase'; baseId: string; zoneCount: number }
  | { type: 'confirm'; value: boolean }
  | { type: 'setMoveOrder'; ops: ArrangeOp[]; moves: Record<number, string[]> }
  | { type: 'lock'; value: boolean }
  | { type: 'ack'; id: number | 'all' }
  | { type: 'reveal'; number: number; reason: RevealReason }
  | { type: 'boardMark'; number: number; to: 'gone' }
  | { type: 'boardOp'; op: ArrangeOp }
  | { type: 'raidCheck'; hex: string }
  | { type: 'raidReveal' }
  | { type: 'optionalSearch'; ruleId: string }
  | { type: 'setSearchOrder'; zones: ZoneDraft[] }
  | { type: 'setDusk'; number: number; entry: DuskEntry }
  | { type: 'requestEnd' }
  | { type: 'cancelEnd' }
  | { type: 'confirmEnd' };

export class RuleError extends Error {}
export function fail(msg: string): never {
  throw new RuleError(msg);
}
