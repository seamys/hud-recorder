'use strict';

// Main process: window, file output, log numbering, system stats, weather and news.

const { app, BrowserWindow, Menu, ipcMain, session, shell, systemPreferences, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { localDate, dayNumber, logFileName } = require('./lib/dates');
const { parseFeedTitles } = require('./lib/feed');
const { NVIDIA_SMI_ARGS, parseNvidiaSmi } = require('./lib/gpu');
const { createLogger } = require('./lib/logger');
const { formatChapters, formatSrt } = require('./lib/sidecar');

const REFRESH_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const ASR_MODELS = { fast: 'Xenova/whisper-base', accurate: 'Xenova/whisper-small' };
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let win = null;
let out = null;       // write stream of the recording in progress
let outFile = null;
let gpu = null;       // latest nvidia-smi reading, or null
let asr = null;       // speech recognition utility process, or null
let asrFinals = 0;
let gpuSeen = null;   // last logged availability, so the log records changes only

// Replaced with the file logger once the app is ready and the log folder is known.
let log = { info() {}, warn() {}, error() {}, dir: '', file: '' };

process.on('uncaughtException', (err) => log.error('uncaughtException', err));
process.on('unhandledRejection', (err) => log.error('unhandledRejection', err));

// ---------- storage ----------

const outDir = () => path.join(app.getPath('videos'), 'HUD-Logs');
const indexPath = () => path.join(outDir(), 'index.json');

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(indexPath(), 'utf8'));
  } catch (e) {
    return { firstDate: null, count: 0, name: '', topic: '', logs: [] };
  }
}

function writeIndex(ix) {
  fs.mkdirSync(outDir(), { recursive: true });
  fs.writeFileSync(indexPath(), JSON.stringify(ix, null, 2));
}

function defaultFeed() {
  return app.getLocale().toLowerCase().startsWith('zh')
    ? 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml'
    : 'https://feeds.bbci.co.uk/news/world/rss.xml';
}

function feedUrl(ix) {
  return ix.rss === undefined ? defaultFeed() : ix.rss;
}

function logInfo() {
  const ix = readIndex();
  return {
    number: ix.count + 1,
    day: dayNumber(ix.firstDate),
    dir: outDir(),
    name: ix.name || '',
    topic: ix.topic || '',
    city: ix.city || '',
    rss: feedUrl(ix)
  };
}

// ---------- system stats ----------

function pollGpu() {
  execFile('nvidia-smi', NVIDIA_SMI_ARGS, { windowsHide: true, timeout: 1500 }, (err, stdout) => {
    gpu = err ? null : parseNvidiaSmi(stdout);
    if (!!gpu !== gpuSeen) {
      gpuSeen = !!gpu;
      log.info(gpu ? 'nvidia-smi available, GPU stats enabled' : 'nvidia-smi unavailable, GPU stats hidden');
    }
  });
}

// ---------- environment and news ----------

let weatherRetry = null;
const env = { city: '', weather: null, weatherError: null, news: [], newsError: null };

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function refreshWeather() {
  const ix = readIndex();
  env.city = ix.cityLabel || '';
  if (typeof ix.lat !== 'number' || typeof ix.lon !== 'number') {
    env.weather = null;
    env.weatherError = null;
    return;
  }
  const q = 'latitude=' + ix.lat + '&longitude=' + ix.lon + '&timezone=auto';
  try {
    const w = await getJson('https://api.open-meteo.com/v1/forecast?' + q +
      '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
      '&daily=sunrise,sunset&forecast_days=1');
    let aqi = null;
    try {
      const a = await getJson('https://air-quality-api.open-meteo.com/v1/air-quality?' + q + '&current=us_aqi');
      if (a.current && typeof a.current.us_aqi === 'number') aqi = a.current.us_aqi;
    } catch (e) {
      // Air quality is optional; the HUD hides the row when it is missing.
    }
    env.weather = {
      temp: w.current.temperature_2m,
      humidity: w.current.relative_humidity_2m,
      code: w.current.weather_code,
      wind: w.current.wind_speed_10m,
      aqi,
      sunrise: String((w.daily.sunrise || [''])[0]).slice(11, 16),
      sunset: String((w.daily.sunset || [''])[0]).slice(11, 16)
    };
    env.weatherError = null;
  } catch (e) {
    env.weatherError = e.message;
    log.warn('weather refresh failed:', e.message);
    if (!weatherRetry) {
      // One quick retry: the first request after launch sometimes times out.
      weatherRetry = setTimeout(() => { weatherRetry = null; refreshWeather(); }, 5000);
      return;
    }
  }
  clearTimeout(weatherRetry);
  weatherRetry = null;
}

