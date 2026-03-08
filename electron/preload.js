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

  // Downloads (events from main process) — each returns a cleanup function
  onDownloadStarted: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download-started', handler);
    return () => ipcRenderer.removeListener('download-started', handler);
  },
  onDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },
  onDownloadComplete: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download-complete', handler);
    return () => ipcRenderer.removeListener('download-complete', handler);
  },
  onDownloadPaused: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download-paused', handler);
    return () => ipcRenderer.removeListener('download-paused', handler);
  },

  // Download controls
  pauseDownload: (id) => ipcRenderer.invoke('pause-download', id),
  resumeDownload: (id) => ipcRenderer.invoke('resume-download', id),
  cancelDownload: (id) => ipcRenderer.invoke('cancel-download', id),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  clearCache: () => ipcRenderer.invoke('clear-cache'),

  // Extensions
  loadExtension: () => ipcRenderer.invoke('load-extension'),
  getExtensions: () => ipcRenderer.invoke('get-extensions'),
  removeExtension: (id) => ipcRenderer.invoke('remove-extension', id),

  // New Tab from context menu
  onNewTab: (callback) => {
    const handler = (_event, url) => callback(url);
    ipcRenderer.on('new-tab', handler);
    return () => ipcRenderer.removeListener('new-tab', handler);
  },

  // Ad-Blocker
  getBlockedCount: () => ipcRenderer.invoke('get-blocked-count'),
  resetBlockedCount: () => ipcRenderer.invoke('reset-blocked-count'),
  onAdBlocked: (callback) => {
    const handler = (_event, count) => callback(count);
    ipcRenderer.on('ad-blocked', handler);
    return () => ipcRenderer.removeListener('ad-blocked', handler);
  },

  // Session Restore
  getLastSession: () => ipcRenderer.invoke('get-last-session'),
  saveSession: (urls) => ipcRenderer.invoke('save-session', urls),

  // Security
  onSecurityStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('security-status', handler);
    return () => ipcRenderer.removeListener('security-status', handler);
  },
  getCertDetails: (webContentsId) => ipcRenderer.invoke('get-cert-details', webContentsId),

  // Incognito
  createIncognitoWindow: () => ipcRenderer.invoke('create-incognito-window'),

  // Audio
  onTabAudioState: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('tab-audio-state', handler);
    return () => ipcRenderer.removeListener('tab-audio-state', handler);
  },
  toggleMute: (webContentsId) => ipcRenderer.invoke('toggle-mute', webContentsId),

  // AI
  getPageContent: (webContentsId) => ipcRenderer.invoke('get-page-content', webContentsId),

  // Agent
  performAgentAction: (webContentsId, command) => ipcRenderer.invoke('perform-agent-action', webContentsId, command),
  onAgentNavigate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('agent-navigate', handler);
    return () => ipcRenderer.removeListener('agent-navigate', handler);
  },

  // Groq AI Proxy
  groqChat: (apiKey, messages) => ipcRenderer.invoke('groq-chat', apiKey, messages),

  // Secure API Key Storage (via electron-store in userData)
  getApiKey: (provider) => ipcRenderer.invoke('get-api-key', provider),
  setApiKey: (provider, key) => ipcRenderer.invoke('set-api-key', provider, key),
  getAllApiKeys: () => ipcRenderer.invoke('get-all-api-keys'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  // Web3 Provider
  getWebviewPreloadPath: () => ipcRenderer.invoke('get-webview-preload-path'),

  // Web3 Wallet Connection
  onWalletRequest: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('wallet-connection-request', handler);
    return () => ipcRenderer.removeListener('wallet-connection-request', handler);
  },
  sendWalletResponse: (response) => ipcRenderer.invoke('wallet-connection-response', response),

  // ── WebContentsView Tab Management ──

  // Tab lifecycle
  createView: (tabId, url, isIncognito) => ipcRenderer.invoke('tab-create', { tabId, url, isIncognito }),
  closeView: (tabId) => ipcRenderer.invoke('tab-close', { tabId }),
  switchView: (tabId, isInternalPage) => ipcRenderer.invoke('tab-switch', { tabId, isInternalPage }),

  // Navigation
  navigateView: (tabId, url) => ipcRenderer.invoke('tab-navigate', { tabId, url }),
  goBackView: (tabId) => ipcRenderer.invoke('tab-go-back', { tabId }),
  goForwardView: (tabId) => ipcRenderer.invoke('tab-go-forward', { tabId }),
  reloadView: (tabId) => ipcRenderer.invoke('tab-reload', { tabId }),

  // Bounds (fire-and-forget, no response needed)
  updateViewBounds: (menuOpen, aiOpen) => ipcRenderer.send('update-tab-bounds', { menuOpen, aiOpen }),

  // Find in page
  findInPage: (tabId, text, options) => ipcRenderer.invoke('tab-find-in-page', { tabId, text, options }),
  stopFindInPage: (tabId, action) => ipcRenderer.invoke('tab-stop-find-in-page', { tabId, action }),

  // Zoom
  setZoomLevel: (tabId, level) => ipcRenderer.invoke('tab-set-zoom-level', { tabId, level }),
  getZoomLevel: (tabId) => ipcRenderer.invoke('tab-get-zoom-level', { tabId }),

  // Nav state query
  getNavState: (tabId) => ipcRenderer.invoke('tab-get-nav-state', { tabId }),

  // Tab event listeners (each returns a cleanup function)
  onTabDidNavigate: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('tab-did-navigate', h);
    return () => ipcRenderer.removeListener('tab-did-navigate', h);
  },
  onTabDidNavigateInPage: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('tab-did-navigate-in-page', h);
    return () => ipcRenderer.removeListener('tab-did-navigate-in-page', h);
  },
  onTabTitleUpdated: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('tab-title-updated', h);
    return () => ipcRenderer.removeListener('tab-title-updated', h);
  },
  onTabFaviconUpdated: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('tab-favicon-updated', h);
    return () => ipcRenderer.removeListener('tab-favicon-updated', h);
  },
  onTabLoadingChanged: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('tab-loading-changed', h);
    return () => ipcRenderer.removeListener('tab-loading-changed', h);
  },
  onTabNavState: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('tab-nav-state', h);
    return () => ipcRenderer.removeListener('tab-nav-state', h);
  },
  onTabFoundInPage: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('tab-found-in-page', h);
    return () => ipcRenderer.removeListener('tab-found-in-page', h);
  },
  onNativeZoomChanged: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('native-zoom-changed', h);
    return () => ipcRenderer.removeListener('native-zoom-changed', h);
  },
  onTabCrashed: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('tab-crashed', h);
    return () => ipcRenderer.removeListener('tab-crashed', h);
  },

  // Agentic Omnibox — /command execution
  executeAgentCommand: (command, tabId) => ipcRenderer.invoke('execute-agent-command', { command, tabId }),
  onAgentNavigateUrl: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('agent-navigate-url', h);
    return () => ipcRenderer.removeListener('agent-navigate-url', h);
  },
});
