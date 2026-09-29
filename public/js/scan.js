// The scan: press it and a pair of 2D eyes shoots out from the crosshair,
// growing exponentially. A wavefront expands at the same exponential rate
// through a cone in front of you, and any fighter it reaches shows up through
// walls for SCAN_REVEAL seconds (after Hunt: Showdown's Dark Sight) as:
//   - a sliced amber ghost of their body (see createGhost in characters.js):
//     their build, but broken into flickering, shearing slices;
//   - a wisp of mist that streams out behind them when they move, so you can
//     read which way they're heading.
//
// Opponents see your eyes fly out from where you stand, so scanning gives
// away your position.

import * as THREE from 'three';
import * as C from '/shared/constants.js';
import { waveRadius, inCone, WAVE_K as K } from '/shared/scan.js';

// Almond eyes with slit pupils, used by the HUD overlay and the world sprite
export const EYES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40">
  <defs><radialGradient id="i" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.55" stop-color="#ffb000"/><stop offset="1" stop-color="#b85a00"/></radialGradient></defs>
  <g fill="url(#i)" stroke="#ffc233" stroke-width="1.5">
    <path d="M6 20 Q26 2 50 20 Q26 38 6 20 Z"/>
    <path d="M70 20 Q94 2 114 20 Q94 38 70 20 Z"/>
  </g>
  <g fill="#1a0602"><ellipse cx="28" cy="20" rx="2.6" ry="11"/><ellipse cx="92" cy="20" rx="2.6" ry="11"/></g>
