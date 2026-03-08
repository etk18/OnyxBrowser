/**
 * TabManager — Native WebContentsView lifecycle manager
 *
 * Replaces <webview> tags with Electron's modern WebContentsView API.
 * Each tab gets its own WebContentsView instance managed by the main process.
 * The React frontend acts as a pure UI shell; all rendering is native.
 */

const { WebContentsView, session } = require('electron');
const path = require('path');

const TOPBAR_HEIGHT = 90; // 40px tab strip + 50px navbar
const MENU_PANEL_WIDTH = 400;
const AI_SIDEBAR_WIDTH = 380;
const DEFAULT_USERAGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

class TabManager {
  /**
   * @param {Electron.BrowserWindow} win — The main shell window
   * @param {object} store — electron-store instance (or null)
   * @param {object} opts — { rustShield, blocker, shieldEnabled, injectCosmeticFilters, observerScript, hijackScript }
   */
  constructor(win, store, opts = {}) {
    this.win = win;
    this.store = store;
    this.tabs = new Map(); // tabId → { view, isIncognito }
    this.activeTabId = null;
    this.menuOpen = false;
    this.aiOpen = false;
    this._pendingOps = new Set(); // tabIds currently in-flight (create/close)

    // External references from main.js
    this.opts = opts;

    // Preload path for webview-preload.js (Web3 + context isolation)
    this.preloadPath = path.join(__dirname, 'webview-preload.js');

    // Update bounds on window resize
    win.on('resize', () => this._setBoundsForActive());
  }

  // ── Tab Creation ──

  createTab(tabId, url, isIncognito = false) {
    // Guard: skip if this tabId is already being processed or already exists
    if (this._pendingOps.has(tabId) || this.tabs.has(tabId)) return { webContentsId: 0 };
    this._pendingOps.add(tabId);

    const partition = isIncognito ? 'incognito' : 'persist:main';

    const view = new WebContentsView({
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        partition,
        sandbox: true,
      },
    });

    const wc = view.webContents;
    wc.setUserAgent(DEFAULT_USERAGENT);
    wc.setBackgroundThrottling(true);

    this.tabs.set(tabId, { view, isIncognito });

    // Bind all events
    this._bindEvents(tabId, wc, isIncognito);

    // Load URL
    if (url && url !== 'about:blank') {
      wc.loadURL(url).catch(() => {});
    }

