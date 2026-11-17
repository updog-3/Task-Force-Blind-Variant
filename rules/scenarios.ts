import { fail, type Side } from './types';

/** A reminder shown to the players. Text only: the app enforces none of these. */
export interface ScenarioNote { text: string; turns?: number[] }

/** A scenario search a side may run by hand in the Board phases, e.g. Midway's PBY night search. */
export interface OptionalRule {
  id: string;
  label: string;
  side: Side;
  turns: number[];
  center: string;
  radius: number;
  /** Whether the create form starts with it ticked. */
  default: boolean;
}

/** A free search that runs by itself in every Reconnaissance phase, e.g. the Ceylon patrol of scenario 9. */
export interface AreaSearch {
  id: string;
  label: string;
  /** The side that gets the report. */
  side: Side;
  hexes: string[];
  radius: number;
}

export interface ScenarioVariant {
  mapId: string;
  /** Shown when the scenario offers a choice of map. */
  label?: string;
  /** Land bases in play: a site printed on the map, its owner and its search zones. */
  bases: { site: string; side: Side; zones: number }[];
  notes?: ScenarioNote[];
}

export interface ScenarioDef {
  id: string;
  label: string;
  startingTurn: number;
  /** Search zones per carrier, prefilled at setup. */
  defaultZones: Record<Side, number>;
  /** One per map the scenario can be played on. More than one means the creator chooses. */
  variants: ScenarioVariant[];
  optionalRules: OptionalRule[];
  areaSearches: AreaSearch[];
  notes: ScenarioNote[];
}

const BLIND_DEFAULT = { ijn: 2, allies: 3 }; // scenario book 12.4.1

