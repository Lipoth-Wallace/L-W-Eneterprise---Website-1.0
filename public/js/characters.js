// Two low-poly cave fighters. They only look different: both use the same
// hitbox, so neither pick has a combat edge.
//
//   brute   - GRUK: hulking, hunched, horned skull mask, fur mantle, bone spines.
//   stalker - VESH: lean and feral, jawbone mask, red war paint, spiked hair.
//
// Every model faces -Z with its origin at the feet, which matches the physics yaw.

import * as THREE from 'three';

export const CHARACTER_INFO = {
  brute: { name: 'GRUK', title: 'The Brute', blurb: 'Skull-masked slab of muscle. Built like a cave wall.' },
  stalker: { name: 'VESH', title: 'The Stalker', blurb: 'Lean, painted, feral. Hunts by the red light.' },
};

// A faint self-glow keeps fighters readable against the dark rock. You should
// lose track of your enemy because of cover, not because of the lighting.
function lam(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: 0x1c0806, ...extra });
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function spike(r, h, mat, x, y, z, rx = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, 0, rz);
  return m;
}

// Gold chain draped over the chest, with a medallion on a pivot so it can swing.
function addChain(torso, { y, z, r }) {
  const gold = new THREE.MeshLambertMaterial({ color: 0xffc23a, emissive: 0x5a3400, flatShading: true });
  const loop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 4, 14), gold);
  loop.position.set(0, y, z);
  loop.rotation.x = 1.2;           // mostly flat round the neck, dipping at the front
  torso.add(loop);
  const pivot = new THREE.Group();
  pivot.position.set(0, y - r * 0.4, z - r * 0.95);
  const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 8), gold);
  medal.rotation.x = Math.PI / 2;
  medal.position.y = -0.08;
  pivot.add(medal);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), new THREE.MeshBasicMaterial({ color: 0xff2a14 }));
  gem.position.set(0, -0.08, -0.015);
  pivot.add(gem);
  torso.add(pivot);
  return pivot;
}

// A limb pivots at its top, so rotation.x swings it like a leg or an arm.
function limb(w, h, d, mat, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.add(box(w, h, d, mat, 0, -h / 2, 0));
  return pivot;
}

export function makeSpearMesh(scale = 1) {
  const g = new THREE.Group();
  const shaft = box(0.05 * scale, 0.05 * scale, 1.7 * scale, lam(0x5a3a22));
  g.add(shaft);
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.11 * scale, 0), lam(0x1a1a1e, { emissive: 0x100404 }));
  head.scale.set(0.7, 0.5, 2.2);
  head.position.z = -0.95 * scale;
  g.add(head);
  const wrap = box(0.08 * scale, 0.08 * scale, 0.14 * scale, lam(0x7a1a10), 0, 0, -0.78 * scale);
  g.add(wrap);
  return g;
}

function buildBrute() {
  const skin = lam(0x8a5a44), hide = lam(0x3a2820), fur = lam(0x2a1c16), bone = lam(0xe0d0b0, { emissive: 0x3a2a1a });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff2010 });
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.85;
  root.add(hips);

  const legL = limb(0.3, 0.85, 0.32, hide, -0.2, 0, 0);
  const legR = limb(0.3, 0.85, 0.32, hide, 0.2, 0, 0);
  hips.add(legL, legR);

  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(box(0.62, 0.3, 0.42, hide, 0, 0.12, 0));            // loincloth belt
  torso.add(box(0.95, 0.62, 0.55, skin, 0, 0.55, 0));            // chest
  torso.add(box(1.25, 0.28, 0.66, fur, 0, 0.88, 0.02));          // fur mantle
  for (let i = 0; i < 4; i++) torso.add(spike(0.07, 0.3, bone, -0.3 + i * 0.2, 1.05, 0.28, -0.6));

  const head = new THREE.Group();
  head.position.set(0, 1.02, -0.12);
  torso.add(head);
  head.add(box(0.36, 0.36, 0.38, bone, 0, 0.16, -0.02));         // skull mask
  head.add(box(0.3, 0.12, 0.1, lam(0x0b0706), 0, 0.12, -0.2));    // brow shadow
  head.add(box(0.07, 0.05, 0.02, eye, -0.08, 0.13, -0.26));
  head.add(box(0.07, 0.05, 0.02, eye, 0.08, 0.13, -0.26));
  head.add(spike(0.06, 0.45, bone, -0.24, 0.42, 0, 0, 0.7));      // horns
  head.add(spike(0.06, 0.45, bone, 0.24, 0.42, 0, 0, -0.7));
  head.add(box(0.26, 0.08, 0.05, bone, 0, -0.02, -0.21));         // teeth row

  const armL = limb(0.24, 0.78, 0.26, skin, -0.62, 0.8, 0);
  const armR = limb(0.24, 0.78, 0.26, skin, 0.62, 0.8, 0);
  armL.add(box(0.28, 0.22, 0.3, fur, 0, -0.1, 0));
  armR.add(box(0.28, 0.22, 0.3, fur, 0, -0.1, 0));
  torso.add(armL, armR);
  torso.rotation.x = -0.28;                                      // hunched
  const medal = addChain(torso, { y: 0.84, z: -0.04, r: 0.26 });
  return { root, hips, torso, head, legL, legR, armL, armR, eye, medal };
}