async function refreshNews() {
  const url = feedUrl(readIndex());
  if (!url) {
    env.news = [];
    env.newsError = null;
    return;
  }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    env.news = parseFeedTitles(await r.text());
    env.newsError = env.news.length ? null : 'NO_TITLES';
  } catch (e) {
    env.news = [];
    env.newsError = e.message;
    log.warn('news refresh failed:', e.message);
  }
}

// ---------- IPC ----------

ipcMain.handle('log:info', () => logInfo());

ipcMain.handle('log:saveProfile', (e, name, topic) => {
  const ix = readIndex();
  ix.name = String(name || '');
  ix.topic = String(topic || '');
  writeIndex(ix);
  return true;
});

ipcMain.handle('rec:start', (e, ext) => {
  if (out) throw new Error('already recording');
  const ix = readIndex();
  fs.mkdirSync(outDir(), { recursive: true });
  outFile = path.join(outDir(), logFileName(ix.count + 1, ext));
  out = fs.createWriteStream(outFile);
  out.on('error', (err) => log.error('output stream error', err));
  log.info('recording started:', outFile);
  return outFile;
});

ipcMain.handle('rec:chunk', (e, ab) => new Promise((resolve, reject) => {
  if (!out) return reject(new Error('not recording'));
  out.write(Buffer.from(ab), (err) => (err ? reject(err) : resolve(true)));
}));

// Close the output file and record the log in the index. Used by a normal stop and when the
// window is closed mid-recording, so an interrupted log still gets its number.
function finishRecording(extras, done) {
  if (!out) return done({ file: null });
  const file = outFile;
  out.end(() => {
    out = null;
    outFile = null;
    const ix = readIndex();
    if (!ix.firstDate) ix.firstDate = localDate();
    ix.count += 1;
    ix.logs = ix.logs || [];
    ix.logs.push({
      number: ix.count,
      file: path.basename(file),
      date: new Date().toISOString(),
      topic: ix.topic || '',
      chapters: writeSidecars(file, extras)
    });
    writeIndex(ix);
    let bytes = 0;
    try { bytes = fs.statSync(file).size; } catch (e) { /* size is informational */ }
    log.info('recording saved:', file, '(' + bytes + ' bytes)');
    done({ file });
  });
}

ipcMain.handle('rec:stop', (e, extras) => new Promise((resolve) => finishRecording(extras, resolve)));

// Chapter list and subtitles are saved next to the video as plain text files.
function writeSidecars(file, extras) {
  const base = file.replace(/\.[^.\\/]+$/, '');
  const marks = extras && Array.isArray(extras.marks)
    ? extras.marks.filter((t) => typeof t === 'number' && isFinite(t) && t > 0).slice(0, 200) : [];
  const cues = extras && Array.isArray(extras.cues)
    ? extras.cues.filter((c) => c && typeof c.start === 'number' && typeof c.end === 'number').slice(0, 5000) : [];
  try {
    if (marks.length) {
      const label = String((extras && extras.chapterLabel) || 'Chapter').slice(0, 40);
      fs.writeFileSync(base + '.chapters.txt', formatChapters(marks, label));
    }
    if (cues.length) fs.writeFileSync(base + '.srt', formatSrt(cues));
    if (marks.length || cues.length) log.info('sidecars written:', marks.length + ' chapter marks,', cues.length + ' subtitle cues');
  } catch (err) {
    log.error('could not write sidecar files', err);
  }
  return marks;
}

