export interface Cube { x: number; y: number; z: number }
export interface ColRow { col: number; row: number }

export const hexId = (col: number, row: number) =>
  String(col).padStart(2, '0') + String(row).padStart(2, '0');

export function parseHex(id: string): ColRow | null {
  if (typeof id !== 'string' || !/^\d{4}$/.test(id)) return null;
  return { col: Number(id.slice(0, 2)), row: Number(id.slice(2)) };
}

/**
 * Flat-topped hexes. 2011 -> col 20, row 11. On most maps even printed columns sit half a
 * hex lower; pass oddLow for a map where the odd columns do (Combined Fleet vs Pacific Fleet).
 */
export function toCube(col: number, row: number, oddLow = false): Cube {
  const q = col - 1, r = row - 1;
  const z = r - (oddLow ? q + (q & 1) : q - (q & 1)) / 2;
  return { x: q, y: -q - z, z };
}

export function fromCube(c: Cube, oddLow = false): ColRow {
  const q = c.x;
  const r = c.z + (oddLow ? q + (q & 1) : q - (q & 1)) / 2;
  return { col: q + 1, row: r + 1 };
}

export const cubeDist = (a: Cube, b: Cube) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));

/** Distance on a map with the usual stagger. Rules code should use GameMap.dist, which knows its map. */
export function hexDist(a: string, b: string, oddLow = false): number {
  const pa = parseHex(a), pb = parseHex(b);
  if (!pa || !pb) return Infinity;
  return cubeDist(toCube(pa.col, pa.row, oddLow), toCube(pb.col, pb.row, oddLow));
}

const DIRS: [number, number, number][] = [
  [1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1],
];

/** The six neighbouring col/row pairs, whether or not they are on a map. */
export function rawNeighbors(id: string, oddLow = false): ColRow[] {
  const p = parseHex(id);
  if (!p) return [];
  const c = toCube(p.col, p.row, oddLow);
  return DIRS.map(([dx, dy, dz]) => fromCube({ x: c.x + dx, y: c.y + dy, z: c.z + dz }, oddLow));
}

export interface Calibration { x0: number; y0: number; dx: number; dy: number }

export interface MapDef {
  id: string;
  name: string;
  cols: [number, number];
  rows: { odd: [number, number]; even: [number, number] };
  /** Which columns sit half a hex lower. Default 'even'. */
  lowColumns?: 'even' | 'odd';
  /** Base locations printed on the map. Which are in play, and who owns them, is up to the scenario. */
  sites: { id: string; name: string; hex: string }[];
  /** Hexes wholly covered by land: ships cannot enter them (rulebook 2.1.1). */
  land?: string[];
  /** Hexsides wholly covered by land, or by coral reef: they block ship movement and contact (2.1.1, 3.4). */
  blockedHexsides: [string, string][];
  image: string;
  aspect: number;
  calibrationHexes: [string, string, string];
  calibration: Calibration;
}

export class GameMap {
  readonly hexes: string[] = [];
  private readonly set = new Set<string>();
  private readonly blocked = new Set<string>();
  private readonly land: Set<string>;
  /** True when odd printed columns sit half a hex lower. */
  readonly oddLow: boolean;

  constructor(readonly def: MapDef) {
    this.land = new Set(def.land ?? []);
    this.oddLow = def.lowColumns === 'odd';
    for (let col = def.cols[0]; col <= def.cols[1]; col++) {
      const [lo, hi] = col % 2 ? def.rows.odd : def.rows.even;
      for (let row = lo; row <= hi; row++) {
        const id = hexId(col, row);
        this.hexes.push(id);
        this.set.add(id);
      }
    }
    for (const [a, b] of def.blockedHexsides ?? []) {
      this.blocked.add(a + b);
      this.blocked.add(b + a);
    }
  }

  has(id: string): boolean {
    return this.set.has(id);
  }

  /** Distance in hexes on this map. */
  dist(a: string, b: string): number {
    return hexDist(a, b, this.oddLow);
  }

  neighbors(id: string): string[] {
    return rawNeighbors(id, this.oddLow)
      .filter((p) => p.col > 0 && p.row > 0)
      .map((p) => hexId(p.col, p.row))
      .filter((n) => this.set.has(n));
  }

  isLand(id: string): boolean {
    return this.land.has(id);
  }

  /** Whether the hexside between two adjacent hexes is land or reef. */
  isBlocked(a: string, b: string): boolean {
    return this.blocked.has(a + b);
  }

  /** The hexes a ship can step into from here: adjacent, not all land, and not across a land or reef hexside. */
  steps(id: string): string[] {
    return this.neighbors(id).filter((n) => !this.land.has(n) && !this.blocked.has(id + n));
  }

  /** An edge hex has fewer than six neighbours on the map. */
  isEdge(id: string): boolean {
    return this.has(id) && this.neighbors(id).length < 6;
  }

  within(center: string, radius: number): string[] {
    return this.hexes.filter((h) => this.dist(center, h) <= radius);
  }

  /** A search zone: the centre plus its on-map neighbours. */
  zone(center: string): string[] {
    return [center, ...this.neighbors(center)];
  }

  /**
   * The single adjacency test used by contact checks. Later maps extend it
   * through blockedHexsides (land and reef hexsides); Midway has none.
   */
  adjacentForContact(a: string, b: string): boolean {
    const d = this.dist(a, b);
    if (d === 0) return true;
    return d === 1 && !this.blocked.has(a + b);
  }
}

/** Pixel-space geometry of a hex, given calibration fractions and an image size. */
export function hexCenter(cal: Calibration, id: string, w: number, h: number, oddLow = false) {
  const p = parseHex(id)!;
  const low = (p.col % 2 === 1) === oddLow;
  return {
    x: (cal.x0 + (p.col - 1) * cal.dx) * w,
    y: (cal.y0 + (p.row - 1) * cal.dy + (low ? cal.dy / 2 : 0)) * h,
  };
}

/** Solve calibration from tapped centres (as fractions) of the three calibration hexes. */
export function solveCalibration(
  hexes: [string, string, string],
  pts: { x: number; y: number }[],
  oddLow = false,
): Calibration {
  const [a, b, c] = hexes.map((h) => parseHex(h)!);
  const yUnits = (p: ColRow) => p.row - 1 + ((p.col % 2 === 1) === oddLow ? 0.5 : 0);
  const dx = (pts[1].x - pts[0].x) / (b.col - a.col);
  const x0 = pts[0].x - (a.col - 1) * dx;
  const dy = (pts[2].y - pts[0].y) / (yUnits(c) - yUnits(a));
  const y0 = pts[0].y - yUnits(a) * dy;
  return { x0, y0, dx, dy };
}
