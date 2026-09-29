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

// ---------------------------------------------------------------- shared skeleton
//
// Both fighters use the same skeleton and proportions, so each pose fills the
// same envelope and the hitboxes in shared/raycast.js can match it exactly.
// The skins only change decoration inside that envelope. test/hitbox.test.js
// measures every pose against its hitbox.

const HIP = 0.84;     // hip height standing
const THIGH = 0.42;
const SHIN = 0.42;

// Leg: thigh from the hip, a knee joint, then shin and foot. leg.rotation.x
// swings the thigh (positive = forward); leg.userData.knee.rotation.x bends the
// knee (negative = shin folds back).
function leg(x, w, d, mat, footMat) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0, 0);
  pivot.add(box(w, THIGH, d, mat, 0, -THIGH / 2, 0));
  const knee = new THREE.Group();
  knee.position.y = -THIGH;
  knee.add(box(w * 0.9, SHIN - 0.03, d * 0.9, mat, 0, -(SHIN - 0.03) / 2, 0));
  knee.add(box(w, 0.07, d + 0.08, footMat, 0, -SHIN + 0.035, -0.04));
  pivot.add(knee);
  pivot.userData.knee = knee;
  return pivot;
}

function skeleton({ legX, legW, legD, legMat, footMat }) {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = HIP;
  root.add(hips);
  const legL = leg(-legX, legW, legD, legMat, footMat);
  const legR = leg(legX, legW, legD, legMat, footMat);
  hips.add(legL, legR);
  const torso = new THREE.Group();
  hips.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 0.76, -0.02);
  torso.add(head);
  return { root, hips, torso, head, legL, legR };
}

function buildBrute() {
  const skin = lam(0x8a5a44), hide = lam(0x3a2820), fur = lam(0x2a1c16), bone = lam(0xe0d0b0, { emissive: 0x3a2a1a });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff2010 });
  const sk = skeleton({ legX: 0.15, legW: 0.22, legD: 0.24, legMat: hide, footMat: fur });
  const { torso, head } = sk;

  torso.add(box(0.56, 0.24, 0.36, hide, 0, 0.1, 0));             // loincloth belt
  torso.add(box(0.74, 0.54, 0.44, skin, 0, 0.47, 0));             // chest
  torso.add(box(0.84, 0.18, 0.5, fur, 0, 0.74, 0.01));            // fur mantle
  for (let i = 0; i < 3; i++) torso.add(spike(0.05, 0.2, bone, -0.2 + i * 0.2, 0.84, 0.2, -0.7));

  head.add(box(0.32, 0.3, 0.32, bone, 0, 0.15, -0.02));           // skull mask
  head.add(box(0.26, 0.1, 0.08, lam(0x0b0706), 0, 0.12, -0.16));  // brow shadow
  head.add(box(0.06, 0.045, 0.02, eye, -0.07, 0.13, -0.2));
  head.add(box(0.06, 0.045, 0.02, eye, 0.07, 0.13, -0.2));
  head.add(spike(0.045, 0.22, bone, -0.17, 0.3, 0, 0, 1.0));      // horns, swept out sideways
  head.add(spike(0.045, 0.22, bone, 0.17, 0.3, 0, 0, -1.0));
  head.add(box(0.22, 0.07, 0.04, bone, 0, -0.01, -0.18));         // teeth row

  const armL = limb(0.16, 0.66, 0.18, skin, -0.41, 0.72, 0);
  const armR = limb(0.16, 0.66, 0.18, skin, 0.41, 0.72, 0);
  armL.add(box(0.18, 0.16, 0.2, fur, 0, -0.06, 0));
  armR.add(box(0.18, 0.16, 0.2, fur, 0, -0.06, 0));
  torso.add(armL, armR);
  const medal = addChain(torso, { y: 0.72, z: -0.03, r: 0.22 });
  return { ...sk, armL, armR, eye, medal, lean: -0.12 };
}

