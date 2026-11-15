'use strict';

// Main process: window, file output, log numbering, system stats, weather and news.

const { app, BrowserWindow, Menu, desktopCapturer, dialog, ipcMain, screen, session, shell, systemPreferences, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { localDate, dayNumber, logFileName } = require('./lib/dates');
const { parseFeedTitles } = require('./lib/feed');
const { NVIDIA_SMI_ARGS, parseNvidiaSmi } = require('./lib/gpu');
const { createLogger } = require('./lib/logger');
const { formatChapters, formatSrt } = require('./lib/sidecar');

const TITLE_BAR = {
  light: { color: '#F8F8F8', symbolColor: '#3B3B3B' },
  dark: { color: '#1F1F1F', symbolColor: '#CCCCCC' }
};
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
let fullBounds = null;      // window bounds to return to when the floating bar is closed
let screenSourceId = '';   // capture source chosen in Settings
let gpuSeen = null;   // last logged availability, so the log records changes only

// Replaced with the file logger once the app is ready and the log folder is known.
let log = { info() {}, warn() {}, error() {}, dir: '', file: '' };

process.on('uncaughtException', (err) => log.error('uncaughtException', err));
process.on('unhandledRejection', (err) => log.error('unhandledRejection', err));

// ---------- storage ----------
//
// The index (log counter, log list, name, topic, city, feeds, chosen output folder) lives in the
// app's data folder, so it stays put when the recordings folder is moved. Recordings and their
// sidecar files go to the output folder, which the user can change.

const defaultOutDir = () => path.join(app.getPath('videos'), 'HUD-Logs');
const indexPath = () => path.join(app.getPath('userData'), 'index.json');
const legacyIndexPath = () => path.join(defaultOutDir(), 'index.json');

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(indexPath(), 'utf8'));
  } catch (e) {
    // Versions up to 0.4.0 kept the index next to the recordings; pick it up from there once.
    try {
      const ix = JSON.parse(fs.readFileSync(legacyIndexPath(), 'utf8'));
      writeIndex(ix);
      return ix;
    } catch (e2) {
      return { firstDate: null, count: 0, name: '', topic: '', logs: [] };
    }
  }
}

function writeIndex(ix) {
  fs.mkdirSync(path.dirname(indexPath()), { recursive: true });
  fs.writeFileSync(indexPath(), JSON.stringify(ix, null, 2));
}

/** Create a folder if it is missing. Existing folders are left alone: asking Windows to
 *  "create" a drive root such as D:\\ fails even though the folder is perfectly usable. */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Folder recordings are saved to: the user's choice, or Videos/HUD-Logs. */
function outDir() {
  const chosen = readIndex().outDir;
  return typeof chosen === 'string' && chosen.trim() ? chosen : defaultOutDir();
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

const MAX_FEEDS = 5;
const MAX_HEADLINES = 40;

/** The feed setting holds one URL per line (or separated by spaces). */
function feedList(value) {
  return String(value || '').split(/\s+/).map((u) => u.trim()).filter(Boolean).slice(0, MAX_FEEDS);
}

async function fetchTitles(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return parseFeedTitles(await r.text(), 20);
}

async function refreshNews() {
  const urls = feedList(feedUrl(readIndex()));
  if (!urls.length) {
    env.news = [];
    env.newsError = null;
    return;
  }
  const results = await Promise.allSettled(urls.map(fetchTitles));
  const lists = [];
  let firstError = null;
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') lists.push(res.value);
    else {
      firstError = firstError || res.reason.message;
      log.warn('news refresh failed for feed ' + (i + 1) + ':', res.reason.message);
    }
  });
  // Interleave the feeds so that every source gets airtime, and drop repeated headlines.
  const merged = [];
  const seen = new Set();
  for (let i = 0; merged.length < MAX_HEADLINES && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      if (i < l.length && !seen.has(l[i]) && merged.length < MAX_HEADLINES) { seen.add(l[i]); merged.push(l[i]); }
    }
  }
  env.news = merged;
  env.newsError = merged.length ? null : (firstError || 'NO_TITLES');
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
  ensureDir(outDir());
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
    ensureDir(outDir());
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

