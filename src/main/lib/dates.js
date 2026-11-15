'use strict';

const pad2 = (n) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
function localDate(d = new Date()) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/**
 * Day counter shown on the HUD ("Day N").
 * Day 1 is the date of the first saved log; before any log exists it is also 1.
 */
function dayNumber(firstDate, now = new Date()) {
  if (!firstDate) return 1;
  const a = new Date(firstDate + 'T00:00:00');
  const b = new Date(localDate(now) + 'T00:00:00');
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/** File name for a log, e.g. log-007_2026-11-15_1632.mp4 */
function logFileName(number, ext, d = new Date()) {
  const safeExt = ext === 'webm' ? 'webm' : 'mp4';
  return 'log-' + String(number).padStart(3, '0') + '_' + localDate(d) + '_' +
    pad2(d.getHours()) + pad2(d.getMinutes()) + '.' + safeExt;
}

module.exports = { localDate, dayNumber, logFileName };
