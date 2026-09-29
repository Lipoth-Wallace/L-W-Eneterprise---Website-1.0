// Player movement. The owning client runs this every frame (the server trusts
// the reported positions within sanity limits), and the tests run it headless.
//
// Feel targets (Straftat / ULTRAKILL):
//   - A slide sets you to at least SLIDE_SPEED and barely slows down.
//   - Jumping out of a slide keeps that speed and adds a little.
//   - Landing with crouch held drops you straight back into a slide.
//   - Holding jump re-jumps the instant you land, with no friction tick
//     (bunny hopping).
//   - Air strafing gains speed like Quake: a low wish-speed cap with high accel.

import * as C from './constants.js';
import { MAP } from './map.js';

export function createPlayerState(p = [0, 0, 0], yaw = 0) {
  return {
    x: p[0], y: p[1], z: p[2],
    vx: 0, vy: 0, vz: 0,
    yaw, pitch: 0,
    onGround: false,
    crouching: false,
    sliding: false,
    justLanded: false,
    slideCooldown: 0,
    jumpBuffer: 0,
    coyote: 0,
    crouchHeldPrev: false,
  };
}

export function playerHeight(s) {
  return s.crouching ? C.CROUCH_HEIGHT : C.PLAYER_HEIGHT;
}

export function eyeHeight(s) {
  return s.crouching ? C.CROUCH_EYE_HEIGHT : C.EYE_HEIGHT;
}

// Colliders are axis-aligned boxes { min, max }, or upright cylinders
// { c: [x, z], r, min, max } (min/max still hold the cylinder's bounds). Against
// a cylinder the player counts as a circle, so pushing out along the radius
// clears it and you slide round rocks instead of snagging on corners.
function overlapsAny(x, y, z, h, boxes) {
  const r = C.PLAYER_HALF_WIDTH;
  for (const b of boxes) {
    if (b.r !== undefined) {
      if (y + h > b.min[1] && y < b.max[1]) {
        const dx = x - b.c[0], dz = z - b.c[1], R = b.r + r;
        if (dx * dx + dz * dz < R * R) return b;
      }
      continue;
    }
    if (x + r > b.min[0] && x - r < b.max[0] &&
        y + h > b.min[1] && y < b.max[1] &&
        z + r > b.min[2] && z - r < b.max[2]) return b;
  }
  return null;
}

// Moves along one horizontal axis and resolves any collision. On the ground,
// a low enough box is stepped up onto instead of stopping you.
function moveHorizontal(s, axis, delta, h, boxes) {
  const r = C.PLAYER_HALF_WIDTH;
  s[axis] += delta;
  for (let guard = 0; guard < 4; guard++) {
    const b = overlapsAny(s.x, s.y, s.z, h, boxes);
    if (!b) return;
    const rise = b.max[1] - s.y;
    if (s.onGround && rise > 0 && rise <= C.STEP_HEIGHT &&
        !overlapsAny(s.x, b.max[1] + 1e-4, s.z, h, boxes)) {
      s.y = b.max[1] + 1e-4;
      continue;
    }
    if (b.r !== undefined) {
      // Out along the radius, keeping the velocity that runs along the wall
      let nx = s.x - b.c[0], nz = s.z - b.c[1];
      const d = Math.hypot(nx, nz);
      if (d < 1e-6) { nx = 1; nz = 0; } else { nx /= d; nz /= d; }
      s.x = b.c[0] + nx * (b.r + r + 1e-4);
      s.z = b.c[1] + nz * (b.r + r + 1e-4);
      const into = s.vx * nx + s.vz * nz;
      if (into < 0) { s.vx -= nx * into; s.vz -= nz * into; }
      continue;
    }
    const i = axis === 'x' ? 0 : 2;
    if (delta > 0) s[axis] = b.min[i] - r - 1e-4;
    else s[axis] = b.max[i] + r + 1e-4;
    if (axis === 'x') s.vx = 0; else s.vz = 0;
  }
}

