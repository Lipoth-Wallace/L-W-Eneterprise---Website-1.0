// Scan maths shared by the client and the tests.

import * as C from './constants.js';

// Distance the wavefront has covered after `age` seconds: exponential growth,
// normalised to reach SCAN_RANGE at SCAN_WAVE_TIME.
export const WAVE_K = 4.5;
const K = WAVE_K;
export function waveRadius(age) {
  const a = Math.min(Math.max(age, 0), C.SCAN_WAVE_TIME);
  return C.SCAN_RANGE * (Math.exp(K * a) - 1) / (Math.exp(K * C.SCAN_WAVE_TIME) - 1);
}

/** True if `point` is inside the scan cone from `eye` along unit `dir`. */
export function inCone(eye, dir, point) {
  const dx = point[0] - eye[0], dy = point[1] - eye[1], dz = point[2] - eye[2];
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-3) return { inside: true, dist: 0 };
  const cos = (dx * dir[0] + dy * dir[1] + dz * dir[2]) / d;
  return { inside: d <= C.SCAN_RANGE && cos >= Math.cos(C.SCAN_CONE), dist: d };
}

