// Settings store and settings panel.
//
// Every option lives in one flat key/value store (persisted to local storage) and is described
// once in SECTIONS below. The panel is generated from that description, so adding an option
// means adding a default, one schema entry and its label in i18n.js.
(function () {
  'use strict';

  const STORE_KEY = 'settings.v1';

  const DEFAULTS = {
    'video.source': 'camera',
    'video.insetPos': 'br',
    'video.insetSize': 24,
    'video.insetShape': 'rect',
    'video.insetRound': false,
    'video.resolution': '1080p',
    'video.fps': 60,
    'video.bitrate': 8,
    'video.audio': 192,
    'video.format': 'auto',
    'video.mirror': false,
    'video.fit': 'cover',

    'hud.show': true,
    'hud.corners': true,
    'hud.rulers': true,
    'hud.status': true,
    'hud.timecode': true,
    'hud.clock': true,
    'hud.nameplate': true,
    'hud.device': true,
    'hud.devCamera': true,
    'hud.devFps': true,
    'hud.devStorage': true,
    'hud.devGpu': true,
    'hud.audio': true,
    'hud.spectrum': true,
    'hud.env': true,
    'hud.envLocation': true,
    'hud.envWeather': true,
    'hud.envWind': true,
    'hud.envAir': true,
    'hud.envSun': true,
    'hud.news': true,
    'hud.speaker': true,
    'hud.faceFrame': true,
    'hud.eyes': false,
    'hud.hands': true,
    'hud.captions': true,
    'hud.chips': true,
    'hud.chapter': true,

    'look.accent': '#6FE3E1',
    'look.rec': '#FF8A4C',
    'look.text': '#E8F1F2',
    'look.opacity': 100,
    'look.shadow': true,
    'look.font': 'mono',

    'general.theme': 'light',

    'info.city': '',
    'info.feed': '',
    'info.label': '',
    'info.units': 'metric',
    'info.preset': 'custom',
    'info.newsSeconds': 8,
    'info.newsMax': 12,

    'speech.face': false,
    'speech.hands': false,
    'speech.captions': false,
    'speech.capLang': '',
    'speech.capModel': 'fast',
    'speech.keywords': '',
    'speech.capSize': 19,
    'speech.capHold': 6
  };

  const ACCENTS = ['#6FE3E1', '#FFC857', '#7CF29A', '#B9A6FF', '#FF8FB1', '#E8F1F2'];
  const REC_COLORS = ['#FF8A4C', '#FF5A5A', '#FFC857'];
  const TEXT_COLORS = ['#E8F1F2', '#FFFFFF', '#FFE9C7', '#C9F7E0'];

  // Ready-made news sources. Choosing one fills in the feed box; "custom" leaves it alone.
  const NEWS_PRESETS = [
    { id: 'custom', k: 'set.presetCustom' },
    { id: 'off', k: 'set.presetOff', url: '' },
    { id: 'bbc-zh', text: 'BBC 中文', url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml' },
    { id: 'bbc-world', text: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { id: 'bbc-tech', text: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
    { id: 'hn', text: 'Hacker News', url: 'https://hnrss.org/frontpage' }
  ];

  const toggle = (key, label, extra) => Object.assign({ type: 'toggle', key, label }, extra);

  const SECTIONS = [
    {
      id: 'devices',
      items: [
        { type: 'select', id: 'cam', label: 'ui.camera', lock: true, wide: true },
        { type: 'select', id: 'mic', label: 'ui.microphone', lock: true, wide: true }
      ]
    },
    {
      id: 'video',
      items: [
        { type: 'value', id: 'outDir', label: 'set.outDir' },
        { type: 'buttons', lock: true, buttons: [
          { action: 'chooseDir', label: 'set.choose' },
          { action: 'resetDir', label: 'set.useDefault' },
          { action: 'openDir', label: 'set.reveal' }] },
        { type: 'group', label: 'set.groupSource' },
        { type: 'select', key: 'video.source', label: 'set.source', lock: true, options: [
          { v: 'camera', k: 'set.srcCamera' }, { v: 'both', k: 'set.srcBoth' }, { v: 'screen', k: 'set.srcScreen' }] },
        { type: 'select', id: 'screenSrc', label: 'set.screenSrc', lock: true, wide: true, hint: 'set.screenHint' },
        { type: 'select', key: 'video.insetPos', label: 'set.insetPos', options: [
          { v: 'br', k: 'set.posBR' }, { v: 'bl', k: 'set.posBL' }, { v: 'tr', k: 'set.posTR' }, { v: 'tl', k: 'set.posTL' }] },
        { type: 'range', key: 'video.insetSize', label: 'set.insetSize', min: 12, max: 45, step: 1, unit: '%' },
        { type: 'select', key: 'video.insetShape', label: 'set.insetShape', options: [
          { v: 'rect', k: 'set.shapeRect' }, { v: 'rect43', k: 'set.shapeRect43' },
          { v: 'square', k: 'set.shapeSquare' }, { v: 'circle', k: 'set.shapeCircle' }] },
        toggle('video.insetRound', 'set.insetRound'),
        { type: 'group', label: 'set.groupQuality' },
        { type: 'select', key: 'video.resolution', label: 'set.resolution', lock: true, options: [
          { v: '720p', text: '720p · 1280 × 720' },
          { v: '1080p', text: '1080p · 1920 × 1080' },
          { v: '1440p', text: '1440p · 2560 × 1440' },
          { v: '2160p', text: '4K · 3840 × 2160' }] },
        { type: 'select', key: 'video.fps', label: 'set.fps', lock: true, num: true, hint: 'set.fpsHint', options: [
          { v: 30, text: '30 FPS' }, { v: 60, text: '60 FPS' }, { v: 120, text: '120 FPS' }, { v: 240, text: '240 FPS' }] },
        { type: 'range', key: 'video.bitrate', label: 'set.bitrate', lock: true, min: 2, max: 40, step: 1, unit: ' Mbps', hint: 'set.bitrateHint' },
        { type: 'select', key: 'video.audio', label: 'set.audio', lock: true, num: true, options: [
          { v: 128, text: '128 kbps' }, { v: 192, text: '192 kbps' }, { v: 256, text: '256 kbps' }, { v: 320, text: '320 kbps' }] },
        { type: 'select', key: 'video.format', label: 'set.format', lock: true, options: [
          { v: 'auto', k: 'set.fmtAuto' }, { v: 'mp4', text: 'MP4 (H.264)' }, { v: 'webm', text: 'WebM (VP9)' }] },
        { type: 'select', key: 'video.fit', label: 'set.fit', options: [
          { v: 'cover', k: 'set.fitCover' }, { v: 'contain', k: 'set.fitContain' }] },
        toggle('video.mirror', 'set.mirror')
      ]
    },
    {
      id: 'hud',
      items: [
        toggle('hud.show', 'set.hudShow', { strong: true }),
        { type: 'group', label: 'set.groupFrame' },
        toggle('hud.corners', 'set.corners'),
        toggle('hud.rulers', 'set.rulers'),
        toggle('hud.status', 'set.status'),
        toggle('hud.timecode', 'set.timecode'),
        toggle('hud.clock', 'set.clock'),
        toggle('hud.nameplate', 'set.nameplate'),
        toggle('hud.chapter', 'set.chapter'),
        { type: 'group', label: 'set.groupPanels' },
        toggle('hud.device', 'set.device'),
        toggle('hud.devCamera', 'set.devCamera', { sub: true }),
        toggle('hud.devFps', 'set.devFps', { sub: true }),
        toggle('hud.devStorage', 'set.devStorage', { sub: true }),
        toggle('hud.devGpu', 'set.devGpu', { sub: true }),
        toggle('hud.audio', 'set.audioPanel'),
        toggle('hud.spectrum', 'set.spectrum'),
        toggle('hud.env', 'set.env'),
        toggle('hud.envLocation', 'set.envLocation', { sub: true }),
        toggle('hud.envWeather', 'set.envWeather', { sub: true }),
        toggle('hud.envWind', 'set.envWind', { sub: true }),
        toggle('hud.envAir', 'set.envAir', { sub: true }),
        toggle('hud.envSun', 'set.envSun', { sub: true }),
        toggle('hud.news', 'set.news'),
        { type: 'group', label: 'set.groupSpeech' },
        toggle('hud.speaker', 'set.speaker'),
        toggle('hud.faceFrame', 'set.faceFrame'),
        toggle('hud.eyes', 'set.eyesEl', { sub: true }),
        toggle('hud.hands', 'set.handsEl'),
        toggle('hud.captions', 'set.captionsEl'),
        toggle('hud.chips', 'set.chips')
      ]
    },
    {
      id: 'look',
      items: [
        { type: 'color', key: 'look.accent', label: 'set.accent', presets: ACCENTS },
        { type: 'color', key: 'look.rec', label: 'set.recColor', presets: REC_COLORS },
        { type: 'color', key: 'look.text', label: 'set.textColor', presets: TEXT_COLORS },
        { type: 'range', key: 'look.opacity', label: 'set.opacity', min: 30, max: 100, step: 5, unit: '%' },
        { type: 'select', key: 'look.font', label: 'set.font', options: [
          { v: 'mono', k: 'set.fontMono' }, { v: 'sans', k: 'set.fontSans' }] },
        toggle('look.shadow', 'set.shadow')
      ]
    },
    {
      id: 'info',
      items: [
        { type: 'group', label: 'set.groupLocation' },
        { type: 'text', key: 'info.city', label: 'ui.city', ph: 'ui.cityPh', hint: 'set.cityHint' },
        { type: 'text', key: 'info.label', label: 'set.label', ph: 'set.labelPh', live: true, hint: 'set.labelHint' },
        { type: 'select', key: 'info.units', label: 'set.units', options: [
          { v: 'metric', k: 'set.metric' }, { v: 'imperial', k: 'set.imperial' }] },
        { type: 'group', label: 'set.groupNews' },
        { type: 'select', key: 'info.preset', label: 'set.preset', options: NEWS_PRESETS.map((p) => (p.k ? { v: p.id, k: p.k } : { v: p.id, text: p.text })) },
        { type: 'textarea', key: 'info.feed', label: 'ui.rss', ph: 'ui.rssPh', hint: 'set.feedHint' },
        { type: 'range', key: 'info.newsMax', label: 'set.newsMax', min: 3, max: 30, step: 1, unit: '' },
        { type: 'range', key: 'info.newsSeconds', label: 'set.newsSeconds', min: 4, max: 20, step: 1, unit: ' s' },
        { type: 'note', label: 'ui.hint' }
      ]
    },
    {
      id: 'speech',
      items: [
        toggle('speech.face', 'ui.face', { hint: 'ui.faceHint' }),
        toggle('speech.hands', 'ui.hands', { hint: 'ui.handsHint' }),
        toggle('speech.captions', 'ui.captions', { hint: 'ui.captionsHint' }),
        { type: 'select', key: 'speech.capLang', label: 'ui.capLang', options: [
          { v: 'chinese', text: '中文' }, { v: 'english', text: 'English' }] },
        { type: 'select', key: 'speech.capModel', label: 'ui.capModel', options: [
          { v: 'fast', k: 'ui.capFast' }, { v: 'accurate', k: 'ui.capAccurate' }] },
        { type: 'range', key: 'speech.capSize', label: 'set.capSize', min: 14, max: 30, step: 1, unit: ' px' },
        { type: 'range', key: 'speech.capHold', label: 'set.capHold', min: 3, max: 12, step: 1, unit: ' s' },
        { type: 'text', key: 'speech.keywords', label: 'ui.keywords', ph: 'ui.keywordsPh', live: true }
      ]
    },
    {
      id: 'general',
      items: [
        { type: 'select', id: 'lang', label: 'ui.language', options: [
          { v: 'en', text: 'English' }, { v: 'zh-CN', text: '简体中文' }] },
        { type: 'select', key: 'general.theme', label: 'set.theme', options: [
          { v: 'light', k: 'set.themeLight' }, { v: 'dark', k: 'set.themeDark' }] },
        { type: 'button', action: 'openDir', label: 'ui.openFolder' },
        { type: 'button', action: 'openLogs', label: 'ui.openLogs' },
        { type: 'button', action: 'reset', label: 'set.reset', lock: true, hint: 'set.resetHint' }
      ]
    }
  ];

  // ---------- store ----------

  let values = {};
  try { values = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { values = {}; }

  // One-time carry-over from the separate keys used before the settings store existed.
  (function migrate() {
    const old = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    if (old('settings.migrated')) return;
    const quality = { best: 16, standard: 8, compact: 4 }[old('quality')];
    if (quality) values['video.bitrate'] = quality;
    if (old('face') === '1') values['speech.face'] = true;
    if (old('captions') === '1') values['speech.captions'] = true;
    if (old('capLang')) values['speech.capLang'] = old('capLang');
    if (old('capModel')) values['speech.capModel'] = old('capModel');
    if (old('keywords')) values['speech.keywords'] = old('keywords');
    try { localStorage.setItem('settings.migrated', '1'); } catch (e) { /* storage unavailable */ }
  })();

  const changeListeners = [];
  const actionListeners = [];
  const controls = {};       // key -> function that pushes a value into its control
  const locked = [];

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(values)); } catch (e) { /* storage unavailable */ }
  }
  function get(key) {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : DEFAULTS[key];
  }
  function set(key, value) {
    values[key] = value;
    save();
    changeListeners.forEach((fn) => fn(key, value));
  }
  /** Store a value and update its control without notifying listeners. */
  function sync(key, value) {
    values[key] = value;
    save();
    if (controls[key]) controls[key](value);
  }
  function reset() {
    values = {};
    save();
  }

  // ---------- panel ----------

  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  let uid = 0;

  function fillOptions(select, options) {
    (options || []).forEach((o) => {
      const opt = el('option');
      opt.value = String(o.v);
      if (o.k) opt.dataset.i18n = o.k; else opt.textContent = o.text;
      select.appendChild(opt);
    });
  }

  function buildRow(item) {
    if (item.type === 'group') {
      const g = el('div', 'group');
      g.dataset.i18n = item.label;
      return g;
    }
    if (item.type === 'note') {
      const n = el('div', 'hint');
      n.dataset.i18n = item.label;
      return n;
    }

    const wrap = el('div', 'item');
    const row = el('div', 'row' + (item.sub ? ' sub' : '') + (item.strong ? ' strong' : '') +
      (item.type === 'text' || item.type === 'textarea' || item.type === 'color' || item.wide ? ' stack' : ''));
    wrap.appendChild(row);
    const id = item.id || 'opt' + (++uid);
    let control;

    if (item.type === 'buttons') {
      row.classList.add('buttons');
      item.buttons.forEach((b) => {
        const btn = el('button', 'btn');
        btn.type = 'button';
        btn.dataset.i18n = b.label;
        btn.addEventListener('click', () => actionListeners.forEach((fn) => fn(b.action)));
        if (item.lock && b.action !== 'openDir') locked.push(btn);
        row.appendChild(btn);
      });
      return wrap;
    }
    if (item.type === 'value') {
      row.classList.add('stack');
      const label = el('div', 'label');
      label.dataset.i18n = item.label;
      const value = el('div', 'value');
      value.id = item.id;
      row.appendChild(label);
      row.appendChild(value);
      return wrap;
    }

    if (item.type === 'button') {
      control = el('button', 'btn');
      control.type = 'button';
      control.dataset.i18n = item.label;
      control.addEventListener('click', () => actionListeners.forEach((fn) => fn(item.action)));
      row.appendChild(control);
    } else {
      const label = el('label');
      label.htmlFor = id;
      label.dataset.i18n = item.label;
      row.appendChild(label);

      if (item.type === 'toggle') {
        control = el('input', 'sw');
        control.type = 'checkbox';
        control.checked = !!get(item.key);
        control.addEventListener('change', () => set(item.key, control.checked));
        controls[item.key] = (v) => { control.checked = !!v; };
        row.appendChild(control);
      } else if (item.type === 'select') {
        control = el('select');
        fillOptions(control, item.options);
        if (item.key) {
          control.value = String(get(item.key));
          control.addEventListener('change', () => set(item.key, item.num ? Number(control.value) : control.value));
          controls[item.key] = (v) => { control.value = String(v); };
        }
        row.appendChild(control);
      } else if (item.type === 'range') {
        const box = el('div', 'range');
        control = el('input');
        control.type = 'range';
        control.min = item.min; control.max = item.max; control.step = item.step;
        control.value = get(item.key);
        const out = el('output');
        const show = () => { out.textContent = control.value + (item.unit || ''); };
        show();
        control.addEventListener('input', () => { show(); set(item.key, Number(control.value)); });
        controls[item.key] = (v) => { control.value = v; show(); };
        box.appendChild(control);
        box.appendChild(out);
        row.appendChild(box);
      } else if (item.type === 'text') {
        control = el('input');
        control.type = 'text';
        control.value = get(item.key) || '';
        if (item.ph) control.dataset.i18nPh = item.ph;
        control.addEventListener(item.live ? 'input' : 'change', () => set(item.key, control.value));
        controls[item.key] = (v) => { control.value = v || ''; };
        row.appendChild(control);
      } else if (item.type === 'textarea') {
        control = el('textarea');
        control.rows = 3;
        control.spellcheck = false;
        control.value = get(item.key) || '';
        if (item.ph) control.dataset.i18nPh = item.ph;
        control.addEventListener('change', () => set(item.key, control.value));
        controls[item.key] = (v) => { control.value = v || ''; };
        row.appendChild(control);
      } else if (item.type === 'color') {
        const box = el('div', 'swatches');
        const buttons = [];
        control = el('input');
        control.type = 'color';
        const mark = (v) => {
          const cur = String(v).toUpperCase();
          buttons.forEach((b) => b.setAttribute('aria-pressed', b.dataset.color === cur ? 'true' : 'false'));
          control.value = cur.toLowerCase();
        };
        item.presets.forEach((c) => {
          const b = el('button', 'swatch');
          b.type = 'button';
          b.dataset.color = c.toUpperCase();
          b.style.background = c;
          b.setAttribute('aria-label', c);
          b.addEventListener('click', () => { set(item.key, c); mark(c); });
          buttons.push(b);
          box.appendChild(b);
        });
        control.addEventListener('input', () => { set(item.key, control.value.toUpperCase()); mark(control.value); });
        controls[item.key] = mark;
        mark(get(item.key));
        box.appendChild(control);
        row.appendChild(box);
      }
      control.id = id;
    }

    if (item.lock) locked.push(control);
    if (item.hint) {
      const h = el('div', 'hint');
      h.dataset.i18n = item.hint;
      wrap.appendChild(h);
    }
    return wrap;
  }

  function build(tabsEl, sectionsEl) {
    tabsEl.textContent = '';
    sectionsEl.textContent = '';
    const show = (id) => {
      tabsEl.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.sec === id ? 'true' : 'false'));
      sectionsEl.querySelectorAll('.section').forEach((s) => { s.hidden = s.dataset.sec !== id; });
      sectionsEl.scrollTop = 0;
    };
    SECTIONS.forEach((sec) => {
      const tab = el('button', 'tab');
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.dataset.sec = sec.id;
      tab.dataset.i18n = 'sec.' + sec.id;
      tab.addEventListener('click', () => show(sec.id));
      tabsEl.appendChild(tab);

      const box = el('div', 'section');
      box.dataset.sec = sec.id;
      sec.items.forEach((item) => box.appendChild(buildRow(item)));
      sectionsEl.appendChild(box);
    });
    show(SECTIONS[0].id);
  }

  function setLocked(on) {
    locked.forEach((c) => { c.disabled = on; });
  }

  window.settings = {
    get, set, sync, reset, build, setLocked, NEWS_PRESETS,
    onChange: (fn) => changeListeners.push(fn),
    onAction: (fn) => actionListeners.push(fn)
  };
})();