function moveVertical(s, delta, h, boxes) {
  s.y += delta;
  const b = overlapsAny(s.x, s.y, s.z, h, boxes);
  if (!b) return false;
  if (delta < 0) {
    s.y = b.max[1] + 1e-4;
    s.vy = 0;
    return true;              // landed
  }
  s.y = b.min[1] - h - 1e-4;  // bonked the ceiling
  s.vy = Math.min(s.vy, 0);
  return false;
}

// Quake's accelerate(): only adds speed along wishDir up to wishSpeed. Pushing
// sideways while turning is what gains speed in the air.
function accelerate(s, wx, wz, wishSpeed, accel, dt) {
  const current = s.vx * wx + s.vz * wz;
  const add = wishSpeed - current;
  if (add <= 0) return;
  const amount = Math.min(accel * dt * Math.max(wishSpeed, 1), add);
  s.vx += wx * amount;
  s.vz += wz * amount;
}

function applyFriction(s, friction, dt) {
  const speed = Math.hypot(s.vx, s.vz);
  if (speed < 1e-4) { s.vx = s.vz = 0; return; }
  const drop = Math.max(speed, 2) * friction * dt;
  const scale = Math.max(speed - drop, 0) / speed;
  s.vx *= scale;
  s.vz *= scale;
}

function startSlide(s, wx, wz, hasWish) {
  let speed = Math.hypot(s.vx, s.vz);
  let dx, dz;
  if (speed > 1) { dx = s.vx / speed; dz = s.vz / speed; }
  else if (hasWish) { dx = wx; dz = wz; }
  else return;
  if (s.slideCooldown <= 0) {
    speed = Math.max(speed, C.SLIDE_SPEED * (s.speedMult || 1));
    s.slideCooldown = C.SLIDE_REBOOST_COOLDOWN;
  }
  if (speed < C.SLIDE_MIN_SPEED) return;
  s.vx = dx * speed;
  s.vz = dz * speed;
  s.sliding = true;
}

/**
 * Advances a player by dt seconds.
 * input: { fwd: -1..1, strafe: -1..1, jump, crouch, sprint (bools, held), yaw, pitch }
 * Returns event flags for sounds and effects: { jumped, landed, slid }.
 */
/**
 * pads: launch pads, [{ min, max, v: [vx, vy, vz] }]. Standing on one flings
 * you along v. input.speedMult (default 1) scales every top speed, e.g. 0.75
 * while dragging the relic.
 */
export function stepPlayer(s, input, dt, boxes = MAP.boxes, pads = null) {
  s.speedMult = input.speedMult || 1;
  // Sub-step so nothing moves further than ~0.2 m per step, which keeps thin
  // boxes from being tunnelled through at top speed.
  const steps = Math.max(1, Math.ceil((Math.hypot(s.vx, s.vy, s.vz) * dt) / 0.2));
  const events = { jumped: false, landed: false, slid: false };
  for (let i = 0; i < steps; i++) {
    const e = substep(s, input, dt / steps, boxes, pads);
    events.jumped ||= e.jumped;
    events.landed ||= e.landed;
    events.slid ||= e.slid;
    events.launched ||= e.launched;
  }
  s.crouchHeldPrev = !!input.crouch;
  return events;
}

