import midway from '../maps/midway.json';
import { GameMap, type MapDef } from './hex';
import { fail } from './types';

const defs: Record<string, MapDef> = { midway: midway as unknown as MapDef };
const cache = new Map<string, GameMap>();

export const MAP_IDS = Object.keys(defs);

export function getMap(id: string): GameMap {
  let m = cache.get(id);
  if (!m) {
    const def = defs[id];
    if (!def) fail(`Unknown map: ${id}`);
    m = new GameMap(def);
    cache.set(id, m);
  }
  return m;
}
