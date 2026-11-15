// Tiny i18n layer. Adding a language means adding one more object to STRINGS
// and one <option> to the language select in index.html.
(function () {
  'use strict';

  const STRINGS = {
    en: {
      ui: {
        recStart: 'Start recording',
        recStop: 'Stop recording',
        standby: 'Standby · Log #{n}',
        recording: 'Recording {t}',
        nameLabel: 'Name',
        namePh: 'Name',
        topicLabel: 'Log topic',
        topicPh: "What is today's log about?",
        openFolder: 'Open log folder',
        settings: 'Settings',
        devices: 'Devices',
        camera: 'Camera',
        microphone: 'Microphone',
        overlay: 'On-screen info',
        city: 'City',
        cityPh: 'e.g. Singapore. Leave empty to hide',
        rss: 'News RSS feed URL',
        rssPh: 'https://… Leave empty to hide',
        hint: 'Press Enter to apply. Weather refreshes every 10 minutes.',
        language: 'Language',
        cameraN: 'Camera {n}',
        microphoneN: 'Microphone {n}'
      },
      status: {
        camOk: 'Camera connected',
        camNone: 'No camera detected',
        micOk: 'Microphone connected',
        micNone: 'No microphone detected',
        recordingTo: 'Recording to {file} · {format}',
        silent: ' · no microphone, the video will be silent',
        saved: 'Saved: {file}',
        writeError: 'Could not write the file: {error}',
        recError: 'Recording error: {error}',
        startError: 'Could not start recording: {error}',
        initError: 'Startup failed: {error}',
        cityLoading: 'Looking up the city and weather…',
        envUpdated: 'Environment data updated',
        envOff: 'Environment data turned off',
        envFail: 'Could not load environment data: {error}',
        feedLoading: 'Loading the news feed…',
        feedUpdated: 'News updated, {n} headlines',
        feedOff: 'News turned off',
        feedFail: 'Could not load the news feed: {error}',
        unknown: 'unknown error'
      },
      errors: {
        CITY_NOT_FOUND: 'city not found',
        BAD_URL: 'that is not a valid URL',
        BAD_PROTOCOL: 'only http and https URLs are supported',
        NO_TITLES: 'the feed has no headlines'
      },
      hud: {
        standby: 'STBY',
        log: 'LOG #{n}',
        device: 'DEVICE',
        camera: 'CAMERA',
        notConnected: 'N/A',
        fps: 'FRAME RATE',
        storage: 'FREE SPACE',
        gpu: 'GPU',
        vram: 'VRAM',
        audio: 'AUDIO',
        level: 'LEVEL',
        peak: 'PEAK',
        env: 'ENVIRONMENT',
        location: 'LOCATION',
        weather: 'WEATHER',
        humidityWind: 'HUMIDITY / WIND',
        air: 'AIR QUALITY',
        sun: 'SUNRISE / SUNSET',
        news: 'NEWS {i} / {n}',
        mic: 'MIC · {v}',
        day: 'DAY {d} · {topic}',
        yourName: '[YOUR NAME]',
        topic: '[TOPIC]',
        noCamera: '[ NO CAMERA SIGNAL ]'
      },
      wmo: {
        clear: 'Clear', mostlyClear: 'Mostly clear', cloudy: 'Partly cloudy', overcast: 'Overcast',
        fog: 'Fog', drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', showers: 'Showers',
        snowShowers: 'Snow showers', thunder: 'Thunderstorm', unknown: '—'
      }
    },

    'zh-CN': {
      ui: {
        recStart: '开始录制',
        recStop: '停止录制',
        standby: '待机 · 日志 #{n}',
        recording: '录制中 {t}',
        nameLabel: '署名',
        namePh: '署名',
        topicLabel: '日志主题',
        topicPh: '今天记录什么',
        openFolder: '打开日志文件夹',
        settings: '设置',
        devices: '设备',
        camera: '摄像头',
        microphone: '麦克风',
        overlay: '画面信息',
        city: '城市',
        cityPh: '例如 新加坡，留空则不显示环境信息',
        rss: '新闻 RSS 地址',
        rssPh: 'https://…，留空则不显示新闻',
        hint: '修改后按回车生效。天气每 10 分钟更新一次。',
        language: '语言',
        cameraN: '摄像头 {n}',
        microphoneN: '麦克风 {n}'
      },
      status: {
        camOk: '摄像头已连接',
        camNone: '没有检测到摄像头',
        micOk: '麦克风已连接',
        micNone: '没有检测到麦克风',
        recordingTo: '正在录制 → {file} · {format}',
        silent: ' · 没有麦克风，视频无声音',
        saved: '已保存：{file}',
        writeError: '写入文件出错：{error}',
        recError: '录制出错：{error}',
        startError: '无法开始录制：{error}',
        initError: '启动失败：{error}',
        cityLoading: '正在查询城市和天气…',
        envUpdated: '环境信息已更新',
        envOff: '已关闭环境信息',
        envFail: '环境信息获取失败：{error}',
        feedLoading: '正在读取新闻源…',
        feedUpdated: '新闻已更新，共 {n} 条',
        feedOff: '已关闭新闻',
        feedFail: '新闻源读取失败：{error}',
        unknown: '未知错误'
      },
      errors: {
        CITY_NOT_FOUND: '找不到这个城市',
        BAD_URL: '地址格式不对',
        BAD_PROTOCOL: '只支持 http 或 https 地址',
        NO_TITLES: '订阅源里没有读到标题'
      },
      hud: {
        standby: '待机',
        log: '日志 #{n}',
        device: '设备',
        camera: '摄像头分辨率',
        notConnected: '未连接',
        fps: '帧率（实测）',
        storage: '存储剩余',
        gpu: 'GPU',
        vram: '显存占用',
        audio: '音频',
        level: '音量',
        peak: '峰值',
        env: '环境',
        location: '位置',
        weather: '天气',
        humidityWind: '湿度 / 风速',
        air: '空气质量',
        sun: '日出 / 日落',
        news: '新闻 {i} / {n}',
        mic: '麦克风 · {v}',
        day: '第 {d} 天 · {topic}',
        yourName: '[你的名字]',
        topic: '[日志主题]',
        noCamera: '[ 没有摄像头画面 ]'
      },
      wmo: {
        clear: '晴', mostlyClear: '大致晴朗', cloudy: '多云', overcast: '阴',
        fog: '雾', drizzle: '毛毛雨', rain: '雨', snow: '雪', showers: '阵雨',
        snowShowers: '阵雪', thunder: '雷暴', unknown: '—'
      }
    }
  };

  function detect() {
    let saved = null;
    try { saved = localStorage.getItem('lang'); } catch (e) { /* storage unavailable */ }
    if (saved && STRINGS[saved]) return saved;
    return String(navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
  }

  let lang = detect();

  /** Look up "section.key" and fill {placeholders}. Falls back to English, then to the key. */
  function t(key, vars) {
    const parts = key.split('.');
    const pick = (table) => (table[parts[0]] || {})[parts[1]];
    let s = pick(STRINGS[lang]);
    if (s === undefined) s = pick(STRINGS.en);
    if (s === undefined) return key;
    return s.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? String(vars[k]) : m));
  }

  /** Map a WMO weather code (as used by Open-Meteo) to a short label. */
  function weatherText(code) {
    let k = 'unknown';
    if (code === 0) k = 'clear';
    else if (code === 1) k = 'mostlyClear';
    else if (code === 2) k = 'cloudy';
    else if (code === 3) k = 'overcast';
    else if (code === 45 || code === 48) k = 'fog';
    else if (code >= 51 && code <= 57) k = 'drizzle';
    else if (code >= 61 && code <= 67) k = 'rain';
    else if (code >= 71 && code <= 77) k = 'snow';
    else if (code >= 80 && code <= 82) k = 'showers';
    else if (code === 85 || code === 86) k = 'snowShowers';
    else if (code >= 95) k = 'thunder';
    return t('wmo.' + k);
  }

  /** Apply translations to static markup (data-i18n, data-i18n-ph, data-i18n-label). */
  function apply(root) {
    root = root || document;
    document.documentElement.lang = lang;
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    root.querySelectorAll('[data-i18n-label]').forEach((el) => {
      const s = t(el.dataset.i18nLabel);
      el.setAttribute('aria-label', s);
      if (el.tagName === 'BUTTON') el.title = s;
    });
  }

  function setLang(next) {
    if (!STRINGS[next]) return;
    lang = next;
    try { localStorage.setItem('lang', next); } catch (e) { /* storage unavailable */ }
    apply();
  }

  window.i18n = { t, apply, setLang, weatherText, get lang() { return lang; } };
})();
