// "The Kiln": a point-symmetric 1v1 cave arena.
//
// Flow, seen from above (north is -Z):
//   - A concrete monolith fills the centre, so you always circle it and never see
//     straight across the map.
//   - Four rock pylons split the space into an inner ring and an outer ring.
//     Eight gaps connect the two rings, so every route is a loop.
//   - East and west ledges (2 m high) have a step at each end, so you can run
//     through them and they never trap you.
//   - Waist-high slabs and boulders (1.1-1.2 m) give cover you can slide behind
//     or jump over.
//
// Collision is only axis-aligned boxes. The brutalist style suits that, and it
// keeps the server's hit checks cheap. Anything that isn't a box is decor only.

const W = 30;          // arena half size
const CEIL = 10;

const boxes = [];
function box(x0, x1, z0, z1, y0, y1, mat) {
  boxes.push({ min: [x0, y0, z0], max: [x1, y1, z1], mat });
}
// Adds a box and its 180-degree rotated twin, which keeps both spawns fair.
function sym(x0, x1, z0, z1, y0, y1, mat) {
  box(x0, x1, z0, z1, y0, y1, mat);
  box(-x1, -x0, -z1, -z0, y0, y1, mat);
}
// Adds all four mirror copies.
function quad(x0, x1, z0, z1, y0, y1, mat) {
  sym(x0, x1, z0, z1, y0, y1, mat);
  sym(-x1, -x0, z0, z1, y0, y1, mat);
}

// Shell
box(-W - 2, W + 2, -W - 2, W + 2, -1, 0, 'floor');
box(-W - 2, W + 2, -W - 2, W + 2, CEIL, CEIL + 1, 'rock');
box(-W - 2, W + 2, -W - 2, -W, 0, CEIL, 'rock');
box(-W - 2, W + 2, W, W + 2, 0, CEIL, 'rock');
box(-W - 2, -W, -W, W, 0, CEIL, 'rock');
box(W, W + 2, -W, W, 0, CEIL, 'rock');

// Central monolith
box(-4, 4, -4, 4, 0, CEIL, 'concrete');

// Waist-high slabs around the monolith; the corner gaps between them are the loop.
sym(-9, -7, -3, 3, 0, 1.1, 'slab');
sym(-3, 3, -9, -7, 0, 1.1, 'slab');

// Rock pylons (floor to ceiling)
quad(12.5, 17.5, 12.5, 17.5, 0, CEIL, 'rock');

// East/west ledges, with a 1 m step at each end
sym(25, W, -8, 8, 0, 2, 'concrete');
sym(25, W, 8, 11, 0, 1, 'concrete');
sym(25, W, -11, -8, 0, 1, 'concrete');

// North/south trench walls, split in the middle
sym(-10, -3, -22, -21, 0, 1.2, 'slab');
sym(3, 10, -22, -21, 0, 1.2, 'slab');

// Boulders
sym(-24, -20, -26, -23, 0, 1.2, 'rock');
sym(14, 16, -1.5, 1.5, 0, 1.2, 'rock');
quad(7, 8, 10, 14, 0, 1.1, 'slab');

// Stalagmite columns (collision box; the tapered look is decor)
sym(-0.6, 0.6, 14.4, 15.6, 0, CEIL, 'rock');
quad(23.4, 24.6, 15.4, 16.6, 0, CEIL, 'rock');

// Overhead brutalist beams
sym(-W, W, 18, 19, 7.5, 8.5, 'concrete');
box(-0.75, 0.75, -W, -4, 7.5, 8.5, 'concrete');
box(-0.75, 0.75, 4, W, 7.5, 8.5, 'concrete');

function spawn(x, z) {
  // Face the centre of the map.
  return { p: [x, 0, z], yaw: Math.atan2(x, z) };
}

export const MAP = {
  name: 'The Kiln',
  halfSize: W,
  ceiling: CEIL,
  boxes,
  spawns: [
    spawn(-26, -26), spawn(26, 26), spawn(26, -26), spawn(-26, 26),
    spawn(0, -27), spawn(0, 27), spawn(-20, 0), spawn(20, 0),
  ],
  lights: [
    { p: [0, 8.8, -12], color: 0xff1a0a, intensity: 60, distance: 26 },
    { p: [0, 8.8, 12], color: 0xff1a0a, intensity: 60, distance: 26 },
    { p: [-27, 4.5, 0], color: 0xff2a10, intensity: 45, distance: 20 },
    { p: [27, 4.5, 0], color: 0xff2a10, intensity: 45, distance: 20 },
    { p: [-28, 1.6, -21], color: 0xff5a1a, intensity: 30, distance: 16, flicker: true },
    { p: [28, 1.6, 21], color: 0xff5a1a, intensity: 30, distance: 16, flicker: true },
    { p: [21, 1.6, -28], color: 0xff3010, intensity: 22, distance: 14, flicker: true },
    { p: [-21, 1.6, 28], color: 0xff3010, intensity: 22, distance: 14, flicker: true },
    { p: [-15, 6, 0], color: 0xb00a05, intensity: 25, distance: 18 },
    { p: [15, 6, 0], color: 0xb00a05, intensity: 25, distance: 18 },
  ],
  braziers: [[-28, 0, -21], [28, 0, 21], [21, 0, -28], [-21, 0, 28]],
};
