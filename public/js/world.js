// Builds a map's scene. Collision boxes are drawn as concrete or lumpy rock.
// Everything else (stalactites, braziers, sky, signs) is decor only.

import * as THREE from 'three';
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

// An upright cylinder collider drawn as rock. Mountains taper into ragged
// peaks well above the collider (nobody gets up there); terraces and boulders
// keep a flat top you can land on.
function roundRock(b, mat) {
  const r = b.r, y0 = b.min[1], h = b.max[1] - y0;
  const mountain = b.mat === 'mountain';
  const seg = Math.max(12, Math.min(72, Math.round(r * 1.6)));
  const hh = mountain ? h * 1.1 : h;
  const geo = new THREE.CylinderGeometry(mountain ? r * 0.4 : r, r, hh, seg, Math.max(1, Math.round(hh / (mountain ? 5 : 1.5))), false);
  // Texture: wrap once per 2.5 m around, and up the side
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * Math.PI * r) / 2.5, uv.getY(i) * hh / 2.5);
  geo.translate(b.c[0], y0 + hh / 2, b.c[1]);
  if (mountain) {
    // Big crags, then smaller breakup. Keep the foot where the collider is.
    const pos = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const k = Math.min(1, (v.y - y0) / 6);   // 0 at the foot, 1 from 6 m up
      const n = vnoise(v.x * 0.07, v.y * 0.05, v.z * 0.07) * 9 * k;
      const dx = v.x - b.c[0], dz = v.z - b.c[1], d = Math.hypot(dx, dz) || 1;
      v.x += (dx / d) * n; v.z += (dz / d) * n;
      v.y += vnoise(v.x * 0.1 + 9, v.y * 0.1, v.z * 0.1) * 6 * k;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    lumpy(geo, 0.9, 0.3);
  } else {
    lumpy(geo, r > 20 ? 0.7 : 0.45, 0.4, b.max[1]);
  }
  return new THREE.Mesh(geo, mat);
}

// keepTopY: leave the walkable top face flat (for terraces you stand on)
function lumpy(geometry, amp, freq, keepTopY) {
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (keepTopY !== undefined && v.y > keepTopY - 1e-3) continue;
    const f = freq;
    v.x += vnoise(v.x * f, v.y * f, v.z * f + 17) * amp;
    v.y += vnoise(v.x * f + 31, v.y * f, v.z * f) * amp * 0.6;
    v.z += vnoise(v.x * f, v.y * f + 53, v.z * f) * amp;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
}

