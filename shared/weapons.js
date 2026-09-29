// Weapon rules the server and the client share, so both agree on what a
// player can fire and when.

import * as C from './constants.js';

/** Which weapon fire kinds a loadout's slot 2 allows. */
export const FIRE_KIND = { sling: 'sling', knives: 'knife', bow: 'bow' };

export const RANGE = {
  stab: C.STAB_RANGE, throw: C.THROW_RANGE, sling: C.SLING_RANGE, knife: C.KNIFE_RANGE, bow: C.BOW_RANGE,
};

/** Seconds between shots for the reloading secondaries. */
export const RELOAD = { sling: C.SLING_RELOAD, bow: C.BOW_RELOAD };

/** A fresh knife belt: { n, refillAt }. */
export function knifeBelt() { return { n: C.KNIFE_COUNT, refillAt: 0 }; }

/** Knives in hand at time t (grows them back as time passes). */
export function knivesAt(k, t) {
  while (k.n < C.KNIFE_COUNT && t >= k.refillAt) {
    k.n++;
    k.refillAt += C.KNIFE_REGEN;
  }
  return k.n;
}

/** Takes one knife at time t; false if the belt is empty. */
export function takeKnife(k, t) {
  if (knivesAt(k, t) <= 0) return false;
  if (k.n === C.KNIFE_COUNT) k.refillAt = t + C.KNIFE_REGEN;
  k.n--;
  return true;
}
