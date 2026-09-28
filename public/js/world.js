// Builds the cave scene from the shared MAP. Collision boxes are drawn as
// concrete or lumpy rock; stalactites, braziers and glowing slits are decor only.

import * as THREE from 'three';
import { MAP } from '/shared/map.js';
import { getTextures, worldUV } from './textures.js';

// Smooth 3D value noise used to lump up rock faces. Every vertex moves by a
// function of its world position, so vertices shared between faces move
// together and no cracks open at the edges.
function hash(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  let r = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
    const wt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    r += hash(xi + dx, yi + dy, zi + dz) * wt;
  }
  return r - 0.5;
}

function lumpy(geometry, amp, freq) {
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const f = freq;
    v.x += vnoise(v.x * f, v.y * f, v.z * f + 17) * amp;
    v.y += vnoise(v.x * f + 31, v.y * f, v.z * f) * amp * 0.6;
    v.z += vnoise(v.x * f, v.y * f + 53, v.z * f) * amp;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
}

export function buildWorld(scene) {
  const tex = getTextures();
  const mats = {
    concrete: new THREE.MeshLambertMaterial({ map: tex.concrete, color: 0xb0a8a0 }),
    slab: new THREE.MeshLambertMaterial({ map: tex.slab, color: 0xa89e96 }),
    rock: new THREE.MeshLambertMaterial({ map: tex.rock, color: 0xa08a80, flatShading: true }),
    floor: new THREE.MeshLambertMaterial({ map: tex.floor, color: 0x9a8a84 }),
  };

  scene.background = new THREE.Color(0x050101);
  scene.fog = new THREE.FogExp2(0x100404, 0.022);
  scene.add(new THREE.AmbientLight(0x4a1c16, 2.2));
  // A dull grey-brown fill from above keeps shapes readable; the red comes from the point lights.
  scene.add(new THREE.HemisphereLight(0x8a7670, 0x180808, 1.5));

  for (const b of MAP.boxes) {
    const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
    const isRock = b.mat === 'rock';
    const seg = (n) => (isRock ? Math.max(1, Math.round(n / 1.2)) : 1);
    const geo = new THREE.BoxGeometry(sx, sy, sz, seg(sx), seg(sy), seg(sz));
    worldUV(geo, sx, sy, sz, b.mat === 'floor' ? 3 : 2.5);
    geo.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    // Lump the rock up in world space. Faces bulge outward by at most ~0.25 m,
    // which you can't feel against the flat collision box.
    if (isRock) lumpy(geo, 0.55, 0.45);
    const mesh = new THREE.Mesh(geo, mats[b.mat] || mats.concrete);
    scene.add(mesh);
  }

  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2a14 });
  const glowDim = new THREE.MeshBasicMaterial({ color: 0x8a0e06 });

  // Glowing slits cut into the monolith: the brutalist centrepiece.
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.2, 0.05), k === 1 ? glowMat : glowDim);
      slit.position.set(-1.8 + k * 1.8, 5.2, -4.03);
      g.add(slit);
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.12, 0.05), glowDim);
    band.position.set(0, 2.4, -4.03);
    g.add(band);
    g.rotation.y = (i * Math.PI) / 2;
    scene.add(g);
  }
  // Red strips along the ledge edges so you can read the high ground in the dark.
  for (const sx of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 16), glowDim);
    strip.position.set(sx * 25.03, 1.97, 0);
    scene.add(strip);
  }

  // Stalactites (seeded, so both players see the same cave)
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const stalMat = new THREE.MeshLambertMaterial({ color: 0x3e302b, flatShading: true });
  for (let i = 0; i < 90; i++) {
    const x = (rand() * 2 - 1) * 29, z = (rand() * 2 - 1) * 29;
    const len = 0.6 + rand() * 2.2, r = 0.15 + rand() * 0.45;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, len, 5), stalMat);
    cone.rotation.x = Math.PI;
    cone.position.set(x, MAP.ceiling - len / 2, z);
    scene.add(cone);
  }

  // Lights
  const flickers = [];
  for (const l of MAP.lights) {
    const light = new THREE.PointLight(l.color, l.intensity * 1.8, l.distance * 1.2, 1.4);
    light.position.set(...l.p);
    scene.add(light);
    if (l.flicker) flickers.push({ light, base: light.intensity, phase: Math.random() * 10 });
  }

  // Braziers: stone bowl and flickering flame blocks
  const bowlMat = new THREE.MeshLambertMaterial({ color: 0x2a211e, flatShading: true });
  const flameA = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
  const flameB = new THREE.MeshBasicMaterial({ color: 0xff2a0a });
  const flames = [];
  for (const [x, y, z] of MAP.braziers) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 0.7, 6), bowlMat);
    bowl.position.set(x, y + 0.35, z);
    scene.add(bowl);
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.22), k % 2 ? flameA : flameB);
      f.position.set(x + (k % 2 ? 0.15 : -0.15), y + 0.9, z + (k < 2 ? 0.12 : -0.12));
      scene.add(f);
      flames.push({ mesh: f, base: f.position.y, phase: Math.random() * 10 });
    }
  }

  return {
    update(t) {
      for (const f of flickers) {
        f.light.intensity = f.base * (0.75 + 0.25 * Math.sin(t * 13 + f.phase) * Math.sin(t * 7.3 + f.phase * 2));
      }
      for (const f of flames) {
        const s = 0.7 + 0.5 * Math.abs(Math.sin(t * 9 + f.phase));
        f.mesh.scale.set(1, s, 1);
        f.mesh.position.y = f.base + (s - 1) * 0.2;
        f.mesh.rotation.y = t * 2 + f.phase;
      }
    },
  };
}