    this._pendingOps.delete(tabId);
    return { webContentsId: wc.id };
  }

  // ── Tab Destruction ──

  closeTab(tabId) {
    // Guard: skip if this tab is mid-creation or already being closed
    if (this._pendingOps.has(tabId)) return;
    const entry = this.tabs.get(tabId);
    if (!entry) return;
    this._pendingOps.add(tabId);

    // Remove from window if currently visible
    if (this.activeTabId === tabId) {
      try { this.win.contentView.removeChildView(entry.view); } catch {}
      this.activeTabId = null;
    }

    // Destroy the webContents
    try {
      if (!entry.view.webContents.isDestroyed()) {
        entry.view.webContents.close();
      }
    } catch {}

    this.tabs.delete(tabId);
    this._pendingOps.delete(tabId);
  }

  // ── Tab Switching ──

  switchTab(tabId, isInternalPage = false) {
    // Remove currently active view
    if (this.activeTabId != null) {
      const current = this.tabs.get(this.activeTabId);
      if (current) {
        try { this.win.contentView.removeChildView(current.view); } catch {}
      }
    }

    this.activeTabId = tabId;

    // If the active tab is an internal page, don't show any native view
    if (isInternalPage) return;

    const entry = this.tabs.get(tabId);
    if (!entry) return;

    this.win.contentView.addChildView(entry.view);
    this._setBoundsForActive();
  }

  // ── Bounds Management ──

  updateBounds(menuOpen, aiOpen) {
    this.menuOpen = menuOpen;
    this.aiOpen = aiOpen;
    this._setBoundsForActive();
  }

  _setBoundsForActive() {
    if (this.activeTabId == null) return;
    const entry = this.tabs.get(this.activeTabId);
    if (!entry) return;

    // Check the view is actually attached
    const children = this.win.contentView.children;
    if (!children || !children.includes(entry.view)) return;

    const { width, height } = this.win.getContentBounds();

    let viewWidth = width;
    if (this.menuOpen) viewWidth -= MENU_PANEL_WIDTH;
    if (this.aiOpen) viewWidth -= AI_SIDEBAR_WIDTH;
    viewWidth = Math.max(200, viewWidth);

    const viewHeight = Math.max(100, height - TOPBAR_HEIGHT);

    entry.view.setBounds({
      x: 0,
      y: TOPBAR_HEIGHT,
      width: viewWidth,
      height: viewHeight,
    });
  }

  // ── Navigation ──

  navigate(tabId, url) {
    const wc = this._wc(tabId);
    if (wc) wc.loadURL(url).catch(() => {});
  }

  goBack(tabId) {
    const wc = this._wc(tabId);
    if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  goForward(tabId) {
    const wc = this._wc(tabId);
    if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  reload(tabId) {
    const wc = this._wc(tabId);
    if (wc) wc.reload();
  }

  stop(tabId) {
    const wc = this._wc(tabId);
    if (wc) wc.stop();
  }

  // ── Find In Page ──

  findInPage(tabId, text, options = {}) {
    const wc = this._wc(tabId);
    if (wc && text) {
      wc.findInPage(text, options);
    }
  }

  stopFindInPage(tabId, action = 'clearSelection') {
    const wc = this._wc(tabId);
    if (wc) wc.stopFindInPage(action);
  }

  // ── Zoom ──

  setZoomLevel(tabId, level) {
    const wc = this._wc(tabId);
    if (wc) wc.setZoomLevel(level);
  }

  getZoomLevel(tabId) {
    const wc = this._wc(tabId);
    return wc ? wc.getZoomLevel() : 0;
  }

  // ── Nav State Query ──

  getNavState(tabId) {
    const wc = this._wc(tabId);
    if (!wc || wc.isDestroyed()) {
      return { canGoBack: false, canGoForward: false, url: '', title: '', webContentsId: 0 };
    }
    return {
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      url: wc.getURL(),
      title: wc.getTitle(),
      webContentsId: wc.id,
    };
  }

  // ── Event Binding ──

  _bindEvents(tabId, wc, isIncognito) {
    const send = (channel, data) => {
      if (this.win && !this.win.isDestroyed()) {
        this.win.webContents.send(channel, data);
      }
    };

    // ─ Native Zoom Interceptor (captures Cmd/Ctrl +/-/0 when WebContentsView has focus) ─
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const isZoomModifier = input.control || input.meta;
      if (!isZoomModifier) return;

      if (input.key === '=' || input.key === '+' || input.code === 'NumpadAdd') {
        event.preventDefault();
        const cur = wc.getZoomLevel();
        const next = Math.min(5, cur + 0.5);
        wc.setZoomLevel(next);
        send('native-zoom-changed', { tabId, level: next });
      } else if (input.key === '-' || input.key === '_' || input.code === 'NumpadSubtract') {
        event.preventDefault();
        const cur = wc.getZoomLevel();
        const next = Math.max(-5, cur - 0.5);
        wc.setZoomLevel(next);
        send('native-zoom-changed', { tabId, level: next });
      } else if (input.key === '0' || input.code === 'Numpad0') {
        event.preventDefault();
        wc.setZoomLevel(0);
        send('native-zoom-changed', { tabId, level: 0 });
      }
    });

    // ─ Navigation ─
    wc.on('did-navigate', (_event, url) => {
      if (url === 'about:blank') return;
      let favicon = null;
      try {
        favicon = `https://www.google.com/s2/favicons?sz=64&domain_url=${new URL(url).origin}`;
      } catch {}
      send('tab-did-navigate', { tabId, url, favicon });

      // Security status
      const secure = url.startsWith('https://');
      send('security-status', { secure, url });

      // Cosmetic filter injection
      if (typeof this.opts.injectCosmeticFilters === 'function') {
        this.opts.injectCosmeticFilters(wc, url);
      }
    });

    wc.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return;
      send('tab-did-navigate-in-page', { tabId, url });

      // Cosmetic re-injection for SPA nav
      if (typeof this.opts.injectCosmeticFilters === 'function') {
        this.opts.injectCosmeticFilters(wc, url);
      }
    });

    // ─ Title & Favicon ─
    wc.on('page-title-updated', (_event, title) => {
      send('tab-title-updated', { tabId, title });
    });

    wc.on('page-favicon-updated', (_event, favicons) => {
      send('tab-favicon-updated', { tabId, favicons });
    });

    // ─ Loading State ─
    wc.on('did-start-loading', () => {
      send('tab-loading-changed', { tabId, isLoading: true });
    });

    wc.on('did-stop-loading', () => {
      send('tab-loading-changed', { tabId, isLoading: false });
    });

    // ─ DOM Ready: zoom, CSS, history, nav state ─
    wc.on('dom-ready', () => {
      wc.setZoomFactor(1.25);
      wc.insertCSS('html, body { overflow-x: hidden; }').catch(() => {});

      // Save history (non-incognito only)
      if (!isIncognito && this.store) {
        try {
          const url = wc.getURL();
          const title = wc.getTitle();
          if (url && url.startsWith('http')) {
            const history = this.store.get('history', []);
            history.unshift({ url, title: title || url, date: new Date().toISOString() });
            if (history.length > 500) history.length = 500;
            this.store.set('history', history);
          }
        } catch {}
      }

      // Send nav state
      send('tab-nav-state', {
        tabId,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        webContentsId: wc.id,
      });
    });

    // ─ Finish Load: content scraping for Vector Memory ─
    wc.on('did-finish-load', () => {
      // Cosmetic filter injection
      try {
        const url = wc.getURL();
        if (typeof this.opts.injectCosmeticFilters === 'function') {
          this.opts.injectCosmeticFilters(wc, url);
        }
      } catch {}

      // Skip memory scraping for incognito
      if (isIncognito) return;

      try {
        const url = wc.getURL();
        if (!url || url === 'about:blank' || url.startsWith('chrome://')) return;

        wc.executeJavaScript(`
          (function() {
            try {
              var t = document.title || '';
              var b = (document.body && document.body.innerText) || '';
              return JSON.stringify({ title: t, content: b.substring(0, 1500) });
            } catch(e) { return '{}'; }
          })()
        `)
          .then((raw) => {
            try {
              const data = JSON.parse(raw || '{}');
              if (data.content && data.content.length > 50) {
                const fetchFn = typeof fetch !== 'undefined' ? fetch : require('cross-fetch');
                fetchFn('http://localhost:8000/api/memory/ingest', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url, title: data.title || url, content: data.content }),
                }).catch(() => {});
              }
            } catch {}
          })
          .catch(() => {});
      } catch {}
    });

    // ─ Find In Page results ─
    wc.on('found-in-page', (_event, result) => {
      send('tab-found-in-page', { tabId, result });
    });

    // ─ Audio state ─
    wc.on('media-started-playing', () => {
      send('tab-audio-state', { webContentsId: wc.id, isPlaying: true, isMuted: wc.isAudioMuted() });
    });

    wc.on('media-paused', () => {
      send('tab-audio-state', { webContentsId: wc.id, isPlaying: false, isMuted: wc.isAudioMuted() });
    });

    // ─ Window open handler (popups → new tab) ─
    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (disposition === 'foreground-tab' || disposition === 'new-window' || disposition === 'background-tab') {
        send('new-tab', url);
        return { action: 'deny' };
      }
      return { action: 'deny' };
    });

    // ─ Crash handler: renderer process gone ─
    wc.on('render-process-gone', (_event, details) => {
      send('tab-crashed', { tabId, reason: details.reason || 'unknown', exitCode: details.exitCode || 0 });
    });

    // ─ Context menu ─
    import('electron-context-menu')
      .then(({ default: contextMenu }) => {
        contextMenu({
          window: wc,
          showSaveImageAs: true,
          showInspectElement: true,
          showSearchWithGoogle: true,
          showCopyImageAddress: true,
          showCopyImage: true,
          showCopyLink: true,
          append: (_defaultActions, params) => [
            {
              label: 'Open in New Tab',
              visible: params.linkURL && params.linkURL.length > 0,
              click: () => send('new-tab', params.linkURL),
            },
          ],
        });
      })
      .catch(() => {});
  }

  // ── Helper ──

  _wc(tabId) {
    const entry = this.tabs.get(tabId);
    if (!entry) return null;
    const wc = entry.view.webContents;
    return wc && !wc.isDestroyed() ? wc : null;
  }
}

module.exports = TabManager;
