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

/** Ray against an upright cylinder collider { c: [x, z], r, min, max }. */
export function rayCyl(o, d, b, maxDist = Infinity, out = null) {
  const ox = o[0] - b.c[0], oz = o[2] - b.c[1], R = b.r, y0 = b.min[1], y1 = b.max[1];
  if (ox * ox + oz * oz <= R * R && o[1] >= y0 && o[1] <= y1) {
    if (out) out.normal = [0, 1, 0];
    return 0;
  }
  let best = Infinity, n = null;
  const a = d[0] * d[0] + d[2] * d[2];
  if (a > 1e-12) {
    const bq = ox * d[0] + oz * d[2], c = ox * ox + oz * oz - R * R;
    const disc = bq * bq - a * c;
    if (disc >= 0) {
      const t = (-bq - Math.sqrt(disc)) / a;
      const y = o[1] + d[1] * t;
      if (t >= 0 && t <= maxDist && y >= y0 && y <= y1) {
        best = t;
        n = [(ox + d[0] * t) / R, 0, (oz + d[2] * t) / R];
      }
    }
  }
  if (Math.abs(d[1]) > 1e-9) {
    for (const [Y, ny] of [[y1, 1], [y0, -1]]) {
      const t = (Y - o[1]) / d[1];
      if (t < 0 || t >= best || t > maxDist) continue;
      const px = ox + d[0] * t, pz = oz + d[2] * t;
      if (px * px + pz * pz <= R * R) { best = t; n = [0, ny, 0]; }
    }
  }
  if (out && n) out.normal = n;
  return best;
}

/** Nearest map hit: { t, point, normal } (t is Infinity on a miss). */
export function rayMap(o, d, maxDist, boxes = MAP.boxes) {
  let best = { t: Infinity, point: null, normal: [0, 1, 0] };
  const tmp = {};
  for (const b of boxes) {
    const t = b.r !== undefined ? rayCyl(o, d, b, maxDist, tmp) : rayBox(o, d, b.min, b.max, maxDist, tmp);
    if (t < best.t) best = { t, point: null, normal: tmp.normal };
  }
  if (best.t === Infinity) {
    best.point = [o[0] + d[0] * maxDist, o[1] + d[1] * maxDist, o[2] + d[2] * maxDist];
  } else {
    best.point = [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t];
  }
  return best;
}

/** A player's hitbox in model space (feet at the origin, facing -Z). */
export function playerHitbox(pose = 'stand', bonus = 0) {
  const b = C.HITBOXES[pose] || C.HITBOXES.stand;
  return {
    min: [-b.half - bonus, -bonus * 0.5, b.front - bonus],
    max: [b.half + bonus, b.height + bonus * 0.5, b.back + bonus],
  };
}

export function poseOf(crouching, sliding) {
  return sliding ? 'slide' : crouching ? 'crouch' : 'stand';
}

/**
 * Ray against a player's hitbox, which turns with their yaw. The ray is moved
 * into the player's model space, where the box is axis-aligned. Returns the
 * hit distance or Infinity.
 */
export function rayPlayer(o, d, maxDist, target, pose = 'stand', bonus = 0) {
  const c = Math.cos(-(target.yaw || 0)), s = Math.sin(-(target.yaw || 0));
  const ox = o[0] - target.x, oz = o[2] - target.z;
  const lo = [ox * c + oz * s, o[1] - target.y, -ox * s + oz * c];
  const ld = [d[0] * c + d[2] * s, d[1], -d[0] * s + d[2] * c];
  const hb = playerHitbox(pose, bonus);
  return rayBox(lo, ld, hb.min, hb.max, maxDist);
}

// Extra hitbox size per weapon: the sling needs a clean hit, the thrown spear
// is forgiving, and the stab gets a little reach for fights at speed.
export function hitboxBonus(kind) {
  return kind === 'throw' ? C.THROW_HITBOX_BONUS : kind === 'stab' ? C.STAB_HITBOX_BONUS : 0;
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
