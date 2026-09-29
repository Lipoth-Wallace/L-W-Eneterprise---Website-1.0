// The scan: press it and a pair of 2D eyes shoots out from the crosshair,
// growing exponentially. A wavefront expands at the same exponential rate
// through a cone in front of you, and any fighter it reaches is highlighted
// through walls (a rough golden silhouette, after Hunt: Showdown's Dark
// Sight) for SCAN_REVEAL seconds.
//
// Opponents see your eyes fly out from where you stand, so scanning gives
// away your position.

import * as THREE from 'three';
import * as C from '/shared/constants.js';
import { waveRadius, inCone, WAVE_K as K } from '/shared/scan.js';

// Almond eyes with slit pupils, used by the HUD overlay and the world sprite
export const EYES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40">
  <defs><radialGradient id="i" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe7a0"/><stop offset="0.55" stop-color="#ffb03a"/><stop offset="1" stop-color="#c8400c"/></radialGradient></defs>
  <g fill="url(#i)" stroke="#ffcf6a" stroke-width="1.5">
    <path d="M6 20 Q26 2 50 20 Q26 38 6 20 Z"/>
    <path d="M70 20 Q94 2 114 20 Q94 38 70 20 Z"/>
  </g>
  <g fill="#1a0602"><ellipse cx="28" cy="20" rx="2.6" ry="11"/><ellipse cx="92" cy="20" rx="2.6" ry="11"/></g>
</svg>`;

export function createScan(scene, overlay) {
  let wave = null;                 // our current scan: { eye, dir, start, found:Set }
  const revealed = new Map();      // target key -> { until, model }
  const sprites = [];              // other players' eyes flying through the world

  // One shared texture for world sprites, drawn from the SVG
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const img = new Image();
  img.onload = () => { tex.image = img; tex.needsUpdate = true; };
  img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(EYES_SVG);

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
            revealed.set(t.key, { until: now + C.SCAN_REVEAL, model: t.model });
            fresh++;
          }
        }
        if (age > C.SCAN_WAVE_TIME) wave = null;
      }
      // Fade highlights: quick in, long tail, gone when the target is.
      const live = new Set(targets.map((t) => t.key));
      for (const [key, r] of revealed) {
        const left = r.until - now;
        if (left <= 0 || !live.has(key)) { r.model.setHighlight(0); revealed.delete(key); continue; }
        r.model.setHighlight(Math.min(1, left / 0.8));
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
      for (const r of revealed.values()) r.model.setHighlight(0);
      revealed.clear();
      wave = null;
    },
  };
}
