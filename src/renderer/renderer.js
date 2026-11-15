// Renderer: captures camera and microphone, draws the video frame plus the HUD onto one canvas,
// and records that canvas. What you see in the preview is what gets recorded.
// Every visual and recording option is read from window.settings (see settings.js).
(function () {
  'use strict';

  const { t, weatherText } = window.i18n;
  const cfg = window.settings;

  // ---------- constants ----------

  const RESOLUTIONS = { '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440], '2160p': [3840, 2160] };
  const CHIP_MS = 4500;
  const FONTS = {
    mono: '"Cascadia Mono","JetBrains Mono","SF Mono",Menlo,Consolas,"Microsoft YaHei","PingFang SC",monospace',
    sans: '"Segoe UI Variable Text","Segoe UI","Microsoft YaHei","PingFang SC",sans-serif'
  };
  const SANS = FONTS.sans;
  const CJK = '\\u3400-\\u9fff\\uf900-\\ufaff';

  // ---------- elements and state ----------

  const $ = (id) => document.getElementById(id);
  const cv = $('view');
  const ctx = cv.getContext('2d', { alpha: false });
  const recBtn = $('rec'), nameIn = $('name'), topicIn = $('topic'), statusEl = $('status');
  let camSel = null, micSel = null;     // created by the settings panel

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;

  // Canvas size and HUD scale. The HUD is laid out on a 1280x720 grid and scaled to the canvas.
  let W = 1920, H = 1080, S = 1.5;
  // Look, refreshed from settings by readLook().
  let FG = '#E8F1F2', DIM = 'rgba(232,241,242,0.78)', LINE = 'rgba(232,241,242,0.25)', AC = '#6FE3E1', REC = '#FF8A4C';
  let FONT = FONTS.mono, A = 1, SHADOW = true;

  let videoStream = null, audioStream = null;
  let audioCtx = null, analyser = null, freq = null, timeBuf = null;
  let recorder = null, recording = false, recStart = 0, chain = Promise.resolve();
  let info = { number: 1, day: 1, dir: '', name: '', topic: '', city: '', rss: '' };
  let stats = { freeBytes: null, gpu: null };
  let env = { city: '', weather: null, news: [], newsError: null };
  let fps = 60, lastT = performance.now();
  let levelDb = -60, peakDb = -60, peakHold = 0;
  let talkRatio = 0, voicedHold = 0;    // share of recent time with voice activity
  let fit = { ox: 0, oy: 0, dw: W, dh: H };   // where the camera frame sits on the canvas
  let captionsOn = false, capLanguage = 'chinese';
  let pcmCtx = null;
  let cap = { text: '', at: -1e9, final: true };
  let cues = [], spoken = [], chips = [], marks = [], keywords = [];
  let chapterToastAt = -1e9;
  let lastStatus = null;                // { key, vars } so the status line can be re-translated

  const pad = (n, l) => String(Math.floor(n)).padStart(l || 2, '0');
  const remember = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };
  const recall = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const errorText = (e) => {
    if (!e) return t('status.unknown');
    const known = t('errors.' + e);
    return known === 'errors.' + e ? String(e) : known;
  };

  // Diagnostics go to the app log file via the main process; failures here are ignored.
  function logLine(level, message) {
    try { window.api.logWrite(level, message); } catch (e) { /* logging is best effort */ }
  }
  window.addEventListener('error', (e) => logLine('error', (e.message || 'error') + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0)));
  window.addEventListener('unhandledrejection', (e) => logLine('error', 'unhandled rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason))));

  function setStatus(key, vars) {
    lastStatus = { key, vars };
    statusEl.textContent = t(key, vars);
  }
  function setStatusText(text) {
    lastStatus = null;
    statusEl.textContent = text;
  }

  // ---------- settings-driven state ----------

  function rgba(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function readLook() {
    FG = cfg.get('look.text');
    DIM = rgba(FG, 0.78);
    LINE = rgba(FG, 0.25);
    AC = cfg.get('look.accent');
    REC = cfg.get('look.rec');
    FONT = FONTS[cfg.get('look.font')] || FONTS.mono;
    A = Math.max(0.3, Math.min(1, cfg.get('look.opacity') / 100));
    SHADOW = !!cfg.get('look.shadow');
  }

  // Interface theme: sets the page palette and asks the main process to recolour the system
  // window buttons to match.
  function applyTheme() {
    const theme = cfg.get('general.theme') === 'dark' ? 'dark' : 'light';
    document.body.dataset.theme = theme;
    try { window.api.setTheme(theme); } catch (e) { /* cosmetic only */ }
  }

  function applyResolution() {
    const r = RESOLUTIONS[cfg.get('video.resolution')] || RESOLUTIONS['1080p'];
    W = r[0]; H = r[1]; S = W / 1280;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }

  const frameMs = () => 1000 / (cfg.get('video.fps') === 30 ? 30 : 60) - 1.2;
  const show = (k) => !!cfg.get('hud.' + k);
  function alpha(x) { ctx.globalAlpha = A * x; }

  // ---------- devices ----------

  async function getStream(constraints) {
    try { return await navigator.mediaDevices.getUserMedia(constraints); }
    catch (e) {
      logLine('warn', 'getUserMedia failed for ' + (constraints.video ? 'camera' : 'microphone') + ': ' + e.name + ': ' + e.message);
      return null;
    }
  }

  function stopTracks(s) { if (s) s.getTracks().forEach((tr) => tr.stop()); }

  async function startVideo() {
    stopTracks(videoStream);
    const id = camSel.value;
    videoStream = await getStream({
      video: {
        deviceId: id ? { exact: id } : undefined,
        width: { ideal: W }, height: { ideal: H }, frameRate: { ideal: cfg.get('video.fps') }
      }
    });
    if (videoStream) {
      video.srcObject = videoStream;
      try { await video.play(); } catch (e) { /* play() can reject while the stream settles */ }
    } else {
      video.srcObject = null;
    }
  }

  async function startAudio() {
    stopTracks(audioStream);
    const id = micSel.value;
    audioStream = await getStream({
      audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: false, noiseSuppression: true }
    });
    analyser = null;
    if (audioStream) {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch (e) { /* stays silent */ } }
      const src = audioCtx.createMediaStreamSource(audioStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      src.connect(analyser);          // analysis only; never routed to the speakers
      freq = new Uint8Array(analyser.frequencyBinCount);
      timeBuf = new Float32Array(analyser.fftSize);
    }
    if (captionsOn) attachPcm().catch((e) => logLine('warn', 'captions: could not attach to the microphone: ' + e.message));
  }

  async function fillDevices() {
    const list = await navigator.mediaDevices.enumerateDevices();
    const fill = (sel, kind, fallbackKey) => {
      const cur = sel.value;
      sel.textContent = '';
      list.filter((d) => d.kind === kind).forEach((d, i) => {
        const o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || t(fallbackKey, { n: i + 1 });
        sel.appendChild(o);
      });
      if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
    };
    fill(camSel, 'videoinput', 'ui.cameraN');
    fill(micSel, 'audioinput', 'ui.microphoneN');
  }

  function reportDevices() {
    setStatusText(t(videoStream ? 'status.camOk' : 'status.camNone') + ' · ' +
      t(audioStream ? 'status.micOk' : 'status.micNone'));
  }

  // ---------- live captions ----------

  // Feed the microphone to the captions process as 16 kHz mono blocks.
  async function attachPcm() {
    detachPcm();
    if (!audioStream) return;
    const c = new AudioContext({ sampleRate: 16000 });
    pcmCtx = c;
    await c.audioWorklet.addModule('pcm-worklet.js');
    if (pcmCtx !== c) { try { c.close(); } catch (e) { /* superseded */ } return; }
    const src = c.createMediaStreamSource(audioStream);
    const tap = new AudioWorkletNode(c, 'pcm-tap');
    tap.port.onmessage = (e) => window.api.asrAudio(e.data);
    const mute = c.createGain();
    mute.gain.value = 0;             // keeps the graph running without playing the microphone back
    src.connect(tap);
    tap.connect(mute);
    mute.connect(c.destination);
  }

  function detachPcm() {
    if (pcmCtx) { try { pcmCtx.close(); } catch (e) { /* already closed */ } }
    pcmCtx = null;
  }

  // Each CJK character counts as one unit, each run of other letters or digits as one word.
  function countUnits(s) {
    const cjk = (s.match(new RegExp('[' + CJK + ']', 'g')) || []).length;
    const words = (s.replace(new RegExp('[' + CJK + ']', 'g'), ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
    return cjk + words;
  }

  function speakingRate() {
    let units = 0, dur = 0;
    for (const s of spoken) { units += s.units; dur += s.dur; }
    return dur >= 3 ? units / dur * 60 : null;
  }

  function readKeywords() {
    keywords = String(cfg.get('speech.keywords') || '').split(/[,，、]/).map((k) => k.trim()).filter(Boolean).slice(0, 30);
  }

  function onAsr(m) {
    if (!m) return;
    if (m.type === 'progress') { setStatus('status.capDownloading', { pct: m.pct }); return; }
    if (m.type !== 'text' || !m.text || !captionsOn) return;
    const now = performance.now();
    cap = { text: m.text, at: now, final: m.final };
    if (!m.final) return;
    spoken.push({ at: now, units: countUnits(m.text), dur: m.dur });
    while (spoken.length && now - spoken[0].at > 90000) spoken.shift();
    if (recording) {
      // Timing is approximate: the utterance ended roughly one inference time ago.
      const end = Math.max(0, (now - recStart - m.ms) / 1000);
      cues.push({ start: Math.max(0, end - m.dur), end, text: m.text });
    }
    const lower = m.text.toLowerCase();
    keywords.forEach((k) => {
      if (lower.indexOf(k.toLowerCase()) >= 0) {
        chips.push({ text: k, at: now });
        if (chips.length > 3) chips.shift();
      }
    });
  }

  async function setCaptions(on) {
    if (!on) {
      captionsOn = false;
      detachPcm();
      window.api.asrStop();
      cap.text = '';
      setStatus('status.capOff');
      return;
    }
    setStatus('status.capLoading');
    try {
      await window.api.asrStart({ model: cfg.get('speech.capModel'), language: capLanguage });
      captionsOn = true;
      await attachPcm();
      setStatus('status.capOn');
    } catch (err) {
      captionsOn = false;
      cfg.sync('speech.captions', false);
      setStatus('status.capFail', { error: err && err.message ? err.message : t('status.unknown') });
    }
  }

  async function setFace(on) {
    if (!on) {
      window.faceTracker.stop();
      setStatus('status.faceOff');
      return;
    }
    setStatus('status.faceLoading');
    try {
      await window.faceTracker.start();
      setStatus('status.faceOn');
    } catch (err) {
      cfg.sync('speech.face', false);
      setStatus('status.faceFail', { error: err && err.message ? err.message : t('status.unknown') });
    }
  }

  async function setHands(on) {
    if (!on) {
      window.handTracker.stop();
      setStatus('status.handsOff');
      return;
    }
    setStatus('status.handsLoading');
    try {
      await window.handTracker.start();
      setStatus('status.handsOn');
    } catch (err) {
      cfg.sync('speech.hands', false);
      setStatus('status.handsFail', { error: err && err.message ? err.message : t('status.unknown') });
    }
  }

  function markChapter() {
    if (!recording) return;
    marks.push((performance.now() - recStart) / 1000);
    chapterToastAt = performance.now();
  }

  // ---------- recording ----------

  function pickMime() {
    const mp4 = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
    const webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const candidates = cfg.get('video.format') === 'webm' ? webm.concat(mp4) : mp4.concat(webm);
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  }

  function setRecordingUi(on) {
    const label = t(on ? 'ui.recStop' : 'ui.recStart');
    recBtn.setAttribute('aria-label', label);
    recBtn.title = label;
    recBtn.classList.toggle('on', on);
    $('mark').disabled = !on;
    cfg.setLocked(on);
  }

  async function startRec() {
    recBtn.disabled = true;
    try {
      const mime = pickMime();
      const ext = mime.indexOf('video/mp4') === 0 ? 'mp4' : 'webm';
      const out = cv.captureStream(cfg.get('video.fps') === 30 ? 30 : 60);
      const at = audioStream && audioStream.getAudioTracks()[0];
      if (at) out.addTrack(at);
      const file = await window.api.recStart(ext);
      const opts = {
        videoBitsPerSecond: Math.max(1, Number(cfg.get('video.bitrate')) || 8) * 1000000,
        audioBitsPerSecond: (Number(cfg.get('video.audio')) || 192) * 1000
      };
      if (mime) opts.mimeType = mime;
      recorder = new MediaRecorder(out, opts);
      logLine('info', 'recorder format: ' + (recorder.mimeType || mime || 'default') + ', audio track: ' + (at ? 'yes' : 'no') +
        ', ' + W + 'x' + H + '@' + cfg.get('video.fps') + ', target bitrate: ' + opts.videoBitsPerSecond);

      // Chunks are written strictly in order: each write waits for the previous one.
      chain = Promise.resolve();
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) {
          chain = chain.then(() => e.data.arrayBuffer()).then((b) => window.api.recChunk(b))
            .catch((err) => setStatus('status.writeError', { error: err.message }));
        }
      };
      recorder.onerror = (e) => setStatus('status.recError', { error: e.error ? e.error.message : t('status.unknown') });
      recorder.onstop = async () => {
        await chain;
        const r = await window.api.recStop({ marks, cues, chapterLabel: t('hud.chapterWord') });
        info = Object.assign(info, await window.api.logInfo());
        recorder = null;
        setRecordingUi(false);
        recBtn.disabled = false;
        setStatus('status.saved', { file: r.file });
      };

      recorder.start(1000);
      marks = [];
      cues = [];
      recording = true;
      recStart = performance.now();
      setRecordingUi(true);
      setStatusText(t('status.recordingTo', { file, format: ext === 'mp4' ? 'MP4 (H.264)' : 'WebM' }) +
        (at ? '' : t('status.silent')));
    } catch (err) {
      try { await window.api.recAbort(); } catch (e) { /* nothing to abort */ }
      recorder = null;
      recording = false;
      setRecordingUi(false);
      setStatus('status.startError', { error: err.message });
      logLine('error', 'could not start recording: ' + err.message);
    }
    recBtn.disabled = false;
  }

  function stopRec() {
    if (!recorder) return;
    recBtn.disabled = true;
    recording = false;
    recorder.stop();
  }

  // ---------- audio metering ----------

  function updateAudio(dt) {
    if (!analyser) { levelDb = -60; peakDb = -60; return; }
    analyser.getByteFrequencyData(freq);
    analyser.getFloatTimeDomainData(timeBuf);
    let sum = 0;
    for (let i = 0; i < timeBuf.length; i++) sum += timeBuf[i] * timeBuf[i];
    const rms = Math.sqrt(sum / timeBuf.length);
    const db = Math.max(-60, Math.min(0, 20 * Math.log10(rms || 1e-6)));
    levelDb += (db - levelDb) * 0.25;
    if (db > peakDb) { peakDb = db; peakHold = 1.5; }
    else { peakHold -= dt; if (peakHold <= 0) peakDb = Math.max(-60, peakDb - 20 * dt); }

    // Voice activity with a short hangover, smoothed over roughly the last 30 seconds.
    if (db > -42) voicedHold = 0.3; else voicedHold = Math.max(0, voicedHold - dt);
    talkRatio += ((voicedHold > 0 ? 1 : 0) - talkRatio) * (1 - Math.exp(-dt / 30));
  }

  // ---------- HUD drawing (coordinates are on the 1280x720 design grid) ----------

  function text(s, x, y, size, color, o) {
    o = o || {};
    ctx.font = (o.weight || 400) + ' ' + size + 'px ' + FONT;
    ctx.fillStyle = color;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = 'top';
    try { ctx.letterSpacing = (o.ls || 0) + 'px'; } catch (e) { /* older Chromium */ }
    ctx.fillText(s, x, y);
  }
  function line(x1, y1, x2, y2, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w || 1;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function corner(x, y, dx, dy) {
    ctx.strokeStyle = FG; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 36 * dx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + 36 * dy); ctx.stroke();
  }
  function row(x, y, label, value, align) {
    text(label, x, y, 11, DIM, { ls: 2, align });
    text(value, x, y + 16, 15, FG, { align });
  }
  function section(x, y, label, align) {
    text(label, x, y, 11, AC, { ls: 3, align });
    const x0 = align === 'right' ? x - 190 : x;
    line(x0, y + 22, x0 + 190, y + 22, LINE, 1);
  }
  function fitText(s, maxWidth) {
    if (ctx.measureText(s).width <= maxWidth) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
    return s + '…';
  }
  function shadowOn() {
    ctx.shadowColor = SHADOW ? 'rgba(0,0,0,0.75)' : 'transparent';
    ctx.shadowBlur = SHADOW ? 4 : 0;
  }

  // Face frame, horizon line and head pose, positioned from normalised video coordinates.
  function drawFace(f) {
    const mirror = !!cfg.get('video.mirror');
    const gx = (nx) => (fit.ox + (mirror ? 1 - nx : nx) * fit.dw) / S;
    const gy = (ny) => (fit.oy + ny * fit.dh) / S;
    const padX = (f.box.x1 - f.box.x0) * 0.12, padY = (f.box.y1 - f.box.y0) * 0.12;
    const xa = gx(f.box.x0 - padX), xb = gx(f.box.x1 + padX);
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    const y0 = gy(f.box.y0 - padY), y1 = gy(f.box.y1 + padY);
    const L = 22;
    ctx.strokeStyle = AC; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0 + L, y0); ctx.lineTo(x0, y0); ctx.lineTo(x0, y0 + L);
    ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
    ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
    ctx.moveTo(x1 - L, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - L);
    ctx.stroke();

    // Horizon ticks either side of the face, tilted with the head roll.
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, half = (x1 - x0) / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((mirror ? -f.roll : f.roll) / 180 * Math.PI);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-half - 50, 0); ctx.lineTo(-half - 6, 0);
    ctx.moveTo(half + 6, 0); ctx.lineTo(half + 50, 0);
    ctx.stroke();
    ctx.restore();

    // Readouts go under the face frame, or above it when that space belongs to the captions
    // and name plate.
    const deg = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '°';
    const lines = [t('hud.pose', { y: deg(f.yaw), p: deg(f.pitch), r: deg(f.roll) })];
    if (f.eyes) {
      // A glance to the image's left is the same direction on screen unless the picture is mirrored.
      let dir = f.gaze;
      if (mirror && (dir === 'left' || dir === 'right')) dir = dir === 'left' ? 'right' : 'left';
      const rate = window.faceTracker.blinkRate;
      lines.push(t('hud.gaze', { d: t('hud.gaze_' + dir) }) + (rate === null ? '' : '  ' + t('hud.blinks', { n: Math.round(rate) })));
    }
    const below = y1 + 8 + lines.length * 18 < 530;
    if (below) {
      text(t('hud.faceLocked'), x0, y0 - 20, 11, AC, { ls: 2 });
      lines.forEach((ln, i) => text(ln, x0, y1 + 8 + i * 18, 11, DIM, { ls: 2 }));
    } else {
      const top = Math.max(104, y0 - 20 - lines.length * 18);
      text(t('hud.faceLocked'), x0, top, 11, AC, { ls: 2 });
      lines.forEach((ln, i) => text(ln, x0, top + 18 + i * 18, 11, DIM, { ls: 2 }));
    }

    // Optional iris markers: a short tick under each eye that follows the iris sideways.
    // Deliberately not drawn on the eye itself, which reads as unsettling on a face.
    if (f.eyes && show('eyes')) {
      ctx.strokeStyle = AC; ctx.lineWidth = 1.5;
      ctx.beginPath();
      f.eyes.forEach((e) => {
        const r = Math.max(3, e.r * fit.dh / S);
        const ex = gx(e.x), ey = gy(e.y) + r * 3.2;
        ctx.moveTo(ex - r, ey); ctx.lineTo(ex + r, ey);
      });
      ctx.stroke();
    }
  }

  // Hand skeletons with a gesture label and a position readout per hand.
  const GESTURE_KEYS = { open: 'hud.gOpen', fist: 'hud.gFist', point: 'hud.gPoint', peace: 'hud.gPeace', rock: 'hud.gRock', thumb: 'hud.gThumb', pinch: 'hud.gPinch', ok: 'hud.gOk' };
  function drawHands(list) {
    const mirror = !!cfg.get('video.mirror');
    const gx = (nx) => (fit.ox + (mirror ? 1 - nx : nx) * fit.dw) / S;
    const gy = (ny) => (fit.oy + ny * fit.dh) / S;
    const tracker = window.handTracker;
    list.forEach((h) => {
      const pts = h.lm.map((p) => [gx(p.x), gy(p.y)]);

      // Bones
      ctx.strokeStyle = AC; ctx.lineWidth = 1.2;
      ctx.beginPath();
      tracker.CONNECTIONS.forEach((c) => { ctx.moveTo(pts[c[0]][0], pts[c[0]][1]); ctx.lineTo(pts[c[1]][0], pts[c[1]][1]); });
      ctx.stroke();

      // Joints, with larger markers on the fingertips
      ctx.fillStyle = FG;
      pts.forEach((p) => ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3));
      const names = ['thumb', 'index', 'middle', 'ring', 'pinky'];
      tracker.TIPS.forEach((i, n) => {
        const on = h.fingers[names[n]];
        ctx.strokeStyle = on ? AC : DIM; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], on ? 5 : 3.5, 0, Math.PI * 2); ctx.stroke();
      });

      // Label above the hand, position below it
      const xa = gx(h.box.x0), xb = gx(h.box.x1);
      const x0 = Math.min(xa, xb), y0 = gy(h.box.y0), y1 = gy(h.box.y1);
      // With a mirrored picture the person's right hand appears on the right of the frame,
      // but it is still their right hand, so the label does not change.
      const side = t(h.side === 'left' ? 'hud.handLeft' : h.side === 'right' ? 'hud.handRight' : 'hud.hand');
      const gesture = GESTURE_KEYS[h.gesture] ? t(GESTURE_KEYS[h.gesture]) : t('hud.gCount', { n: h.count });
      text(side + ' · ' + gesture, x0, y0 - 22, 11, AC, { ls: 2 });
      const px = Math.round((mirror ? 1 - h.center.x : h.center.x) * 100), py = Math.round(h.center.y * 100);
      text('X ' + px + '%  Y ' + py + '%', x0, y1 + 10, 11, DIM, { ls: 2 });
    });
  }

  function drawHud(now) {
    if (!show('show')) return;
    alpha(1);
    shadowOn();

    // Frame corners and edge rulers
    if (show('corners')) {
      corner(32, 32, 1, 1); corner(1248, 32, -1, 1); corner(32, 688, 1, -1); corner(1248, 688, -1, -1);
    }
    if (show('rulers')) {
      alpha(0.4);
      for (let y = 120; y <= 600; y += 12) { line(40, y, 47, y, FG, 1); line(1233, y, 1240, y, FG, 1); }
      alpha(1);
    }

    // Top left: recording state and log number
    if (show('status')) {
      if (recording) {
        if (Math.floor(now / 600) % 2 === 0) {
          ctx.fillStyle = REC; ctx.beginPath(); ctx.arc(66, 65, 6, 0, Math.PI * 2); ctx.fill();
        }
        text('REC', 84, 56, 16, REC, { weight: 700, ls: 3 });
      } else {
        ctx.strokeStyle = DIM; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(66, 65, 5.5, 0, Math.PI * 2); ctx.stroke();
        text(t('hud.standby'), 84, 56, 16, DIM, { weight: 700, ls: 3 });
      }
      line(144, 56, 144, 74, rgba(FG, 0.4), 1);
      text(t('hud.log', { n: String(info.number).padStart(3, '0') }), 157, 56, 16, FG, { ls: 2 });
    }
    if (show('chapter') && recording) text(t('hud.chapter', { n: marks.length + 1 }), 84, 82, 11, AC, { ls: 2 });

    // Top right: timecode and wall clock
    if (show('timecode')) {
      const el = recording ? (now - recStart) / 1000 : 0;
      const tc = pad(el / 3600) + ':' + pad((el / 60) % 60) + ':' + pad(el % 60) + ':' + pad((el * 60) % 60);
      text(tc, 1220, 50, 26, FG, { weight: 500, ls: 2, align: 'right' });
    }
    if (show('clock')) {
      const d = new Date();
      const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' · ' +
        pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      text(stamp, 1220, show('timecode') ? 86 : 58, 12, DIM, { ls: 2, align: 'right' });
    }

    // Top centre: rotating news headline
    const news = (env.news || []).slice(0, Math.max(1, Number(cfg.get('info.newsMax')) || 12));
    if (show('news') && news.length) {
      const slot = Math.max(4, Number(cfg.get('info.newsSeconds')) || 8) * 1000;
      const idx = Math.floor(now / slot) % news.length;
      const ph = (now % slot) / slot;
      alpha(Math.max(0, Math.min(1, ph / 0.06, (1 - ph) / 0.06)));
      text(t('hud.news', { i: idx + 1, n: news.length }), 640, 52, 11, AC, { ls: 3, align: 'center' });
      ctx.font = '400 15px ' + FONT;
      try { ctx.letterSpacing = '0px'; } catch (e) { /* older Chromium */ }
      text(fitText(news[idx], 560), 640, 72, 15, FG, { align: 'center' });
      alpha(1);
    }

    // Left column: device
    let y = 150;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (show('device')) {
      const rows = [];
      if (show('devCamera')) rows.push([t('hud.camera'), vw ? vw + ' × ' + vh : t('hud.notConnected')]);
      if (show('devFps')) rows.push([t('hud.fps'), Math.round(fps) + ' FPS']);
      if (show('devStorage') && stats.freeBytes != null) rows.push([t('hud.storage'), (stats.freeBytes / 1073741824).toFixed(0) + ' GB']);
      if (show('devGpu') && stats.gpu) {
        rows.push([t('hud.gpu'), Math.round(stats.gpu.util) + '% · ' + Math.round(stats.gpu.temp) + '°C']);
        rows.push([t('hud.vram'), (stats.gpu.memMB / 1024).toFixed(1) + ' GB']);
      }
      if (rows.length) {
        section(64, y, t('hud.device'));
        y += 36;
        rows.forEach((r) => { row(64, y, r[0], r[1]); y += 46; });
        y += 10;
      }
    }

    // Left column: speaker analysis (only while a speech feature is switched on)
    const tracker = window.faceTracker;
    const faceOn = tracker.state === 'on';
    if (show('speaker') && (faceOn || captionsOn)) {
      section(64, y, t('hud.speaker'));
      y += 36;
      if (faceOn) {
        row(64, y, t('hud.eyeContact'), tracker.eyeContact === null ? '—' : Math.round(tracker.eyeContact * 100) + '%'); y += 46;
      }
      row(64, y, t('hud.talk'), analyser ? Math.round(talkRatio * 100) + '%' : '—'); y += 46;
      if (captionsOn) {
        const rate = speakingRate();
        row(64, y, t('hud.rate'), rate === null ? '—' : Math.round(rate) + ' ' + t(capLanguage === 'english' ? 'hud.wpm' : 'hud.cpm'));
      }
    }
    if (show('faceFrame') && faceOn && tracker.face) drawFace(tracker.face);
    if (show('hands') && window.handTracker.state === 'on' && window.handTracker.hands.length) drawHands(window.handTracker.hands);

    // Right column: audio
    y = 150;
    if (show('audio')) {
      section(1216, y, t('hud.audio'), 'right');
      y += 36;
      row(1216, y, t('hud.level'), analyser ? Math.round(levelDb) + ' dB' : t('hud.notConnected'), 'right');
      ctx.fillStyle = rgba(FG, 0.2); ctx.fillRect(1096, y + 40, 120, 3);
      ctx.fillStyle = AC; ctx.fillRect(1096, y + 40, 120 * (levelDb + 60) / 60, 3);
      y += 58;
      row(1216, y, t('hud.peak'), analyser ? Math.round(peakDb) + ' dB' : '—', 'right');
      y += 66;
    }

    // Right column: environment
    if (show('env') && env.weather) {
      const w = env.weather;
      const imperial = cfg.get('info.units') === 'imperial';
      const temp = imperial ? Math.round(w.temp * 9 / 5 + 32) + '°F' : Math.round(w.temp) + '°C';
      const wind = imperial ? Math.round(w.wind * 0.621) + ' mph' : Math.round(w.wind) + ' km/h';
      const rows = [];
      if (show('envLocation')) rows.push([t('hud.location'), String(cfg.get('info.label') || '').trim() || env.city || '—']);
      if (show('envWeather')) rows.push([t('hud.weather'), temp + ' · ' + weatherText(w.code)]);
      if (show('envWind')) rows.push([t('hud.humidityWind'), Math.round(w.humidity) + '% · ' + wind]);
      if (show('envAir') && w.aqi != null) rows.push([t('hud.air'), 'AQI ' + Math.round(w.aqi)]);
      if (show('envSun') && w.sunrise && w.sunset) rows.push([t('hud.sun'), w.sunrise + ' / ' + w.sunset]);
      if (rows.length) {
        section(1216, y, t('hud.env'), 'right');
        y += 36;
        rows.forEach((r) => { row(1216, y, r[0], r[1], 'right'); y += 46; });
      }
    }

    // Bottom left: name plate
    if (show('nameplate')) {
      line(61, 610, 61, 664, AC, 2);
      text(info.name || t('hud.yourName'), 76, 610, 22, FG, { weight: 700, ls: 1 });
      text(t('hud.day', { d: info.day, topic: info.topic || t('hud.topic') }), 76, 645, 13, DIM, { ls: 1 });
    }

    // Bottom right: spectrum
    if (show('spectrum')) {
      for (let i = 0; i < 28; i++) {
        const v = analyser ? freq[i + 1] / 255 : 0;
        const h = 2 + v * 42;
        ctx.fillStyle = h > 5 ? AC : rgba(FG, 0.35);
        ctx.fillRect(1000 + i * 8, 640 - h, 4, h);
      }
      text(t('hud.mic', { v: analyser ? Math.round(levelDb) + ' dB' : t('hud.notConnected') }), 1220, 650, 12, DIM, { ls: 2, align: 'right' });
    }

    // Chapter announcement, shown briefly after a marker is added
    const toastAge = now - chapterToastAt;
    if (show('chapter') && toastAge < 2500) {
      alpha(Math.min(1, toastAge / 200, (2500 - toastAge) / 500));
      text('▸ ' + t('hud.chapter', { n: marks.length + 1 }), 640, 122, 16, AC, { weight: 700, ls: 3, align: 'center' });
      alpha(1);
    }

    if (show('chips')) drawChips(now);
    if (show('captions')) drawCaptions(now);

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  // Break caption text into lines: CJK characters can break anywhere, other words stay whole.
  function wrapText(s, maxWidth) {
    const tokens = s.match(new RegExp('[' + CJK + '\\u3000-\\u303f\\uff00-\\uffef]|[^\\s' + CJK + '\\u3000-\\u303f\\uff00-\\uffef]+\\s*|\\s+', 'g')) || [];
    const lines = [];
    let cur = '';
    for (const tok of tokens) {
      if (cur && ctx.measureText(cur + tok).width > maxWidth) { lines.push(cur.trim()); cur = tok; }
      else cur += tok;
    }
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }

  function drawCaptions(now) {
    const hold = Math.max(3, Number(cfg.get('speech.capHold')) || 6) * 1000;
    const age = now - cap.at;
    if (!captionsOn || !cap.text || age > hold) return;
    const size = Math.max(14, Math.min(30, Number(cfg.get('speech.capSize')) || 19));
    const lh = Math.round(size * 1.45);
    ctx.save();
    ctx.globalAlpha = A * Math.min(1, (hold - age) / 800);
    ctx.font = '400 ' + size + 'px ' + SANS;
    try { ctx.letterSpacing = '0px'; } catch (e) { /* older Chromium */ }
    const lines = wrapText(cap.text, 600).slice(-2);
    const h = lines.length * lh + 20, y0 = 628 - h;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(6,10,12,0.55)';
    ctx.fillRect(320, y0, 640, h);
    line(320, y0, 960, y0, LINE, 1);
    ctx.fillStyle = cap.final ? FG : DIM;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((ln, i) => ctx.fillText(ln, 640, y0 + 12 + i * lh));
    ctx.restore();
  }

  function drawChips(now) {
    chips = chips.filter((c) => now - c.at < CHIP_MS);
    chips.forEach((c, i) => {
      const age = now - c.at;
      const label = '◆ ' + c.text.toUpperCase();
      ctx.save();
      ctx.globalAlpha = A * Math.min(1, age / 300, (CHIP_MS - age) / 600);
      ctx.font = '400 13px ' + FONT;
      try { ctx.letterSpacing = '1px'; } catch (e) { /* older Chromium */ }
      const w = ctx.measureText(label).width + 22, y = 516 - (chips.length - 1 - i) * 32;
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(6,10,12,0.55)';
      ctx.fillRect(320, y, w, 26);
      ctx.strokeStyle = AC; ctx.lineWidth = 1;
      ctx.strokeRect(320.5, y + 0.5, w - 1, 25);
      ctx.fillStyle = AC;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(label, 331, y + 6);
      ctx.restore();
    });
  }

  function draw(now) {
    requestAnimationFrame(draw);
    if (now - lastT < frameMs()) return;
    const dt = Math.max(0.001, (now - lastT) / 1000);
    lastT = now;
    fps += ((1 / dt) - fps) * 0.05;
    updateAudio(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#10161A';
    ctx.fillRect(0, 0, W, H);
    const hasVideo = video.readyState >= 2 && video.videoWidth;
    if (hasVideo) {
      // Fit the camera frame into the canvas: "cover" crops, "contain" letterboxes.
      const rx = W / video.videoWidth, ry = H / video.videoHeight;
      const sc = cfg.get('video.fit') === 'contain' ? Math.min(rx, ry) : Math.max(rx, ry);
      const dw = video.videoWidth * sc, dh = video.videoHeight * sc;
      fit = { ox: (W - dw) / 2, oy: (H - dh) / 2, dw, dh };
      if (cfg.get('video.mirror')) {
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, fit.ox, fit.oy, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(video, fit.ox, fit.oy, dw, dh);
      }
      window.faceTracker.update(video, now);
      window.handTracker.update(video, now);
    }
    ctx.setTransform(S, 0, 0, S, 0, 0);
    if (!hasVideo) text(t('hud.noCamera'), 640, 352, 14, '#9FB0B5', { ls: 2, align: 'center' });
    drawHud(now);
  }

  // ---------- startup ----------

  async function init() {
    if (/Mac/i.test(navigator.platform)) document.body.classList.add('mac');

    // Build the settings panel first: it creates the camera and microphone selects.
    cfg.build($('tabs'), $('sections'));
    camSel = $('cam');
    micSel = $('mic');
    const langSel = $('lang');
    window.i18n.apply();
    applyTheme();
    readLook();
    applyResolution();
    readKeywords();
    setRecordingUi(false);

    info = Object.assign(info, await window.api.logInfo());
    nameIn.value = info.name;
    topicIn.value = info.topic;
    $('outDir').textContent = info.dir;
    cfg.sync('info.city', info.city || '');
    cfg.sync('info.feed', info.rss || '');
    cfg.sync('info.preset', (function (v) { const hit = cfg.NEWS_PRESETS.find((p) => p.url === v); return !v ? 'off' : hit ? hit.id : 'custom'; })(String(info.rss || '').trim()));

    capLanguage = cfg.get('speech.capLang') || (window.i18n.lang === 'zh-CN' ? 'chinese' : 'english');
    cfg.sync('speech.capLang', capLanguage);

    await startVideo();
    await startAudio();
    await fillDevices();
    if (videoStream) {
      const s = videoStream.getVideoTracks()[0].getSettings();
      if (s.deviceId) camSel.value = s.deviceId;
    }
    if (audioStream) {
      const s = audioStream.getAudioTracks()[0].getSettings();
      if (s.deviceId) micSel.value = s.deviceId;
    }

    // Restore the camera and microphone chosen last time.
    const has = (sel, v) => !!v && [...sel.options].some((o) => o.value === v);
    const savedCam = recall('camId'), savedMic = recall('micId');
    if (has(camSel, savedCam) && camSel.value !== savedCam) { camSel.value = savedCam; await startVideo(); }
    if (has(micSel, savedMic) && micSel.value !== savedMic) { micSel.value = savedMic; await startAudio(); }
    reportDevices();
    const label = (sel) => (sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : 'none');
    logLine('info', 'camera: ' + (videoStream ? label(camSel) + ' ' + video.videoWidth + 'x' + video.videoHeight : 'none') +
      ', microphone: ' + (audioStream ? label(micSel) : 'none'));

    camSel.addEventListener('change', async () => { remember('camId', camSel.value); await startVideo(); reportDevices(); });
    micSel.addEventListener('change', async () => { remember('micId', micSel.value); await startAudio(); reportDevices(); });
    navigator.mediaDevices.addEventListener('devicechange', fillDevices);

    const saveProfile = () => {
      info.name = nameIn.value.trim();
      info.topic = topicIn.value.trim();
      window.api.saveProfile(info.name, info.topic);
    };
    nameIn.addEventListener('input', saveProfile);
    topicIn.addEventListener('input', saveProfile);

    // Environment and news
    const pollEnv = async () => { try { env = await window.api.envGet(); } catch (e) { /* keep the last reading */ } };
    const applyCity = async () => {
      const city = String(cfg.get('info.city') || '');
      setStatus('status.cityLoading');
      const res = await window.api.setCity(city, window.i18n.lang);
      await pollEnv();
      if (res.ok) setStatus(city.trim() ? 'status.envUpdated' : 'status.envOff');
      else setStatus('status.envFail', { error: errorText(res.error) });
    };
    // Keep the source menu in step with whatever is in the feed box.
    const presetFor = (value) => {
      const v = String(value || '').trim();
      if (!v) return 'off';
      const hit = cfg.NEWS_PRESETS.find((p) => p.url === v);
      return hit ? hit.id : 'custom';
    };
    const applyFeed = async () => {
      const url = String(cfg.get('info.feed') || '');
      cfg.sync('info.preset', presetFor(url));
      setStatus('status.feedLoading');
      const res = await window.api.setFeed(url);
      await pollEnv();
      if (res.ok) setStatus(url.trim() ? 'status.feedUpdated' : 'status.feedOff', { n: res.count });
      else setStatus('status.feedFail', { error: errorText(res.error) });
    };
    pollEnv();
    setTimeout(pollEnv, 4000);       // pick up the first weather and news fetch soon after launch
    setInterval(pollEnv, 30000);

    // React to settings as they change. Purely visual options need nothing here: the draw
    // loop reads them every frame.
    window.api.onAsr(onAsr);
    cfg.onChange((key, value) => {
      if (key.indexOf('look.') === 0) readLook();
      else if (key === 'general.theme') applyTheme();
      else if (key === 'video.resolution') { applyResolution(); startVideo(); }
      else if (key === 'video.fps') startVideo();
      else if (key === 'info.city') applyCity();
      else if (key === 'info.feed') applyFeed();
      else if (key === 'info.preset') {
        const preset = cfg.NEWS_PRESETS.find((p) => p.id === value);
        if (preset && preset.url !== undefined) { cfg.sync('info.feed', preset.url); applyFeed(); }
      }
      else if (key === 'speech.face') setFace(!!value);
      else if (key === 'speech.hands') setHands(!!value);
      else if (key === 'speech.captions') setCaptions(!!value);
      else if (key === 'speech.capModel') { if (cfg.get('speech.captions')) setCaptions(true); }
      else if (key === 'speech.capLang') { capLanguage = value; spoken = []; window.api.asrLanguage(value); }
      else if (key === 'speech.keywords') readKeywords();
    });
    cfg.onAction((action) => {
      if (action === 'openDir') window.api.openDir();
      else if (action === 'openLogs') window.api.openLogs();
      else if (action === 'chooseDir' || action === 'resetDir') {
        (action === 'chooseDir' ? window.api.chooseOutDir() : window.api.resetOutDir()).then((res) => {
          if (res.ok) {
            info.dir = res.dir;
            $('outDir').textContent = res.dir;
            setStatus('status.dirChanged', { dir: res.dir });
          } else if (!res.canceled) {
            setStatus('status.dirFail', { error: errorText(res.error) });
          }
        });
      }
      else if (action === 'reset' && !recording) { cfg.reset(); location.reload(); }
    });
    if (cfg.get('speech.face')) setFace(true);
    if (cfg.get('speech.hands')) setHands(true);
    if (cfg.get('speech.captions')) setCaptions(true);

    // Language
    langSel.value = window.i18n.lang;
    langSel.addEventListener('change', async () => {
      window.i18n.setLang(langSel.value);
      setRecordingUi(recording);
      await fillDevices();
      if (lastStatus) setStatus(lastStatus.key, lastStatus.vars); else reportDevices();
      if (String(cfg.get('info.city') || '').trim()) applyCity();   // re-resolve the city name in the new language
    });

    // Control bar state and settings drawer
    const stateEl = $('state'), gear = $('gear'), drawer = $('drawer');
    const updateState = () => {
      if (recording) {
        const el = (performance.now() - recStart) / 1000;
        stateEl.textContent = t('ui.recording', { t: pad(el / 3600) + ':' + pad((el / 60) % 60) + ':' + pad(el % 60) });
      } else {
        stateEl.textContent = t('ui.standby', { n: String(info.number).padStart(3, '0') });
      }
      stateEl.classList.toggle('on', recording);
    };
    updateState();
    setInterval(updateState, 250);

    const setDrawer = (open) => {
      drawer.classList.toggle('open', open);
      drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      gear.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    gear.addEventListener('click', () => setDrawer(!drawer.classList.contains('open')));
    $('closeDrawer').addEventListener('click', () => setDrawer(false));
    document.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (e.key === 'Escape') setDrawer(false);
      else if ((e.key === 'm' || e.key === 'M') && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') markChapter();
    });

    $('mark').addEventListener('click', markChapter);
    recBtn.addEventListener('click', () => { if (recorder) stopRec(); else startRec(); });
    $('open').addEventListener('click', () => window.api.openDir());

    const poll = async () => { try { stats = await window.api.sysStats(); } catch (e) { /* keep the last reading */ } };
    poll();
    setInterval(poll, 2000);

    requestAnimationFrame(draw);
  }

  init().catch((err) => {
    setStatus('status.initError', { error: err.message });
    logLine('error', 'startup failed: ' + err.message);
  });
})();
