'use strict';

// Narrow, explicit bridge between the sandboxed page and the main process.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  logInfo: () => ipcRenderer.invoke('log:info'),
  saveProfile: (name, topic) => ipcRenderer.invoke('log:saveProfile', name, topic),
  recStart: (ext) => ipcRenderer.invoke('rec:start', ext),
  recChunk: (ab) => ipcRenderer.invoke('rec:chunk', ab),
  recStop: (extras) => ipcRenderer.invoke('rec:stop', extras),
  recAbort: () => ipcRenderer.invoke('rec:abort'),
  sysStats: () => ipcRenderer.invoke('sys:stats'),
  envGet: () => ipcRenderer.invoke('env:get'),
  setCity: (name, lang) => ipcRenderer.invoke('env:setCity', name, lang),
  setFeed: (url) => ipcRenderer.invoke('env:setFeed', url),
  openDir: () => ipcRenderer.invoke('open:dir'),
  screenSources: () => ipcRenderer.invoke('screen:sources'),
  protectWindow: (on) => ipcRenderer.invoke('screen:protect', on),
  selectScreen: (id) => ipcRenderer.invoke('screen:select', id),
  chooseOutDir: () => ipcRenderer.invoke('out:choose'),
  resetOutDir: () => ipcRenderer.invoke('out:reset'),
  setTheme: (theme) => ipcRenderer.invoke('ui:theme', theme),
  setCompact: (on) => ipcRenderer.invoke('ui:compact', on),
  openLogs: () => ipcRenderer.invoke('open:logs'),
  faceModel: () => ipcRenderer.invoke('face:model'),
  handModel: () => ipcRenderer.invoke('hand:model'),
  asrStart: (opts) => ipcRenderer.invoke('asr:start', opts),
  asrStop: () => ipcRenderer.invoke('asr:stop'),
  asrLanguage: (language) => ipcRenderer.invoke('asr:language', language),
  asrAudio: (samples) => ipcRenderer.send('asr:audio', samples),
  onAsr: (callback) => ipcRenderer.on('asr:event', (e, message) => callback(message)),
  logWrite: (level, message) => ipcRenderer.invoke('log:write', level, message)
});
