import coralSea from '../maps/coralSea.json';
import easternSolomons from '../maps/easternSolomons.json';
import fleetVsFleet from '../maps/fleetVsFleet.json';
import midway from '../maps/midway.json';
import { GameMap, type MapDef } from './hex';
import { fail } from './types';

const defs: Record<string, MapDef> = {
  midway: midway as unknown as MapDef,
  coralSea: coralSea as unknown as MapDef,
  easternSolomons: easternSolomons as unknown as MapDef,
  fleetVsFleet: fleetVsFleet as unknown as MapDef,
};
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
