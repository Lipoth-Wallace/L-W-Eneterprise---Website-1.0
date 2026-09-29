import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOLCANO as V } from '../shared/maps/volcano.js';
import { MAPS } from '../shared/map.js';
import { createPlayerState, stepPlayer } from '../shared/physics.js';

const DT = 1 / 120;

function run(start, yaw, input, seconds, stopWhen) {
  const s = createPlayerState(start, yaw);
  for (let i = 0; i < 30; i++) stepPlayer(s, { yaw, pitch: 0 }, DT, V.boxes, V.pads);
  for (let i = 0; i < seconds / DT; i++) {
    stepPlayer(s, { yaw, pitch: 0, ...input }, DT, V.boxes, V.pads);
    if (stopWhen && stopWhen(s)) break;
  }
  return s;
}

test('the Caldera is 2.5x the Thicket on each side', () => {
  assert.equal(V.halfSize * 2, MAPS.thicket.halfSize * 2 * 2.5);
});

for (const [who, speedMult] of [['a runner', 1], ['a relic carrier (-25%)', 0.75]]) {
  test(`${who} can sprint from the west cave up the stairs into the crater`, () => {
    const EAST = -Math.PI / 2;   // yaw that faces +X
    const s = run([-80, 0, 0], EAST, { fwd: 1, sprint: true, speedMult }, 20, (st) => st.x > -1);
    assert.ok(s.x > -1, `stuck at x=${s.x.toFixed(1)} y=${s.y.toFixed(1)}`);
    assert.ok(Math.abs(s.y - V.relic.p[1]) < 0.1, `y=${s.y}`);
  });

  test(`launch pads land ${who} on the next tier`, () => {
    for (const pad of V.pads) {
      const c = [(pad.min[0] + pad.max[0]) / 2, pad.max[1], (pad.min[2] + pad.max[2]) / 2];
      const s = createPlayerState(c, 0);
      stepPlayer(s, { yaw: 0, pitch: 0, speedMult }, DT, V.boxes, V.pads);
      let launched = false, landedY = null;
      for (let i = 0; i < 3 / DT; i++) {
        const e = stepPlayer(s, { yaw: 0, pitch: 0, speedMult }, DT, V.boxes, V.pads);
        if (s.vy > 5) launched = true;
        if (launched && e.landed) { landedY = s.y; break; }
      }
      assert.ok(launched, `pad at ${c} did not fire`);
      const want = c[1] === 0 ? 8 : 14;
      assert.ok(landedY !== null && Math.abs(landedY - want) < 0.1, `pad at ${c}: landed at y=${landedY} x=${s.x.toFixed(1)} z=${s.z.toFixed(1)}, wanted ${want}`);
    }
  });
}

test('Caldera spawns stand on clear ground, on their own side', () => {
  for (const sp of V.spawns) {
    const s = createPlayerState(sp.p, sp.yaw);
    s.y += 0.05;
    for (let i = 0; i < 40; i++) stepPlayer(s, { yaw: 0, pitch: 0 }, DT, V.boxes);
    assert.ok(s.onGround && Math.abs(s.y) < 0.05 && Math.hypot(s.x - sp.p[0], s.z - sp.p[2]) < 0.01, `spawn ${sp.p}`);
    assert.equal(Math.sign(sp.p[0]), sp.team === 0 ? -1 : 1);
  }
});

test('each cave capture zone is open ground a player can stand in', () => {
  for (const b of V.bases) {
    const s = createPlayerState(b.p, 0);
    s.y += 0.05;
    for (let i = 0; i < 40; i++) stepPlayer(s, { yaw: 0, pitch: 0 }, DT, V.boxes);
    assert.ok(s.onGround && Math.hypot(s.x - b.p[0], s.z - b.p[2]) < 0.01);
    const z = b.zone;
    assert.ok(s.x > z.min[0] && s.x < z.max[0] && s.z > z.min[2] && s.z < z.max[2]);
  }
});

