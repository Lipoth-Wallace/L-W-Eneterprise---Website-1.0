// Plays sections of the Quarry parkour course with scripted inputs to check
// each gap needs the move it was designed around.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANGE } from '../shared/maps/range.js';
import { createPlayerState, stepPlayer } from '../shared/physics.js';
import { playerHitbox } from '../shared/raycast.js';

const DT = 1 / 120;
const B = RANGE.boxes;
const NORTH = Math.PI;   // yaw that runs toward +Z, down the course

function play(start, controller, seconds) {
  const s = createPlayerState(start, NORTH);
  for (let i = 0; i < 30; i++) stepPlayer(s, { yaw: NORTH, pitch: 0 }, DT, B);
  for (let i = 0; i < seconds / DT; i++) {
    stepPlayer(s, { yaw: NORTH, pitch: 0, ...controller(s) }, DT, B);
    if (s.y < RANGE.course.killY) return { s, fell: true };
  }
  return { s, fell: false };
}

const onTop = (s, x0, x1, z0, z1, y) => !s.onGround ? false :
  s.x >= x0 - 0.4 && s.x <= x1 + 0.4 && s.z >= z0 - 0.4 && s.z <= z1 + 0.4 && Math.abs(s.y - y) < 0.05;

test('standing players cannot get through the tunnel', () => {
  const { s } = play([0, 0, 47.5], () => ({ fwd: 1, sprint: true }), 1.5);
  assert.ok(s.z < 49, `z=${s.z}`);
});

test('gap B: slide through the tunnel and slide-jump clears it', () => {
  let jumped = false;
  const { s, fell } = play([0, 0, 47.5], (st) => {
    const jump = !jumped && st.z > 57.4;
    if (jump) jumped = true;
    return { fwd: 1, sprint: true, crouch: st.z > 48.2, jump };
  }, 2);
  assert.ok(!fell, `fell at z=${s.z}`);
  assert.ok(onTop(s, -3, 3, 65, 77, 0), `ended at ${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}`);
});

test('gap B: a sprint-jump without the slide falls short', () => {
  let jumped = false;
  const { fell } = play([0, 0, 54.6], (st) => {
    const jump = !jumped && st.z > 57.4;
    if (jump) jumped = true;
    return { fwd: 1, sprint: true, jump };
  }, 2);
  assert.ok(fell);
});

test('gap C: land on the step in a slide, slide-jump to the finish', () => {
  let hops = 0;
  const { s, fell } = play([-2, 0, 89.6], (st) => {
    let jump = false;
    if (hops === 0 && st.z > 91.2) { jump = true; hops = 1; }
    else if (hops === 1 && st.onGround && st.y > 0.9 && st.z > 96.4) { jump = true; hops = 2; }
    return { fwd: 1, sprint: true, crouch: hops >= 1 && st.y > 0.2, jump };
  }, 3);
  assert.ok(!fell, `fell at z=${s.z}`);
  assert.equal(hops, 2);
  assert.ok(onTop(s, -4, 18, 106, 112, 0), `ended at ${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}`);
});

test('gap C: a sprint-jump off the step falls short', () => {
  let jumped = false;
  const { fell } = play([0, 1, 93.8], (st) => {
    const jump = !jumped && st.z > 96.5;
    if (jump) jumped = true;
    return { fwd: 1, sprint: true, jump };
  }, 2);
  assert.ok(fell);
});

test('targets stand on solid ground and are not buried in geometry', () => {
  for (const b of RANGE.bots) {
    const s = createPlayerState(b.p, 0);
    s.crouching = b.pose !== 'stand';
    s.y += 0.05;
    for (let i = 0; i < 30; i++) stepPlayer(s, { yaw: 0, pitch: 0, crouch: s.crouching }, DT, B);
    assert.ok(s.onGround && Math.abs(s.y - b.p[1]) < 0.06, `${b.label} y=${s.y}`);
    assert.ok(Math.hypot(s.x - b.p[0], s.z - b.p[2]) < 0.01, `${b.label} was pushed out of geometry`);
    const hb = playerHitbox(b.p[0], b.p[1], b.p[2], b.pose !== 'stand');
    assert.ok(hb.max[1] > hb.min[1]);
  }
});
