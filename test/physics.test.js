import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../shared/constants.js';
import { MAP } from '../shared/map.js';
import { createPlayerState, stepPlayer } from '../shared/physics.js';

const DT = 1 / 120;
const flat = [{ min: [-100, -1, -100], max: [100, 0, 100], mat: 'floor' }];

function run(s, input, seconds, boxes = flat) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) events.push(stepPlayer(s, { yaw: 0, pitch: 0, ...input }, DT, boxes));
  return events;
}
const hspeed = (s) => Math.hypot(s.vx, s.vz);

test('lands on the floor and stays grounded', () => {
  const s = createPlayerState([0, 2, 0]);
  run(s, {}, 1);
  assert.ok(s.onGround);
  assert.ok(Math.abs(s.y) < 0.01, `y=${s.y}`);
});

test('walking tops out at WALK_SPEED, sprinting at RUN_SPEED', () => {
  const s = createPlayerState([0, 0, 0]);
  run(s, {}, 0.2);
  run(s, { fwd: 1 }, 2);
  assert.ok(Math.abs(hspeed(s) - C.WALK_SPEED) < 0.3, `walk=${hspeed(s)}`);
  assert.ok(s.z < -5, 'yaw 0 moves toward -Z');
  run(s, { fwd: 1, sprint: true }, 2);
  assert.ok(Math.abs(hspeed(s) - C.RUN_SPEED) < 0.3, `sprint=${hspeed(s)}`);
});

test('slide boosts to SLIDE_SPEED and holds most of it', () => {
  const s = createPlayerState([0, 0, 0]);
  run(s, {}, 0.2);
  run(s, { fwd: 1, sprint: true }, 1);
  const ev = run(s, { fwd: 1, crouch: true }, 1 / 60);
  assert.ok(ev.some((e) => e.slid));
  assert.ok(s.sliding);
  assert.ok(hspeed(s) >= C.SLIDE_SPEED - 0.5, `speed=${hspeed(s)}`);
  run(s, { fwd: 1, crouch: true }, 0.4);
  assert.ok(s.sliding, 'still sliding after 0.4s');
  assert.ok(hspeed(s) > C.SLIDE_SPEED * 0.6, `speed=${hspeed(s)}`);
});

test('slide-jump chain keeps speed well above running', () => {
  const s = createPlayerState([0, 0, 0]);
  run(s, {}, 0.2);
  run(s, { fwd: 1, sprint: true }, 0.6);
  // Slide, then hop repeatedly while keeping crouch held: land -> slide -> jump.
  for (let i = 0; i < 6; i++) {
    run(s, { fwd: 1, crouch: true }, 0.1);
    run(s, { fwd: 1, crouch: true, jump: true }, 1 / 60);
    run(s, { fwd: 1, crouch: true }, 0.7);
  }
  assert.ok(hspeed(s) > C.RUN_SPEED * 1.3, `speed=${hspeed(s)}`);
  assert.ok(hspeed(s) <= C.MAX_SPEED + 1e-6);
});

test('holding jump bunny hops without a friction tick', () => {
  const s = createPlayerState([0, 0, 0]);
  run(s, {}, 0.2);
  s.vx = 0; s.vz = -14;
  const ev = run(s, { jump: true }, 1.2);
  assert.ok(ev.filter((e) => e.jumped).length >= 2, 'jumped more than once');
  assert.ok(hspeed(s) > 13, `speed=${hspeed(s)}`);
});

test('air strafing gains speed', () => {
  const s = createPlayerState([0, 0, 0]);
  run(s, {}, 0.2);
  s.vx = 0; s.vz = -10;
  let yaw = 0;
  const start = hspeed(s);
  // Turn while holding strafe: the classic curve
  for (let hop = 0; hop < 4; hop++) {
    for (let i = 0; i < 90; i++) {
      yaw -= 0.02;
      stepPlayer(s, { strafe: 1, jump: true, yaw, pitch: 0 }, DT, flat);
    }
  }
  assert.ok(hspeed(s) > start + 1, `start=${start} end=${hspeed(s)}`);
});

test('jump apex clears waist-high cover but not the 2 m ledge', () => {
  const s = createPlayerState([0, 0, 0]);
  run(s, {}, 0.2);
  let top = 0;
  run(s, { jump: true }, 1 / 60);
  for (let i = 0; i < 120; i++) { stepPlayer(s, { yaw: 0, pitch: 0 }, DT, flat); top = Math.max(top, s.y); }
  assert.ok(top > 1.2 && top < 1.5, `apex=${top}`);
});

test('walls stop you and you slide along them', () => {
  const wall = [...flat, { min: [-10, 0, -3], max: [10, 5, -2] }];
  const s = createPlayerState([0, 0, 0]);
  run(s, {}, 0.2, wall);
  run(s, { fwd: 1, strafe: 1, sprint: true }, 1, wall);
  assert.ok(s.z > -2 + C.PLAYER_HALF_WIDTH - 0.01, `z=${s.z}`);
  assert.ok(s.x > 3, 'kept moving along the wall');
});

test('small ledges are stepped up automatically', () => {
  const step = [...flat, { min: [-5, 0, -8], max: [5, 0.4, -3] }];
  const s = createPlayerState([0, 0, 0]);
  run(s, {}, 0.2, step);
  run(s, { fwd: 1, sprint: true }, 0.6, step);
  assert.ok(s.z < -4, `z=${s.z}`);
  assert.ok(Math.abs(s.y - 0.4) < 0.02, `y=${s.y}`);
});

test('cannot stand up under a low ceiling', () => {
  const low = [...flat, { min: [-5, 1.3, -5], max: [5, 2, 5] }];
  const s = createPlayerState([0, 0, 0]);
  s.crouching = true;
  run(s, {}, 0.3, low);
  assert.ok(s.crouching);
});

test('every spawn is clear of map geometry', () => {
  for (const sp of MAP.spawns) {
    const s = createPlayerState(sp.p, sp.yaw);
    s.y += 0.05;
    run(s, {}, 0.3, MAP.boxes);
    assert.ok(s.onGround && Math.abs(s.y) < 0.05, `spawn ${sp.p} y=${s.y}`);
    assert.ok(Math.hypot(s.x - sp.p[0], s.z - sp.p[2]) < 0.01, `spawn ${sp.p} was pushed`);
  }
});

test('rays hit upright cylinder colliders on the side and on top', async () => {
  const { rayMap } = await import('../shared/raycast.js');
  const c = [{ c: [0, 0], r: 2, min: [-2, 0, -2], max: [2, 3, 2] }];
  const side = rayMap([-10, 1, 0], [1, 0, 0], 50, c);
  assert.ok(Math.abs(side.t - 8) < 1e-6 && Math.abs(side.normal[0] + 1) < 1e-6);
  const top = rayMap([0.5, 10, 0.5], [0, -1, 0], 50, c);
  assert.ok(Math.abs(top.t - 7) < 1e-6 && top.normal[1] === 1);
  const miss = rayMap([-10, 1, 2.5], [1, 0, 0], 50, c);
  assert.equal(miss.t, Infinity);
});
