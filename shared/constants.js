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
export const HITBOX_HALF_WIDTH = 0.48;   // a little more generous than collision
export const STEP_HEIGHT = 0.55;

// Movement: mostly horizontal. Low jump, strong slide, Quake-style air strafing.
export const GRAVITY = 26;
export const JUMP_SPEED = 8.2;           // apex ~1.3m: clears waist-high cover, not much more
export const RUN_SPEED = 9.5;
export const CROUCH_SPEED = 4.5;
export const GROUND_ACCEL = 120;         // must beat FRICTION * RUN_SPEED to reach top speed
export const FRICTION = 9;
export const AIR_ACCEL = 70;
export const AIR_WISH_CAP = 1.2;         // low cap + high accel = strafe gains
export const SLIDE_SPEED = 16;           // slide start sets speed to at least this
export const SLIDE_FRICTION = 0.9;
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
export const THROW_COOLDOWN = 0.35;
export const SLING_RANGE = 90;
export const SLING_RELOAD = 1.25;
export const SPEAR_PICKUP_RADIUS = 1.5;
export const SPEAR_RETURN_TIME = 15;     // an unreachable spear flies home after this

// Match
export const KILLS_TO_WIN = 10;
export const RESPAWN_TIME = 2;
export const MATCH_RESET_TIME = 7;
export const SPAWN_PROTECTION = 0.75;

export const CHARACTERS = ['brute', 'stalker'];