export function buildWorld(scene, map) {
  const tex = getTextures();
  const mats = {
    concrete: new THREE.MeshLambertMaterial({ map: tex.concrete, color: 0xb0a8a0 }),
    slab: new THREE.MeshLambertMaterial({ map: tex.slab, color: 0xa89e96 }),
    rock: new THREE.MeshLambertMaterial({ map: tex.rock, color: 0xa08a80, flatShading: true }),
    floor: new THREE.MeshLambertMaterial({ map: tex.floor, color: 0x9a8a84 }),
    course: new THREE.MeshLambertMaterial({ map: tex.concrete, color: 0xc8bcb4 }),
    blood: new THREE.MeshLambertMaterial({ map: tex.rock, color: 0x6a0a06, emissive: 0x4a0402 }),
    grass: new THREE.MeshLambertMaterial({ map: tex.grass, color: 0xb0a098 }),
    ash: new THREE.MeshLambertMaterial({ map: tex.floor, color: 0x6a5a58 }),
    basalt: new THREE.MeshLambertMaterial({ map: tex.rock, color: 0x5a4a4a, flatShading: true }),
    step: new THREE.MeshLambertMaterial({ map: tex.slab, color: 0x5a4e4c }),
    wood: new THREE.MeshLambertMaterial({ map: tex.bark, color: 0xa08a80 }),
    boulder: new THREE.MeshLambertMaterial({ map: tex.rock, color: 0x6a5652, flatShading: true }),
    mountain: new THREE.MeshLambertMaterial({ map: tex.rock, color: 0x4a3634, flatShading: true }),
  };

  // Lighting: bright enough to read the shapes of the world near you. Low
  // visibility comes from the mist, which swallows anything far away, not
  // from pitch-black shadows.
  scene.add(new THREE.AmbientLight(0x5a2a22, 3.0));
  let sky = null;
  if (map.sky) {
    sky = addSky(scene);
    scene.fog = map.fog ? new THREE.FogExp2(map.fog.color, map.fog.density) : new THREE.FogExp2(0x4a1c16, 0.012);
    // Red moonlight: long shadows are too expensive, but a key light from
    // the moon's side keeps silhouettes readable.
    scene.add(new THREE.HemisphereLight(0xb07068, 0x2a1010, 2.2));
    const moon = new THREE.DirectionalLight(0xff8a6a, 1.7);
    moon.position.set(...MOON_DIR.map((v) => v * 100));
    scene.add(moon);
  } else {
    scene.fog = new THREE.FogExp2(0x2c100c, 0.02);
    scene.background = scene.fog.color.clone();
    // A grey-brown fill from above keeps shapes readable; the red comes from the point lights.
    scene.add(new THREE.HemisphereLight(0xa89088, 0x2a1414, 2.3));
  }
  const mist = addMist(scene, scene.fog.color);

  for (const b of map.boxes) {
    if (b.mat === 'trunk') continue;   // drawn as round trees in addThicketDecor
    if (b.r !== undefined) { scene.add(roundRock(b, mats[b.mat] || mats.basalt)); continue; }
    const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
    const isRock = b.mat === 'rock' || b.mat === 'basalt';
    const seg = (n) => (isRock ? Math.max(1, Math.round(n / 1.2)) : 1);
    const geo = new THREE.BoxGeometry(sx, sy, sz, seg(sx), seg(sy), seg(sz));
    worldUV(geo, sx, sy, sz, b.mat === 'floor' ? 3 : 2.5);
    geo.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    // Lump the rock up in world space. Faces bulge outward by at most ~0.25 m,
    // which you can't feel against the flat collision box.
    if (b.mat === 'rock') lumpy(geo, 0.55, 0.45);
    if (b.mat === 'basalt') lumpy(geo, 0.6, 0.4, b.max[1]);
    const mesh = new THREE.Mesh(geo, mats[b.mat] || mats.concrete);
    scene.add(mesh);
  }

  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2a14 });
  const glowDim = new THREE.MeshBasicMaterial({ color: 0x8a0e06 });

  let extras = {};
  if (map.id === 'kiln') addKilnDecor(scene, map, glowMat, glowDim);
  else if (map.id === 'thicket') extras = addThicketDecor(scene, map);
  else if (map.id === 'volcano') extras = addVolcanoDecor(scene, map);
  else addQuarryDecor(scene, map, glowMat, glowDim);

  // Lights
  const flickers = [];
  for (const l of map.lights) {
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
  for (const [x, y, z] of map.braziers) {
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
    bushes: extras.bushes || [],
    update(t, camera) {
      if (sky && camera) sky.position.copy(camera.position);
      if (camera) mist.update(t, camera);
      if (extras.update) extras.update(t);
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

function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

function addKilnDecor(scene, map, glowMat, glowDim) {
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
  const rand = seeded(7);
  const stalMat = new THREE.MeshLambertMaterial({ color: 0x3e302b, flatShading: true });
  for (let i = 0; i < 90; i++) {
    const x = (rand() * 2 - 1) * 29, z = (rand() * 2 - 1) * 29;
    const len = 0.6 + rand() * 2.2, r = 0.15 + rand() * 0.45;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, len, 5), stalMat);
    cone.rotation.x = Math.PI;
    cone.position.set(x, map.ceiling - len / 2, z);
    scene.add(cone);
  }

}

// ---------------------------------------------------------------- the Quarry

const MOON_DIR = new THREE.Vector3(-0.35, 0.32, -1).normalize().toArray();

// Sky dome, moon and stars. The group follows the camera so they never get closer.
// A thin layer of drifting ground mist around the viewer: soft puffs a bit
// lighter than the fog, low to the ground. It keeps far fighters hazy while
// the lighting keeps the near world readable.
function addMist(scene, fogColor) {
  const n = 220, R = 34;
  const pos = new Float32Array(n * 3), seed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    seed[i * 3] = (Math.random() * 2 - 1) * R;
    seed[i * 3 + 1] = Math.random();
    seed[i * 3 + 2] = (Math.random() * 2 - 1) * R;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const cg = c.getContext('2d');
  // Lumpy, not a clean disc
  for (let k = 0; k < 7; k++) {
    const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24, r = 12 + Math.random() * 14;
    const grad = cg.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = grad;
    cg.fillRect(0, 0, 64, 64);
  }
  const color = fogColor.clone().lerp(new THREE.Color(0xc89a90), 0.2);
  const mat = new THREE.PointsMaterial({ color, size: 9, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.1, depthWrite: false, fog: true });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  const wrap = (v) => ((v + R) % (2 * R) + 2 * R) % (2 * R) - R;
  return {
    update(t, camera) {
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      for (let i = 0; i < n; i++) {
        // Drift slowly, and wrap around the viewer so the layer never ends
        const x = wrap(seed[i * 3] + t * 0.6 - cx) + cx;
        const z = wrap(seed[i * 3 + 2] + t * 0.25 - cz) + cz;
        pos[i * 3] = x;
        pos[i * 3 + 1] = cy - 1.9 + seed[i * 3 + 1] * 1.5 + Math.sin(t * 0.3 + i) * 0.2;
        pos[i * 3 + 2] = z;
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

function addSky(scene) {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(450, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 horizon = vec3(0.075, 0.009, 0.006);
          vec3 zenith = vec3(0.003, 0.0008, 0.0015);
          vec3 c = mix(horizon, zenith, pow(h, 0.4));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -2;
  group.add(dome);

  const moonPos = new THREE.Vector3(...MOON_DIR).multiplyScalar(400);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(16, 20), new THREE.MeshBasicMaterial({ color: 0xff5a3a, fog: false }));
  moon.position.copy(moonPos);
  moon.lookAt(0, 0, 0);
  group.add(moon);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(46, 20),
    new THREE.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0.14, fog: false, depthWrite: false }),
  );
  halo.position.copy(moonPos).multiplyScalar(1.01);
  halo.lookAt(0, 0, 0);
  group.add(halo);

  const rand = seeded(99);
  const n = 700, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, y = 0.08 + rand() * 0.92, r = Math.sqrt(1 - y * y);
    arr[i * 3] = Math.cos(a) * r * 420;
    arr[i * 3 + 1] = y * 420;
    arr[i * 3 + 2] = Math.sin(a) * r * 420;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd8a898, size: 1.5, sizeAttenuation: false, fog: false })));

  group.traverse((o) => { o.frustumCulled = false; });
  scene.add(group);
  return group;
}

