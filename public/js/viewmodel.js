// First-person hands and weapons. They live in their own scene and camera,
// drawn over the world with a cleared depth buffer so they never clip into walls.

import * as THREE from 'three';
import { makeSpearMesh, makeKnifeMesh, makeArrowMesh } from './characters.js';
import { SLING_RELOAD, BOW_RELOAD, KNIFE_COUNT } from '/shared/constants.js';

function lam(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function createViewmodel(character, secondary = 'sling') {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
  scene.add(new THREE.AmbientLight(0x5a1a12, 1.6));
  const key = new THREE.DirectionalLight(0xff4a28, 2.2);
  key.position.set(-1, 2, 1);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff1a0a, 1.2);
  rim.position.set(1, -0.5, -1);
  scene.add(rim);

  const skinColor = character === 'stalker' ? 0x4b3a33 : 0x6e4a3a;
  const skin = lam(skinColor);
  const wrap = lam(0x2a1c16);
  const paint = new THREE.MeshBasicMaterial({ color: 0xb4140a });

  // Spear rig: right forearm, fist and spear
  const spearRig = new THREE.Group();
  const arm = box(0.07, 0.07, 0.26, skin, 0.03, -0.05, 0.16);
  const fist = box(0.085, 0.085, 0.09, skin, 0, 0, 0);
  const cuff = box(0.08, 0.08, 0.04, wrap, 0.015, -0.02, 0.07);
  spearRig.add(arm, fist, cuff);
  if (character === 'stalker') spearRig.add(box(0.075, 0.012, 0.075, paint, 0.03, -0.012, 0.2));
  const spear = makeSpearMesh(0.7);
  spear.position.set(0, 0.01, -0.42);
  spearRig.add(spear);
  const spearHome = new THREE.Vector3(0.3, -0.3, -0.72);
  spearRig.position.copy(spearHome);
  spearRig.rotation.set(0.06, 0.16, 0);
  scene.add(spearRig);

  // Sling rig: left fist holding two cords, pouch and stone
  const slingRig = new THREE.Group();
  const lArm = box(0.07, 0.07, 0.26, skin, -0.03, -0.05, 0.16);
  const lFist = box(0.085, 0.085, 0.09, skin);
  slingRig.add(lArm, lFist);
  const pouchPivot = new THREE.Group();
  slingRig.add(pouchPivot);
  const cordMat = lam(0x7a5a38);
  const cord = box(0.012, 0.42, 0.012, cordMat, 0, -0.21, 0);
  pouchPivot.add(cord);
  const pouch = box(0.1, 0.05, 0.1, lam(0x3a2a1c), 0, -0.44, 0);
  pouchPivot.add(pouch);
  const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.045, 0), lam(0x8a8078));
  stone.position.set(0, -0.4, 0);
  pouchPivot.add(stone);
  const slingHome = new THREE.Vector3(-0.3, -0.2, -0.72);
  slingRig.position.copy(slingHome);
  slingRig.rotation.set(0.1, -0.1, 0);
  scene.add(slingRig);

  // Knife rig: left fist holding a fan of bone knives, one per knife left
  const knifeRig = new THREE.Group();
  knifeRig.add(box(0.07, 0.07, 0.26, skin, -0.03, -0.05, 0.16), box(0.085, 0.085, 0.09, skin));
  const knives = [];
  for (let i = 0; i < KNIFE_COUNT; i++) {
    const k = makeKnifeMesh(1.9);
    k.position.set(-0.03 + i * 0.03, 0.04, -0.03);
    k.rotation.set(0.2, -0.25 + i * 0.25, 0);
    knifeRig.add(k);
    knives.push(k);
  }
  const knifeHome = new THREE.Vector3(-0.22, -0.2, -0.52);
  knifeRig.position.copy(knifeHome);
  knifeRig.rotation.set(0.15, -0.15, 0);
  scene.add(knifeRig);

  // Bow rig: held flat (horizontal) in the left fist, limbs curving away.
  // The string runs left to right between the tips; the arrow lies along the
  // bow pointing forward, its nock on the string.
  const bowRig = new THREE.Group();
  bowRig.add(box(0.085, 0.085, 0.09, skin, 0, -0.03, -0.1), box(0.07, 0.07, 0.26, skin, -0.02, -0.07, 0.04));
  const wood = lam(0x5a3a22);
  const limbs = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.014, 4, 18, 1.5), wood);
  limbs.rotation.set(-Math.PI / 2, 0, Math.PI / 2 - 0.75);   // lie flat, bulging forward (-Z)
  limbs.position.z = 0.26;
  bowRig.add(limbs);
  const tipX = Math.sin(0.75) * 0.42, tipZ = 0.26 - Math.cos(0.75) * 0.42;
  const stringMat = new THREE.LineBasicMaterial({ color: 0xd8ccb0 });
  const stringPts = new Float32Array(9);
  const stringGeo = new THREE.BufferGeometry();
  stringGeo.setAttribute('position', new THREE.BufferAttribute(stringPts, 3));
  const string = new THREE.Line(stringGeo, stringMat);
  string.frustumCulled = false;
  bowRig.add(string);
  const arrow = makeArrowMesh(0.72);
  bowRig.add(arrow);
  const bowHome = new THREE.Vector3(-0.06, -0.19, -0.62);
  bowRig.position.copy(bowHome);
  bowRig.scale.setScalar(0.6);
  bowRig.rotation.set(0.04, 0.05, 0.08);
  scene.add(bowRig);
  const setString = (pull) => {
    stringPts.set([-tipX, 0, tipZ, 0, 0, tipZ + pull, tipX, 0, tipZ]);
    stringGeo.attributes.position.needsUpdate = true;
  };

  // Only the loadout's slot-2 rig is ever shown
  const rigs = { sling: slingRig, knives: knifeRig, bow: bowRig };
  for (const [k, r] of Object.entries(rigs)) r.visible = k === secondary;

  const anim = {
    weapon: 'spear',
    raise: { spear: 1, sling: 0, knives: 0, bow: 0 },
    knifeT: 0,
    bowT: 0,
    stab: 0,        // 1 -> 0 over the thrust
    throwT: 0,
    slingT: 0,
    reloadLeft: 0,
    bobPhase: 0,
    charge: 0,      // 0..1 windup progress (set by the game)
    chargeK: 0,     // smoothed for display
  };

  return {
    scene,
    camera,
    setAspect(a) { camera.aspect = a; camera.updateProjectionMatrix(); },
    setWeapon(w) { anim.weapon = w; },
    stab() { anim.stab = 1; },
    throwSpear() { anim.throwT = 1; anim.charge = 0; anim.chargeK = 0; },
    setCharge(k) { anim.charge = k; },
    slingShot() { anim.slingT = 1; anim.reloadLeft = SLING_RELOAD; },
    knifeThrow() { anim.knifeT = 1; },
    bowShot() { anim.bowT = 1; anim.reloadLeft = BOW_RELOAD; },
    /**
     * hasSpear: bool; move: { speed, ground, slide }; st: { reloadLeft, knives }
     * (the slot-2 reload left in seconds, and knives in hand).
     */
    update(dt, hasSpear, move, st = {}) {
      if (st.reloadLeft !== undefined) anim.reloadLeft = st.reloadLeft;
      else anim.reloadLeft = Math.max(0, anim.reloadLeft - dt);
      for (const w of ['spear', 'sling', 'knives', 'bow']) {
        const target = anim.weapon === w ? 1 : 0;
        anim.raise[w] += (target - anim.raise[w]) * Math.min(1, dt * 14);
      }
      anim.stab = Math.max(0, anim.stab - dt / 0.3);
      anim.throwT = Math.max(0, anim.throwT - dt / 0.35);
      anim.slingT = Math.max(0, anim.slingT - dt / 0.25);
      anim.knifeT = Math.max(0, anim.knifeT - dt / 0.16);
      anim.bowT = Math.max(0, anim.bowT - dt / 0.2);

      if (move.ground && move.speed > 1 && !move.slide) anim.bobPhase += dt * Math.min(move.speed, 14) * 1.1;
      const bobX = Math.sin(anim.bobPhase) * 0.018;
      const bobY = -Math.abs(Math.cos(anim.bobPhase)) * 0.02;
      const tilt = move.slide ? 0.25 : 0;
      const airLift = move.ground ? 0 : 0.03;

      // Spear: a quick thrust out that eases back
      const s = anim.stab;
      const thrust = s > 0.6 ? (1 - s) / 0.4 : s / 0.6;
      spearRig.visible = hasSpear || anim.throwT > 0.7;
      spear.visible = hasSpear || anim.throwT > 0.7;
      // Charge: the spear draws back over the shoulder, tip up, and trembles
      // once it's ready to throw.
      anim.chargeK += (anim.charge - anim.chargeK) * Math.min(1, dt * 30);
      const c = anim.chargeK;
      const shake = anim.charge >= 1 ? (Math.random() - 0.5) * 0.006 : 0;
      spearRig.position.set(
        spearHome.x + bobX - thrust * 0.12 + c * 0.04 + shake,
        spearHome.y + bobY + airLift - (1 - anim.raise.spear) * 0.7 + thrust * 0.06 + c * 0.13 + shake,
        spearHome.z - thrust * 0.45 - anim.throwT * 0.2 + c * 0.22,
      );
      spearRig.rotation.set(0.06 - thrust * 0.12 + anim.throwT * 0.3 + c * 0.22, 0.16 - thrust * 0.1 - c * 0.08, -tilt - c * 0.1);

      // Sling: a whip forward on release, then the pouch spins while reloading
      const whip = anim.slingT;
      slingRig.position.set(
        slingHome.x - bobX,
        slingHome.y + bobY + airLift - (1 - anim.raise.sling) * 0.7 + whip * 0.1,
        slingHome.z - whip * 0.15,
      );
      slingRig.rotation.set(0.1 + whip * 0.5, -0.1, tilt);
      const reloading = anim.reloadLeft > 0.001;
      if (reloading) {
        const spin = (1 - anim.reloadLeft / SLING_RELOAD) * Math.PI * 6;
        pouchPivot.rotation.set(Math.sin(spin) * 1.2, 0, Math.cos(spin) * 1.2);
      } else {
        pouchPivot.rotation.x += (0.15 - pouchPivot.rotation.x) * Math.min(1, dt * 8);
        pouchPivot.rotation.z += (0 - pouchPivot.rotation.z) * Math.min(1, dt * 8);
      }
      stone.visible = !reloading || anim.reloadLeft < 0.15;

      // Knives: a flick forward and down on each throw; one knife per one left
      const flick = anim.knifeT;
      knifeRig.position.set(
        knifeHome.x - bobX,
        knifeHome.y + bobY + airLift - (1 - anim.raise.knives) * 0.7 + flick * 0.05,
        knifeHome.z - flick * 0.2,
      );
      knifeRig.rotation.set(0.15 - flick * 0.9, -0.15, tilt);
      const left = st.knives ?? KNIFE_COUNT;
      knives.forEach((k, i) => { k.visible = i < left; });

      // Bow: fire snaps the string forward and the arrow is gone. Reloading,
      // a new arrow slides in tip first along the bow from behind you (first
      // 60%), its nock clips onto the string with a little snap (to 75%), then
      // the string draws back ready.
      bowRig.position.set(
        bowHome.x - bobX * 0.6,
        bowHome.y + bobY + airLift - (1 - anim.raise.bow) * 0.7,
        bowHome.z + anim.bowT * 0.03,
      );
      bowRig.rotation.set(0.04 - anim.bowT * 0.08, 0.05, 0.08 + tilt);
      const bowReload = anim.weapon === 'bow' || anim.reloadLeft > 0 ? anim.reloadLeft : 0;
      const p = bowReload > 0 ? 1 - bowReload / BOW_RELOAD : 1;   // 0 = just fired, 1 = ready
      const drawn = 0.1;
      let nockZ, pull;
      if (anim.bowT > 0.5) { arrow.visible = false; pull = -0.02 * Math.sin(anim.bowT * 30); nockZ = 0; }
      else if (p < 0.6) {
        const k = p / 0.6;
        arrow.visible = p > 0.05;
        nockZ = tipZ + 0.75 * (1 - k * k * (3 - 2 * k)) + 0.06;   // eases in from behind, tip first
        pull = 0;
      } else if (p < 0.75) {
        const k = (p - 0.6) / 0.15;
        arrow.visible = true;
        nockZ = tipZ + 0.06 * (1 - k);                              // the clip onto the string
        pull = k > 0.8 ? 0.012 * Math.sin((k - 0.8) * 60) : 0;      // a tiny twang as it seats
      } else {
        const k = (p - 0.75) / 0.25;
        arrow.visible = true;
        pull = drawn * k;                                           // draw back
        nockZ = tipZ + pull;
      }
      arrow.position.set(0, 0.012, nockZ);
      setString(anim.bowT > 0.5 ? pull : Math.max(pull, 0));
    },
  };
}
