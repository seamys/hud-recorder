'use strict';

// Speech recognition worker. Runs in an Electron utility process so that model loading and
// inference can never stall or crash the recorder. Receives 16 kHz mono audio, splits it into
// utterances with a simple energy gate, and transcribes them with Whisper (Transformers.js).

const port = process.parentPort;

const RATE = 16000;
const SPEECH_DB = -45;          // chunks louder than this count as speech
const END_SILENCE_S = 0.7;      // silence that closes an utterance
const MAX_UTTERANCE_S = 12;     // force a cut so captions keep flowing in long sentences
const INTERIM_EVERY_S = 1.5;    // how often a partial transcript is attempted
const MIN_FINAL_S = 0.4;
const MIN_INTERIM_S = 0.8;
const MAX_BACKLOG = 5;

let transcriber = null;
let language = 'chinese';
let active = false, silence = 0, sinceInterim = 0;
let seg = [], segLen = 0, prev = null;
let busy = false;
const finals = [];

const send = (m) => port.postMessage(m);

function rmsDb(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return 20 * Math.log10(Math.sqrt(s / a.length) || 1e-6);
}

function concat(chunks, len) {
  const out = new Float32Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function run(samples, final) {
  const t0 = Date.now();
  const out = await transcriber(samples, { language, task: 'transcribe' });
  const text = String((out && out.text) || '').trim();
  send({ type: 'text', text, final, dur: samples.length / RATE, ms: Date.now() - t0 });
}

async function pump() {
  if (busy || !transcriber) return;
  busy = true;
  try {
    while (finals.length) await run(finals.shift(), true);
  } catch (e) {
    send({ type: 'error', message: e.message });
  }
  busy = false;
}

async function interim() {
  if (busy || !transcriber || segLen < RATE * MIN_INTERIM_S) return;
  busy = true;
  try {
    await run(concat(seg, segLen), false);
  } catch (e) {
    send({ type: 'error', message: e.message });
  }
  busy = false;
  pump();
}

function finalize() {
  if (segLen >= RATE * MIN_FINAL_S) {
    finals.push(concat(seg, segLen));
    while (finals.length > MAX_BACKLOG) finals.shift();
  }
  seg = []; segLen = 0; active = false; silence = 0; sinceInterim = 0;
  pump();
}

function onAudio(chunk) {
  const dur = chunk.length / RATE;
  const speech = rmsDb(chunk) > SPEECH_DB;
  if (speech) {
    if (!active) {
      active = true;
      if (prev) { seg.push(prev); segLen += prev.length; }   // keep the onset
    }
    seg.push(chunk); segLen += chunk.length; silence = 0;
  } else if (active) {
    seg.push(chunk); segLen += chunk.length; silence += dur;
    if (silence >= END_SILENCE_S) finalize();
  }
  if (active) {
    sinceInterim += dur;
    if (segLen >= RATE * MAX_UTTERANCE_S) finalize();
    else if (sinceInterim >= INTERIM_EVERY_S) { sinceInterim = 0; interim(); }
  }
  prev = chunk;
}

async function init(m) {
  language = m.language || language;
  try {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = m.cacheDir;
    let lastPct = -1;
    transcriber = await pipeline('automatic-speech-recognition', m.model, {
      device: 'cpu',
      dtype: 'q8',
      progress_callback: (p) => {
        if (p && p.status === 'progress' && typeof p.progress === 'number') {
          const pct = Math.floor(p.progress / 10) * 10;
          if (pct !== lastPct) { lastPct = pct; send({ type: 'progress', file: p.file, pct }); }
        }
      }
    });
    send({ type: 'ready', model: m.model });
  } catch (e) {
    send({ type: 'fatal', message: e && e.message ? e.message : String(e) });
  }
}

port.on('message', (e) => {
  const m = e.data;
  if (!m) return;
  if (m.type === 'init') init(m);
  else if (m.type === 'audio') { if (transcriber && m.samples) onAudio(m.samples); }
  else if (m.type === 'language') language = m.language || language;
});
