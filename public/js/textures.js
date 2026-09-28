// Tiny procedural textures (64px, nearest-filtered) for the low-res look.
// Making them in code means there are no asset files to ship or license.

import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size, draw, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size, rng(seed));
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function noise(g, size, r, base, amp) {
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = (r() - 0.5) * amp;
    img.data[i * 4] = base[0] + n;
    img.data[i * 4 + 1] = base[1] + n;
    img.data[i * 4 + 2] = base[2] + n;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

function blotches(g, size, r, count, color, maxR) {
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = r() * size, y = r() * size, rad = 1 + r() * maxR;
    g.fillRect(x, y, rad, rad * (0.5 + r()));
  }
}

// Board-marked concrete: horizontal formwork lines and tie holes.
function concrete(g, s, r) {
  noise(g, s, r, [92, 86, 82], 26);
  blotches(g, s, r, 40, 'rgba(40,30,28,0.25)', 5);
  for (let y = 0; y < s; y += 8) {
    g.fillStyle = 'rgba(20,15,14,0.55)';
    g.fillRect(0, y, s, 1);
    g.fillStyle = 'rgba(160,150,140,0.12)';
    g.fillRect(0, y + 1, s, 1);
  }
  g.fillStyle = 'rgba(10,8,8,0.8)';
  for (const [x, y] of [[12, 20], [44, 20], [12, 52], [44, 52]]) g.fillRect(x, y, 2, 2);
  // Rust and blood streaks running down from the tie holes
  g.fillStyle = 'rgba(70,18,12,0.35)';
  for (const [x, y] of [[12, 22], [44, 54]]) g.fillRect(x, y, 2, 6 + r() * 8);
}

function rock(g, s, r) {
  noise(g, s, r, [58, 47, 43], 34);
  blotches(g, s, r, 70, 'rgba(20,14,12,0.35)', 6);
  blotches(g, s, r, 30, 'rgba(110,80,70,0.18)', 4);
  g.strokeStyle = 'rgba(8,5,5,0.7)';
  g.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    let x = r() * s, y = r() * s;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 16; y += r() * 10; g.lineTo(x, y); }
    g.stroke();
  }
}

function floor(g, s, r) {
  noise(g, s, r, [50, 42, 39], 24);
  blotches(g, s, r, 40, 'rgba(15,10,9,0.35)', 5);
  g.fillStyle = 'rgba(12,8,8,0.8)';
  g.fillRect(0, 0, s, 1);
  g.fillRect(0, 32, s, 1);
  g.fillRect(0, 0, 1, 32);
  g.fillRect(40, 32, 1, 32);
  g.fillStyle = 'rgba(80,16,10,0.3)';
  blotches(g, s, r, 6, 'rgba(90,14,8,0.3)', 7);
}

function slab(g, s, r) {
  noise(g, s, r, [104, 96, 90], 22);
  blotches(g, s, r, 30, 'rgba(40,30,28,0.25)', 6);
  g.fillStyle = 'rgba(20,15,14,0.5)';
  g.fillRect(0, s - 2, s, 2);
  g.fillRect(0, 0, s, 1);
}

let cache = null;
export function getTextures() {
  if (cache) return cache;
  cache = {
    concrete: canvasTexture(64, concrete, 11),
    rock: canvasTexture(64, rock, 23),
    floor: canvasTexture(64, floor, 37),
    slab: canvasTexture(64, slab, 41),
  };
  return cache;
}

// World-space UVs for a box: one texture tile per `scale` metres on every face,
// so walls don't stretch. BoxGeometry faces come in the order +x -x +y -y +z -z.
export function worldUV(geometry, sx, sy, sz, scale = 2) {
  const uv = geometry.attributes.uv;
  const faceDims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    const [du, dv] = faceDims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * du / scale, uv.getY(i) * dv / scale);
    }
  }
  uv.needsUpdate = true;
}
