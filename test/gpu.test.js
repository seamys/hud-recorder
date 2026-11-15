'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseNvidiaSmi } = require('../src/main/lib/gpu');

test('parseNvidiaSmi reads utilisation, temperature and memory', () => {
  assert.deepStrictEqual(parseNvidiaSmi('27, 55, 1741\r\n'), { util: 27, temp: 55, memMB: 1741 });
});

test('parseNvidiaSmi uses the first GPU when several are listed', () => {
  assert.deepStrictEqual(parseNvidiaSmi('5, 40, 300\n90, 70, 8000\n'), { util: 5, temp: 40, memMB: 300 });
});

test('parseNvidiaSmi returns null for unusable output', () => {
  assert.strictEqual(parseNvidiaSmi(''), null);
  assert.strictEqual(parseNvidiaSmi('[N/A], 55, 1741'), null);
  assert.strictEqual(parseNvidiaSmi('27, 55'), null);
});