function buildStalker() {
  const skin = lam(0x6a5048), hide = lam(0x2e221c), hair = lam(0x1a1210), bone = lam(0xe0d4b8, { emissive: 0x3a2a1a });
  const paint = new THREE.MeshBasicMaterial({ color: 0xb4140a });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff3a1a });
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  root.add(hips);

  const legL = limb(0.2, 0.9, 0.22, hide, -0.15, 0, 0);
  const legR = limb(0.2, 0.9, 0.22, hide, 0.15, 0, 0);
  hips.add(legL, legR);

  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(box(0.44, 0.22, 0.28, hide, 0, 0.1, 0));
  torso.add(box(0.6, 0.62, 0.34, skin, 0, 0.52, 0));
  // War paint: three slashes across the chest
  for (let i = 0; i < 3; i++) torso.add(box(0.5, 0.035, 0.02, paint, 0, 0.4 + i * 0.12, -0.175));

  const head = new THREE.Group();
  head.position.set(0, 0.92, -0.08);
  torso.add(head);
  head.add(box(0.28, 0.32, 0.3, skin, 0, 0.16, 0));
  head.add(box(0.3, 0.12, 0.08, bone, 0, 0.02, -0.17));          // jawbone mask
  for (let i = 0; i < 4; i++) head.add(box(0.03, 0.06, 0.03, bone, -0.09 + i * 0.06, 0.09, -0.21));
  head.add(box(0.3, 0.04, 0.02, paint, 0, 0.24, -0.16));         // paint band over the eyes
  head.add(box(0.06, 0.04, 0.02, eye, -0.07, 0.2, -0.165));
  head.add(box(0.06, 0.04, 0.02, eye, 0.07, 0.2, -0.165));
  for (let i = 0; i < 5; i++) head.add(spike(0.06, 0.5, hair, -0.12 + i * 0.06, 0.3, 0.12, 1.1 + (i % 2) * 0.2, 0));

  const armL = limb(0.15, 0.85, 0.16, skin, -0.4, 0.78, 0);
  const armR = limb(0.15, 0.85, 0.16, skin, 0.4, 0.78, 0);
  armL.add(box(0.17, 0.035, 0.18, paint, 0, -0.3, 0));
  armR.add(box(0.17, 0.035, 0.18, paint, 0, -0.3, 0));
  torso.add(armL, armR);
  torso.rotation.x = -0.42;                                      // stalking crouch
  hips.position.y = 0.82;
  const medal = addChain(torso, { y: 0.8, z: -0.02, r: 0.19 });
  return { root, hips, torso, head, legL, legR, armL, armR, eye, medal };
}

export function createCharacter(type) {
  const rig = type === 'stalker' ? buildStalker() : buildBrute();
  const baseHip = rig.hips.position.y;
  const baseLean = rig.torso.rotation.x;

  const spear = makeSpearMesh(0.85);
  spear.rotation.x = -Math.PI / 2 + 0.15;
  spear.position.set(0, -0.7, -0.1);
  rig.armR.add(spear);

  // Sling: a cord hanging from the left hand with a stone pouch on the end.
  const sling = new THREE.Group();
  sling.add(box(0.015, 0.5, 0.015, lam(0x6a4a30), 0, -0.25, 0));
  sling.add(box(0.1, 0.08, 0.1, lam(0x3a2a1c), 0, -0.52, 0));
  sling.position.set(0, -0.75, 0);
  rig.armL.add(sling);

  let phase = 0;
  const state = { speed: 0 };

  return {
    group: rig.root,
    rig,
    /** pose: { vx, vz, yaw, pitch, crouch, slide, ground, weapon, hasSpear, charge } */
    update(pose, dt) {
      rig.root.rotation.y = pose.yaw;
      const speed = Math.hypot(pose.vx || 0, pose.vz || 0);
      state.speed += (speed - state.speed) * Math.min(1, dt * 10);
      phase += state.speed * dt * 1.4;
      const swing = Math.min(1, state.speed / 8) * 0.9;

      let hip = baseHip, lean = baseLean, legA = Math.sin(phase) * swing, legB = -legA;
      let armA = -legA * 0.8, armB = legA * 0.8, headPitch = 0;
      if (pose.slide) {
        hip = 0.45; lean = 0.35; legA = 1.3; legB = 1.0; armA = -0.6; armB = 0.3;
      } else if (pose.crouch) {
        hip = baseHip * 0.6; lean = baseLean - 0.35; legA = legA * 0.6 + 0.8; legB = legB * 0.6 + 0.8;
      } else if (!pose.ground) {
        legA = 0.7; legB = -0.4; armA = 0.9; armB = 0.5;
      }
      // Arms come up to ready the current weapon.
      if (pose.weapon === 'spear' && pose.hasSpear) armB = 1.2;
      // Winding up a throw: the arm cocks back over the shoulder. This is the tell.
      if (pose.charge && pose.hasSpear) armB = -2.5;
      if (pose.weapon === 'sling') armA = 1.1;
      // Keep the head level in the world, then tilt it partway toward the aim.
      headPitch = (pose.pitch || 0) * 0.6 - lean;

      const k = Math.min(1, dt * 14);
      rig.hips.position.y += (hip - rig.hips.position.y) * k;
      rig.torso.rotation.x += (lean - rig.torso.rotation.x) * k;
      rig.legL.rotation.x += (legA - rig.legL.rotation.x) * k;
      rig.legR.rotation.x += (legB - rig.legR.rotation.x) * k;
      rig.armL.rotation.x += (armA - rig.armL.rotation.x) * k;
      rig.armR.rotation.x += (armB - rig.armR.rotation.x) * k;
      rig.head.rotation.x += (headPitch - rig.head.rotation.x) * k;
      // Medallion bounces off the chest with the stride and lifts in a slide or jump
      const swingTarget = pose.slide ? 1.1 : !pose.ground ? 0.7 : (0.5 + 0.5 * Math.sin(phase * 2)) * 0.5 * swing;
      rig.medal.rotation.x += (swingTarget - rig.medal.rotation.x) * Math.min(1, dt * 9);
      spear.visible = !!pose.hasSpear;
      sling.visible = pose.weapon === 'sling';
    },
  };
}