// Text on a plane, drawn to a small canvas so it matches the pixel look.
function label(text, { color = '#d8ccb0', bg = 'rgba(12,4,3,0.85)', h = 0.5 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '16px monospace';
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(text).width) + 12;
  c.height = 22;
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 6, 12);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const w = (h * c.width) / c.height;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false }));
}

function addQuarryDecor(scene, map, glowMat, glowDim) {
  const concrete = new THREE.MeshLambertMaterial({ map: getTextures().concrete, color: 0xb0a8a0 });
  const rock = new THREE.MeshLambertMaterial({ color: 0x2a1e1a, flatShading: true });
  const rand = seeded(31);

  // Jagged cliff tops against the sky
  for (const b of map.boxes) {
    if (b.mat !== 'rock' || b.max[1] < 12) continue;
    const lx = b.max[0] - b.min[0], lz = b.max[2] - b.min[2];
    const count = Math.round(Math.max(lx, lz) / 3.5);
    for (let i = 0; i < count; i++) {
      const hgt = 3 + rand() * 9, r = 1.5 + rand() * 2.5;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, hgt, 5), rock);
      cone.position.set(
        b.min[0] + (lx > lz ? rand() * lx : lx / 2),
        b.max[1] + hgt / 2 - 0.5,
        b.min[2] + (lz >= lx ? rand() * lz : lz / 2),
      );
      cone.rotation.y = rand() * 3;
      scene.add(cone);
    }
  }

  // Distant mountains, drawn as dark silhouettes with no fog
  const far = new THREE.MeshBasicMaterial({ color: 0x2a0907, fog: false });
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + rand() * 0.1, d = 230 + rand() * 60;
    const hgt = 40 + rand() * 70;
    const m = new THREE.Mesh(new THREE.ConeGeometry(30 + rand() * 30, hgt, 5), far);
    m.position.set(Math.cos(a) * d, hgt / 2 - 25, Math.sin(a) * d);
    scene.add(m);
  }

  // Glowing edges on every course platform, so the gaps read at speed
  for (const b of map.boxes) {
    if (b.mat !== 'course') continue;
    const y = b.max[1] + 0.02, lx = b.max[0] - b.min[0], lz = b.max[2] - b.min[2];
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    for (const z of [b.min[2], b.max[2]]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(lx, 0.05, 0.08), glowMat);
      s.position.set(cx, y, z);
      scene.add(s);
    }
    for (const x of [b.min[0], b.max[0]]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, lz), glowDim);
      s.position.set(x, y, cz);
      scene.add(s);
    }
  }

  // Course gates
  const course = map.course;
  for (const g of course.gates) {
    const top = 3.4;
    for (const x of [g.x0, g.x1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, top, 0.35), concrete);
      post.position.set(x, top / 2, g.z);
      scene.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(g.x1 - g.x0 + 0.35, 0.35, 0.35), concrete);
    lintel.position.set((g.x0 + g.x1) / 2, top, g.z);
    scene.add(lintel);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(g.x1 - g.x0, 0.06, 0.06), glowMat);
    strip.position.set((g.x0 + g.x1) / 2, top - 0.2, g.z - 0.2);
    scene.add(strip);
    const text = label(g.label, { color: g.label === 'CHECKPOINT' ? '#ff5a22' : '#d8ccb0', h: 0.55 });
    text.position.set((g.x0 + g.x1) / 2, top + 0.55, g.z);
    text.rotation.y = Math.PI;   // readable from the start side (-Z)
    scene.add(text);
    const back = text.clone();
    back.rotation.y = 0;
    back.position.z -= 0.01;
    scene.add(back);
  }

  // Distance plates beside each target
  for (const b of map.bots) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), concrete);
    const sx = b.p[0] + 1.4, sz = b.p[2];
    post.position.set(sx, b.p[1] + 0.6, sz);
    scene.add(post);
    const plate = label(b.label, { h: 0.45 });
    plate.position.set(sx, b.p[1] + 1.35, sz);
    plate.rotation.y = b.yaw + Math.PI;
    scene.add(plate);
  }

  for (const sign of map.signs || []) {
    const t = label(sign.text, { h: 0.6 });
    t.position.set(sign.p[0], sign.p[1] + 2.6, sign.p[2]);
    t.rotation.y = sign.yaw || 0;
    scene.add(t);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.3, 0.15), concrete);
    post.position.set(sign.p[0], sign.p[1] + 1.15, sign.p[2] + 0.1 * Math.cos(sign.yaw || 0));
    scene.add(post);
  }
}

