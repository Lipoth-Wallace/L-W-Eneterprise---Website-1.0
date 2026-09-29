// "The Caldera": the Relic Run map. 225 x 225 m (2.5x the Thicket), with a
// stepped volcano in the middle and a cave base at each end.
//
//   - The relic (a skull) sits in the crater at the summit.
//   - Each player's cave is on one side: team 0 west, team 1 east. Drag the
//     skull into your own cave to score.
//   - Height: ground (0), first terrace (4), second terrace (8, the crater
//     floor), and the crater rim (14). Sprint up the stairs (each step is
//     under the auto-step height), or use the launch pads on the diagonals.
//     They fling you up a whole tier, so the big map stays fast.
//   - Gates through the rim on all four sides lead into the crater.
//
// Everything that collides is an axis-aligned box; the volcano look is decor.

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

// Ground and a rock rim around the edge
box(-W - 2, W + 2, -W - 2, W + 2, -1, 0, 'ash');
box(-W - 2, W + 2, -W - 2, -W, 0, 14, 'basalt');
box(-W - 2, W + 2, W, W + 2, 0, 14, 'basalt');
box(-W - 2, -W, -W, W, 0, 14, 'basalt');
box(W, W + 2, -W, W, 0, 14, 'basalt');

// The volcano: two terraces and a crater rim with a gate on every side
box(-45, 45, -45, 45, 0, 4, 'basalt');
box(-33, 33, -33, 33, 4, 8, 'basalt');
spin(11, 21, 3.5, 21, 8, 14, 'basalt');     // rim corner, first leg
spin(3.5, 11, 11, 21, 8, 14, 'basalt');     // rim corner, second leg

// Stairs up each face of each terrace. Steps rise 0.5 m (under STEP_HEIGHT),
// so a sprint carries you straight up.
function stairs(edge, baseY, n, width) {
  for (let k = 0; k < n; k++) {
    const x0 = edge + (n - 1 - k) * 1.3, x1 = x0 + 1.3;
    spin(x0, x1, -width / 2, width / 2, baseY, baseY + 0.5 * (k + 1), 'step');
  }
}
stairs(45, 0, 7, 9);     // ground -> first terrace
stairs(33, 4, 7, 7);     // first -> second terrace (crater floor)

// Caves: team 0 (west) and team 1 (east). Open toward the volcano.
function cave(sign) {
  const b = (x0, x1, z0, z1, y0, y1) => (sign < 0 ? box(x0, x1, z0, z1, y0, y1, 'basalt') : box(-x1, -x0, z0, z1, y0, y1, 'basalt'));
  b(-W, -106, -13, 13, 0, 8);          // back wall
  b(-106, -90, -13, -10, 0, 8);        // side walls
  b(-106, -90, 10, 13, 0, 8);
  b(-106, -90, -13, 13, 6.5, 8);       // roof
}
cave(-1);
cave(1);

// Cover on the plains: boulders, spires and low walls (mirrored)
sym(-72, -68, -30, -26, 0, 2.2, 'basalt');
sym(-78, -74, 18, 22, 0, 1.2, 'basalt');
sym(-60, -58, 40, 42, 0, 9, 'basalt');      // spire
sym(-60, -58, -44, -42, 0, 9, 'basalt');
sym(-84, -82, -3, 3, 0, 1.2, 'step');        // low wall in front of each cave
sym(-56, -52, -8, -2, 0, 1.3, 'basalt');
sym(-30, -26, 60, 64, 0, 2, 'basalt');
sym(26, 30, 60, 64, 0, 2, 'basalt');
sym(-8, 8, 80, 82, 0, 1.2, 'step');
sym(-95, -85, 55, 57, 0, 3, 'basalt');
sym(-95, -85, -57, -55, 0, 3, 'basalt');

// Launch pads (flat plates) on the diagonals: ground -> second terrace, and
// second terrace -> the rim top. Horizontal speed stays under the relic
// carrier's cap, so they work while dragging the skull too.
const pads = [];
for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
  pads.push({ min: [sx * 50 - 1.5, 0, sz * 50 - 1.5], max: [sx * 50 + 1.5, 0, sz * 50 + 1.5], v: [-sx * 12.3, 26, -sz * 12.3] });
  pads.push({ min: [sx * 28 - 1.5, 8, sz * 28 - 1.5], max: [sx * 28 + 1.5, 8, sz * 28 + 1.5], v: [-sx * 12, 19, -sz * 12] });
}

export const VOLCANO = {
  id: 'volcano',
  name: 'The Caldera',
  halfSize: W,
  ceiling: 40,
  sky: true,
  fog: { color: 0x3a0c06, density: 0.011 },
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
    { p: [-50, 2, 50], color: 0xff8a20, intensity: 14, distance: 10 },
    { p: [50, 2, -50], color: 0xff8a20, intensity: 14, distance: 10 },
    { p: [50, 2, 50], color: 0xff8a20, intensity: 14, distance: 10 },
    { p: [-50, 2, -50], color: 0xff8a20, intensity: 14, distance: 10 },
  ],
  braziers: [[-93, 0, -8], [-93, 0, 8], [93, 0, -8], [93, 0, 8]],
};