test('the mountain ring seals the Caldera: nothing on foot gets past it', () => {
  // Flood-fill ground-level cells a standing player fits in, starting in the
  // west cave. Nothing reachable may lie beyond the mountains' inner face.
  const r = 0.4, H = 1.8, STEP = 0.55;
  const solid = V.boxes.filter((b) => b.min[1] < H && b.max[1] > STEP);
  const free = (x, z) => !solid.some((b) => (b.r !== undefined
    ? Math.hypot(x - b.c[0], z - b.c[1]) < b.r + r
    : x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2]));
  const N = 150, key = (i, j) => i * 1000 + j;
  const seen = new Set([key(-99, 0)]);
  const queue = [[-99, 0]];
  let far = 0;
  while (queue.length) {
    const [i, j] = queue.pop();
    far = Math.max(far, Math.hypot(i, j));
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (Math.abs(a) > N || Math.abs(b) > N || seen.has(key(a, b)) || !free(a, b)) continue;
      seen.add(key(a, b));
      queue.push([a, b]);
    }
  }
  // The peaks' inner faces sit 107-110 m out; the server's bounds are 112.5
  assert.ok(far < V.halfSize, `reached ${far.toFixed(1)} m from the centre`);
  assert.ok(seen.has(key(99, 0)), 'the east cave is reachable from the west cave');
});

test('running into the round terrace turns you along it instead of stopping you', () => {
  // Aim just off-centre at the first terrace's wall and sprint: you should
  // keep most of your speed and slide round the curve
  const s = createPlayerState([-60, 0, 20], -Math.PI / 2);
  for (let i = 0; i < 30; i++) stepPlayer(s, { yaw: -Math.PI / 2, pitch: 0 }, DT, V.boxes);
  let minR = Infinity;
  for (let i = 0; i < 3 / DT; i++) {
    stepPlayer(s, { yaw: -Math.PI / 2, pitch: 0, fwd: 1, sprint: true }, DT, V.boxes);
    minR = Math.min(minR, Math.hypot(s.x, s.z));
  }
  assert.ok(minR > 45, `went inside the terrace wall (r=${minR.toFixed(2)})`);
  assert.ok(s.z > 22 && Math.hypot(s.vx, s.vz) > 4, `stalled at x=${s.x.toFixed(1)} z=${s.z.toFixed(1)}`);
});

function slideStairs(start, yaw) {
  const s = createPlayerState(start, yaw);
  for (let i = 0; i < 30; i++) stepPlayer(s, { yaw, pitch: 0 }, DT, V.boxes);
  let airborne = 0;
  for (let i = 0; i < 1.2 / DT; i++) {
    stepPlayer(s, { yaw, pitch: 0, fwd: 1, sprint: true, crouch: i > 3 }, DT, V.boxes);
    if (!s.onGround) airborne++;
  }
  return { s, airborne };
}

test('a slide climbs a full flight of stairs, but slower than on the flat', () => {
  const WEST = Math.PI / 2;
  const up = slideStairs([58, 0, 0], WEST).s;         // east stairs, heading in
  const flat = slideStairs([58, 0, 30], WEST).s;      // same run, open ground
  assert.ok(up.y > 3.9, `stopped at y=${up.y.toFixed(2)}`);
  assert.ok(up.sliding, 'the slide died on the stairs');
  assert.ok(Math.hypot(up.vx, up.vz) < Math.hypot(flat.vx, flat.vz) - 2);
});

test('a slide down stairs hugs the steps and speeds up', () => {
  const EAST = -Math.PI / 2;
  const { s, airborne } = slideStairs([38, 4, 0], EAST);
  const flat = slideStairs([38, 0, 70], EAST).s;
  assert.equal(airborne, 0, 'left the ground on the way down');
  assert.ok(Math.hypot(s.vx, s.vz) > Math.hypot(flat.vx, flat.vz) + 1.5);
});

test('a launch pad keeps your heading: cross it sideways and it throws you sideways', () => {
  const pad = V.pads.find((p) => p.max[1] === 0 && p.min[0] > 0 && p.min[2] > 0);
  const c = [(pad.min[0] + pad.max[0]) / 2, 0, (pad.min[2] + pad.max[2]) / 2];
  // Run across it heading +Z (yaw pi faces +Z), from 5 m before it
  const s = createPlayerState([c[0], 0, c[2] - 5], Math.PI);
  for (let i = 0; i < 30; i++) stepPlayer(s, { yaw: Math.PI, pitch: 0 }, DT, V.boxes, V.pads);
  let launched = null;
  for (let i = 0; i < 2 / DT && !launched; i++) {
    const e = stepPlayer(s, { yaw: Math.PI, pitch: 0, fwd: 1, sprint: true }, DT, V.boxes, V.pads);
    if (e.launched) launched = { vx: s.vx, vy: s.vy, vz: s.vz };
  }
  assert.ok(launched, 'never launched');
  const speed = Math.hypot(pad.v[0], pad.v[2]);
  assert.ok(Math.abs(launched.vx) < 0.5 && Math.abs(launched.vz - speed) < 0.5, JSON.stringify(launched));
  assert.equal(launched.vy, pad.v[1]);
});
