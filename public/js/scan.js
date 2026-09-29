// The scan: press it and a pair of kite-shaped eyes pushes out of your chest
// into the world, growing exponentially to three times your height. They light
// the surfaces they pass and splat against the first wall in their path. A
// wavefront expands at the same exponential rate
// through a cone in front of you, and any fighter it reaches shows up through
// walls for SCAN_REVEAL seconds (after Hunt: Showdown's Dark Sight) as:
//   - a sliced amber ghost of their body (see createGhost in characters.js):
//     their build, but broken into flickering, shearing slices;
//   - a wisp of mist that streams out behind them when they move, so you can
//     read which way they're heading.
//
// The eyes exist only in your own scene: opponents never see them. They only
// hear a faint whisper from your direction.

import * as THREE from 'three';
import * as C from '/shared/constants.js';
import { waveRadius, inCone } from '/shared/scan.js';
import { rayMap } from '/shared/raycast.js';

const EYES_TIME = 0.8;                       // flight time
const EYES_MAX_H = 3 * C.PLAYER_HEIGHT;      // full size: three times your height
const EYES_START_H = 0.25;
const EYES_GROW = Math.log(EYES_MAX_H / EYES_START_H) / 0.55;   // full size after 0.55 s
const EYES_OPACITY = 0.2;                    // 80% see-through

// Two kites joined at their inner tips, each with a slit pupil and a wide
// radial gradient: yellow at the heart, through red, to black at the edges.
function eyesTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const g = c.getContext('2d');
  const kite = (tip, mid, inner) => {
    g.beginPath();
    g.moveTo(tip, 96);
    g.lineTo(mid, 34);
    g.lineTo(inner, 96);
    g.lineTo(mid, 158);
    g.closePath();
    const grad = g.createRadialGradient(mid, 96, 4, mid, 96, 132);
    grad.addColorStop(0, '#fff08a');
    grad.addColorStop(0.22, '#ffc21a');
    grad.addColorStop(0.5, '#e0280a');
    grad.addColorStop(0.78, '#5a0602');
    grad.addColorStop(1, '#000000');
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#2a0402';
    g.stroke();
    // Slit pupil
    g.beginPath();
    g.moveTo(mid, 56);
    g.lineTo(mid + 9, 96);
    g.lineTo(mid, 136);
    g.lineTo(mid - 9, 96);
    g.closePath();
    g.fillStyle = '#000000';
    g.fill();
  };
  kite(10, 150, 244);
  kite(502, 362, 268);
  g.fillStyle = '#b01806';
  g.fillRect(236, 90, 40, 12);           // the bridge joining them
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * boxes: the map's collision boxes (the eyes stop at walls).
 * onSplat(point, normal): called when the eyes hit a wall, for dust.
 */
export function createScan(scene, { boxes = [], onSplat } = {}) {
  let wave = null;                 // our current scan: { eye, dir, start, found:Set }
  const revealed = new Map();      // target key -> { until, mist }
  const puff = puffTexture();

  // The eyes: one sprite (always faces you) and an amber light that travels
  // with it. The light stays in the scene at zero so adding it never forces
  // shaders to recompile mid-fight.
  const eyesMat = new THREE.SpriteMaterial({ map: eyesTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false });
  const eyes = new THREE.Sprite(eyesMat);
  eyes.visible = false;
  eyes.renderOrder = 6;
  scene.add(eyes);
  const glow = new THREE.PointLight(0xff9a20, 0, 11, 1.6);
  scene.add(glow);
  let flight = null;               // { eye, dir, start, wallT, normal, hitAt }

  function updateEyes(now) {
    if (!flight) return;
    const age = now - flight.start;
    if (age > EYES_TIME) {
      flight = null;
      eyes.visible = false;
      glow.intensity = 0;
      return;
    }
    // Push out along your aim at the wave's pace, rising from chest to eye level
    const reach = flight.wallT - 0.4;
    let travel = 0.9 + waveRadius(age);
    if (travel >= reach && flight.hitAt == null) {
      flight.hitAt = age;
      if (onSplat && flight.wallT < C.SCAN_RANGE) {
        const e = flight.eye, d = flight.dir;
        onSplat([e[0] + d[0] * flight.wallT, e[1] + d[1] * flight.wallT, e[2] + d[2] * flight.wallT], flight.normal);
      }
    }
    travel = Math.min(travel, reach);
    const lift = -0.45 * Math.max(0, 1 - travel / 4);
    const e = flight.eye, d = flight.dir;
    eyes.position.set(e[0] + d[0] * travel, e[1] + d[1] * travel + lift, e[2] + d[2] * travel);

    // Grow exponentially to three times your height
    const h = Math.min(EYES_MAX_H, EYES_START_H * Math.exp(EYES_GROW * age));
    let sx = h * (512 / 192), sy = h, fade = 1 - Math.max(0, (age - EYES_TIME * 0.6) / (EYES_TIME * 0.4));
    if (flight.hitAt != null) {
      // Splat: spread flat across the wall and die quickly
      const k = age - flight.hitAt;
      sx *= 1 + k * 5;
      sy *= Math.max(0.12, 1 - k * 4);
      fade *= Math.max(0, 1 - k / 0.25);
    }
    eyes.scale.set(sx, sy, 1);
    eyesMat.opacity = EYES_OPACITY * fade;
    glow.position.copy(eyes.position);
    glow.intensity = 9 * fade;
  }

  return {
    /** Start our own scan. Reveals and the eyes' flight happen in update(). */
    fire(eye, dir, now) {
      wave = { eye: [...eye], dir: [...dir], start: now, found: new Set() };
      const hit = rayMap(eye, dir, C.SCAN_RANGE, boxes);
      flight = { eye: [...eye], dir: [...dir], start: now, wallT: hit.t, normal: hit.normal, hitAt: null };
      eyes.visible = true;
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
      updateEyes(now);
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
      flight = null;
      eyes.visible = false;
      glow.intensity = 0;
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