// ---------------------------------------------------------------- the Thicket

function addThicketDecor(scene, map) {
  const tex = getTextures();
  const rand = seeded(77);
  const barkMat = new THREE.MeshLambertMaterial({ map: tex.bark, color: 0x9a8078, flatShading: true });
  const canopyMat = new THREE.MeshLambertMaterial({ map: tex.leaves, color: 0x6a7a60, flatShading: true });

  // Trees: a round trunk (the collision box is its square footprint) and a
  // stacked-cone canopy high enough to leave sightlines at head height.
  for (const t of map.trees) {
    const [x, z] = t.p;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.85, t.r * 1.25, 14, 6), barkMat);
    trunk.position.set(x, 7, z);
    scene.add(trunk);
    const tiers = 3 + Math.floor(rand() * 2);
    for (let i = 0; i < tiers; i++) {
      const r = 3.2 - i * 0.65 + rand() * 0.5, h = 3.2;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), canopyMat);
      cone.position.set(x + (rand() - 0.5) * 0.4, 5.2 + i * 2.1, z + (rand() - 0.5) * 0.4);
      cone.rotation.y = rand() * 3;
      scene.add(cone);
    }
  }

  // Bushes: a dense dome of leafy blobs. The inside is hollow, so you can
  // stand in one, and the blobs overlap enough that nothing shows through
  // from outside. Each bush has its own material so the one you're standing
  // in can fade out for you alone.
  const bushes = [];
  for (const b of map.bushes) {
    const mat = new THREE.MeshLambertMaterial({ map: tex.leaves, color: 0x6a7c58, emissive: 0x0c1408, flatShading: true, transparent: true, opacity: 1 });
    const group = new THREE.Group();
    group.position.set(b.p[0], 0, b.p[1]);
    const ring = (count, radius, y, size) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rand() * 0.3;
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(size * (0.85 + rand() * 0.3), 0), mat);
        blob.position.set(Math.cos(a) * radius, y + (rand() - 0.5) * 0.2, Math.sin(a) * radius);
        blob.rotation.set(rand() * 3, rand() * 3, 0);
        group.add(blob);
      }
    };
    ring(11, b.r, 0.55, 0.75);
    ring(10, b.r * 0.92, 1.35, 0.72);
    ring(6, b.r * 0.55, b.h - 0.15, 0.7);
    const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), mat);
    cap.position.y = b.h + 0.1;
    group.add(cap);
    scene.add(group);
    bushes.push({ ...b, mat, group });
  }

  // Ground scatter: ferns and a few glowing mushrooms
  const fernMat = new THREE.MeshLambertMaterial({ color: 0x2c3a22, flatShading: true });
  const shroomMat = new THREE.MeshBasicMaterial({ color: 0xff3a1a });
  const W = map.halfSize - 2;
  for (let i = 0; i < 140; i++) {
    const x = (rand() * 2 - 1) * W, z = (rand() * 2 - 1) * W;
    const fern = new THREE.Mesh(new THREE.ConeGeometry(0.35 + rand() * 0.3, 0.4 + rand() * 0.4, 4), fernMat);
    fern.position.set(x, 0.25, z);
    fern.rotation.y = rand() * 3;
    scene.add(fern);
    if (i % 7 === 0) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.07, 5), shroomMat);
      cap.position.set(x + 0.4, 0.14, z + 0.2);
      scene.add(cap);
    }
  }

  // Fireflies: slow drifting specks that pulse
  const n = 160;
  const base = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    base[i * 3] = (rand() * 2 - 1) * W;
    base[i * 3 + 1] = 0.5 + rand() * 3;
    base[i * 3 + 2] = (rand() * 2 - 1) * W;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
  const flyMat = new THREE.PointsMaterial({ color: 0xd8e070, size: 0.09, transparent: true, opacity: 0.8, depthWrite: false });
  const flies = new THREE.Points(g, flyMat);
  flies.frustumCulled = false;
  scene.add(flies);

  return {
    bushes,
    update(t) {
      const pos = g.attributes.position;
      for (let i = 0; i < n; i++) {
        pos.setXYZ(i,
          base[i * 3] + Math.sin(t * 0.3 + i) * 1.2,
          base[i * 3 + 1] + Math.sin(t * 0.7 + i * 1.3) * 0.4,
          base[i * 3 + 2] + Math.cos(t * 0.25 + i * 0.7) * 1.2);
      }
      pos.needsUpdate = true;
      flyMat.opacity = 0.55 + 0.35 * Math.sin(t * 2.3);
    },
  };
}

