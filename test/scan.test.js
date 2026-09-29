import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../shared/constants.js';
import { waveRadius, inCone } from '../shared/scan.js';

test('the scan wave grows exponentially and reaches full range on time', () => {
  assert.equal(waveRadius(0), 0);
  assert.ok(Math.abs(waveRadius(C.SCAN_WAVE_TIME) - C.SCAN_RANGE) < 1e-9);
  // Each equal slice of time covers more ground than the one before
  const steps = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map(waveRadius);
  for (let i = 2; i < steps.length; i++) assert.ok(steps[i] - steps[i - 1] > steps[i - 1] - steps[i - 2]);
});

test('the scan only senses what is in front of you', () => {
  const eye = [0, 1.6, 0], fwd = [0, 0, -1];
  assert.ok(inCone(eye, fwd, [0, 1.1, -20]).inside, 'straight ahead');
  assert.ok(inCone(eye, fwd, [10, 1.1, -20]).inside, 'off to the side, inside the cone');
  assert.ok(!inCone(eye, fwd, [20, 1.1, -5]).inside, 'far off to the side');
  assert.ok(!inCone(eye, fwd, [0, 1.1, 20]).inside, 'behind');
  assert.ok(!inCone(eye, fwd, [0, 1.1, -C.SCAN_RANGE - 5]).inside, 'out of range');
});
