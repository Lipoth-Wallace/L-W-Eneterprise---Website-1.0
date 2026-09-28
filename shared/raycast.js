// Hitscan helpers. The server uses these to decide every hit. The client uses
// them only to draw tracers and impact effects.

import * as C from './constants.js';
import { MAP } from './map.js';

// Slab test. Returns the entry distance along a normalised dir, or Infinity.
// Also writes the hit face normal into out.normal when out is given.
export function rayBox(o, d, min, max, maxDist = Infinity, out = null) {
  let tmin = 0, tmax = maxDist, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return Infinity;
      continue;
    }
    const inv = 1 / d[i];
    let t1 = (min[i] - o[i]) * inv;
    let t2 = (max[i] - o[i]) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (out) {
    out.normal = [0, 0, 0];
    if (axis >= 0) out.normal[axis] = sign;
  }
  return tmin;
}

/** Nearest map hit: { t, point, normal } (t is Infinity on a miss). */
export function rayMap(o, d, maxDist, boxes = MAP.boxes) {
  let best = { t: Infinity, point: null, normal: [0, 1, 0] };
  const tmp = {};
  for (const b of boxes) {
    const t = rayBox(o, d, b.min, b.max, maxDist, tmp);
    if (t < best.t) best = { t, point: null, normal: tmp.normal };
  }
  if (best.t === Infinity) {
    best.point = [o[0] + d[0] * maxDist, o[1] + d[1] * maxDist, o[2] + d[2] * maxDist];
  } else {
    best.point = [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t];
  }
  return best;
}

/** Hitbox for a player standing at (x, y, z) with feet at y. */
export function playerHitbox(x, y, z, crouching, bonus = 0) {
  const r = C.HITBOX_HALF_WIDTH + bonus;
  const h = (crouching ? C.CROUCH_HEIGHT : C.PLAYER_HEIGHT) + 0.1;
  return { min: [x - r, y - bonus * 0.5, z - r], max: [x + r, y + h + bonus * 0.5, z + r] };
}

export function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Direction the camera faces for a yaw/pitch pair (yaw 0 looks down -Z). */
export function aimDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

/**
 * Where a thrown spear comes to rest after hitting the map at `point`: backed
 * off the surface a little, then dropped to the floor below it, so it can
 * always be reached on foot.
 */
export function spearRestPoint(point, normal, boxes = MAP.boxes) {
  const start = [point[0] + normal[0] * 0.35, point[1] + normal[1] * 0.35 + 0.05, point[2] + normal[2] * 0.35];
  const down = rayMap(start, [0, -1, 0], 50, boxes);
  const p = down.t === Infinity ? [start[0], 0, start[2]] : down.point;
  return [p[0], p[1] + 0.05, p[2]];
}
