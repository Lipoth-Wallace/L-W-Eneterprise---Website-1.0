// The relic: a giant human skull, deliberately uncanny. The rest of the world
// is chunky and low-poly; this is smooth, sculpted and far too detailed, so it
// looks wrong in the scene. Its pinprick pupils follow whoever is looking at
// it, its jaw clacks at irregular intervals (and chatters when dragged), and it
// slowly swells as if breathing.
//
// It hovers in the crater. Once taken it is dragged behind the carrier on a
// lead, bumping along the ground and up the terraces.

import * as THREE from 'three';
import * as C from '/shared/constants.js';
import { rayMap } from '/shared/raycast.js';

const SCALE = 2.1;    // over 2 m tall: a skull for something enormous

// Bone: off-white with cracks, pits and grime, a little waxy
function boneTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d9ccb0';
  g.fillRect(0, 0, 256, 256);
  let seed = 3;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 2600; i++) {
    const v = 150 + r() * 80;
    g.fillStyle = `rgba(${v},${v * 0.92},${v * 0.78},${0.25 + r() * 0.3})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
  }
  for (let i = 0; i < 40; i++) {             // grime and old blood in the pores
    g.fillStyle = `rgba(${60 + r() * 40},${20 + r() * 20},${10},${0.08 + r() * 0.12})`;
    g.beginPath();
    g.arc(r() * 256, r() * 256, 3 + r() * 16, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(40,24,14,0.7)';       // hairline cracks and cranial sutures
  for (let i = 0; i < 14; i++) {
    let x = r() * 256, y = r() * 256;
    g.lineWidth = 0.6 + r() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 10; k++) { x += (r() - 0.5) * 18; y += (r() - 0.5) * 18; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// The cranium is one dense sphere sculpted by pushing each vertex in or out
// along its direction: deep hollows for the eye sockets and nasal cavity, a
// brow ridge, cheekbones, sunken temples, a narrowed lower face. The deeper a
// point is carved, the darker its vertex colour (baked ambient occlusion), so
// the sockets fall away into shadow like real bone.
const SOCKET_DEPTH = 0.36;
const SOCKET_DIR = (s) => new THREE.Vector3(s * 0.36, 0.04, -0.93).normalize();

function feature(n, dir, sx, sy, amount) {
  const dx = n.x - dir.x, dy = n.y - dir.y, dz = n.z - dir.z;
  const e = (dx * dx) / (sx * sx) + (dy * dy) / (sy * sy) + (dz * dz) / (Math.min(sx, sy) ** 2);
  return amount * Math.exp(-e);
}

// Sculpted radius multiplier for a unit direction n (front is -Z)
function carve(n) {
  let d = 0;
  for (const s of [-1, 1]) {
    d += feature(n, SOCKET_DIR(s), 0.2, 0.16, -SOCKET_DEPTH);                                // eye socket
    d += feature(n, new THREE.Vector3(s * 0.5, -0.24, -0.83).normalize(), 0.16, 0.1, 0.07);    // cheekbone
    d += feature(n, new THREE.Vector3(s * 0.95, 0.12, -0.2).normalize(), 0.3, 0.28, -0.07);    // temple hollow
  }
  d += feature(n, new THREE.Vector3(0, 0.27, -0.96).normalize(), 0.6, 0.07, 0.05);            // brow ridge
  d += feature(n, new THREE.Vector3(0, -0.2, -0.98).normalize(), 0.07, 0.13, -0.22);          // nasal cavity
  return d;
}

function cranium(bone) {
  const geo = new THREE.SphereGeometry(0.5, 128, 96);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    const d = carve(n);
    v.copy(n).multiplyScalar(0.5 * (1 + d));
    v.z *= 1.16;                                               // long skull
    v.x *= 0.86;                                               // narrow
    if (n.y < -0.2) {                                          // the face narrows toward the jaw
      const k = Math.min(1, (-0.2 - n.y) / 0.5);
      v.x *= 1 - 0.28 * k;
      if (n.z < 0) v.z *= 1 - 0.18 * k;
    }
    if (n.z > 0.3) v.y += 0.05 * (n.z - 0.3);                  // swollen back of the head
    v.y = Math.max(v.y, -0.34);                                // flat base where the jaw hangs
    pos.setXYZ(i, v.x, v.y, v.z);
    const ao = Math.min(1, Math.max(0, -d * 3.4));
    const shade = 1 - 0.93 * ao;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade * (1 - 0.05 * ao);
    colors[i * 3 + 2] = shade * (1 - 0.1 * ao);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, bone);
}

// Where the bottom of each socket is, in cranium space (for the pupils)
function socketFloor(s) {
  const n = SOCKET_DIR(s);
  const v = n.clone().multiplyScalar(0.5 * (1 - SOCKET_DEPTH * 0.92));
  v.z *= 1.16;
  v.x *= 0.86;
  return v;
}

export function createSkull(scene) {
  const tex = boneTexture();
  // The cranium carries baked shading in its vertex colours; the other bones don't
  const craniumMat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, color: 0xf4ead4, roughness: 0.5, metalness: 0.02, emissive: 0x1a140e });
  const bone = new THREE.MeshStandardMaterial({ map: tex, color: 0xe8dcc0, roughness: 0.5, metalness: 0.02, emissive: 0x140e08 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0xffe0c0 });

  const root = new THREE.Group();
  const skull = new THREE.Group();
  skull.scale.setScalar(SCALE);
  root.add(skull);

  const head = cranium(craniumMat);
  head.position.y = 0.55;
  skull.add(head);

  // A pinprick pupil at the bottom of each socket
  const pupils = [];
  for (const s of [-1, 1]) {
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), pupilMat);
    const home = socketFloor(s).add(new THREE.Vector3(0, 0.55, 0));
    pupil.position.copy(home);
    skull.add(pupil);
    pupils.push({ mesh: pupil, home });
  }

  // Upper jaw that carries the top teeth
  const face = new THREE.Group();
  face.position.set(0, 0.25, -0.38);
  skull.add(face);
  const maxilla = new THREE.Mesh(new THREE.SphereGeometry(0.17, 40, 24), bone);
  maxilla.scale.set(1.05, 0.55, 0.9);
  maxilla.position.set(0, 0.02, 0.0);
  face.add(maxilla);

  // Teeth on an arc: upper row fixed, lower row on the jaw
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xe8dcb8, roughness: 0.35, emissive: 0x100804 });
  function teeth(parent, y, flip) {
    for (let i = 0; i < 14; i++) {
      const a = ((i - 6.5) / 6.5) * 1.05;
      const w = Math.abs(i - 6.5) < 2 ? 0.024 : 0.021;
      const tooth = new THREE.Mesh(new THREE.CapsuleGeometry(w, 0.05, 4, 8), toothMat);
      tooth.position.set(Math.sin(a) * 0.16, y, -Math.cos(a) * 0.16 - 0.02);
      tooth.rotation.z = flip ? Math.PI : 0;
      tooth.scale.z = 0.7;
      parent.add(tooth);
    }
  }
  teeth(face, -0.06, false);

  // Mandible, hinged near the ears
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.24, -0.02);
  skull.add(jaw);
  const mandible = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 12, 40, Math.PI), bone);
  mandible.rotation.set(Math.PI / 2, 0, Math.PI);
  mandible.scale.set(1.1, 1.25, 1);
  mandible.position.set(0, -0.13, -0.12);
  jaw.add(mandible);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), bone);
  chin.scale.set(1.3, 0.7, 0.8);
  chin.position.set(0, -0.15, -0.42);
  jaw.add(chin);
  for (const s of [-1, 1]) {
    const ramus = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.14, 6, 12), bone);
    ramus.position.set(s * 0.22, 0.0, -0.04);
    ramus.rotation.x = 0.25;
    jaw.add(ramus);
  }
  const lowerTeeth = new THREE.Group();
  lowerTeeth.position.set(0, -0.06, -0.36);
  teeth(lowerTeeth, 0, true);
  jaw.add(lowerTeeth);

  // Its own cold, pale light: it should look lit by something that isn't
  // there, and read as bone against the red of everything else
  const glint = new THREE.PointLight(0xd8e4ff, 10, 7, 1.4);
  glint.position.set(0.6, 2.2, -2.2);
  root.add(glint);

  scene.add(root);

  // The lead: a sagging rope from the carrier's hand to the skull
  const ropePts = new Float32Array(16 * 3);
  const ropeGeo = new THREE.BufferGeometry();
  ropeGeo.setAttribute('position', new THREE.BufferAttribute(ropePts, 3));
  const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0x5a3a22 }));
  rope.frustumCulled = false;
  rope.visible = false;
  scene.add(rope);

  const pos = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let placed = false, clack = 0, clackAt = 0, jawTarget = 0, tumble = 0;

  function groundBelow(x, y, z, boxes) {
    const hit = rayMap([x, y + 1.5, z], [0, -1, 0], 40, boxes);
    return hit.t === Infinity ? 0 : hit.point[1];
  }

  return {
    group: root,
    /**
     * state: 'home' | 'dropped' | 'carried' | 'scored'; p: server position;
     * carrier: [x, y, z] feet of whoever holds it (when carried); camera: the
     * viewer's camera; boxes: map geometry.
     */
    update(dt, t, { state, p, carrier, camera, boxes }) {
      root.visible = state !== 'scored';
      if (!root.visible) { rope.visible = false; placed = false; return; }
      const carried = state === 'carried' && carrier;
      if (carried) {
        // Dragged: stay a lead's length behind, resting on whatever's below
        if (!placed) pos.set(carrier[0], carrier[1], carrier[2]);
        tmp.set(pos.x - carrier[0], 0, pos.z - carrier[2]);
        const d = tmp.length();
        if (d > C.RELIC_LEAD) pos.set(carrier[0] + (tmp.x / d) * C.RELIC_LEAD, pos.y, carrier[2] + (tmp.z / d) * C.RELIC_LEAD);
        const floor = groundBelow(pos.x, Math.max(pos.y, carrier[1]), pos.z, boxes);
        pos.y += (floor - pos.y) * Math.min(1, dt * 12);
        tumble += d * dt * 3;
      } else {
        // Home: hovers and bobs. Dropped: sits on the ground where it fell.
        const hover = state === 'home' ? 1.2 + Math.sin(t * 1.3) * 0.15 : 0;
        const target = tmp.set(p[0], p[1] + hover, p[2]);
        if (!placed || pos.distanceTo(target) > 6) pos.copy(target);
        else pos.lerp(target, Math.min(1, dt * 6));
      }
      placed = true;
      root.position.copy(pos);

      // Turn to face the viewer, slowly; tumble a little while dragged
      const face = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z) + Math.PI;
      let dyaw = face - root.rotation.y;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      root.rotation.y += dyaw * Math.min(1, dt * (carried ? 1.2 : 0.7));
      skull.rotation.z = carried ? Math.sin(tumble) * 0.25 : Math.sin(t * 0.7) * 0.05;
      skull.rotation.x = carried ? -0.25 + Math.sin(tumble * 0.7) * 0.15 : 0;

      // Breathing
      const b = 1 + Math.sin(t * 1.1) * 0.02 + Math.sin(t * 2.9) * 0.006;
      skull.scale.set(SCALE * b, SCALE * (2 - b), SCALE * b);

      // The jaw: long still spells, then a sudden clack. Dragged, it chatters.
      if (carried) jawTarget = 0.12 + Math.abs(Math.sin(t * 23)) * 0.18;
      else if (t > clackAt) {
        clack = 0.2 + Math.random() * 0.25;
        clackAt = t + 1.5 + Math.random() * 4;
        jawTarget = clack;
      } else if (t > clackAt - 1.3) jawTarget = 0;
      jaw.rotation.x += (jawTarget - jaw.rotation.x) * Math.min(1, dt * (carried ? 30 : 9));

      // Pupils swivel toward the viewer
      const local = skull.worldToLocal(camera.position.clone());
      for (const pl of pupils) {
        tmp.copy(local).sub(pl.home).normalize().multiplyScalar(0.035);
        pl.mesh.position.set(pl.home.x + tmp.x, pl.home.y + tmp.y * 0.8, pl.home.z + Math.min(0, tmp.z) * 0.2);
      }
      glint.intensity = 9 + Math.sin(t * 5) * 1.5;

      // Rope from the carrier's hand, sagging in the middle
      rope.visible = !!carried;
      if (carried) {
        const hx = carrier[0], hy = carrier[1] + 1.0, hz = carrier[2];
        const ex = pos.x, ey = pos.y + 0.5, ez = pos.z;
        for (let i = 0; i < 16; i++) {
          const k = i / 15;
          ropePts[i * 3] = hx + (ex - hx) * k;
          ropePts[i * 3 + 1] = hy + (ey - hy) * k - Math.sin(k * Math.PI) * 0.45;
          ropePts[i * 3 + 2] = hz + (ez - hz) * k;
        }
        ropeGeo.attributes.position.needsUpdate = true;
      }
    },
    /** World position of the skull (for markers and sounds). */
    get position() { return pos; },
    dispose() {
      scene.remove(root);
      scene.remove(rope);
    },
  };
}
