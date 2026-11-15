'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const channels = (src, re) => [...src.matchAll(re)].map((m) => m[1]).sort();

// The page can only reach the main process through channels named in preload.js. A channel
// without a handler fails at run time, so check the two lists against each other here.
test('every channel used by the preload bridge has a handler in the main process', () => {
  const used = channels(read('src/preload/preload.js'), /ipcRenderer\.(?:invoke|send)\('([^']+)'/g);
  const handled = new Set(channels(read('src/main/main.js'), /ipcMain\.(?:handle|on)\('([^']+)'/g));
  const missing = used.filter((c) => !handled.has(c));
  assert.deepStrictEqual(missing, []);
});

test('every handler in the main process is reachable from the preload bridge', () => {
  const used = new Set(channels(read('src/preload/preload.js'), /ipcRenderer\.(?:invoke|send)\('([^']+)'/g));
  const handled = channels(read('src/main/main.js'), /ipcMain\.(?:handle|on)\('([^']+)'/g);
  assert.deepStrictEqual(handled.filter((c) => !used.has(c)), []);
});
