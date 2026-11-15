'use strict';

// Narrow, explicit bridge between the sandboxed page and the main process.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  logInfo: () => ipcRenderer.invoke('log:info'),
  saveProfile: (name, topic) => ipcRenderer.invoke('log:saveProfile', name, topic),
  recStart: (ext) => ipcRenderer.invoke('rec:start', ext),
  recChunk: (ab) => ipcRenderer.invoke('rec:chunk', ab),
  recStop: () => ipcRenderer.invoke('rec:stop'),
  recAbort: () => ipcRenderer.invoke('rec:abort'),
  sysStats: () => ipcRenderer.invoke('sys:stats'),
  envGet: () => ipcRenderer.invoke('env:get'),
  setCity: (name, lang) => ipcRenderer.invoke('env:setCity', name, lang),
  setFeed: (url) => ipcRenderer.invoke('env:setFeed', url),
  openDir: () => ipcRenderer.invoke('open:dir'),
  openLogs: () => ipcRenderer.invoke('open:logs'),
  logWrite: (level, message) => ipcRenderer.invoke('log:write', level, message)
});
