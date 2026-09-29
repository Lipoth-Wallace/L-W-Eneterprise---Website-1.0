// Map registry. Online matches can be played on any ARENAS map; the Quarry is
// the practice map.
import { KILN } from './maps/kiln.js';
import { RANGE } from './maps/range.js';
import { THICKET } from './maps/thicket.js';

export const MAP = KILN;   // default arena
export const MAPS = { kiln: KILN, thicket: THICKET, range: RANGE };
export const ARENAS = ['kiln', 'thicket'];
