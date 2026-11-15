'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { localDate, dayNumber, logFileName } = require('../src/main/lib/dates');

test('localDate formats as YYYY-MM-DD', () => {
  assert.strictEqual(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('dayNumber is 1 before any log exists', () => {
  assert.strictEqual(dayNumber(null), 1);
});

test('dayNumber counts the first log date as day 1', () => {
  assert.strictEqual(dayNumber('2026-11-15', new Date(2026, 10, 15, 8, 0)), 1);
  assert.strictEqual(dayNumber('2026-11-15', new Date(2026, 10, 16, 0, 1)), 2);
  assert.strictEqual(dayNumber('2026-11-15', new Date(2026, 11, 31, 12, 0)), 47);
});

test('dayNumber never goes below 1 when the clock moves backwards', () => {
  assert.strictEqual(dayNumber('2026-11-15', new Date(2026, 10, 10)), 1);
});

test('logFileName pads the number and sanitises the extension', () => {
  const d = new Date(2026, 10, 15, 16, 32);
  assert.strictEqual(logFileName(7, 'mp4', d), 'log-007_2026-11-15_1632.mp4');
  assert.strictEqual(logFileName(12, 'webm', d), 'log-012_2026-11-15_1632.webm');
  assert.strictEqual(logFileName(1, '../evil', d), 'log-001_2026-11-15_1632.mp4');
});