const reinforcements: ScenarioNote = {
  text: 'Setup: IJN Task Forces with transports start in the Reinforcements zone. The app does not check this.',
};
const guadalcanalNotes: ScenarioNote[] = [
  { text: 'Both battles start on turn 3 and run to the end of turn 24.' },
  { text: 'Search zones (10.5.1): 2 per carrier, 1 per light carrier. Set a light carrier Task Force to 1 at setup. Bases: IJN 1, USN 2. Off-map bases cannot search.' },
  { text: 'IJN landings (10.6.1.1): transport Task Forces must reach the Henderson hex on a daytime turn. Unlike scenario 7, the base need not be destroyed first.' },
  { text: 'Naval support (10.6.3): fleets with 30 or more firepower in the Henderson hex for two consecutive turns.' },
  { text: 'Advanced fog of war (3.8.1), naval surprise attacks (4.2.5) and long range raids from land bases (4.3.7) are in effect.' },
];

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'sc5',
    label: 'Sc 5. Battle of the Coral Sea',
    startingTurn: 1,
    defaultZones: BLIND_DEFAULT,
    variants: [{ mapId: 'coralSea', bases: [] }],
    optionalRules: [],
    areaSearches: [],
    notes: [
      { text: 'The game starts on turn 1 and runs to the end of turn 24.' },
      { text: 'No land bases are in play (5.2).' },
      { text: 'Port Moresby (5.6.2): the IJN needs 3 intact transports within 16 traversable hexes of hex 0517, and no operational US carrier within 5 hexes of the waterway hexes 1014 and 1015.' },
    ],
  },
  {
    id: 'sc6',
    label: 'Sc 6. Battle of Midway',
    startingTurn: 1,
    defaultZones: BLIND_DEFAULT,
    variants: [{ mapId: 'midway', bases: [{ site: 'midway', side: 'allies', zones: 0 }] }],
    optionalRules: [{
      id: 'midwayPby', label: 'PBY night search (6.5.2)', side: 'allies', turns: [1, 2], center: '1409', radius: 8, default: true,
    }],
    areaSearches: [],
    notes: [
      { text: 'The game starts on turn 1 and runs to the end of turn 22.' },
      { text: 'Setup: IJN Task Forces start on hexes touching their start line.' },
      { text: 'The Midway base does no regular reconnaissance (6.5.2), so its zone count is 0.' },
      { text: 'IJN Carrier Task Forces must be exactly 4 hexes from Midway (1409) by the end of turn 3 movement (6.5.1).', turns: [1, 2, 3] },
      { text: 'The IJN carriers must raid Midway this turn with exactly 12 aircraft units (6.5.3).', turns: [3] },
      { text: 'The IJN cannot move north-west or south-west until the USN launches a raid on an IJN Task Force (6.5.1).' },
    ],
  },
  {
    id: 'sc7',
    label: 'Sc 7. Battle of the Eastern Solomons',
    startingTurn: 3,
    defaultZones: { ijn: 2, allies: 2 },
    variants: [{ mapId: 'easternSolomons', bases: [{ site: 'henderson', side: 'allies', zones: 1 }] }],
    optionalRules: [],
    areaSearches: [],
    notes: [
      { text: 'The game starts on turn 3 and runs to the end of turn 24.' },
      { text: 'Setup: IJN Task Forces with transports start in the Reinforcements zone; Task Force 18 (Wasp) starts on the WASP hex. The app does not check this.' },
      { text: 'Search zones (7.5.1): 2 per carrier; the Task Force with CVL Ryujo gets 1 (set it at setup); Henderson gets 1.' },
      { text: 'TF 18 (Wasp) must sail south along the dotted line until an enemy fleet is sighted, or until turn 11 (7.5.2).', turns: [3, 4, 5, 6, 7, 8, 9, 10] },
      { text: 'TF 18 (Wasp) may now move freely (7.5.2).', turns: [11] },
      { text: 'A B-17 unit arrives this turn and may raid any hex on the map (7.5.5).', turns: [8, 18] },
      { text: 'An IJN Task Force that enters the Henderson hex (1410) is revealed. Landing needs the Henderson base destroyed first (7.6.2).' },
    ],
  },
  {
    id: 'sc8',
    label: 'Sc 8. Combined Fleet vs Pacific Fleet (Fictional)',
    startingTurn: 1,
    defaultZones: { ijn: 1, allies: 2 },
    variants: [{ mapId: 'fleetVsFleet', bases: [] }],
    optionalRules: [],
    areaSearches: [],
    notes: [
      { text: 'The game starts on turn 1 and runs to the end of turn 24. No land bases.' },
      { text: 'Search zones (8.5.3): IJN 1 per carrier, USN 2 per carrier.' },
      { text: 'No retreat (8.5.2): the IJN may not move south-west or north-west, nor the USN north-east or south-east, until an air raid or naval combat has taken place.' },
      { text: 'A Task Force that moves behind its own start line has left the board (8.5.4): reveal it and mark it Gone under On board.' },
    ],
  },
  {
    id: 'sc9',
    label: 'Sc 9. Indian Ocean Raid (Fictional)',
    startingTurn: 3,
    defaultZones: { ijn: 1, allies: 2 },
    variants: [{ mapId: 'fleetVsFleet', bases: [] }],
    optionalRules: [],
    areaSearches: [{
      id: 'ceylonPatrol', label: 'Ceylon patrol (9.5.2)', side: 'allies', hexes: ['2107', '2108', '2109', '2110'], radius: 4,
    }],
    notes: [
      { text: 'The Allied side is the Royal Navy. The game starts on turn 3 and runs to the end of turn 24, or ends early when all carriers of one side are disabled or have left the board (9.6).' },
      { text: 'Setup: IJN Carrier Task Forces start on hexes touching their start line.' },
      { text: 'Search zones (9.5.2): IJN 1 per CV and CVL; Royal Navy 2 per CV, and none for Hermes (set its Task Force to 0 at setup).' },
      { text: 'Ceylon patrol (9.5.2): in every Reconnaissance phase the app searches for IJN Task Forces within 4 hexes of 2107-2110, one chit each, and reports counts by type to the Royal Navy.' },
      { text: 'IJN Task Forces must head directly for the 19xx column until an enemy Task Force is detected (9.5.1).', turns: [3, 4, 5, 6, 7] },
      { text: 'The IJN may not move south-west or north-west until an air raid has been made against an IJN Task Force (9.5.1).' },
      { text: 'Royal Navy Swordfish may raid this turn despite the dark: roll 1D6 per attack group, and on a 6 a third of its aircraft fail to find the target (9.5.3).', turns: [10, 11, 12, 13, 14, 22, 23, 24] },
    ],
  },
  {
    id: 'sc10a',
    label: 'Sc 10. Battle of the Santa Cruz Islands (Battle 1)',
    startingTurn: 3,
    defaultZones: { ijn: 2, allies: 2 },
    variants: [{
      mapId: 'easternSolomons',
      bases: [{ site: 'henderson', side: 'allies', zones: 2 }, { site: 'buka', side: 'ijn', zones: 1 }],
      notes: [reinforcements],
    }],
    optionalRules: [],
    areaSearches: [],
    notes: guadalcanalNotes,
  },
  {
    id: 'sc10b',
    label: 'Sc 10. Second Naval Battle of Guadalcanal (Battle 2)',
    startingTurn: 3,
    defaultZones: { ijn: 2, allies: 2 },
    variants: [
      {
        mapId: 'easternSolomons',
        label: 'Eastern Solomons: the USN still holds Guadalcanal',
        bases: [{ site: 'henderson', side: 'allies', zones: 2 }, { site: 'buka', side: 'ijn', zones: 1 }],
        notes: [
          reinforcements,
          { text: 'Setup (10.4.3): the IJN may put one Fleet Task Force in the Reinforcements zone; the USN may put one Fleet Task Force on hex 1908 or adjacent to it.' },
        ],
      },
      {
        mapId: 'coralSea',
        label: 'Coral Sea: the IJN captured Guadalcanal in Battle 1',
        bases: [
          { site: 'rabaul', side: 'ijn', zones: 1 }, { site: 'buka', side: 'ijn', zones: 1 },
          { site: 'gasmata', side: 'ijn', zones: 1 }, { site: 'lae', side: 'ijn', zones: 1 },
          { site: 'henderson', side: 'ijn', zones: 1 }, { site: 'portMoresby', side: 'allies', zones: 2 },
        ],
        notes: [
          { text: 'The IJN holds Henderson (hex 2203) as a damaged base (10.4.1.2); the USN is trying to retake the island.' },
        ],
      },
    ],
    optionalRules: [],
    areaSearches: [],
    notes: guadalcanalNotes,
  },
  {
    id: 'custom',
    label: 'Custom game',
    startingTurn: 1,
    defaultZones: BLIND_DEFAULT,
    variants: ['midway', 'coralSea', 'easternSolomons', 'fleetVsFleet'].map((mapId) => ({ mapId, bases: [] })),
    optionalRules: [],
    areaSearches: [],
    notes: [{ text: 'No scenario rules and no land bases: agree your own.' }],
  },
];

export function getScenario(id: string): ScenarioDef {
  return SCENARIOS.find((s) => s.id === id) ?? fail(`Unknown scenario: ${id}`);
}

/** The variant of a scenario played on the given map (the first one if no map is named). */
export function getVariant(scenario: ScenarioDef, mapId?: string): ScenarioVariant {
  if (!mapId) return scenario.variants[0];
  return scenario.variants.find((v) => v.mapId === mapId) ?? fail(`${scenario.label} is not played on that map`);
}

export const scenarioNotes = (scenario: ScenarioDef, mapId: string): ScenarioNote[] =>
  [...scenario.notes, ...(getVariant(scenario, mapId).notes ?? [])];
