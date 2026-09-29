import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../shared/constants.js';
import { Room } from '../server/room.js';
import { normalize } from '../shared/raycast.js';
import { knifeBelt, knivesAt, takeKnife } from '../shared/weapons.js';

// a (loadout slot 2 = secondary) at x -20, b at x 20, facing -Z, with a clear
// line between them across the Kiln
function duel(secondary) {
  let clock = 100;
  const room = new Room('ARMS', { now: () => clock });
  const a = room.addPlayer(() => {}, { name: 'Gruk', secondary });
  const b = room.addPlayer(() => {}, { name: 'Vesh' });
  const advance = (dt) => { clock += dt; room.tick(); };
  for (const [p, x] of [[a, -20], [b, 20]]) {
    advance(5);
    room.handleState(p, { seq: p.spawnSeq, p: [x, 0, -26], yaw: 0, pitch: 0 });
  }
  advance(1);   // past spawn protection
  // A shot along +X that passes b `dz` metres off their centre line
  const shoot = (weapon, dz = 0) => {
    const eye = [-20, 1.6, -26 + dz];
    const d = normalize([40, 1 - 1.6, 0]);
    room.handleFire(a, { weapon, o: eye, d, time: 0 });
  };
  return { room, a, b, advance, shoot };
}

test('slot 2 fires only the weapon in your loadout', () => {
  for (const [secondary, allowed] of [['sling', 'sling'], ['knives', 'knife'], ['bow', 'bow']]) {
    for (const kind of ['sling', 'knife', 'bow']) {
      const { b, shoot } = duel(secondary);
      shoot(kind);
      assert.equal(!b.alive, kind === allowed, `${secondary} loadout firing ${kind}`);
    }
  }
});

test('an unknown loadout falls back to the sling', () => {
  const { a } = duel('rocket');
  assert.equal(a.secondary, 'sling');
});

test('the bow needs a much thinner line than the sling', () => {
  // 0.45 m off centre along the depth of the body: inside the sling's box,
  // outside the bow's
  const sling = duel('sling');
  sling.shoot('sling', 0.45);
  assert.equal(sling.b.alive, false, 'sling should hit');
  const bow = duel('bow');
  bow.shoot('bow', 0.45);
  assert.equal(bow.b.alive, true, 'bow should miss');
  bow.advance(C.BOW_RELOAD);
  bow.shoot('bow', 0);
  assert.equal(bow.b.alive, false, 'a centred arrow hits');
});

test('a knife hitbox is a little bigger than the sling', () => {
  const sling = duel('sling');
  sling.shoot('sling', 0.58);
  assert.equal(sling.b.alive, true, 'sling should miss');
  const knives = duel('knives');
  knives.shoot('knife', 0.58);
  assert.equal(knives.b.alive, false, 'knife should hit');
});

test('the bow reloads faster than the sling', () => {
  assert.ok(C.BOW_RELOAD < C.SLING_RELOAD);
  const { b, advance, shoot } = duel('bow');
  shoot('bow', 1.5);                     // a miss, to start the reload
  advance(C.BOW_RELOAD - 0.1);
  shoot('bow', 0);
  assert.equal(b.alive, true, 'fired before the reload finished');
  advance(0.1);
  shoot('bow', 0);
  assert.equal(b.alive, false);
});

test('three knives in quick succession, then a wait while they grow back', () => {
  const { room, advance, shoot } = duel('knives');
  const thrown = () => room.snapshot().ev.filter((e) => e.e === 'shot' && e.w === 'knife').length;
  let n = 0;
  for (let i = 0; i < 4; i++) {
    shoot('knife', 1.5);                 // misses, so b stays up
    n += thrown();
    advance(C.KNIFE_INTERVAL);
  }
  assert.equal(n, 3, 'the fourth throw should fail: the belt is empty');
  advance(C.KNIFE_REGEN);
  shoot('knife', 1.5);
  assert.equal(thrown(), 1, 'a knife grew back');
});

test('knives grow back one at a time', () => {
  const k = knifeBelt();
  for (let i = 0; i < 3; i++) assert.ok(takeKnife(k, 10 + i * 0.2));
  assert.equal(takeKnife(k, 10.7), false);
  assert.equal(knivesAt(k, 10 + C.KNIFE_REGEN + 0.01), 1);
  assert.equal(knivesAt(k, 10 + C.KNIFE_REGEN * 3 + 0.01), 3);
});