ipcMain.handle('env:setFeed', async (e, value) => {
  const urls = feedList(value);
  for (const url of urls) {
    let u;
    try { u = new URL(url); } catch (err) { return { ok: false, error: 'BAD_URL' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'BAD_PROTOCOL' };
  }
  const ix = readIndex();
  ix.rss = urls.join('\n');
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

// Screen recording: list the screens and windows that can be captured.
ipcMain.handle('screen:sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
    log.info('screen sources found:', sources.length);
    return sources.map((s) => ({ id: s.id, name: s.name, screen: s.id.indexOf('screen:') === 0 }));
  } catch (err) {
    log.warn('could not list screen sources:', err.message);
    return [];
  }
});

ipcMain.handle('screen:select', (e, id) => {
  screenSourceId = String(id || '');
  return true;
});

// While the screen is being captured, hide this window from the capture. Otherwise the preview
// would show the screen, which shows the preview, and so on.
ipcMain.handle('screen:protect', (e, on) => {
  if (win && !win.isDestroyed()) {
    try { win.setContentProtection(!!on); } catch (err) { log.warn('content protection failed:', err.message); }
  }
  return true;
});

// Let the user pick where recordings are saved. Refused while a recording is being written.
ipcMain.handle('out:choose', async () => {
  if (out) return { ok: false, error: 'RECORDING' };
  const res = await dialog.showOpenDialog(win, {
    defaultPath: outDir(),
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
  const dir = res.filePaths[0];
  try {
    ensureDir(dir);
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (err) {
    log.warn('chosen output folder is not writable:', dir, err.message);
    return { ok: false, error: 'NOT_WRITABLE' };
  }
  const ix = readIndex();
  ix.outDir = dir;
  writeIndex(ix);
  log.info('output folder changed to', dir);
  return { ok: true, dir };
});

ipcMain.handle('out:reset', () => {
  if (out) return { ok: false, error: 'RECORDING' };
  const ix = readIndex();
  delete ix.outDir;
  writeIndex(ix);
  log.info('output folder reset to the default');
  return { ok: true, dir: outDir() };
});

// Floating control bar: shrink the window to a small always-on-top strip, or restore it.
// The same window is reused on purpose. It stays visible, so drawing and recording carry on;
// a minimised window would stop producing frames.
const COMPACT = { width: 470, height: 56 };
const FULL_MIN = { width: 960, height: 640 };
ipcMain.handle('ui:compact', (e, on) => {
  if (!win || win.isDestroyed()) return false;
  try {
    if (on) {
      if (win.isFullScreen()) win.setFullScreen(false);
      if (win.isMaximized()) win.unmaximize();
      fullBounds = win.getBounds();
      const area = screen.getDisplayMatching(fullBounds).workArea;
      win.setMinimumSize(COMPACT.width, COMPACT.height);
      win.setBounds({
        x: area.x + area.width - COMPACT.width - 24,
        y: area.y + area.height - COMPACT.height - 24,
        width: COMPACT.width,
        height: COMPACT.height
      });
      win.setResizable(false);
      win.setMaximizable(false);
      win.setAlwaysOnTop(true, 'floating');
    } else {
      win.setAlwaysOnTop(false);
      win.setResizable(true);
      win.setMaximizable(true);
      win.setMinimumSize(FULL_MIN.width, FULL_MIN.height);
      if (fullBounds) win.setBounds(fullBounds);
    }
    log.info('floating control bar', on ? 'on' : 'off');
    return true;
  } catch (err) {
    log.warn('could not switch the floating control bar:', err.message);
    return false;
  }
});

// Keep the system window buttons in step with the interface theme.
ipcMain.handle('ui:theme', (e, theme) => {
  if (win && !win.isDestroyed() && process.platform !== 'darwin') {
    try {
      win.setTitleBarOverlay(Object.assign({ height: 36 }, TITLE_BAR[theme === 'dark' ? 'dark' : 'light']));
    } catch (err) {
      log.warn('could not recolour the title bar:', err.message);
    }
  }
  return true;
});

ipcMain.handle('open:dir', () => {
  ensureDir(outDir());
  return shell.openPath(outDir());
});

// ---------- window ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: FULL_MIN.width,
    minHeight: FULL_MIN.height,
    backgroundColor: '#F3F3F3',
    // The page draws its own title bar; the system window buttons sit on top of it.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? false : Object.assign({ height: 36 }, TITLE_BAR.light),
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
  // Camera, microphone and screen capture are the only permissions the app ever needs.
  const allowed = (permission) => permission === 'media' || permission === 'display-capture';
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(allowed(permission)));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => allowed(permission));

  // Screen capture requests from the page are answered here with the source chosen in Settings,
  // so no system picker is shown.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } }).then((sources) => {
      const pick = sources.find((s) => s.id === screenSourceId) ||
        sources.find((s) => s.id.indexOf('screen:') === 0) || sources[0];
      if (!pick) {
        log.warn('screen capture requested but no source is available');
        callback({});
        return;
      }
      log.info('screen capture source:', pick.name, '(' + pick.id + ')');
      callback({ video: pick });
    }).catch((err) => {
      log.warn('screen capture request failed:', err.message);
      callback({});
    });
  });

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
