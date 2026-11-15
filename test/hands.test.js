'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { classify } = require('../src/renderer/hands');

// Build a schematic upright right hand. Each finger is a column of four joints above its
// knuckle; `up` lists the fingers that are extended, the rest are curled back to the palm.
function hand(up, opts = {}) {
  const lm = new Array(21);
  lm[0] = { x: 0.5, y: 0.9 };                               // wrist
  const base = { index: [5, 0.42], middle: [9, 0.48], ring: [13, 0.54], pinky: [17, 0.60] };
  for (const name of Object.keys(base)) {
    const [i, x] = base[name];
    lm[i] = { x, y: 0.62 };                                 // knuckle
    if (up.includes(name)) {
      lm[i + 1] = { x, y: 0.52 }; lm[i + 2] = { x, y: 0.44 }; lm[i + 3] = { x, y: 0.36 };
    } else {
      lm[i + 1] = { x, y: 0.56 }; lm[i + 2] = { x, y: 0.62 }; lm[i + 3] = { x, y: 0.68 };
    }
  }
  // thumb: out to the side when extended, folded across the palm otherwise
  lm[1] = { x: 0.42, y: 0.84 }; lm[2] = { x: 0.36, y: 0.78 };
  if (up.includes('thumb')) { lm[3] = { x: 0.29, y: 0.72 }; lm[4] = { x: 0.23, y: 0.66 }; }
  else { lm[3] = { x: 0.42, y: 0.72 }; lm[4] = { x: 0.50, y: 0.70 }; }
  if (opts.pinch) lm[4] = { x: lm[8].x + 0.01, y: lm[8].y + 0.01 };
  return lm;
}

test('open hand: all five fingers extended', () => {
  const r = classify(hand(['thumb', 'index', 'middle', 'ring', 'pinky']), 1);
  assert.strictEqual(r.gesture, 'open');
  assert.strictEqual(r.count, 5);
});

test('fist: nothing extended', () => {
  const r = classify(hand([]), 1);
  assert.strictEqual(r.gesture, 'fist');
  assert.strictEqual(r.count, 0);
});

test('pointing, peace, rock and thumbs up', () => {
  assert.strictEqual(classify(hand(['index']), 1).gesture, 'point');
  assert.strictEqual(classify(hand(['index', 'middle']), 1).gesture, 'peace');
  assert.strictEqual(classify(hand(['index', 'pinky']), 1).gesture, 'rock');
  assert.strictEqual(classify(hand(['thumb']), 1).gesture, 'thumb');
});

test('other combinations report a finger count', () => {
  const r = classify(hand(['index', 'middle', 'ring']), 1);
  assert.strictEqual(r.gesture, 'count');
  assert.strictEqual(r.count, 3);
});

test('pinch and OK sign depend on the other fingers', () => {
  assert.strictEqual(classify(hand(['index'], { pinch: true }), 1).gesture, 'pinch');
  assert.strictEqual(classify(hand(['index', 'middle', 'ring', 'pinky'], { pinch: true }), 1).gesture, 'ok');
});

test('the result does not depend on frame aspect ratio for an upright hand', () => {
  assert.strictEqual(classify(hand(['index', 'middle']), 16 / 9).gesture, 'peace');
});
