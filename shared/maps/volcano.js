// "The Caldera": the Relic Run map. 225 m across (2.5x the Thicket), a round
// basin walled in by a ring of tall mountains, with a stepped volcano in the
// middle and a cave base cut into the mountains at each end.
//
//   - The relic (a skull) sits in the crater at the summit.
//   - Each player's cave is on one side: team 0 west, team 1 east. Drag the
//     skull into your own cave to score.
//   - Height: ground (0), first terrace (4), second terrace (8, the crater
//     floor), and the boulders of the crater rim (14). Sprint up the stairs
//     (each step is under the auto-step height), or use the launch pads on
//     the diagonals. They fling you up a whole tier, so the big map stays fast.
//   - Everything is round: the terraces, the rim, the boulders and the
//     mountain wall. Round colliders turn you along their curve instead of
//     stopping you dead, so you can carve round the volcano at full speed.
//   - Gaps in the rim on all four sides lead into the crater.
//
// Colliders are upright cylinders ({ c, r }) or axis-aligned boxes (the
// stairs and the caves, which are cut by hand).

const W = 112.5;
const boxes = [];
function box(x0, x1, z0, z1, y0, y1, mat) {
  boxes.push({ min: [x0, y0, z0], max: [x1, y1, z1], mat });
}
// Box plus its 180-degree rotated twin (keeps the two sides fair)
function sym(x0, x1, z0, z1, y0, y1, mat) {
  box(x0, x1, z0, z1, y0, y1, mat);
  box(-x1, -x0, -z1, -z0, y0, y1, mat);
}
// All four 90-degree rotations
function spin(x0, x1, z0, z1, y0, y1, mat) {
  sym(x0, x1, z0, z1, y0, y1, mat);
  sym(-z1, -z0, x0, x1, y0, y1, mat);
}
function cyl(x, z, r, y0, y1, mat) {
  boxes.push({ c: [x, z], r, min: [x - r, y0, z - r], max: [x + r, y1, z + r], mat });
}
// Cylinder plus its 180-degree twin
function symCyl(x, z, r, y0, y1, mat) {
  cyl(x, z, r, y0, y1, mat);
  cyl(-x, -z, r, y0, y1, mat);
}

// Ground (it runs on under the mountains)
box(-W - 30, W + 30, -W - 30, W + 30, -1, 0, 'ash');

// The volcano: two round terraces and a broken ring of boulders around the
// crater, with a gap on every side
cyl(0, 0, 45, 0, 4, 'basalt');
cyl(0, 0, 33, 4, 8, 'basalt');
for (let q = 0; q < 4; q++) {
  for (const deg of [25, 45, 65]) {
    const a = (q * 90 + deg) * Math.PI / 180;
    cyl(Math.cos(a) * 17, Math.sin(a) * 17, 4.5, 8, 14, 'boulder');
  }
}

// Stairs up each face of each terrace. Steps rise 0.5 m (under STEP_HEIGHT),
// so a sprint carries you straight up. Each step runs on into the terrace so
// the curved face leaves no gap.
function stairs(edge, baseY, n, width) {
  for (let k = 0; k < n; k++) {
    const x0 = edge + (n - 1 - k) * 1.3;
    spin(x0, edge + (n - k) * 1.3, -width / 2, width / 2, baseY, baseY + 0.5 * (k + 1), 'step');
    spin(edge - 1.5, x0, -width / 2, width / 2, baseY, baseY + 0.5 * (k + 1), 'step');
  }
}
stairs(45, 0, 7, 9);     // ground -> first terrace
stairs(33, 4, 7, 7);     // first -> second terrace (crater floor)

// Caves: team 0 (west) and team 1 (east), cut into the mountain wall and
// open toward the volcano. Two peaks frame each mouth and one sits on top.
function cave(sign) {
  const b = (x0, x1, z0, z1, y0, y1) => (sign < 0 ? box(x0, x1, z0, z1, y0, y1, 'basalt') : box(-x1, -x0, z0, z1, y0, y1, 'basalt'));
  b(-W, -106, -13, 13, 0, 8);          // back wall
  b(-106, -90, -13, -10, 0, 8);        // side walls
  b(-106, -90, 10, 13, 0, 8);
  b(-106, -90, -13, 13, 6.5, 8);       // roof
  cyl(sign * 124, 0, 16, 0, 60, 'mountain');         // the peak the cave is dug into
  cyl(sign * 101, 23, 10, 0, 34, 'mountain');        // the two that frame the mouth
  cyl(sign * 101, -23, 10, 0, 38, 'mountain');
}
cave(-1);
cave(1);

