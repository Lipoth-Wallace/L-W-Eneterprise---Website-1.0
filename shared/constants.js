// Tuning shared by the server and the browser client. Units are metres and seconds.

export const SNAPSHOT_RATE = 30;         // server -> client snapshots per second
export const STATE_RATE = 60;            // client -> server movement updates per second
export const INTERP_DELAY = 0.1;         // remote players are drawn this far in the past
export const LAG_COMP_MAX = 0.25;        // furthest back the server will rewind a target

// Player body
export const PLAYER_HALF_WIDTH = 0.4;    // collision box half extent on X/Z
export const PLAYER_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.0;
export const EYE_HEIGHT = 1.6;
export const CROUCH_EYE_HEIGHT = 0.85;
// Hitboxes hug the fighters' visible envelope in each pose. They turn with
// the player's facing (model space: -Z is forward, x is half-width). Both skins
// share one skeleton, and test/hitbox.test.js checks the fit.
// Collision uses the smaller PLAYER_* sizes above.
export const HITBOXES = {
  stand: { half: 0.5, front: -0.72, back: 0.52, height: 1.96 },   // arms forward holding a weapon
  crouch: { half: 0.5, front: -0.54, back: 0.3, height: 1.52 },
  slide: { half: 0.5, front: -0.9, back: 0.84, height: 1.44 },    // long and low
};
export const STEP_HEIGHT = 0.55;

// Movement: mostly horizontal. Low jump, strong slide, Quake-style air strafing.
export const GRAVITY = 26;
export const JUMP_SPEED = 8.2;           // apex ~1.3m: clears waist-high cover, not much more
export const WALK_SPEED = 5.8;
export const RUN_SPEED = 9.5;            // sprint (hold Shift)
export const CROUCH_SPEED = 4.5;
export const GROUND_ACCEL = 120;         // must beat FRICTION * RUN_SPEED to reach top speed
export const FRICTION = 9;
export const AIR_ACCEL = 70;
export const AIR_WISH_CAP = 1.2;         // low cap + high accel = strafe gains
export const SLIDE_SPEED = 16;           // slide start sets speed to at least this
export const SLIDE_FRICTION = 0.5;        // low: a slide carries its speed (ULTRAKILL-style)
export const SLIDE_STEER = 10;
export const SLIDE_MIN_SPEED = 6;        // slide ends below this
export const SLIDE_REBOOST_COOLDOWN = 0.7;
export const SLIDE_JUMP_MULT = 1.08;     // jumping out of a slide keeps and adds speed
export const MAX_SPEED = 26;             // hard horizontal cap
export const JUMP_BUFFER = 0.12;
export const COYOTE_TIME = 0.1;

// Weapons: everything kills in one hit.
export const STAB_RANGE = 2.8;
export const STAB_COOLDOWN = 0.45;
export const STAB_HITBOX_BONUS = 0.35;   // extra reach so melee feels fair at speed
export const THROW_RANGE = 90;
export const THROW_HITBOX_BONUS = 0.45;   // thrown spear: much fatter target than the sling's exact box
export const THROW_COOLDOWN = 0.35;
export const SPEAR_WINDUP = 0.18;        // hold RMB this long before the throw is ready
export const WINDUP_TOLERANCE = 0.06;    // server slack for packet jitter
export const SLING_RANGE = 90;
export const SLING_RELOAD = 1.25;
export const SPEAR_PICKUP_RADIUS = 1.5;
export const SPEAR_RETURN_TIME = 15;     // an unreachable spear flies home after this

// Scan (after Hunt: Showdown's Dark Sight): a cone in front of you that
// reveals fighters through walls for a moment. Darkness is part of the game;
// the scan is how you cut through it.
export const SCAN_COOLDOWN = 3.75;
export const SCAN_RANGE = 60;
export const SCAN_CONE = 40 * Math.PI / 180;   // half-angle
export const SCAN_WAVE_TIME = 0.7;             // wavefront takes this long to reach full range
export const SCAN_REVEAL = 2.2;                // how long a sensed fighter stays highlighted

// Match
export const KILLS_TO_WIN = 10;
export const RESPAWN_TIME = 2;
export const MATCH_RESET_TIME = 7;
export const SPAWN_PROTECTION = 0.75;

// Relic Run: race to the crater, grab the skull, drag it home
export const RELIC_TO_WIN = 3;
export const RELIC_GRAB_RADIUS = 2.0;
export const RELIC_CARRY_MULT = 0.75;   // dragging it costs 25% of your speed
export const RELIC_RETURN = 25;         // a dropped skull no one touches goes back to the crater
export const RELIC_RESET_DELAY = 3;     // after a capture, before it reappears
export const RELIC_LEAD = 2.6;          // length of the lead it's dragged on

export const CHARACTERS = ['brute', 'stalker'];
