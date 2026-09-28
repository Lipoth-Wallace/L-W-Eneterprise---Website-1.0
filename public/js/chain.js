// Your own gold chain, seen in first person.
//
// A rope of verlet points hangs from two neck anchors. The anchors follow the
// body (the camera position, turned by yaw only), so the chain reacts to real
// motion: it lags when you turn, floats in the air, and whips up into view when
// the camera drops into a slide or bottoms out on a hard landing. Look down and
// it's hanging on your chest. It lives in the world scene at true size (the
// viewmodel camera's narrower FOV would magnify it).

import * as THREE from 'three';

const N = 17;               // points, anchors at 0 and N-1
const SEG = 0.042;          // rest length between points
const GRAVITY = 8.5;        // a touch light, so it floats a bit more than real gold would
const DAMP = 0.985;
const STEP = 1 / 120;
const ITER = 8;

export function createChain(scene) {
  const gold = new THREE.MeshLambertMaterial({ color: 0xffc23a, emissive: 0x4a2c00, flatShading: true });
  const group = new THREE.Group();
  group.frustumCulled = false;
  scene.add(group);

  const links = [];
  for (let i = 0; i < N - 1; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.009, SEG * 1.15), gold);
    group.add(m);
    links.push(m);
  }
  // Medallion: a gold disc with a flint-red gem, hanging from the middle link
  const medal = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 10), gold);
  disc.rotation.x = Math.PI / 2;
  medal.add(disc);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), new THREE.MeshBasicMaterial({ color: 0xff2a14 }));
  gem.scale.set(1, 1.4, 0.6);
  gem.position.z = 0.012;
  medal.add(gem);
  group.add(medal);

  const pts = [], prev = [];
  for (let i = 0; i < N; i++) { pts.push(new THREE.Vector3()); prev.push(new THREE.Vector3()); }
  const anchorL = new THREE.Vector3(), anchorR = new THREE.Vector3(), neck = new THREE.Vector3();
  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  let placed = false, acc = 0, glint = 0, jingleAt = 0;
  const lastRel = new THREE.Vector3();
  const tmp = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3();

  function anchors(eye, yaw) {
    fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    neck.copy(eye).addScaledVector(fwd, 0.1).y -= 0.2;
    anchorL.copy(neck).addScaledVector(right, -0.1);
    anchorR.copy(neck).addScaledVector(right, 0.1);
  }

  function reset() {
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      pts[i].lerpVectors(anchorL, anchorR, k);
      pts[i].y -= Math.sin(k * Math.PI) * 0.26;
      pts[i].addScaledVector(fwd, Math.sin(k * Math.PI) * 0.08);
      prev[i].copy(pts[i]);
    }
    placed = true;
  }

  function simulate() {
    for (let i = 1; i < N - 1; i++) {
      tmp.copy(pts[i]);
      pts[i].x += (pts[i].x - prev[i].x) * DAMP;
      pts[i].y += (pts[i].y - prev[i].y) * DAMP - GRAVITY * STEP * STEP;
      pts[i].z += (pts[i].z - prev[i].z) * DAMP;
      prev[i].copy(tmp);
    }
    pts[0].copy(anchorL);
    pts[N - 1].copy(anchorR);
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < N - 1; i++) {
        a.subVectors(pts[i + 1], pts[i]);
        const len = a.length() || 1e-6;
        const diff = (len - SEG) / len;
        const wA = i === 0 ? 0 : 0.5, wB = i + 1 === N - 1 ? 0 : 0.5;
        const s = wA + wB || 1;
        pts[i].addScaledVector(a, (diff * wA) / s);
        pts[i + 1].addScaledVector(a, (-diff * wB) / s);
      }
      // The chest: keep the chain in front of the body instead of through it.
      for (let i = 1; i < N - 1; i++) {
        tmp.subVectors(pts[i], neck);
        const front = tmp.dot(fwd);
        if (front < 0.02) pts[i].addScaledVector(fwd, 0.02 - front);
      }
    }
  }

  return {
    group,
    reset() { placed = false; },
    /** Push the whole chain, in world units per second (e.g. up on a slide). */
    kick(vx, vy, vz) {
      for (let i = 1; i < N - 1; i++) {
        const w = Math.sin((i / (N - 1)) * Math.PI);   // the middle moves most
        prev[i].x -= vx * STEP * w;
        prev[i].y -= vy * STEP * w;
        prev[i].z -= vz * STEP * w;
      }
    },
    /** A bling flash on the medallion, e.g. after a kill. */
    glint() { glint = 1; },
    /**
     * eye: camera world position; yaw: body yaw; camera: the world camera.
     * Returns true when the chain swung hard enough to jingle.
     */
    update(dt, eye, yaw, camera, visible) {
      group.visible = visible;
      if (!visible) { placed = false; return false; }
      const lastNeck = tmp.copy(neck);
      anchors(eye, yaw);
      // A teleport (respawn, server correction) would fling the chain across
      // the map, so start it fresh instead.
      if (!placed || lastNeck.distanceToSquared(neck) > 1) reset();
      acc += Math.min(dt, 0.1);
      while (acc >= STEP) { acc -= STEP; simulate(); }

      for (let i = 0; i < N - 1; i++) {
        a.copy(pts[i]);
        b.copy(pts[i + 1]);
        const link = links[i];
        link.position.addVectors(a, b).multiplyScalar(0.5);
        link.lookAt(b);
        link.rotateZ(i % 2 ? Math.PI / 2 : 0);   // alternate links for a rope-chain look
      }
      const m = (N - 1) / 2;
      mid.copy(pts[m]);
      // Hang the medallion off the middle link, on the side away from the neck
      tmp.subVectors(mid, neck).normalize();
      medal.position.copy(mid).addScaledVector(tmp, 0.045);
      medal.lookAt(camera.position);

      glint = Math.max(0, glint - dt * 2.5);
      gold.emissive.setRGB(0.29 + glint * 0.7, 0.17 + glint * 0.5, glint * 0.2);

      // Jingle when the chain swings fast relative to your body (running
      // alone shouldn't count, only the chain moving on its own).
      tmp.subVectors(pts[m], neck);
      const relSpeed = tmp.distanceTo(lastRel) / Math.max(dt, 1e-3);
      lastRel.copy(tmp);
      const now = performance.now();
      if (relSpeed > 2.5 && now - jingleAt > 220) { jingleAt = now; return true; }
      return false;
    },
  };
}
