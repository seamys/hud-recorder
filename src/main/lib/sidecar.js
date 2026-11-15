'use strict';

const pad = (n, l = 2) => String(Math.floor(n)).padStart(l, '0');

/** Seconds as H:MM:SS or MM:SS, the format video sites accept for chapter lists. */
function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const rest = pad((s % 3600) / 60) + ':' + pad(s % 60);
  return h > 0 ? h + ':' + rest : rest;
}

/**
 * Chapter list text. `marks` are the seconds at which the user pressed the chapter button;
 * chapter 1 always starts at 0.
 */
function formatChapters(marks, label = 'Chapter') {
  const times = [0].concat((marks || []).filter((t) => t > 0).sort((a, b) => a - b));
  return times.map((t, i) => clock(t) + ' ' + label + ' ' + (i + 1)).join('\n') + '\n';
}

function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return pad(ms / 3600000) + ':' + pad((ms % 3600000) / 60000) + ':' + pad((ms % 60000) / 1000) + ',' + pad(ms % 1000, 3);
}

/** SubRip subtitles from [{ start, end, text }] with times in seconds. */
function formatSrt(cues) {
  return (cues || [])
    .filter((c) => c && String(c.text || '').trim())
    .map((c, i) => (i + 1) + '\n' + srtTime(c.start) + ' --> ' + srtTime(Math.max(c.end, c.start + 0.2)) + '\n' + String(c.text).trim() + '\n')
    .join('\n');
}

/**
 * Speech units for a speaking rate: each CJK character counts as one, and each run of other
 * letters or digits counts as one word.
 */
function countUnits(text) {
  const s = String(text || '');
  const cjk = (s.match(/[㐀-鿿豈-﫿]/g) || []).length;
  const words = (s.replace(/[㐀-鿿豈-﫿]/g, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
  return cjk + words;
}

module.exports = { clock, formatChapters, formatSrt, countUnits };
