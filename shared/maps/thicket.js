// "The Thicket": a night forest, 90 x 90 m (1.5x the Kiln on each side).
//
// Layout:
//   - A ruined brutalist shrine in the middle: four L-shaped wall corners with
//     an opening on every side and a waist-high altar in the centre.
//   - About 50 trees, generated from a fixed seed so every client and the
//     server agree, and mirrored through the centre so both halves play the
//     same. Trunks block movement and shots; the canopy is decor only.
//   - Fallen logs and boulders for low cover.
//   - Eight bushes. They don't block anything, but the foliage fully hides
//     someone standing inside. Only a scan gives them away.
//
// Everything that collides is still an axis-aligned box.

const W = 45;
const boxes = [];
function box(x0, x1, z0, z1, y0, y1, mat) {
  boxes.push({ min: [x0, y0, z0], max: [x1, y1, z1], mat });
}
// Adds a box and its 180-degree rotated twin
function sym(x0, x1, z0, z1, y0, y1, mat) {
  box(x0, x1, z0, z1, y0, y1, mat);
  box(-x1, -x0, -z1, -z0, y0, y1, mat);
}
function quad(x0, x1, z0, z1, y0, y1, mat) {
  sym(x0, x1, z0, z1, y0, y1, mat);
  sym(-x1, -x0, z0, z1, y0, y1, mat);
}

// Ground and the rock rim
box(-W - 2, W + 2, -W - 2, W + 2, -1, 0, 'grass');
box(-W - 2, W + 2, -W - 2, -W, 0, 8, 'rock');
box(-W - 2, W + 2, W, W + 2, 0, 8, 'rock');
box(-W - 2, -W, -W, W, 0, 8, 'rock');
box(W, W + 2, -W, W, 0, 8, 'rock');

// Shrine: L-shaped corners leave an opening in the middle of every side
quad(3, 6, 5, 6, 0, 3.4, 'concrete');
quad(5, 6, 3, 5, 0, 3.4, 'concrete');
box(-1, 1, -0.6, 0.6, 0, 1.0, 'slab');            // altar

// Fallen logs and boulders (mirrored)
sym(-22, -15, -12.4, -11.6, 0, 0.9, 'wood');
sym(12, 13, -26, -19, 0, 0.9, 'wood');
sym(-34, -28, 8.6, 9.4, 0, 0.9, 'wood');
sym(-15, -12.5, 17, 19.5, 0, 1.6, 'rock');
sym(24, 27, -8, -5, 0, 2.2, 'rock');
sym(-8, -6, -32, -30, 0, 1.2, 'rock');

const SPAWNS = [[-38, -38], [38, 38], [38, -38], [-38, 38], [0, -40], [0, 40], [-40, 0], [40, 0]];

const BUSHES = [];
function bush(x, z, r = 1.6) {
  BUSHES.push({ p: [x, z], r, h: 2.1 }, { p: [-x, -z], r, h: 2.1 });
}
bush(-18, -3);
bush(9, -16);
bush(-30, -22);
bush(20, 30);

// Trees: seeded, kept clear of the shrine, spawns, bushes, cover and each other
let seed = 4242;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const TREES = [];
const clear = (x, z, pts, d) => pts.every(([px, pz]) => Math.hypot(x - px, z - pz) > d);
function freeOfBoxes(x, z, pad) {
  return boxes.every((b) => b.mat === 'grass' ||
    x + pad < b.min[0] || x - pad > b.max[0] || z + pad < b.min[2] || z - pad > b.max[2]);
}
for (let tries = 0; TREES.length < 52 && tries < 4000; tries++) {
  const x = (rand() * 2 - 1) * (W - 4), z = (rand() * 2 - 1) * (W - 4);
  if (Math.hypot(x, z) < 10) continue;
  const all = TREES.map((t) => t.p);
  if (!clear(x, z, all, 4.2) || !clear(-x, -z, all, 4.2) || Math.hypot(2 * x, 2 * z) < 4.2) continue;
  if (!clear(x, z, SPAWNS, 4) || !clear(-x, -z, SPAWNS, 4)) continue;
  if (!clear(x, z, BUSHES.map((b) => b.p), 3.5)) continue;
  if (!freeOfBoxes(x, z, 1.4) || !freeOfBoxes(-x, -z, 1.4)) continue;
  const r = 0.3 + rand() * 0.15;
  TREES.push({ p: [x, z], r }, { p: [-x, -z], r });
}
for (const t of TREES) box(t.p[0] - t.r, t.p[0] + t.r, t.p[1] - t.r, t.p[1] + t.r, 0, 14, 'trunk');

function spawn(x, z) {
  return { p: [x, 0, z], yaw: Math.atan2(x, z) };   // face the middle
}

export const THICKET = {
  id: 'thicket',
  name: 'The Thicket',
  halfSize: W,
  ceiling: 30,
  sky: true,
  fog: { color: 0x240907, density: 0.022 },   // thicker than the Quarry: you hunt by scan here
  boxes,
  trees: TREES,
  bushes: BUSHES,
  spawns: SPAWNS.map(([x, z]) => spawn(x, z)),
  dust: { min: [-W, 0, -W], max: [W, 8, W] },
  fireflies: true,
  lights: [
    { p: [-4, 1.6, -4], color: 0xff5a1a, intensity: 26, distance: 16, flicker: true },
    { p: [4, 1.6, 4], color: 0xff5a1a, intensity: 26, distance: 16, flicker: true },
    { p: [0, 4, 0], color: 0xb00a05, intensity: 30, distance: 18 },
    { p: [-30, 1.6, 20], color: 0xff3010, intensity: 18, distance: 14, flicker: true },
    { p: [30, 1.6, -20], color: 0xff3010, intensity: 18, distance: 14, flicker: true },
  ],
  braziers: [[-4, 0, -4], [4, 0, 4], [-30, 0, 20], [30, 0, -20]],
};