// ---------------------------------------------------------------- the Caldera

function addVolcanoDecor(scene, map) {
  const lava = new THREE.MeshBasicMaterial({ color: 0xff4a0a });
  const lavaDim = new THREE.MeshBasicMaterial({ color: 0xb01e04 });
  const flat = (w, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };
  const pulsing = [];

  // Lava pools in the crater's corners, around the skull
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    pulsing.push(flat(5, 5, sx * 7.5, 8.03, sz * 7.5, lava));
  }
  // Lava falls down the terrace faces, and channels across the plains
  for (const deg of [20, 110, 200, 290]) {
    const a = deg * Math.PI / 180;
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(3, 4), lavaDim);
    fall.position.set(Math.cos(a) * 45.8, 2, Math.sin(a) * 45.8);
    fall.rotation.y = Math.PI / 2 - a;
    scene.add(fall);
  }
  for (const [x, z, w, d] of [[-70, 0, 26, 1.4], [70, 0, 26, 1.4], [0, -70, 1.4, 30], [0, 70, 1.4, 30], [-60, 60, 18, 1.2], [60, -60, 18, 1.2]]) {
    flat(w, d, x, 0.03, z, lavaDim);
  }

  // A massif behind the ring of peaks, so it reads as one mountain range
  // rather than a fence of spires. Decor only: the ring does the blocking.
  const massif = new THREE.MeshLambertMaterial({ map: getTextures().rock, color: 0x3e2c2a, flatShading: true });
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + Math.sin(i * 12.9) * 0.05;
    const d = 150 + Math.abs(Math.sin(i * 3.7)) * 22;
    const r = 34 + Math.abs(Math.sin(i * 5.3)) * 16, h = 60 + Math.abs(Math.sin(i * 2.1)) * 55;
    const geo = new THREE.ConeGeometry(r, h, 9, 5);
    geo.translate(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d);
    lumpy(geo, 5, 0.05);
    scene.add(new THREE.Mesh(geo, massif));
  }

  // Launch pads: a glowing rune plate that pulses
  for (const pad of map.pads) {
    const cx = (pad.min[0] + pad.max[0]) / 2, cz = (pad.min[2] + pad.max[2]) / 2;
    const size = pad.max[0] - pad.min[0];
    flat(size, size, cx, pad.max[1] + 0.03, cz, new THREE.MeshBasicMaterial({ color: 0x3a0c04 }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(size * 0.28, size * 0.42, 6), new THREE.MeshBasicMaterial({ color: 0xff8a20 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, pad.max[1] + 0.05, cz);
    scene.add(ring);
    pulsing.push(ring);
  }

  // A sigil over each cave mouth: amber for the west (team 0), crimson for the east
  const bases = [];
  for (const b of map.bases) {
    const color = b.team === 0 ? 0xffa000 : 0xd0101a;
    const sigil = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.18, 6, 3), new THREE.MeshBasicMaterial({ color }));
    const mouthX = b.p[0] > 0 ? 90.2 : -90.2;
    sigil.position.set(mouthX, 7.6, 0);
    sigil.rotation.y = Math.PI / 2;
    scene.add(sigil);
    const glow = new THREE.PointLight(color, 25, 18, 1.6);
    glow.position.set(b.p[0], 3, 0);
    scene.add(glow);
    bases.push(sigil);
  }

  // Smoke rising out of the crater
  const n = 120, smoke = new Float32Array(n * 3), life = new Float32Array(n);
  for (let i = 0; i < n; i++) life[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(smoke, 3));
  const puff = document.createElement('canvas');
  puff.width = puff.height = 32;
  const pg = puff.getContext('2d');
  const grad = pg.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  pg.fillStyle = grad;
  pg.fillRect(0, 0, 32, 32);
  const smokeMat = new THREE.PointsMaterial({ color: 0x3a2a26, size: 2.4, map: new THREE.CanvasTexture(puff), transparent: true, opacity: 0.32, depthWrite: false });
  const plume = new THREE.Points(g, smokeMat);
  plume.frustumCulled = false;
  scene.add(plume);

  return {
    update(t) {
      for (const [i, m] of pulsing.entries()) m.material.color.setRGB(1, 0.25 + 0.2 * Math.sin(t * 2 + i), 0.04);
      for (const s of bases) s.rotation.x = t * 0.6;
      for (let i = 0; i < n; i++) {
        life[i] += 0.004;
        if (life[i] > 1) life[i] -= 1;
        const k = life[i];
        smoke[i * 3] = Math.sin(i * 7.3) * (2 + k * 14) + k * 6;
        smoke[i * 3 + 1] = 9 + k * 45;
        smoke[i * 3 + 2] = Math.cos(i * 3.1) * (2 + k * 14);
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}
