import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../shared/constants.js';
import { MAPS } from '../shared/map.js';
import { createPlayerState, stepPlayer } from '../shared/physics.js';
import { Room } from '../server/room.js';
import { normalize } from '../shared/raycast.js';

const T = MAPS.thicket;

test('the Thicket is 1.5x the Kiln on each side', () => {
  assert.equal(T.halfSize, MAPS.kiln.halfSize * 1.5);
});

test('the Thicket has trees, a few bushes, and is mirrored through the centre', () => {
  assert.ok(T.trees.length >= 40, `${T.trees.length} trees`);
  assert.ok(T.bushes.length >= 6 && T.bushes.length <= 10, `${T.bushes.length} bushes`);
  const key = (b) => [b.min[0], b.min[2], b.max[0], b.max[2]].map((v) => v.toFixed(3)).join();
  const all = new Set(T.boxes.map(key));
  for (const b of T.boxes) {
    const mirrored = { min: [-b.max[0], 0, -b.max[2]], max: [-b.min[0], 0, -b.min[2]] };
    assert.ok(all.has(key(mirrored)), `no mirror for ${b.mat} at ${b.min}`);
  }
});

test('Thicket spawns stand on clear ground', () => {
  for (const sp of T.spawns) {
    const s = createPlayerState(sp.p, sp.yaw);
    s.y += 0.05;
    for (let i = 0; i < 40; i++) stepPlayer(s, { yaw: 0, pitch: 0 }, 1 / 120, T.boxes);
    assert.ok(s.onGround && Math.abs(s.y) < 0.05 && Math.hypot(s.x - sp.p[0], s.z - sp.p[2]) < 0.01, `spawn ${sp.p}`);
  }
});

test('bushes are clear of trunks and cover, so you can walk into them', () => {
  for (const b of T.bushes) {
    const s = createPlayerState([b.p[0], 0.05, b.p[1]], 0);
    for (let i = 0; i < 40; i++) stepPlayer(s, { yaw: 0, pitch: 0 }, 1 / 120, T.boxes);
    assert.ok(Math.hypot(s.x - b.p[0], s.z - b.p[1]) < 0.01, `bush at ${b.p} overlaps geometry`);
  }
});

test('every standing spot on the Thicket floor is reachable', () => {
  const step = 0.5, r = C.PLAYER_HALF_WIDTH, W = T.halfSize;
  const solid = T.boxes.filter((b) => b.mat !== 'grass' && b.min[1] < C.PLAYER_HEIGHT && b.max[1] > C.STEP_HEIGHT);
  const free = (x, z) => !solid.some((b) => x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2]);
  const n = Math.round((2 * W) / step);
  const seen = new Uint8Array((n + 1) * (n + 1));
  const idx = (i, j) => i * (n + 1) + j;
  const toI = (v) => Math.round((v + W) / step);
  const start = [toI(T.spawns[0].p[0]), toI(T.spawns[0].p[2])];
  const queue = [start];
  seen[idx(...start)] = 1;
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a > n || b > n || seen[idx(a, b)] || !free(-W + a * step, -W + b * step)) continue;
      seen[idx(a, b)] = 1;
      queue.push([a, b]);
    }
  }
  let unreached = 0;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) if (free(-W + i * step, -W + j * step) && !seen[idx(i, j)]) unreached++;
  assert.equal(unreached, 0);
});

test('a room on the Thicket uses its map: trunks stop shots, bushes do not', () => {
  let clock = 100;
  const room = new Room('WOOD', { map: 'thicket', now: () => clock });
  const inbox = [];
  const a = room.addPlayer((m) => inbox.push(m), { name: 'A' });
  const b = room.addPlayer(() => {}, { name: 'B' });
  assert.equal(inbox[0].t, 'welcome');
  assert.equal(inbox[0].map, 'thicket');
  assert.equal(inbox[1].t, 'spawn', 'spawn follows welcome');
  const place = (p, x, z) => { clock += 5; room.handleState(p, { seq: p.spawnSeq, p: [x, 0, z], yaw: 0, pitch: 0 }); };

  // Shoot straight through a tree
  const tree = T.trees.find((t) => Math.abs(t.p[0]) < 30 && Math.abs(t.p[1]) < 30);
  place(a, tree.p[0] - 6, tree.p[1]);
  place(b, tree.p[0] + 6, tree.p[1]);
  const eye = [tree.p[0] - 6, 1.6, tree.p[1]];
  room.handleFire(a, { weapon: 'sling', o: eye, d: normalize([12, -0.6, 0]), time: 0 });
  assert.equal(b.alive, true, 'the trunk took the stone');

  // Target standing inside a bush: hidden, but not protected
  const bush = T.bushes[0];
  place(b, bush.p[0], bush.p[1]);
  place(a, bush.p[0], bush.p[1] + 8);
  clock += C.SLING_RELOAD;
  const eye2 = [bush.p[0], 1.6, bush.p[1] + 8];
  room.handleFire(a, { weapon: 'sling', o: eye2, d: normalize([0, -0.6, -8]), time: 0 });
  assert.equal(b.alive, false, 'stones go straight through foliage');
});