function buildStalker() {
  const skin = lam(0x6a5048), hide = lam(0x2e221c), hair = lam(0x1a1210), bone = lam(0xe0d4b8, { emissive: 0x3a2a1a });
  const paint = new THREE.MeshBasicMaterial({ color: 0xb4140a });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff3a1a });
  const sk = skeleton({ legX: 0.14, legW: 0.19, legD: 0.21, legMat: hide, footMat: hide });
  const { torso, head } = sk;

  torso.add(box(0.5, 0.22, 0.32, hide, 0, 0.1, 0));
  torso.add(box(0.66, 0.54, 0.38, skin, 0, 0.47, 0));
  torso.add(box(0.78, 0.1, 0.4, bone, 0, 0.72, 0));               // bone collar across the shoulders
  // War paint: three slashes across the chest
  for (let i = 0; i < 3; i++) torso.add(box(0.54, 0.035, 0.02, paint, 0, 0.34 + i * 0.12, -0.195));

  head.add(box(0.28, 0.3, 0.3, skin, 0, 0.15, 0));
  head.add(box(0.3, 0.11, 0.08, bone, 0, 0.02, -0.17));           // jawbone mask
  for (let i = 0; i < 4; i++) head.add(box(0.03, 0.05, 0.03, bone, -0.09 + i * 0.06, 0.09, -0.21));
  head.add(box(0.3, 0.04, 0.02, paint, 0, 0.22, -0.16));          // paint band over the eyes
  head.add(box(0.06, 0.04, 0.02, eye, -0.07, 0.19, -0.165));
  head.add(box(0.06, 0.04, 0.02, eye, 0.07, 0.19, -0.165));
  // Matted mane swept back and down
  for (let i = 0; i < 5; i++) head.add(spike(0.06, 0.42, hair, -0.12 + i * 0.06, 0.2, 0.2, 1.9 + (i % 2) * 0.2, 0));

  const armL = limb(0.14, 0.68, 0.15, skin, -0.39, 0.72, 0);
  const armR = limb(0.14, 0.68, 0.15, skin, 0.39, 0.72, 0);
  armL.add(box(0.16, 0.035, 0.17, paint, 0, -0.26, 0));
  armR.add(box(0.16, 0.035, 0.17, paint, 0, -0.26, 0));
  torso.add(armL, armR);
  const medal = addChain(torso, { y: 0.72, z: -0.02, r: 0.2 });
  return { ...sk, armL, armR, eye, medal, lean: -0.2 };
}

