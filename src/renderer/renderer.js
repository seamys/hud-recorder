// Renderer: captures camera and microphone, draws the video frame plus the HUD onto one
// 1080p canvas, and records that canvas. What you see in the preview is what gets recorded.
(function () {
  'use strict';

  const { t, weatherText } = window.i18n;

  // ---------- constants ----------

  const W = 1920, H = 1080;
  const S = W / 1280;                 // the HUD is laid out on a 1280x720 grid and scaled up
  const BITRATE = 12000000;           // video bitrate, bits per second
  const FRAME_MS = 15.5;              // draw at ~60 fps even on high refresh rate displays
  const NEWS_SLOT_MS = 8000;          // how long each headline stays on screen
  const FG = '#E8F1F2', DIM = '#B8C7CB', AC = '#6FE3E1', REC = '#FF8A4C';
  const MONO = '"Cascadia Mono","JetBrains Mono",Consolas,"Microsoft YaHei",monospace';

  // ---------- elements and state ----------

  const $ = (id) => document.getElementById(id);
  const cv = $('view');
  const ctx = cv.getContext('2d', { alpha: false });
  const camSel = $('cam'), micSel = $('mic'), recBtn = $('rec');
  const nameIn = $('name'), topicIn = $('topic'), statusEl = $('status');

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;

  let videoStream = null, audioStream = null;
  let audioCtx = null, analyser = null, freq = null, timeBuf = null;
  let recorder = null, recording = false, recStart = 0, chain = Promise.resolve();
  let info = { number: 1, day: 1, dir: '', name: '', topic: '', city: '', rss: '' };
  let stats = { freeBytes: null, gpu: null };
  let env = { city: '', weather: null, news: [], newsError: null };
  let fps = 60, lastT = performance.now();
  let levelDb = -60, peakDb = -60, peakHold = 0;
  let lastStatus = null;              // { key, vars } so the status line can be re-translated

  const pad = (n, l) => String(Math.floor(n)).padStart(l || 2, '0');
  const errorText = (e) => {
    if (!e) return t('status.unknown');
    const known = t('errors.' + e);
    return known === 'errors.' + e ? String(e) : known;
  };

  function setStatus(key, vars) {
    lastStatus = { key, vars };
    statusEl.textContent = t(key, vars);
  }
  function setStatusText(text) {
    lastStatus = null;
    statusEl.textContent = text;
  }

  // ---------- devices ----------

  async function getStream(constraints) {
    try { return await navigator.mediaDevices.getUserMedia(constraints); }
    catch (e) { return null; }
  }

  function stopTracks(s) { if (s) s.getTracks().forEach((tr) => tr.stop()); }

  async function startVideo() {
    stopTracks(videoStream);
    const id = camSel.value;
    videoStream = await getStream({
      video: {
        deviceId: id ? { exact: id } : undefined,
        width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 }
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
  }

  async function fillDevices() {
    const list = await navigator.mediaDevices.enumerateDevices();
    const fill = (sel, kind, fallbackKey) => {
      const cur = sel.value;
      sel.innerHTML = '';
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

  // ---------- recording ----------

  function pickMime() {
    const candidates = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  }

  function setRecordingUi(on) {
    const label = t(on ? 'ui.recStop' : 'ui.recStart');
    recBtn.setAttribute('aria-label', label);
    recBtn.title = label;
    recBtn.classList.toggle('on', on);
    camSel.disabled = on;
    micSel.disabled = on;
  }

  async function startRec() {
    recBtn.disabled = true;
    try {
      const mime = pickMime();
      const ext = mime.indexOf('video/mp4') === 0 ? 'mp4' : 'webm';
      const out = cv.captureStream(60);
      const at = audioStream && audioStream.getAudioTracks()[0];
      if (at) out.addTrack(at);
      const file = await window.api.recStart(ext);
      const opts = { videoBitsPerSecond: BITRATE, audioBitsPerSecond: 192000 };
      if (mime) opts.mimeType = mime;
      recorder = new MediaRecorder(out, opts);

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
        const r = await window.api.recStop();
        info = Object.assign(info, await window.api.logInfo());
        recorder = null;
        setRecordingUi(false);
        recBtn.disabled = false;
        setStatus('status.saved', { file: r.file });
      };

      recorder.start(1000);
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
  }

  // ---------- HUD drawing (coordinates are on the 1280x720 design grid) ----------

  function text(s, x, y, size, color, o) {
    o = o || {};
    ctx.font = (o.weight || 400) + ' ' + size + 'px ' + MONO;
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
    line(x0, y + 22, x0 + 190, y + 22, 'rgba(232,241,242,0.25)', 1);
  }
  function fitText(s, maxWidth) {
    if (ctx.measureText(s).width <= maxWidth) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
    return s + '…';
  }

  function drawHud(now) {
    // A soft shadow keeps the HUD readable over bright footage.
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 4;

    // Frame corners and edge rulers
    corner(32, 32, 1, 1); corner(1248, 32, -1, 1); corner(32, 688, 1, -1); corner(1248, 688, -1, -1);
    ctx.globalAlpha = 0.4;
    for (let y = 120; y <= 600; y += 12) { line(40, y, 47, y, FG, 1); line(1233, y, 1240, y, FG, 1); }
    ctx.globalAlpha = 1;

    // Top left: recording state and log number
    if (recording) {
      if (Math.floor(now / 600) % 2 === 0) {
        ctx.fillStyle = REC; ctx.beginPath(); ctx.arc(66, 65, 6, 0, Math.PI * 2); ctx.fill();
      }
      text('REC', 84, 56, 16, REC, { weight: 700, ls: 3 });
    } else {
      ctx.strokeStyle = DIM; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(66, 65, 5.5, 0, Math.PI * 2); ctx.stroke();
      text(t('hud.standby'), 84, 56, 16, DIM, { weight: 700, ls: 3 });
    }
    line(144, 56, 144, 74, 'rgba(232,241,242,0.4)', 1);
    text(t('hud.log', { n: String(info.number).padStart(3, '0') }), 157, 56, 16, FG, { ls: 2 });

    // Top right: timecode and wall clock
    const el = recording ? (now - recStart) / 1000 : 0;
    const tc = pad(el / 3600) + ':' + pad((el / 60) % 60) + ':' + pad(el % 60) + ':' + pad((el * 60) % 60);
    text(tc, 1220, 50, 26, FG, { weight: 500, ls: 2, align: 'right' });
    const d = new Date();
    const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' · ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    text(stamp, 1220, 86, 12, DIM, { ls: 2, align: 'right' });

    // Top centre: rotating news headline
    if (env.news && env.news.length) {
      const idx = Math.floor(now / NEWS_SLOT_MS) % env.news.length;
      const ph = (now % NEWS_SLOT_MS) / NEWS_SLOT_MS;
      ctx.globalAlpha = Math.max(0, Math.min(1, ph / 0.06, (1 - ph) / 0.06));
      text(t('hud.news', { i: idx + 1, n: env.news.length }), 640, 52, 11, AC, { ls: 3, align: 'center' });
      ctx.font = '400 15px ' + MONO;
      try { ctx.letterSpacing = '0px'; } catch (e) { /* older Chromium */ }
      text(fitText(env.news[idx], 560), 640, 72, 15, FG, { align: 'center' });
      ctx.globalAlpha = 1;
    }

    // Left column: device
    let y = 150;
    section(64, y, t('hud.device'));
    y += 36;
    const vw = video.videoWidth, vh = video.videoHeight;
    row(64, y, t('hud.camera'), vw ? vw + ' × ' + vh : t('hud.notConnected')); y += 46;
    row(64, y, t('hud.fps'), Math.round(fps) + ' FPS'); y += 46;
    if (stats.freeBytes != null) {
      row(64, y, t('hud.storage'), (stats.freeBytes / 1073741824).toFixed(0) + ' GB'); y += 46;
    }
    if (stats.gpu) {
      row(64, y, t('hud.gpu'), Math.round(stats.gpu.util) + '% · ' + Math.round(stats.gpu.temp) + '°C'); y += 46;
      row(64, y, t('hud.vram'), (stats.gpu.memMB / 1024).toFixed(1) + ' GB'); y += 46;
    }

    // Right column: audio
    y = 150;
    section(1216, y, t('hud.audio'), 'right');
    y += 36;
    row(1216, y, t('hud.level'), analyser ? Math.round(levelDb) + ' dB' : t('hud.notConnected'), 'right');
    ctx.fillStyle = 'rgba(232,241,242,0.2)'; ctx.fillRect(1096, y + 40, 120, 3);
    ctx.fillStyle = AC; ctx.fillRect(1096, y + 40, 120 * (levelDb + 60) / 60, 3);
    y += 58;
    row(1216, y, t('hud.peak'), analyser ? Math.round(peakDb) + ' dB' : '—', 'right');

    // Right column: environment
    if (env.weather) {
      const w = env.weather;
      y = 310;
      section(1216, y, t('hud.env'), 'right');
      y += 36;
      row(1216, y, t('hud.location'), env.city || '—', 'right'); y += 46;
      row(1216, y, t('hud.weather'), Math.round(w.temp) + '°C · ' + weatherText(w.code), 'right'); y += 46;
      row(1216, y, t('hud.humidityWind'), Math.round(w.humidity) + '% · ' + Math.round(w.wind) + ' km/h', 'right'); y += 46;
      if (w.aqi != null) { row(1216, y, t('hud.air'), 'AQI ' + Math.round(w.aqi), 'right'); y += 46; }
      if (w.sunrise && w.sunset) row(1216, y, t('hud.sun'), w.sunrise + ' / ' + w.sunset, 'right');
    }

    // Bottom left: name plate
    line(61, 610, 61, 664, AC, 2);
    text(info.name || t('hud.yourName'), 76, 610, 22, FG, { weight: 700, ls: 1 });
    text(t('hud.day', { d: info.day, topic: info.topic || t('hud.topic') }), 76, 645, 13, DIM, { ls: 1 });

    // Bottom right: spectrum
    for (let i = 0; i < 28; i++) {
      const v = analyser ? freq[i + 1] / 255 : 0;
      const h = 2 + v * 42;
      ctx.fillStyle = h > 5 ? AC : 'rgba(232,241,242,0.35)';
      ctx.fillRect(1000 + i * 8, 640 - h, 4, h);
    }
    text(t('hud.mic', { v: analyser ? Math.round(levelDb) + ' dB' : t('hud.notConnected') }), 1220, 650, 12, DIM, { ls: 2, align: 'right' });

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  function draw(now) {
    requestAnimationFrame(draw);
    if (now - lastT < FRAME_MS) return;
    const dt = Math.max(0.001, (now - lastT) / 1000);
    lastT = now;
    fps += ((1 / dt) - fps) * 0.05;
    updateAudio(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10161A';
    ctx.fillRect(0, 0, W, H);
    const hasVideo = video.readyState >= 2 && video.videoWidth;
    if (hasVideo) {
      // Cover-fit the camera frame into 16:9.
      const sc = Math.max(W / video.videoWidth, H / video.videoHeight);
      const dw = video.videoWidth * sc, dh = video.videoHeight * sc;
      ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    ctx.setTransform(S, 0, 0, S, 0, 0);
    if (!hasVideo) text(t('hud.noCamera'), 640, 352, 14, '#9FB0B5', { ls: 2, align: 'center' });
    drawHud(now);
  }

  // ---------- startup ----------

  async function init() {
    window.i18n.apply();
    setRecordingUi(false);

    info = Object.assign(info, await window.api.logInfo());
    nameIn.value = info.name;
    topicIn.value = info.topic;

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
    const remember = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };
    const recall = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const has = (sel, v) => !!v && [...sel.options].some((o) => o.value === v);
    const savedCam = recall('camId'), savedMic = recall('micId');
    if (has(camSel, savedCam) && camSel.value !== savedCam) { camSel.value = savedCam; await startVideo(); }
    if (has(micSel, savedMic) && micSel.value !== savedMic) { micSel.value = savedMic; await startAudio(); }
    reportDevices();

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

    // Environment and news settings
    const cityIn = $('city'), rssIn = $('rss'), langSel = $('lang');
    cityIn.value = info.city || '';
    rssIn.value = info.rss || '';
    const pollEnv = async () => { try { env = await window.api.envGet(); } catch (e) { /* keep the last reading */ } };
    const applyCity = async () => {
      setStatus('status.cityLoading');
      const res = await window.api.setCity(cityIn.value, window.i18n.lang);
      await pollEnv();
      if (res.ok) setStatus(cityIn.value.trim() ? 'status.envUpdated' : 'status.envOff');
      else setStatus('status.envFail', { error: errorText(res.error) });
    };
    cityIn.addEventListener('change', applyCity);
    rssIn.addEventListener('change', async () => {
      setStatus('status.feedLoading');
      const res = await window.api.setFeed(rssIn.value);
      await pollEnv();
      if (res.ok) setStatus(rssIn.value.trim() ? 'status.feedUpdated' : 'status.feedOff', { n: res.count });
      else setStatus('status.feedFail', { error: errorText(res.error) });
    });
    pollEnv();
    setInterval(pollEnv, 30000);

    // Language
    langSel.value = window.i18n.lang;
    langSel.addEventListener('change', async () => {
      window.i18n.setLang(langSel.value);
      setRecordingUi(recording);
      await fillDevices();
      if (lastStatus) setStatus(lastStatus.key, lastStatus.vars); else reportDevices();
      if (cityIn.value.trim()) applyCity();   // re-resolve the city name in the new language
    });

    // Control bar state line and settings panel
    const stateEl = $('state'), gear = $('gear'), panel = $('panel');
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

    const setPanel = (open) => {
      panel.classList.toggle('open', open);
      gear.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    gear.addEventListener('click', (e) => { e.stopPropagation(); setPanel(!panel.classList.contains('open')); });
    panel.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => setPanel(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setPanel(false); });

    recBtn.addEventListener('click', () => { if (recorder) stopRec(); else startRec(); });
    $('open').addEventListener('click', () => window.api.openDir());

    const poll = async () => { try { stats = await window.api.sysStats(); } catch (e) { /* keep the last reading */ } };
    poll();
    setInterval(poll, 2000);

    requestAnimationFrame(draw);
  }

  init().catch((err) => setStatus('status.initError', { error: err.message }));
})();
