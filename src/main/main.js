'use strict';

// Main process: window, file output, log numbering, system stats, weather and news.

const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { localDate, dayNumber, logFileName } = require('./lib/dates');
const { parseFeedTitles } = require('./lib/feed');
const { NVIDIA_SMI_ARGS, parseNvidiaSmi } = require('./lib/gpu');

const REFRESH_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

let win = null;
let out = null;       // write stream of the recording in progress
let outFile = null;
let gpu = null;       // latest nvidia-smi reading, or null

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
  });
}

// ---------- environment and news ----------

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
  }
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
  return outFile;
});

ipcMain.handle('rec:chunk', (e, ab) => new Promise((resolve, reject) => {
  if (!out) return reject(new Error('not recording'));
  out.write(Buffer.from(ab), (err) => (err ? reject(err) : resolve(true)));
}));

ipcMain.handle('rec:stop', () => new Promise((resolve) => {
  if (!out) return resolve({ file: null });
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
      topic: ix.topic || ''
    });
    writeIndex(ix);
    resolve({ file });
  });
}));

// Discard a recording that failed to start; the log counter is not advanced.
ipcMain.handle('rec:abort', () => new Promise((resolve) => {
  if (!out) return resolve(true);
  const file = outFile;
  out.end(() => {
    out = null;
    outFile = null;
    try { fs.unlinkSync(file); } catch (e) { /* nothing to clean up */ }
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

ipcMain.handle('open:dir', () => {
  fs.mkdirSync(outDir(), { recursive: true });
  return shell.openPath(outDir());
});

// ---------- window ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#070A0C',
    autoHideMenuBar: true,
    title: 'HUD Recorder',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep drawing and recording while the window is in the background.
      backgroundThrottling: false
    }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  // The app only ever needs camera and microphone access.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media');

  pollGpu();
  setInterval(pollGpu, 2000);
  refreshWeather();
  refreshNews();
  setInterval(refreshWeather, REFRESH_MS);
  setInterval(refreshNews, REFRESH_MS);

  createWindow();
});

app.on('window-all-closed', () => {
  if (out) {
    try { out.end(); } catch (e) { /* already closed */ }
  }
  app.quit();
});
