import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../shared/constants.js';
import { Room } from '../server/room.js';
import { normalize } from '../shared/raycast.js';

function setup() {
  let clock = 100;
  const room = new Room('SKUL', { mode: 'relic', now: () => clock });
  const inbox = { a: [], b: [] };
  const a = room.addPlayer((m) => inbox.a.push(m), { name: 'Gruk' });
  const b = room.addPlayer((m) => inbox.b.push(m), { name: 'Vesh' });
  const advance = (dt) => { clock += dt; room.tick(); };
  // Teleport by sending a state after enough time has passed to be believable
  const move = (p, pos) => { clock += 20; room.handleState(p, { seq: p.spawnSeq, p: pos, yaw: 0, pitch: 0 }); room.tick(); };
  return { room, a, b, inbox, advance, move };
}
const events = (room) => room.snapshot().ev;

test('Relic Run uses the Caldera, puts players on opposite teams and sides', () => {
  const { room, a, b, inbox } = setup();
  assert.equal(room.map.id, 'volcano');
  assert.equal(inbox.a[0].mode, 'relic');
  assert.deepEqual([a.team, b.team], [0, 1]);
  assert.ok(a.x < 0 && b.x > 0, `a at ${a.x}, b at ${b.x}`);
});

test('touching the skull takes it; dragging it into your own cave scores', () => {
  const { room, a, move } = setup();
  events(room);
  move(a, [0.5, 8, 0]);
  assert.equal(room.relic.state, 'carried');
  assert.equal(room.relic.by, a.id);
  assert.ok(events(room).some((e) => e.e === 'relic' && e.what === 'take'));
  move(a, [-99, 0, 0]);                         // a's cave (team 0, west)
  assert.equal(a.score, 1);
  assert.equal(room.relic.state, 'scored');
});

test('carrying it into the enemy cave does not score', () => {
  const { room, a, move } = setup();
  move(a, [0.5, 8, 0]);
  move(a, [99, 0, 0]);                          // b's cave
  assert.equal(a.score, 0);
  assert.equal(room.relic.state, 'carried');
});

test('the skull goes home a few seconds after a capture', () => {
  const { room, a, move, advance } = setup();
  move(a, [0.5, 8, 0]);
  move(a, [-99, 0, 0]);
  advance(C.RELIC_RESET_DELAY + 0.1);
  assert.equal(room.relic.state, 'home');
  assert.deepEqual(room.relic.p, room.map.relic.p);
});

test('killing the carrier drops the skull where they fell; the killer can pick it up', () => {
  const { room, a, b, move } = setup();
  move(a, [0.5, 8, 0]);
  move(a, [-43, 4, 10]);                        // both on the first terrace, beside the stairs
  move(b, [-35, 4, 10]);
  const eye = [-35, 5.6, 10];
  room.handleFire(b, { weapon: 'sling', o: eye, d: normalize([-8, -0.6, 0]), time: 0 });
  assert.equal(a.alive, false);
  assert.equal(room.relic.state, 'dropped');
  assert.equal(room.relic.p[0], -43);
  assert.equal(b.score, 0, 'kills do not score in Relic Run');
  assert.equal(b.kills, 1);
  move(b, [-42.5, 4, 10]);
  assert.equal(room.relic.by, b.id);
});

test('a dropped skull nobody touches returns to the crater', () => {
  const { room, a, b, move, advance } = setup();
  move(a, [0.5, 8, 0]);
  move(a, [-60, 0, 30]);
  room.kill(b, a, 'sling');
  assert.equal(room.relic.state, 'dropped');
  advance(C.RELIC_RETURN + 0.1);
  assert.equal(room.relic.state, 'home');
});

test('first to RELIC_TO_WIN captures wins, then the match resets', () => {
  const { room, a, move, advance } = setup();
  for (let i = 0; i < C.RELIC_TO_WIN; i++) {
    move(a, [0.5, 8, 0]);
    move(a, [-99, 0, 0]);
    advance(C.RELIC_RESET_DELAY + 0.1);
  }
  assert.equal(room.winner, a.id);
  advance(C.MATCH_RESET_TIME);
  assert.equal(a.score, 0);
  assert.equal(room.relic.state, 'home');
});

test('leaving while carrying drops the skull', () => {
  const { room, a, move } = setup();
  move(a, [0.5, 8, 0]);
  room.removePlayer(a.id);
  assert.notEqual(room.relic.state, 'carried');
});

test('the snapshot carries the relic state and teams', () => {
  const { room, a, move } = setup();
  move(a, [0.5, 8, 0]);
  const snap = room.snapshot();
  assert.equal(snap.relic.st, 'carried');
  assert.equal(snap.relic.by, a.id);
  assert.deepEqual(snap.players.map((p) => p.tm).sort(), [0, 1]);
});
