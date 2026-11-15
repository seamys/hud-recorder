'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLogger } = require('../src/main/lib/logger');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hud-log-'));

test('logger writes timestamped lines with a level', () => {
  const log = createLogger(tmp());
  log.info('started', { version: '1.0.0' });
  log.error(new Error('boom'));
  const lines = fs.readFileSync(log.file, 'utf8').trim().split('\n');
  assert.match(lines[0], /^\d{4}-\d{2}-\d{2}T[\d:.]+Z INFO  started \{"version":"1\.0\.0"\}$/);
  assert.match(lines[1], /ERROR Error: boom/);
});

test('logger rotates to main.old.log past the size limit', () => {
  const dir = tmp();
  const log = createLogger(dir, { maxBytes: 200 });
  for (let i = 0; i < 20; i++) log.info('line number ' + i);
  assert.ok(fs.existsSync(path.join(dir, 'main.old.log')));
  assert.ok(fs.statSync(log.file).size <= 200);
});

test('logger never throws when the folder is unusable', () => {
  const dir = tmp();
  const blocker = path.join(dir, 'file');
  fs.writeFileSync(blocker, 'x');
  const log = createLogger(path.join(blocker, 'nested'));
  assert.doesNotThrow(() => log.info('still fine'));
});
