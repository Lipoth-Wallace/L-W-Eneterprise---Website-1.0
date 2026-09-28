// "The Quarry": the practice map, open to a red night sky.
//
//   South half (-Z): a shooting range. Fighters stand at 5-75 m in different
//   poses and lighting (in a brazier's glow, in shadow, silhouetted against the
//   sky, behind waist cover), so you can judge how readable enemies are.
//
//   North half (+Z): a timed parkour course over a pit of blood. Each section
//   tests one movement skill:
//     gap A (4 m)     plain run-jump
//     tunnel          slide under a 1.1 m roof
//     gap B (7 m)     needs a slide-jump; a sprint-jump falls short
//     stones          diagonal hops
//     step + gap C    land on the step in a slide, then slide-jump a 9 m drop-gap
//   A walkway down the east side leads from the finish back to the start, so
//   there's no dead end.

const boxes = [];
function box(x0, x1, z0, z1, y0, y1, mat) {
  boxes.push({ min: [x0, y0, z0], max: [x1, y1, z1], mat });
}

// Ground, pit and cliffs
box(-40, 40, -95, 22, -1, 0, 'floor');
box(-40, 40, 22, 112, -7, -6, 'blood');
box(-46, -40, -101, 118, -7, 18, 'rock');
box(40, 46, -101, 118, -7, 18, 'rock');
box(-46, 46, -101, -95, -1, 20, 'rock');
box(-46, 46, 112, 118, -7, 16, 'rock');

// Firing line: waist-high counter with a gap in the middle to walk downrange
box(-20, -2, 4, 4.8, 0, 1.0, 'slab');
box(2, 20, 4, 4.8, 0, 1.0, 'slab');

// Range furniture
box(3.5, 8.5, -10.4, -9.6, 0, 1.1, 'slab');       // waist cover for the 20 m target
box(7, 13, -45, -39, 0, 2, 'concrete');           // ledge for the 50 m target
box(-20, 20, -82, -80, 0, 6, 'concrete');         // backstop wall
box(-16, -12, -24, -23, 0, 1.2, 'rock');
box(14, 18, -60, -58, 0, 1.2, 'rock');
box(-30, -26, -45, -41, 0, 3, 'rock');
box(26, 31, -30, -27, 0, 2.5, 'rock');

// Parkour course (platform tops at y=0 unless noted; the pit floor is at -6)
box(-3, 3, 22, 32, -6, 0, 'course');              // start pad
box(-3, 3, 36, 44, -6, 0, 'course');              // after gap A (4 m)
box(-3, 3, 47, 58, -6, 0, 'course');              // tunnel platform
box(-3, 3, 49, 54, 1.1, 2.2, 'concrete');         // tunnel roof: slide under
box(-3, 3, 65, 77, -6, 0, 'course');              // after gap B (7 m), checkpoint
box(-4.25, -1.75, 80.25, 82.75, -6, 0, 'course'); // stepping stones
box(1.25, 3.75, 84.75, 87.25, -6, 0, 'course');
box(-3.25, -0.75, 89.25, 91.75, -6, 0, 'course');
box(-4, 4, 93.5, 97, -6, 1, 'course');            // 1 m step
box(-4, 18, 106, 112, -6, 0, 'course');           // finish pad, after gap C (9 m drop)
box(14, 18, 22, 106, -6, 0, 'concrete');          // walkway back to the start

// Targets. yaw is set so each one faces the firing line.
const FIRING_LINE = [0, 0, 8];
function bot(x, y, z, char, pose, note) {
  const dx = FIRING_LINE[0] - x, dz = FIRING_LINE[2] - z;
  return { p: [x, y, z], yaw: Math.atan2(-dx, -dz), char, pose, label: `${Math.round(Math.hypot(dx, dz))}M`, note };
}

export const RANGE = {
  id: 'range',
  name: 'The Quarry',
  halfSize: 40,
  ceiling: 18,
  sky: true,
  boxes,
  spawns: [{ p: [0, 0, 12], yaw: 0 }],
  dust: { min: [-40, 0, -95], max: [40, 12, 112] },
  bots: [
    bot(5, 0, 1, 'brute', 'crouch', 'close, crouched'),
    bot(-8, 0, -2, 'brute', 'stand', 'lit by a brazier'),
    bot(6, 0, -12, 'stalker', 'stand', 'behind waist cover'),
    bot(-12, 0, -27, 'stalker', 'slide', 'sliding, in shadow'),
    bot(10, 2, -42, 'brute', 'stand', 'on a ledge, against the sky'),
    bot(-4, 0, -67, 'stalker', 'stand', 'far, in front of the backstop'),
  ],
  lights: [
    { p: [-11, 1.6, -4], color: 0xff5a1a, intensity: 30, distance: 16, flicker: true },
    { p: [-22, 1.6, 7], color: 0xff3010, intensity: 22, distance: 14, flicker: true },
    { p: [22, 1.6, 7], color: 0xff3010, intensity: 22, distance: 14, flicker: true },
    { p: [16, 1.6, 40], color: 0xff5a1a, intensity: 22, distance: 16, flicker: true },
    { p: [16, 1.6, 75], color: 0xff5a1a, intensity: 22, distance: 16, flicker: true },
    { p: [-2, 1.6, 110], color: 0xff5a1a, intensity: 26, distance: 16, flicker: true },
    { p: [0, 4, 55], color: 0xb00a05, intensity: 20, distance: 14 },
    { p: [0, -4, 67], color: 0xff1a0a, intensity: 40, distance: 30 },
    { p: [0, -4, 100], color: 0xff1a0a, intensity: 40, distance: 30 },
  ],
  braziers: [[-11, 0, -4], [-22, 0, 7], [22, 0, 7], [16, 0, 40], [16, 0, 75], [-2, 0, 110]],
  signs: [
    { p: [-5, 0, 21], text: 'PARKOUR COURSE', yaw: Math.PI },   // read from the spawn
    { p: [12, 0, 111.4], text: 'WALKWAY BACK →', yaw: Math.PI },
  ],
  course: {
    start: { min: [-3, -1, 31], max: [3, 3, 32] },
    checkpoints: [{ min: [-3, -1, 73.5], max: [3, 3, 74.5] }],
    finish: { min: [-4, -1, 107.5], max: [14, 3, 108.5] },
    respawns: [{ p: [0, 0, 26], yaw: Math.PI }, { p: [0, 0, 74], yaw: Math.PI }],
    killY: -3,
    gates: [
      { z: 31.5, x0: -3.3, x1: 3.3, label: 'START' },
      { z: 74, x0: -3.3, x1: 3.3, label: 'CHECKPOINT' },
      { z: 108, x0: -4.3, x1: 4.3, label: 'FINISH' },
    ],
  },
};
