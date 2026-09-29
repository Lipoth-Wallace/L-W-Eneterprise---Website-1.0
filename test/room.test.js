import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../shared/constants.js';
import { MAP } from '../shared/map.js';
import { Room } from '../server/room.js';
import { normalize } from '../shared/raycast.js';

function setup() {
  let clock = 100;
  const room = new Room('TEST', { now: () => clock });
  const inbox = { a: [], b: [] };
  const a = room.addPlayer((m) => inbox.a.push(m), { name: 'Gruk', character: 'brute' });
  const b = room.addPlayer((m) => inbox.b.push(m), { name: 'Vesh', character: 'stalker' });
  const advance = (dt) => { clock += dt; room.tick(); };
  return { room, a, b, inbox, advance, now: () => clock };
}

// Put a player somewhere via a state packet, with enough time passing that the
// speed check accepts it.
function place(room, p, pos, advance) {
  advance(5);
  room.handleState(p, { seq: p.spawnSeq, p: pos, yaw: 0, pitch: 0 });
}

// Wind the spear up for the full windup, then throw.
function chargedThrow(room, p, msg, advance) {
  room.handleCharge(p, { on: true });
  advance(C.SPEAR_WINDUP);
  room.handleFire(p, { weapon: 'throw', ...msg });
}

function aim(from, to) {
  return normalize([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
}

test('spawns the second player away from the first', () => {
  const { a, b } = setup();
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 20);
});

test('sling hit kills and scores, then the victim respawns', () => {
  const { room, a, b, advance } = setup();
  place(room, a, [-20, 0, -26], advance);
  place(room, b, [20, 0, -26], advance);
  const eye = [-20, 1.6, -26];
  room.handleFire(a, { weapon: 'sling', o: eye, d: aim(eye, [20, 1, -26]), time: 0 });
  const snap = room.snapshot();
  assert.equal(b.alive, false);
  assert.equal(a.score, 1);
  assert.ok(snap.ev.some((e) => e.e === 'kill' && e.killer === a.id && e.victim === b.id));
  advance(C.RESPAWN_TIME + 0.1);
  assert.equal(b.alive, true);
});

test('walls block shots', () => {
  const { room, a, b, advance } = setup();
  place(room, a, [-8, 0, 0], advance);   // west of the monolith
  place(room, b, [8, 0, 0], advance);    // east of it
  const eye = [-8, 1.6, 0];
  room.handleFire(a, { weapon: 'sling', o: eye, d: aim(eye, [8, 1, 0]), time: 0 });
  assert.equal(b.alive, true);
});

test('sling has to reload between shots', () => {
  const { room, a, b, advance } = setup();
  place(room, a, [-20, 0, -26], advance);
  place(room, b, [20, 0, -26], advance);
  const eye = [-20, 1.6, -26];
  room.handleFire(a, { weapon: 'sling', o: eye, d: [0, 1, 0], time: 0 });  // miss upward
  room.handleFire(a, { weapon: 'sling', o: eye, d: aim(eye, [20, 1, -26]), time: 0 });
  assert.equal(b.alive, true, 'second shot during reload was ignored');
});

test('stab only reaches a couple of metres', () => {
  const { room, a, b, advance } = setup();
  place(room, a, [-20, 0, -26], advance);
  place(room, b, [-14, 0, -26], advance);
  const eye = [-20, 1.6, -26];
  room.handleFire(a, { weapon: 'stab', o: eye, d: aim(eye, [-14, 1, -26]), time: 0 });
  assert.equal(b.alive, true);
  advance(0.1);
  room.handleState(b, { seq: b.spawnSeq, p: [-18, 0, -26], yaw: 0, pitch: 0 });
  advance(C.STAB_COOLDOWN);
  room.handleFire(a, { weapon: 'stab', o: eye, d: aim(eye, [-18, 1, -26]), time: 0 });
  assert.equal(b.alive, false);
});

test('thrown spear lands on the floor, can not be reused, and is picked up by walking over it', () => {
  const { room, a, advance } = setup();
  place(room, a, [0, 0, -26], advance);
  const eye = [0, 1.6, -26];
  // Throw at the north wall
  chargedThrow(room, a, { o: eye, d: [0, 0, -1], time: 0 }, advance);
  assert.equal(a.spear.state, 'ground');
  assert.ok(Math.abs(a.spear.p[1]) < 0.2, `rests on the floor: ${a.spear.p}`);
  // Can't stab or throw without it
  const before = room.snapshot().ev.length;
  room.handleFire(a, { weapon: 'throw', o: eye, d: [0, 0, -1], time: 0 });
  assert.equal(room.snapshot().ev.length, 0, `ignored (had ${before} events before)`);
  // Walk to it
  advance(0.5);
  room.handleState(a, { seq: a.spawnSeq, p: [a.spear.p[0], 0, a.spear.p[2]], yaw: 0, pitch: 0 });
  advance(1 / 60);
  assert.equal(a.spear.state, 'held');
});

test('a spear thrown onto a ledge lands on the ledge top', () => {
  const { room, a, advance } = setup();
  place(room, a, [20, 0, 0], advance);
  const eye = [20, 1.6, 0];
  chargedThrow(room, a, { o: eye, d: aim(eye, [28, 3, 0]), time: 0 }, advance);
  assert.equal(a.spear.state, 'ground');
  assert.ok(Math.abs(a.spear.p[1] - 2) < 0.2, `on the ledge: ${a.spear.p}`);
});

test('the thrown spear hits a near miss that the sling would not', () => {
  const { room, a, b, advance } = setup();
  place(room, a, [-20, 0, -26], advance);
  place(room, b, [20, 0, -26], advance);
  const eye = [-20, 1.6, -26];
  // Aim 0.75 m to the side of b's centre: outside the sling box (0.48), inside the spear's
  const d = aim(eye, [20, 1, -26 + 0.75]);
  room.handleFire(a, { weapon: 'sling', o: eye, d, time: 0 });
  assert.equal(b.alive, true, 'sling missed');
  chargedThrow(room, a, { o: eye, d, time: 0 }, advance);
  assert.equal(b.alive, false, 'spear hit');
});

test('a throw before the windup finishes is ignored', () => {
  const { room, a, b, advance } = setup();
  place(room, a, [-20, 0, -26], advance);
  place(room, b, [20, 0, -26], advance);
  const eye = [-20, 1.6, -26];
  const shot = { weapon: 'throw', o: eye, d: aim(eye, [20, 1, -26]), time: 0 };
  room.handleFire(a, shot);                       // never charged
  assert.equal(b.alive, true);
  room.handleCharge(a, { on: true });
  advance(C.SPEAR_WINDUP / 3);
  room.handleFire(a, shot);                       // charged too briefly
  assert.equal(b.alive, true);
  assert.equal(room.snapshot().players.find((p) => p.id === a.id).ch, 1, 'charge is visible to the opponent');
  advance(C.SPEAR_WINDUP);
  room.handleFire(a, shot);
  assert.equal(b.alive, false);
  assert.equal(a.charging, false);
});

test('scans are relayed to the opponent and rate-limited by the cooldown', () => {
  const { room, a, advance } = setup();
  place(room, a, [-20, 0, -26], advance);
  room.snapshot();
  const scan = { o: [-20, 1.6, -26], d: [1, 0, 0] };
  room.handleScan(a, scan);
  room.handleScan(a, scan);                 // spammed: ignored
  assert.equal(room.snapshot().ev.filter((e) => e.e === 'scan').length, 1);
  advance(C.SCAN_COOLDOWN);
  room.handleScan(a, scan);
  assert.equal(room.snapshot().ev.filter((e) => e.e === 'scan').length, 1);
});

test('an unreachable spear flies home after SPEAR_RETURN_TIME', () => {
  const { room, a, advance } = setup();
  place(room, a, [0, 0, -26], advance);
  chargedThrow(room, a, { o: [0, 1.6, -26], d: [0, 0, -1], time: 0 }, advance);
  advance(C.SPEAR_RETURN_TIME + 0.1);
  assert.equal(a.spear.state, 'held');
});

test('lag compensation hits where the target was on the shooter\'s screen', () => {
  const { room, a, b, advance, now } = setup();
  place(room, a, [-20, 0, -26], advance);
  place(room, b, [20, 0, -26], advance);
  const seenAt = now();
  // b then moves 3 m north (behind nothing, just out of the line)
  advance(0.1);
  room.handleState(b, { seq: b.spawnSeq, p: [20, 0, -23], yaw: 0, pitch: 0 });
  advance(0.05);
  const eye = [-20, 1.6, -26];
  room.handleFire(a, { weapon: 'sling', o: eye, d: aim(eye, [20, 1, -26]), time: seenAt });
  assert.equal(b.alive, false);
});

test('rewind is capped so very old aims miss', () => {
  const { room, a, b, advance, now } = setup();
  place(room, a, [-20, 0, -26], advance);
  place(room, b, [20, 0, -26], advance);
  const seenAt = now();
  advance(0.1);
  room.handleState(b, { seq: b.spawnSeq, p: [20, 0, -23], yaw: 0, pitch: 0 });
  advance(0.5);
  const eye = [-20, 1.6, -26];
  room.handleFire(a, { weapon: 'sling', o: eye, d: aim(eye, [20, 1, -26]), time: seenAt });
  assert.equal(b.alive, true);
});

test('teleport-speed movement is rejected and corrected', () => {
  const { room, a, inbox, advance } = setup();
  advance(1 / 60);
  const x0 = a.x;
  room.handleState(a, { seq: a.spawnSeq, p: [x0 + 30, 0, a.z], yaw: 0, pitch: 0 });
  assert.equal(a.x, x0);
  assert.ok(inbox.a.some((m) => m.t === 'correct'));
});

test('a shot fired from far away from your body is ignored', () => {
  const { room, a, b, advance } = setup();
  place(room, a, [-20, 0, -26], advance);
  place(room, b, [20, 0, -26], advance);
  const eye = [18, 1.6, -26];
  room.handleFire(a, { weapon: 'sling', o: eye, d: [1, 0, 0], time: 0 });
  assert.equal(b.alive, true);
});

test('first to KILLS_TO_WIN wins and the match resets', () => {
  const { room, a, b, advance } = setup();
  for (let i = 0; i < C.KILLS_TO_WIN; i++) {
    place(room, a, [-20, 0, -26], advance);
    place(room, b, [20, 0, -26], advance);
    advance(C.SLING_RELOAD);
    const eye = [-20, 1.6, -26];
    room.handleFire(a, { weapon: 'sling', o: eye, d: aim(eye, [20, 1, -26]), time: 0 });
    assert.equal(b.alive, false, `kill ${i + 1}`);
    advance(C.RESPAWN_TIME + 0.1);
  }
  assert.equal(a.score, C.KILLS_TO_WIN);
  assert.equal(room.winner, a.id);
  advance(C.MATCH_RESET_TIME + 0.1);
  assert.equal(a.score, 0);
  assert.equal(room.winner, null);
  assert.ok(a.alive && b.alive);
});

test('the map has one connected floor with no sealed pockets', () => {
  // Flood-fill 0.5 m cells at ground level. Every cell a standing player fits
  // in must be reachable from spawn 0.
  const step = 0.5, r = C.PLAYER_HALF_WIDTH, W = MAP.halfSize;
  const free = (x, z) => !MAP.boxes.some((b) =>
    b.mat !== 'floor' && x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2] &&
    b.min[1] < C.PLAYER_HEIGHT && b.max[1] > C.STEP_HEIGHT);
  const n = Math.round((2 * W) / step);
  const idx = (i, j) => i * (n + 1) + j;
  const seen = new Uint8Array((n + 1) * (n + 1));
  const toI = (v) => Math.round((v + W) / step);
  const start = MAP.spawns[0].p;
  const queue = [[toI(start[0]), toI(start[2])]];
  seen[idx(...queue[0])] = 1;
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a > n || b > n || seen[idx(a, b)]) continue;
      if (!free(-W + a * step, -W + b * step)) continue;
      seen[idx(a, b)] = 1;
      queue.push([a, b]);
    }
  }
  let unreached = 0;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    if (free(-W + i * step, -W + j * step) && !seen[idx(i, j)]) unreached++;
  }
  assert.equal(unreached, 0);
  for (const sp of MAP.spawns) assert.ok(seen[idx(toI(sp.p[0]), toI(sp.p[2]))], `spawn ${sp.p} reachable`);
});