// Discard a recording that failed to start; the log counter is not advanced.
ipcMain.handle('rec:abort', () => new Promise((resolve) => {
  if (!out) return resolve(true);
  const file = outFile;
  out.end(() => {
    out = null;
    outFile = null;
    try { fs.unlinkSync(file); } catch (e) { /* nothing to clean up */ }
    log.warn('recording aborted before it started:', file);
    resolve(true);
  });
}));

ipcMain.handle('sys:stats', async () => {
  let freeBytes = null;
  try {
    fs.mkdirSync(outDir(), { recursive: true });
    const s = await fs.promises.statfs(outDir());
    freeBytes = Number(s.bavail) * Number(s.bsize);
  } catch (e) {
    // The HUD hides the row when free space is unknown.
  }
  return { freeBytes, gpu };
});

ipcMain.handle('env:get', () => env);

ipcMain.handle('env:setCity', async (e, name, lang) => {
  name = String(name || '').trim();
  const ix = readIndex();
  ix.city = name;
  if (!name) {
    delete ix.lat;
    delete ix.lon;
    ix.cityLabel = '';
    writeIndex(ix);
    await refreshWeather();
    return { ok: true };
  }
  try {
    const language = String(lang || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const g = await getJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=' + language +
      '&name=' + encodeURIComponent(name));
    const hit = g.results && g.results[0];
    if (!hit) return { ok: false, error: 'CITY_NOT_FOUND' };
    ix.lat = hit.latitude;
    ix.lon = hit.longitude;
    ix.cityLabel = hit.name || name;
    writeIndex(ix);
    await refreshWeather();
    return { ok: !env.weatherError, error: env.weatherError };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('env:setFeed', async (e, url) => {
  url = String(url || '').trim();
  if (url) {
    let u;
    try { u = new URL(url); } catch (err) { return { ok: false, error: 'BAD_URL' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'BAD_PROTOCOL' };
  }
  const ix = readIndex();
  ix.rss = url;
  writeIndex(ix);
  await refreshNews();
  return { ok: !env.newsError, error: env.newsError, count: env.news.length };
});

// Messages from the page (device failures, script errors) go to the same log file.
ipcMain.handle('log:write', (e, level, message) => {
  const text = String(message || '').slice(0, 2000);
  if (level === 'error') log.error('[renderer]', text);
  else if (level === 'warn') log.warn('[renderer]', text);
  else log.info('[renderer]', text);
  return true;
});

// ---------- live captions ----------

function stopAsr() {
  if (asr) {
    try { asr.kill(); } catch (e) { /* already gone */ }
  }
  asr = null;
}

ipcMain.handle('asr:start', (e, opts) => new Promise((resolve, reject) => {
  stopAsr();
  const model = ASR_MODELS[opts && opts.model] || ASR_MODELS.fast;
  const child = utilityProcess.fork(path.join(__dirname, 'asr-worker.js'), [], { serviceName: 'HUD Recorder captions' });
  asr = child;
  asrFinals = 0;
  let settled = false;
  const forward = (m) => { if (win && !win.isDestroyed()) win.webContents.send('asr:event', m); };
  log.info('captions: starting with', model);

  child.on('message', (m) => {
    if (!m) return;
    if (m.type === 'ready') {
      log.info('captions: model ready');
      if (!settled) { settled = true; resolve(true); }
    } else if (m.type === 'fatal') {
      log.error('captions: could not load the model:', m.message);
      if (!settled) { settled = true; reject(new Error(m.message)); }
      if (asr === child) stopAsr();
    } else if (m.type === 'progress') {
      forward(m);
    } else if (m.type === 'text') {
      // Timing only: what was said is never written to the log.
      if (m.final && (++asrFinals <= 3 || asrFinals % 25 === 0)) {
        log.info('captions: utterance ' + asrFinals + ', ' + m.dur.toFixed(1) + ' s of audio transcribed in ' + m.ms + ' ms');
      }
      forward(m);
    } else if (m.type === 'error') {
      log.warn('captions: transcription failed:', m.message);
      forward(m);
    }
  });
  child.on('exit', (code) => {
    if (asr === child) asr = null;
    if (!settled) { settled = true; reject(new Error('the captions process exited with code ' + code)); }
    else if (code) log.warn('captions: process exited with code ' + code);
  });
  child.postMessage({
    type: 'init',
    model,
    language: opts && opts.language === 'english' ? 'english' : 'chinese',
    cacheDir: path.join(app.getPath('userData'), 'models', 'transformers')
  });
}));

ipcMain.on('asr:audio', (e, samples) => {
  if (asr) asr.postMessage({ type: 'audio', samples });
});

ipcMain.handle('asr:language', (e, language) => {
  if (asr) asr.postMessage({ type: 'language', language: language === 'english' ? 'english' : 'chinese' });
  return true;
});

ipcMain.handle('asr:stop', () => { stopAsr(); return true; });

// MediaPipe models: downloaded once into the app's data folder, then served from disk.
async function loadModel(name, url) {
  const dir = path.join(app.getPath('userData'), 'models');
  const file = path.join(dir, name);
  try {
    return fs.readFileSync(file);
  } catch (e) {
    log.info('downloading model', name, 'from', url);
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) {
    log.error('model download failed for ' + name + ': HTTP ' + r.status);
    throw new Error('HTTP ' + r.status);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, buf);
  log.info('model saved:', name, '(' + buf.length + ' bytes)');
  return buf;
}

ipcMain.handle('face:model', () => loadModel('face_landmarker.task', FACE_MODEL_URL));
ipcMain.handle('hand:model', () => loadModel('hand_landmarker.task', HAND_MODEL_URL));

ipcMain.handle('open:logs', () => shell.openPath(log.dir));

ipcMain.handle('open:dir', () => {
  fs.mkdirSync(outDir(), { recursive: true });
  return shell.openPath(outDir());
});

// ---------- window ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#09090A',
    // The page draws its own title bar; the system window buttons sit on top of it.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? false : { color: '#111112', symbolColor: '#A1A1AA', height: 36 },
    title: 'HUD Recorder',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep drawing and recording while the window is in the background.
      backgroundThrottling: false
    }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.on('render-process-gone', (e, details) => log.error('renderer process gone:', details.reason));
}

// macOS asks for camera and microphone access per app; request both up front so the
// system prompts appear before the first capture attempt.
async function requestMediaAccess() {
  if (process.platform !== 'darwin') return;
  for (const kind of ['camera', 'microphone']) {
    try {
      const granted = await systemPreferences.askForMediaAccess(kind);
      log.info('macOS ' + kind + ' access:', granted ? 'granted' : 'denied');
    } catch (e) {
      log.warn('macOS ' + kind + ' access request failed:', e.message);
    }
  }
}

app.whenReady().then(async () => {
  log = createLogger(app.getPath('logs'));
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  log.info('HUD Recorder ' + app.getVersion() + ' starting on ' + process.platform + ' ' + process.arch +
    ', Electron ' + process.versions.electron + ', locale ' + app.getLocale());

  // The app only ever needs camera and microphone access.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media');

  pollGpu();
  setInterval(pollGpu, 2000);
  refreshWeather();
  refreshNews();
  setInterval(refreshWeather, REFRESH_MS);
  setInterval(refreshNews, REFRESH_MS);

  await requestMediaAccess();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopAsr();
  if (out) {
    log.warn('window closed while recording; saving what was captured');
    finishRecording(null, () => app.quit());
    return;
  }
  log.info('window closed, quitting');
  app.quit();
});