</svg>`;

export function createScan(scene, overlay) {
  let wave = null;                 // our current scan: { eye, dir, start, found:Set }
  const revealed = new Map();      // target key -> { until, mist }
  const sprites = [];              // other players' eyes flying through the world

  // One shared texture for world sprites, drawn from the SVG
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const img = new Image();
  img.onload = () => { tex.image = img; tex.needsUpdate = true; };
  img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(EYES_SVG);
  const puff = puffTexture();

  return {
    /** Start our own scan. Returns nothing; reveals happen in update(). */
    fire(eye, dir, now) {
      wave = { eye: [...eye], dir: [...dir], start: now, found: new Set() };
      if (overlay) {
        overlay.classList.remove('go');
        void overlay.offsetWidth;          // restart the CSS animation
        overlay.classList.add('go');
      }
    },
    /** Show an opponent's scan leaving them. */
    remote(eye, dir, now) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const s = new THREE.Sprite(mat);
      s.renderOrder = 5;
      scene.add(s);
      sprites.push({ s, eye: [...eye], dir: [...dir], start: now });
    },
    /**
     * targets: [{ key, model, p: [x, y, z] (feet) }]. Returns the number of
     * newly sensed targets this frame (for a sound).
     */
    update(now, targets) {
      let fresh = 0;
      if (wave) {
        const age = now - wave.start;
        const r = waveRadius(age);
        for (const t of targets) {
          if (wave.found.has(t.key)) continue;
          const chest = [t.p[0], t.p[1] + 1.1, t.p[2]];
          const c = inCone(wave.eye, wave.dir, chest);
          if (c.inside && c.dist <= r) {
            wave.found.add(t.key);
            revealed.set(t.key, { until: now + C.SCAN_REVEAL, mist: createMist(scene, puff), model: t.model });
            fresh++;
          }
        }
        if (age > C.SCAN_WAVE_TIME) wave = null;
      }
      // Mists fade over their last 0.8 s, and vanish with the target.
      const byKey = new Map(targets.map((t) => [t.key, t]));
      const dt = Math.min(0.05, Math.max(0, now - (this.last || now)));
      this.last = now;
      for (const [key, r] of revealed) {
        const left = r.until - now, t = byKey.get(key);
        if (left <= 0 || !t) { r.mist.dispose(); r.model.setGhost(0, now); revealed.delete(key); continue; }
        const k = Math.min(1, left / 0.8);
        r.mist.update(dt, t, k);
        r.model.setGhost(k, now);
      }
      for (let i = sprites.length - 1; i >= 0; i--) {
        const sp = sprites[i];
        const age = now - sp.start;
        const d = waveRadius(age);
        const size = 0.5 * Math.exp(K * 0.6 * Math.min(age, C.SCAN_WAVE_TIME));
        sp.s.position.set(sp.eye[0] + sp.dir[0] * d, sp.eye[1] + sp.dir[1] * d, sp.eye[2] + sp.dir[2] * d);
        sp.s.scale.set(size * 3, size, 1);
        sp.s.material.opacity = Math.max(0, 1 - age / C.SCAN_WAVE_TIME);
        if (age > C.SCAN_WAVE_TIME) {
          scene.remove(sp.s);
          sp.s.material.dispose();
          sprites.splice(i, 1);
        }
      }
      return fresh;
    },
    /** 0..1 while our wave is out, for the screen tint. */
    pulse(now) {
      return wave ? Math.max(0, 1 - (now - wave.start) / C.SCAN_WAVE_TIME) : 0;
    },
    clear() {
      for (const r of revealed.values()) { r.mist.dispose(); r.model.setGhost(0, 0); }
      revealed.clear();
      wave = null;
    },
  };
}

// A soft round blob for mist particles, drawn once
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

const AMBER = new THREE.Color(0xff6a00);
const HOT = new THREE.Color(0xffa820);
const SHROUD_N = 70;   // hangs around the body and moves with it
const TRAIL_N = 50;    // flung back against the direction of travel
const MIST_N = SHROUD_N + TRAIL_N;

// The mist around one sensed fighter, in two layers:
//   - Shroud: puffs that live in a loose shell around the body and ride along
//     with it, churning in place. It blurs the head and edges of the ghost,
//     so the scan says "someone's there", not "aim here".
//   - Trail: puffs born on the body and thrown back against the motion. A
//     standing fighter just smoulders; a moving one drags a streak behind
//     them that points back the way they came.
// Additive and depth-test-free, so it all shows through walls and foliage.
function createMist(scene, tex) {
  const pos = new Float32Array(MIST_N * 3);
  const col = new Float32Array(MIST_N * 3);
  const parts = [];
  for (let i = 0; i < MIST_N; i++) {
    parts.push({ shroud: i < SHROUD_N, x: 0, y: -99, z: 0, ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 1 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    map: tex, size: 0.7, sizeAttenuation: true, vertexColors: true, transparent: true,
    depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 11;
  scene.add(points);
  let first = true;
  const c = new THREE.Color();

  function spawn(p, t, stagger) {
    const h = t.h || 1.8;
    const vx = t.v ? t.v[0] : 0, vz = t.v ? t.v[1] : 0;
    if (p.shroud) {
      // A point in a loose, lumpy shell around the body (offset from the feet)
      const a = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 0.5;
      p.ox = Math.cos(a) * r;
      p.oy = Math.random() * (h + 0.35);
      p.oz = Math.sin(a) * r;
      p.vx = (Math.random() - 0.5) * 0.8;
      p.vy = 0.1 + Math.random() * 0.35;
      p.vz = (Math.random() - 0.5) * 0.8;
      p.life = 0.5 + Math.random() * 0.6;
    } else {
      p.x = t.p[0] + (Math.random() - 0.5) * 0.7;
      p.y = t.p[1] + 0.1 + Math.random() * h;
      p.z = t.p[2] + (Math.random() - 0.5) * 0.7;
      p.vx = (Math.random() - 0.5) * 1.6 - vx * 0.75;
      p.vy = 0.2 + Math.random() * 0.6;
      p.vz = (Math.random() - 0.5) * 1.6 - vz * 0.75;
      p.life = 0.45 + Math.random() * 0.55;
    }
    p.age = stagger ? Math.random() * p.life : 0;
  }

  return {
    update(dt, t, strength) {
      const moving = t.v ? Math.min(1, Math.hypot(t.v[0], t.v[1]) / 6) : 0;
      for (let i = 0; i < MIST_N; i++) {
        const p = parts[i];
        if (first) spawn(p, t, true);
        p.age += dt;
        if (p.age >= p.life) spawn(p, t, false);
        let bright;
        if (p.shroud) {
          // Rides along with the body, drifting within its shell
          p.ox += p.vx * dt; p.oy += p.vy * dt; p.oz += p.vz * dt;
          p.x = t.p[0] + p.ox; p.y = t.p[1] + p.oy; p.z = t.p[2] + p.oz;
          bright = 0.2;
        } else {
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.vx *= 0.97; p.vz *= 0.97;
          // The trail only really shows once they're moving
          bright = 0.08 + 0.22 * moving;
        }
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        // Bright at birth, burning down to dark amber; flicker keeps it restless
        const k = 1 - p.age / p.life;
        const fadeIn = Math.min(1, p.age / 0.12);
        c.copy(AMBER).lerp(HOT, k * k).multiplyScalar(Math.sqrt(k) * fadeIn * strength * (0.5 + Math.random() * 0.5) * bright);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      first = false;
      mat.size = 0.6 + Math.random() * 0.2;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    dispose() {
      scene.remove(points);
      geo.dispose();
      mat.dispose();
    },
  };
}
