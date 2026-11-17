import type { Side } from './types';

export interface Cube { x: number; y: number; z: number }
export interface ColRow { col: number; row: number }

export const hexId = (col: number, row: number) =>
  String(col).padStart(2, '0') + String(row).padStart(2, '0');

export function parseHex(id: string): ColRow | null {
  if (typeof id !== 'string' || !/^\d{4}$/.test(id)) return null;
  return { col: Number(id.slice(0, 2)), row: Number(id.slice(2)) };
}

/** Flat-topped hexes; even printed columns sit half a hex lower. 2011 -> col 20, row 11. */
export function toCube(col: number, row: number): Cube {
  const q = col - 1, r = row - 1;
  const z = r - (q - (q & 1)) / 2;
  return { x: q, y: -q - z, z };
}

export function fromCube(c: Cube): ColRow {
  const q = c.x;
  const r = c.z + (q - (q & 1)) / 2;
  return { col: q + 1, row: r + 1 };
}

export const cubeDist = (a: Cube, b: Cube) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));

export function hexDist(a: string, b: string): number {
  const pa = parseHex(a), pb = parseHex(b);
  if (!pa || !pb) return Infinity;
  return cubeDist(toCube(pa.col, pa.row), toCube(pb.col, pb.row));
}

const DIRS: [number, number, number][] = [
  [1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1],
];

/** The six neighbouring col/row pairs, whether or not they are on a map. */
export function rawNeighbors(id: string): ColRow[] {
  const p = parseHex(id);
  if (!p) return [];
  const c = toCube(p.col, p.row);
  return DIRS.map(([dx, dy, dz]) => fromCube({ x: c.x + dx, y: c.y + dy, z: c.z + dz }));
}

export interface Calibration { x0: number; y0: number; dx: number; dy: number }

/** A scenario rule a session can switch on at creation. Today: a radius search by one side on set turns. */
export interface OptionalRule {
  id: string;
  label: string;
  side: Side;
  turns: number[];
  center: string;
  radius: number;
}

export interface MapDef {
  id: string;
  name: string;
  cols: [number, number];
  rows: { odd: [number, number]; even: [number, number] };
  bases: { id: string; name: string; hex: string; side: Side; defaultZones?: number }[];
  blockedHexsides: [string, string][];
  image: string;
  aspect: number;
  calibrationHexes: [string, string, string];
  calibration: Calibration;
  optionalRules?: OptionalRule[];
}

export class GameMap {
  readonly hexes: string[] = [];
  private readonly set = new Set<string>();
  private readonly blocked = new Set<string>();

  constructor(readonly def: MapDef) {
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

  neighbors(id: string): string[] {
    return rawNeighbors(id)
      .filter((p) => p.col > 0 && p.row > 0)
      .map((p) => hexId(p.col, p.row))
      .filter((n) => this.set.has(n));
  }

  /** An edge hex has fewer than six neighbours on the map. */
  isEdge(id: string): boolean {
    return this.has(id) && this.neighbors(id).length < 6;
  }

  within(center: string, radius: number): string[] {
    return this.hexes.filter((h) => hexDist(center, h) <= radius);
  }

  /** A search zone: the centre plus its on-map neighbours. */
  zone(center: string): string[] {
    return [center, ...this.neighbors(center)];
  }

  /**
   * The single adjacency test used by contact checks. Later maps extend it
   * through blockedHexsides; Midway has none.
   */
  adjacentForContact(a: string, b: string): boolean {
    const d = hexDist(a, b);
    if (d === 0) return true;
    return d === 1 && !this.blocked.has(a + b);
  }
}

/** Pixel-space geometry of a hex, given calibration fractions and an image size. */
export function hexCenter(cal: Calibration, id: string, w: number, h: number) {
  const p = parseHex(id)!;
  return {
    x: (cal.x0 + (p.col - 1) * cal.dx) * w,
    y: (cal.y0 + (p.row - 1) * cal.dy + (p.col % 2 === 0 ? cal.dy / 2 : 0)) * h,
  };
}

/** Solve calibration from tapped centres (as fractions) of the three calibration hexes. */
export function solveCalibration(
  hexes: [string, string, string],
  pts: { x: number; y: number }[],
): Calibration {
  const [a, b, c] = hexes.map((h) => parseHex(h)!);
  const yUnits = (p: ColRow) => p.row - 1 + (p.col % 2 === 0 ? 0.5 : 0);
  const dx = (pts[1].x - pts[0].x) / (b.col - a.col);
  const x0 = pts[0].x - (a.col - 1) * dx;
  const dy = (pts[2].y - pts[0].y) / (yUnits(c) - yUnits(a));
  const y0 = pts[0].y - yUnits(a) * dy;
  return { x0, y0, dx, dy };
}
