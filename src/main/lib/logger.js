'use strict';

const fs = require('fs');
const path = require('path');

function format(part) {
  if (part instanceof Error) return part.stack || part.message;
  if (part && typeof part === 'object') {
    try { return JSON.stringify(part); } catch (e) { return String(part); }
  }
  return String(part);
}

/**
 * Minimal file logger. Appends timestamped lines to <dir>/main.log and keeps one previous
 * file (main.old.log) once the log grows past maxBytes. Logging never throws: a diagnostics
 * failure must not take the recorder down.
 */
function createLogger(dir, opts = {}) {
  const maxBytes = opts.maxBytes || 1024 * 1024;
  const file = path.join(dir, 'main.log');
  const oldFile = path.join(dir, 'main.old.log');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* reported on first write */ }

  function write(level, parts) {
    const text = new Date().toISOString() + ' ' + level.padEnd(5) + ' ' + parts.map(format).join(' ') + '\n';
    try {
      let size = 0;
      try { size = fs.statSync(file).size; } catch (e) { /* no log yet */ }
      if (size + Buffer.byteLength(text) > maxBytes) {
        try { fs.renameSync(file, oldFile); } catch (e) { /* keep appending */ }
      }
      fs.appendFileSync(file, text);
    } catch (e) {
      // Nowhere left to report this.
    }
    return text;
  }

  return {
    dir,
    file,
    info: (...parts) => write('INFO', parts),
    warn: (...parts) => write('WARN', parts),
    error: (...parts) => write('ERROR', parts)
  };
}

module.exports = { createLogger };
