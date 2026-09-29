// Map registry. Deathmatch runs on any ARENAS map, Relic Run on the Caldera
// (volcano), and the Quarry is the practice map.
import { KILN } from './maps/kiln.js';
import { RANGE } from './maps/range.js';
import { THICKET } from './maps/thicket.js';
import { VOLCANO } from './maps/volcano.js';

export const MAP = KILN;   // default arena
export const MAPS = { kiln: KILN, thicket: THICKET, range: RANGE, volcano: VOLCANO };
export const ARENAS = ['kiln', 'thicket'];