// The mountain wall: a ring of tall peaks, overlapping so there's no way
// out. Heights vary (seeded) so the skyline is ragged; the ring is the same
// on both sides.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let deg = 15; deg <= 165; deg += 7.5) {
  const a = deg * Math.PI / 180;
  const r = 12 + rnd() * 4, h = 34 + rnd() * 40, R = 108 + r - 1 + rnd() * 3;
  symCyl(Math.cos(a) * R, Math.sin(a) * R, r, 0, h, 'mountain');
}

// Cover on the plains: round boulders, spires and low walls (mirrored)
symCyl(-70, -28, 2.6, 0, 2.2, 'boulder');
symCyl(-76, 20, 2.2, 0, 1.2, 'boulder');
symCyl(-59, 41, 1.6, 0, 9, 'basalt');          // spires
symCyl(-59, -43, 1.6, 0, 9, 'basalt');
sym(-84, -82, -3, 3, 0, 1.2, 'step');           // low wall in front of each cave
symCyl(-54, -5, 2.4, 0, 1.3, 'boulder');
symCyl(-28, 62, 2.4, 0, 2, 'boulder');
symCyl(28, 62, 2.4, 0, 2, 'boulder');
symCyl(-8, 81, 1.5, 0, 1.2, 'boulder');
symCyl(8, 81, 1.5, 0, 1.2, 'boulder');
symCyl(-88, 56, 3.5, 0, 3, 'boulder');
symCyl(-88, -56, 3.5, 0, 3, 'boulder');
symCyl(-40, 78, 3, 0, 2.6, 'boulder');
symCyl(40, 78, 3, 0, 2.6, 'boulder');
symCyl(-78, 38, 1.8, 0, 1.4, 'boulder');
symCyl(-78, -38, 1.8, 0, 1.4, 'boulder');

// Launch pads (flat plates) on the diagonals: ground -> second terrace, and
// second terrace -> the rim boulder on that diagonal. Horizontal speed stays
// under the relic carrier's cap, so they work while dragging the skull too.
const pads = [];
const D = Math.SQRT1_2;
const GROUND_PAD = 12.3, RIM_PAD = 5.3;   // per axis: 17.4 and 7.5 m/s along the diagonal
for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
  const g = 59 * D;
  pads.push({ min: [sx * g - 1.5, 0, sz * g - 1.5], max: [sx * g + 1.5, 0, sz * g + 1.5], v: [-sx * GROUND_PAD, 26, -sz * GROUND_PAD] });
  const c = 26 * D;
  pads.push({ min: [sx * c - 1.5, 8, sz * c - 1.5], max: [sx * c + 1.5, 8, sz * c + 1.5], v: [-sx * RIM_PAD, 19, -sz * RIM_PAD] });
}

export const VOLCANO = {
  id: 'volcano',
  name: 'The Caldera',
  halfSize: W,
  ceiling: 40,
  sky: true,
  fog: { color: 0x4e1c12, density: 0.0095 },
  boxes,
  pads,
  relic: { p: [0, 8, 0] },
  bases: [
    { team: 0, zone: { min: [-106, -1, -10], max: [-92, 6, 10] }, p: [-99, 0, 0] },
    { team: 1, zone: { min: [92, -1, -10], max: [106, 6, 10] }, p: [99, 0, 0] },
  ],
  spawns: [
    { p: [-99, 0, -5], yaw: -Math.PI / 2, team: 0 }, { p: [-99, 0, 5], yaw: -Math.PI / 2, team: 0 },
    { p: [-86, 0, -20], yaw: -Math.PI / 2, team: 0 }, { p: [-86, 0, 20], yaw: -Math.PI / 2, team: 0 },
    { p: [99, 0, 5], yaw: Math.PI / 2, team: 1 }, { p: [99, 0, -5], yaw: Math.PI / 2, team: 1 },
    { p: [86, 0, 20], yaw: Math.PI / 2, team: 1 }, { p: [86, 0, -20], yaw: Math.PI / 2, team: 1 },
  ],
  dust: { min: [-W, 0, -W], max: [W, 20, W] },
  lights: [
    { p: [0, 12, 0], color: 0xff3a0a, intensity: 90, distance: 40, flicker: true },   // the crater's glow
    { p: [-99, 4, 0], color: 0xff5a1a, intensity: 30, distance: 16, flicker: true },
    { p: [99, 4, 0], color: 0xff5a1a, intensity: 30, distance: 16, flicker: true },
    { p: [-41.7, 2, 41.7], color: 0xff8a20, intensity: 14, distance: 10 },
    { p: [41.7, 2, -41.7], color: 0xff8a20, intensity: 14, distance: 10 },
    { p: [41.7, 2, 41.7], color: 0xff8a20, intensity: 14, distance: 10 },
    { p: [-41.7, 2, -41.7], color: 0xff8a20, intensity: 14, distance: 10 },
  ],
  braziers: [[-93, 0, -8], [-93, 0, 8], [93, 0, -8], [93, 0, 8]],
};
