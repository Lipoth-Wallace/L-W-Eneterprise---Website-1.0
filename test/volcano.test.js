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
