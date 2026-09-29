// Measures both fighters in every pose and checks that pose's hitbox fits the
// visible model: nothing you can see pokes out far enough to "should have
// hit", and the box doesn't float far above the head either.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCharacter } from '../public/js/characters.js';
import { playerHitbox, rayPlayer } from '../shared/raycast.js';

const POSES = {
  stand: { hitbox: 'stand', pose: { ground: true } },
  run: { hitbox: 'stand', pose: { ground: true, vx: 9.5 } },
  air: { hitbox: 'stand', pose: { ground: false } },
  spearOut: { hitbox: 'stand', pose: { ground: true, weapon: 'spear', hasSpear: true } },
  slingOut: { hitbox: 'stand', pose: { ground: true, weapon: 'sling' } },
  charging: { hitbox: 'stand', pose: { ground: true, weapon: 'spear', hasSpear: true, charge: true } },
  crouch: { hitbox: 'crouch', pose: { ground: true, crouch: true } },
  crouchWalk: { hitbox: 'crouch', pose: { ground: true, crouch: true, vx: 4 } },
  slide: { hitbox: 'slide', pose: { ground: true, crouch: true, slide: true } },
};
const OVERHANG = 0.07;   // a sliver may poke out (well under a pixel at fighting range)
const HEADROOM = 0.12;   // at most this much empty box above the head

// Visible, non-weapon geometry in model space. Weapons stick out on purpose.
function envelope(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || o.userData.twin) return;
    for (let p = o; p; p = p.parent) if (!p.visible || p.userData.cosmetic) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  });
  return box;
}

// The union over a whole stride for moving poses
function measure(type, pose) {
  const total = new THREE.Box3();
  for (const phase of pose.vx ? [0, 0.5, 1, 1.5, 2, 2.5, 3] : [0]) {
    const m = createCharacter(type);
    for (let i = 0; i < 20; i++) m.update({ vx: 0, vz: 0, pitch: 0, weapon: 'spear', hasSpear: false, yaw: 0, ...pose }, 0.2 + phase / 20);
    total.union(envelope(m.group));
  }
  return total;
}

for (const type of ['brute', 'stalker']) {
  for (const [name, { hitbox, pose }] of Object.entries(POSES)) {
    test(`${type} ${name}: the ${hitbox} hitbox fits the model`, () => {
      const hb = playerHitbox(hitbox);
      const b = measure(type, pose);
      const where = `model x ${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)} y ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)} z ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)}`;
      assert.ok(b.min.x >= hb.min[0] - OVERHANG && b.max.x <= hb.max[0] + OVERHANG, `sides: ${where}`);
      assert.ok(b.min.z >= hb.min[2] - OVERHANG && b.max.z <= hb.max[2] + OVERHANG, `front/back: ${where}`);
      assert.ok(b.max.y <= hb.max[1] + OVERHANG, `top: ${where}`);
      assert.ok(b.min.y >= -0.06, `sinks into the floor: ${where}`);
      if (name !== 'charging') assert.ok(hb.max[1] - b.max.y <= HEADROOM, `box floats ${(hb.max[1] - b.max.y).toFixed(2)} above the head`);
    });
  }
}

test('both skins fill the same envelope', () => {
  for (const { pose } of Object.values(POSES)) {
    const a = measure('brute', pose), b = measure('stalker', pose);
    assert.ok(Math.abs(a.max.y - b.max.y) < 0.08, `heights ${a.max.y.toFixed(2)} vs ${b.max.y.toFixed(2)}`);
    assert.ok(Math.abs((a.max.x - a.min.x) - (b.max.x - b.min.x)) < 0.1, 'widths differ');
  }
});

test('hitboxes turn with the player', () => {
  // A slide is 1.7 m long front to back but 1 m wide. Facing -Z, a ray across
  // the X axis 0.8 m in front of the body hits the outstretched legs...
  const target = { x: 0, y: 0, z: 0, yaw: 0 };
  assert.ok(rayPlayer([-5, 0.3, -0.8], [1, 0, 0], 20, target, 'slide') < Infinity);
  // ...but turned 90 degrees, the legs point along -X and that ray misses.
  assert.equal(rayPlayer([-5, 0.3, -0.8], [1, 0, 0], 20, { ...target, yaw: Math.PI / 2 }, 'slide'), Infinity);
  // Standing, a ray 0.45 m to the side hits whatever the facing.
  for (const yaw of [0, 0.8, 1.6, 3]) assert.ok(rayPlayer([0.45, 1, -5], [0, 0, 1], 20, { ...target, yaw }, 'stand') < Infinity);
});
