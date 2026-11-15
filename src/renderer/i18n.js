// Tiny i18n layer. Adding a language means adding one more object to STRINGS
// and one <option> to the language select in index.html.
(function () {
  'use strict';

  const STRINGS = {
    en: {
      sec: {
        devices: 'Devices', video: 'Recording', hud: 'HUD elements', look: 'Appearance',
        info: 'Weather & news', speech: 'Speech', general: 'General'
      },
      set: {
        resolution: 'Resolution',
        fps: 'Frame rate',
        bitrate: 'Video bitrate',
        bitrateHint: 'A target, not a cap: busy scenes can use up to twice as much. 8 Mbps is about 60 to 120 MB per minute.',
        audio: 'Audio bitrate',
        format: 'File format',
        fmtAuto: 'Automatic (MP4 if available)',
        fit: 'Camera framing',
        fitCover: 'Fill the frame (crop)',
        fitContain: 'Show the whole image (bars)',
        mirror: 'Mirror the camera',
        hudShow: 'Show the HUD',
        groupFrame: 'Frame',
        groupPanels: 'Panels',
        groupSpeech: 'Speech',
        corners: 'Frame corners',
        rulers: 'Edge rulers',
        status: 'Recording state and log number',
        timecode: 'Timecode',
        clock: 'Date and time',
        nameplate: 'Name plate',
        chapter: 'Chapter indicator',
        device: 'Device panel',
        devCamera: 'Camera resolution',
        devFps: 'Frame rate',
        devStorage: 'Free disk space',
        devGpu: 'GPU load and memory',
        audioPanel: 'Audio panel',
        spectrum: 'Audio spectrum',
        env: 'Environment panel',
        news: 'News ticker',
        speaker: 'Speaker panel',
        faceFrame: 'Face tracking frame',
        captionsEl: 'Captions',
        chips: 'Keyword callouts',
        accent: 'Accent colour',
        recColor: 'Recording colour',
        textColor: 'Text colour',
        opacity: 'HUD opacity',
        font: 'HUD typeface',
        fontMono: 'Monospace',
        fontSans: 'Sans serif',
        shadow: 'Text shadow for bright footage',
        units: 'Units',
        metric: 'Metric (°C, km/h)',
        imperial: 'Imperial (°F, mph)',
        newsSeconds: 'Seconds per headline',
        capSize: 'Caption size',
        capHold: 'Caption stays for',
        reset: 'Reset all settings',
        resetHint: 'Restores every option on these tabs to its default. Your logs, name and devices are kept.'
      },
      ui: {
        close: 'Close',
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
        rss: 'News feed (RSS or Atom URL)',
        rssPh: 'https://… Leave empty to hide',
        hint: 'Press Enter to apply the city or feed. Weather and news refresh every 10 minutes.',
        language: 'Language',
        openLogs: 'Open app log folder (for bug reports)',
        mark: 'Add chapter marker (M)',
        quality: 'Recording quality',
        qBest: 'Best (largest files)',
        qStandard: 'Standard',
        qCompact: 'Compact (smallest files)',
        captions: 'Live captions',
        captionsHint: 'Speech is transcribed on this device with Whisper. The first use downloads the model from Hugging Face (roughly 80 MB for Fast, 250 MB for Accurate). Captions are also saved as an .srt file next to the video.',
        capLang: 'Spoken language',
        capModel: 'Caption model',
        capFast: 'Fast',
        capAccurate: 'Accurate (slower, larger download)',
        keywords: 'Keyword callouts',
        keywordsPh: 'Comma separated, e.g. overlay, timecode',
        face: 'Speaker analysis (face tracking)',
        faceHint: 'Downloads a face model of about 4 MB from Google once. Video is analysed on this device only.',
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
        capLoading: 'Loading the caption model… the first time includes a download',
        capDownloading: 'Downloading the caption model… {pct}%',
        capOn: 'Live captions are on',
        capOff: 'Live captions are off',
        capFail: 'Could not start live captions: {error}',
        faceLoading: 'Loading the face model…',
        faceOn: 'Speaker analysis is on',
        faceOff: 'Speaker analysis is off',
        faceFail: 'Could not start speaker analysis: {error}',
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
        noCamera: '[ NO CAMERA SIGNAL ]',
        chapter: 'CHAPTER {n}',
        chapterWord: 'Chapter',
        rate: 'SPEAKING RATE',
        wpm: 'WPM',
        cpm: 'CHARS/MIN',
        speaker: 'SPEAKER',
        eyeContact: 'EYE CONTACT',
        talk: 'TALK RATIO',
        faceLocked: 'FACE TRACKING · LOCKED',
        pose: 'YAW {y}  PITCH {p}  ROLL {r}'
      },
      wmo: {
        clear: 'Clear', mostlyClear: 'Mostly clear', cloudy: 'Partly cloudy', overcast: 'Overcast',
        fog: 'Fog', drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', showers: 'Showers',
        snowShowers: 'Snow showers', thunder: 'Thunderstorm', unknown: '—'
      }
    },

    'zh-CN': {
      sec: {
        devices: '设备', video: '录制', hud: '画面元素', look: '外观',
        info: '天气与新闻', speech: '语音', general: '通用'
      },
      set: {
        resolution: '分辨率',
        fps: '帧率',
        bitrate: '视频码率',
        bitrateHint: '这是目标值而非上限，画面变化大时实际可能达到两倍。8 Mbps 大约每分钟 60 到 120 MB。',
        audio: '音频码率',
        format: '文件格式',
        fmtAuto: '自动（优先 MP4）',
        fit: '摄像头取景',
        fitCover: '填满画面（裁切）',
        fitContain: '显示完整画面（留黑边）',
        mirror: '镜像摄像头',
        hudShow: '显示 HUD',
        groupFrame: '画框',
        groupPanels: '信息面板',
        groupSpeech: '语音相关',
        corners: '四角边框',
        rulers: '两侧刻度',
        status: '录制状态与日志编号',
        timecode: '时间码',
        clock: '日期时间',
        nameplate: '署名条',
        chapter: '章节提示',
        device: '设备面板',
        devCamera: '摄像头分辨率',
        devFps: '帧率',
        devStorage: '存储剩余',
        devGpu: '显卡占用与显存',
        audioPanel: '音频面板',
        spectrum: '声纹频谱',
        env: '环境面板',
        news: '新闻轮播',
        speaker: '说话者面板',
        faceFrame: '人脸追踪框',
        captionsEl: '字幕',
        chips: '关键词提示',
        accent: '强调色',
        recColor: '录制标记颜色',
        textColor: '文字颜色',
        opacity: 'HUD 不透明度',
        font: 'HUD 字体',
        fontMono: '等宽',
        fontSans: '无衬线',
        shadow: '文字阴影（亮背景下更清晰）',
        units: '单位',
        metric: '公制（°C、km/h）',
        imperial: '英制（°F、mph）',
        newsSeconds: '每条新闻停留秒数',
        capSize: '字幕字号',
        capHold: '字幕停留时间',
        reset: '恢复全部默认设置',
        resetHint: '把这些标签页里的选项全部恢复默认。日志、署名和设备选择会保留。'
      },
      ui: {
        close: '关闭',
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
        hint: '城市和新闻地址修改后按回车生效。天气和新闻每 10 分钟更新一次。',
        language: '语言',
        openLogs: '打开程序日志文件夹（反馈问题时使用）',
        mark: '添加章节标记 (M)',
        quality: '录制画质',
        qBest: '最佳（文件最大）',
        qStandard: '标准',
        qCompact: '紧凑（文件最小）',
        captions: '实时字幕',
        captionsHint: '语音在本机用 Whisper 识别。首次使用会从 Hugging Face 下载模型（快速约 80 MB，准确约 250 MB）。字幕会同时保存为视频旁边的 .srt 文件。',
        capLang: '说话语言',
        capModel: '字幕模型',
        capFast: '快速',
        capAccurate: '准确（更慢，下载更大）',
        keywords: '关键词提示',
        keywordsPh: '用逗号分隔，例如 叠加层, 时间码',
        face: '说话者分析（人脸追踪）',
        faceHint: '首次开启会从 Google 下载约 4 MB 的人脸模型。画面只在本机分析。',
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
        capLoading: '正在加载字幕模型…首次使用需要下载',
        capDownloading: '正在下载字幕模型… {pct}%',
        capOn: '实时字幕已开启',
        capOff: '实时字幕已关闭',
        capFail: '无法启动实时字幕：{error}',
        faceLoading: '正在加载人脸模型…',
        faceOn: '说话者分析已开启',
        faceOff: '说话者分析已关闭',
        faceFail: '无法启动说话者分析：{error}',
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
        noCamera: '[ 没有摄像头画面 ]',
        chapter: '章节 {n}',
        chapterWord: '章节',
        rate: '语速',
        wpm: '词/分',
        cpm: '字/分',
        speaker: '说话者',
        eyeContact: '视线接触',
        talk: '说话占比',
        faceLocked: '人脸追踪 · 已锁定',
        pose: '偏航 {y}  俯仰 {p}  滚转 {r}'
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
