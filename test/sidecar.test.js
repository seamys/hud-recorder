'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { clock, formatChapters, formatSrt, countUnits } = require('../src/main/lib/sidecar');

test('clock formats minutes and hours', () => {
  assert.strictEqual(clock(0), '00:00');
  assert.strictEqual(clock(192.9), '03:12');
  assert.strictEqual(clock(3725), '1:02:05');
});

test('formatChapters always starts at zero and sorts marks', () => {
  assert.strictEqual(formatChapters([192, 65]), '00:00 Chapter 1\n01:05 Chapter 2\n03:12 Chapter 3\n');
  assert.strictEqual(formatChapters([]), '00:00 Chapter 1\n');
});

test('formatSrt numbers cues and formats times', () => {
  const srt = formatSrt([{ start: 1.5, end: 3.25, text: ' Hello ' }, { start: 4, end: 4, text: 'x' }, { start: 9, end: 10, text: '  ' }]);
  assert.strictEqual(srt, '1\n00:00:01,500 --> 00:00:03,250\nHello\n\n2\n00:00:04,000 --> 00:00:04,200\nx\n');
});

test('countUnits counts CJK characters and latin words', () => {
  assert.strictEqual(countUnits('今天天气不错'), 6);
  assert.strictEqual(countUnits('Hello brave new world'), 4);
  assert.strictEqual(countUnits('今天用 Electron 做了 2 个功能。'), 10);
  assert.strictEqual(countUnits(''), 0);
});