export function createCharacter(type) {
  const rig = type === 'stalker' ? buildStalker() : buildBrute();
  const baseLean = rig.lean;
  rig.torso.rotation.x = baseLean;

  const spear = makeSpearMesh(0.85);
  spear.rotation.x = -Math.PI / 2 + 0.15;
  spear.position.set(0, -0.62, -0.1);
  spear.userData.cosmetic = true;      // weapons stick out of the hitbox on purpose
  rig.armR.add(spear);

  // Sling: a cord hanging from the left hand with a stone pouch on the end.
  const sling = new THREE.Group();
  sling.add(box(0.015, 0.4, 0.015, lam(0x6a4a30), 0, -0.2, 0));
  sling.add(box(0.1, 0.08, 0.1, lam(0x3a2a1c), 0, -0.42, 0));
  sling.position.set(0, -0.64, 0);
  sling.userData.cosmetic = true;
  rig.armL.add(sling);

  let phase = 0;
  const state = { speed: 0 };
  const kneeL = rig.legL.userData.knee, kneeR = rig.legR.userData.knee;
  const ghost = createGhost(rig.root);

  return {
    group: rig.root,
    rig,
    /** Scan ghost strength 0..1, and the clock driving its flicker. */
    setGhost: ghost.set,
    /** pose: { vx, vz, yaw, pitch, crouch, slide, ground, weapon, hasSpear, charge } */
    update(pose, dt) {
      rig.root.rotation.y = pose.yaw;
      const speed = Math.hypot(pose.vx || 0, pose.vz || 0);
      state.speed += (speed - state.speed) * Math.min(1, dt * 10);
      phase += state.speed * dt * 1.4;
      const swing = Math.min(1, state.speed / 8);

      // Walk cycle: thighs swing, the back leg's knee folds.
      const s = Math.sin(phase);
      let hip = HIP, lean = baseLean;
      let thighL = s * 0.42 * swing, thighR = -s * 0.42 * swing;
      let kneeLA = -Math.max(0, -s) * 0.5 * swing, kneeRA = -Math.max(0, s) * 0.5 * swing;
      let armA = -thighL * 1.1, armB = -thighR * 1.1, hipZ = 0;
      if (pose.slide) {
        // Leaning back, lead leg out front, the other tucked under
        hip = 0.47; lean = 0.7; hipZ = -0.05;
        thighL = 1.25; kneeLA = -0.4; thighR = 0.9; kneeRA = -2.3;
        armA = -0.4; armB = 0.2;
      } else if (pose.crouch) {
        // Thighs near level, shins straight down, back bent
        hip = 0.47; lean = baseLean - 0.3; hipZ = 0.1;
        thighL = 1.5 + s * 0.08 * swing; thighR = 1.5 - s * 0.08 * swing;
        kneeLA = -thighL; kneeRA = -thighR;
        armA = 0.25; armB = 0.25;
      } else if (!pose.ground) {
        thighL = 0.6; kneeLA = -0.9; thighR = -0.15; kneeRA = -0.6;
        armA = 0.7; armB = 0.4;
      }
      // Arms come up to ready the current weapon.
      if (pose.weapon === 'spear' && pose.hasSpear) armB = 1.1;
      // Winding up a throw: the arm cocks back over the shoulder. This is the tell.
      if (pose.charge && pose.hasSpear) armB = -1.9;
      if (pose.weapon === 'sling') armA = 1.0;
      // Keep the head roughly level in the world, then tilt it toward the aim.
      const headPitch = Math.max(-0.6, Math.min(0.6, (pose.pitch || 0) * 0.5)) - lean;

      const k = Math.min(1, dt * 14);
      rig.hips.position.y += (hip - rig.hips.position.y) * k;
      rig.hips.position.z += (hipZ - rig.hips.position.z) * k;
      rig.torso.rotation.x += (lean - rig.torso.rotation.x) * k;
      rig.legL.rotation.x += (thighL - rig.legL.rotation.x) * k;
      rig.legR.rotation.x += (thighR - rig.legR.rotation.x) * k;
      kneeL.rotation.x += (kneeLA - kneeL.rotation.x) * k;
      kneeR.rotation.x += (kneeRA - kneeR.rotation.x) * k;
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

// ---------------------------------------------------------------- scan ghost
//
// What a scan shows: an amber hologram of the fighter's own body, drawn through
// walls. It keeps their build but is cut into thin horizontal slices; slices
// drop out and shear sideways at random, the edges glow brighter than the
// middle, and a band of light rolls up the body. Every mesh gets an additive
// twin sharing one shader; the twins are hidden until a scan finds them.

const GHOST_VERT = /* glsl */`
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormalV;
varying vec3 vViewDir;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  // Shear each slice sideways a little, re-rolled 14 times a second
  float slice = floor(w.y / 0.11);
  float tick = floor(uTime * 14.0);
  float shove = (hash(slice * 3.7 + tick * 1.3) - 0.5) * 0.14 * step(0.7, hash(slice + tick * 5.1));
  w.x += shove;
  w.z += shove * 0.6;
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const GHOST_FRAG = /* glsl */`
uniform float uStrength;
uniform float uTime;
uniform vec3 uColor;
varying vec3 vWorld;
varying vec3 vNormalV;
varying vec3 vViewDir;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float s = vWorld.y / 0.11;
  float slice = floor(s);
  float tick = floor(uTime * 14.0);
  float r = hash(slice * 13.1 + tick * 7.7);
  if (fract(s) > 0.58) discard;          // the gaps between slices
  if (r < 0.2) discard;                  // whole slices blink out
  float rim = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir))), 1.4);
  float roll = 0.55 + 0.45 * sin(vWorld.y * 3.2 - uTime * 7.0);
  float a = uStrength * (0.18 + 0.82 * rim) * roll * (0.55 + 0.45 * r);
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

const AMBER_GHOST = new THREE.Color(0xff8a00).multiplyScalar(1.4);
const BLOOD_GHOST = new THREE.Color(0x8a0a04).multiplyScalar(1.3);

function createGhost(root) {
  const uniforms = {
    uStrength: { value: 0 },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0xff8a00).multiplyScalar(1.4) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const twins = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.twin) return;
    for (let p = o; p; p = p.parent) if (p.userData.cosmetic) return;
    const t = new THREE.Mesh(o.geometry, mat);
    t.userData.twin = true;
    t.scale.setScalar(1.06);
    t.renderOrder = 10;
    t.visible = false;
    twins.push({ o, t });
  });
  for (const { o, t } of twins) o.add(t);
  return {
    /** carrier: the skull carrier shows as a dark red ghost instead of amber. */
    set(k, time, carrier = false) {
      const on = k > 0.001;
      for (const { t } of twins) t.visible = on;
      uniforms.uStrength.value = k;
      uniforms.uTime.value = time;
      uniforms.uColor.value.copy(carrier ? BLOOD_GHOST : AMBER_GHOST);
    },
  };
}

