const { contextBridge, ipcRenderer } = require('electron');

// Existing API
contextBridge.exposeInMainWorld('api', {
  sendPrompt: (text) => ipcRenderer.invoke('send-prompt', text),
});

// Browser API — History, Bookmarks, Downloads, Settings, Ad-Blocker
contextBridge.exposeInMainWorld('browserAPI', {
  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  saveHistory: (url, title) => ipcRenderer.invoke('save-history', url, title),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // Bookmarks
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  addBookmark: (url, title) => ipcRenderer.invoke('add-bookmark', url, title),
  removeBookmark: (url) => ipcRenderer.invoke('remove-bookmark', url),

  // Downloads (events from main process)
  onDownloadStarted: (callback) => {
    ipcRenderer.on('download-started', (_event, data) => callback(data));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (_event, data) => callback(data));
  },
  onDownloadComplete: (callback) => {
    ipcRenderer.on('download-complete', (_event, data) => callback(data));
  },
  onDownloadPaused: (callback) => {
    ipcRenderer.on('download-paused', (_event, data) => callback(data));
  },

  // Download controls
  pauseDownload: (id) => ipcRenderer.invoke('pause-download', id),
  resumeDownload: (id) => ipcRenderer.invoke('resume-download', id),
  cancelDownload: (id) => ipcRenderer.invoke('cancel-download', id),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  clearCache: () => ipcRenderer.invoke('clear-cache'),

  // New Tab from context menu
  onNewTab: (callback) => {
    ipcRenderer.on('new-tab', (_event, url) => callback(url));
  },

  // Ad-Blocker
  getBlockedCount: () => ipcRenderer.invoke('get-blocked-count'),
  resetBlockedCount: () => ipcRenderer.invoke('reset-blocked-count'),
  onAdBlocked: (callback) => {
    ipcRenderer.on('ad-blocked', (_event, count) => callback(count));
  },

  // Session Restore
  getLastSession: () => ipcRenderer.invoke('get-last-session'),
  saveSession: (urls) => ipcRenderer.invoke('save-session', urls),

  // Security
  onSecurityStatus: (callback) => {
    ipcRenderer.on('security-status', (_event, data) => callback(data));
  },
  getCertDetails: (webContentsId) => ipcRenderer.invoke('get-cert-details', webContentsId),

  // Incognito
  createIncognitoWindow: () => ipcRenderer.invoke('create-incognito-window'),

  // Audio
  onTabAudioState: (callback) => {
    ipcRenderer.on('tab-audio-state', (_event, data) => callback(data));
  },
  toggleMute: (webContentsId) => ipcRenderer.invoke('toggle-mute', webContentsId),

  // AI
  getPageContent: (webContentsId) => ipcRenderer.invoke('get-page-content', webContentsId),

  // Agent
  performAgentAction: (webContentsId, command) => ipcRenderer.invoke('perform-agent-action', webContentsId, command),

  // OpenRouter AI Proxy
  openrouterChat: (apiKey, messages) => ipcRenderer.invoke('openrouter-chat', apiKey, messages),
});