function substep(s, input, dt, boxes, pads) {
  const events = { jumped: false, landed: false, slid: false };
  s.yaw = input.yaw;
  s.pitch = input.pitch;
  s.slideCooldown = Math.max(0, s.slideCooldown - dt);
  s.jumpBuffer = input.jump ? C.JUMP_BUFFER : Math.max(0, s.jumpBuffer - dt);

  // Wish direction on the ground plane. Yaw 0 looks down -Z.
  const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
  let wx = -sin * (input.fwd || 0) + cos * (input.strafe || 0);
  let wz = -cos * (input.fwd || 0) - sin * (input.strafe || 0);
  const wl = Math.hypot(wx, wz);
  const hasWish = wl > 1e-3;
  if (hasWish) { wx /= wl; wz /= wl; }

  // Crouch and uncrouch. Standing up needs headroom.
  if (input.crouch) {
    s.crouching = true;
  } else if (s.crouching) {
    if (!overlapsAny(s.x, s.y, s.z, C.PLAYER_HEIGHT, boxes)) s.crouching = false;
  }
  if (!input.crouch) s.sliding = false;

  if (s.onGround && input.crouch && !s.sliding &&
      (!s.crouchHeldPrev || s.justLanded)) {
    startSlide(s, wx, wz, hasWish);
    if (s.sliding) events.slid = true;
  }
  s.justLanded = false;

  const wantJump = s.jumpBuffer > 0 && (s.onGround || s.coyote > 0);

  if (s.onGround) {
    s.coyote = C.COYOTE_TIME;
    if (s.sliding) {
      const speed = Math.hypot(s.vx, s.vz);
      if (!wantJump) {
        const ns = Math.max(0, speed - speed * C.SLIDE_FRICTION * dt);
        // Steer a little, then restore the speed so steering never adds any.
        if (hasWish) { s.vx += wx * C.SLIDE_STEER * dt; s.vz += wz * C.SLIDE_STEER * dt; }
        const cur = Math.hypot(s.vx, s.vz) || 1;
        s.vx *= ns / cur;
        s.vz *= ns / cur;
        if (ns < C.SLIDE_MIN_SPEED) s.sliding = false;
      }
    } else {
      if (!wantJump) applyFriction(s, C.FRICTION, dt);
      if (hasWish) {
        const top = (s.crouching ? C.CROUCH_SPEED : input.sprint ? C.RUN_SPEED : C.WALK_SPEED) * s.speedMult;
        accelerate(s, wx, wz, top, C.GROUND_ACCEL / C.RUN_SPEED, dt);
      }
    }
  } else {
    s.coyote = Math.max(0, s.coyote - dt);
    if (hasWish) accelerate(s, wx, wz, C.AIR_WISH_CAP, C.AIR_ACCEL / C.AIR_WISH_CAP, dt);
  }

  if (wantJump) {
    s.vy = C.JUMP_SPEED;
    if (s.sliding) {
      s.vx *= C.SLIDE_JUMP_MULT;
      s.vz *= C.SLIDE_JUMP_MULT;
      s.sliding = false;
    }
    s.onGround = false;
    s.coyote = 0;
    // Holding jump refills the buffer every step, so you hop again on landing.
    s.jumpBuffer = 0;
    events.jumped = true;
  }

  // Hard horizontal cap
  const hs = Math.hypot(s.vx, s.vz);
  const cap = C.MAX_SPEED * s.speedMult;
  if (hs > cap) { s.vx *= cap / hs; s.vz *= cap / hs; }

  s.vy -= C.GRAVITY * dt;

  const h = playerHeight(s);
  const wasOnGround = s.onGround;
  moveHorizontal(s, 'x', s.vx * dt, h, boxes);
  moveHorizontal(s, 'z', s.vz * dt, h, boxes);
  const landed = moveVertical(s, s.vy * dt, h, boxes);
  s.onGround = landed;
  if (s.onGround && !wasOnGround) {
    s.justLanded = true;
    events.landed = true;
  }
  if (!s.onGround) s.sliding = false;

  // Anything that falls out of the world gets put back at a spawn.
  // Launch pads fire when you're standing on one
  if (pads && s.onGround) {
    for (const p of pads) {
      if (s.x >= p.min[0] && s.x <= p.max[0] && s.z >= p.min[2] && s.z <= p.max[2] && Math.abs(s.y - p.max[1]) < 0.3) {
        s.vx = p.v[0]; s.vy = p.v[1]; s.vz = p.v[2];
        s.onGround = false;
        s.sliding = false;
        events.launched = true;
        break;
      }
    }
  }

  if (s.y < -20) {
    const sp = MAP.spawns[0];
    s.x = sp.p[0]; s.y = sp.p[1]; s.z = sp.p[2];
    s.vx = s.vy = s.vz = 0;
  }
  return events;
}
