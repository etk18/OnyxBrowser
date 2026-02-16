const { app, BrowserWindow, Menu, ipcMain, session } = require('electron');
const path = require('path');
const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const fetch = require('cross-fetch');

// ── Application Menu: Enable system shortcuts (Cmd+C/V/X) ──
// Without this, Electron strips all standard Edit shortcuts.
const appMenu = Menu.buildFromTemplate([
  {
    label: 'Onyx',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' },
    ],
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  },
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { role: 'close' },
    ],
  },
]);
Menu.setApplicationMenu(appMenu);

// ── Force High-Performance GPU rendering to fix video stutter ──
// app.commandLine.appendSwitch('enable-transparent-visuals');
// app.commandLine.appendSwitch('disable-gpu-driver-bug-workarounds');
app.commandLine.appendSwitch('ignore-gpu-blacklist');
// app.commandLine.appendSwitch('enable-gpu-rasterization');
// app.commandLine.appendSwitch('enable-zero-copy');
// app.commandLine.appendSwitch('disable-frame-rate-limit');

let mainWindow = null;
let store = null;
let blocker = null;
let blockedCount = 0;
let downloadItems = new Map();
let nextDownloadId = 1;

// ── Initialize electron-store (ESM module, must use dynamic import) ──
async function initStore() {
  const Store = (await import('electron-store')).default;
  store = new Store({
    schema: {
      history: {
        type: 'array',
        default: [],
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            title: { type: 'string' },
            date: { type: 'string' },
          },
        },
      },
      bookmarks: {
        type: 'array',
        default: [],
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            title: { type: 'string' },
            folder: { type: 'string' },
          },
        },
      },
      searchEngine: {
        type: 'string',
        default: 'google',
      },
      homePage: {
        type: 'string',
        default: 'https://www.google.com',
      },
      adBlock: {
        type: 'boolean',
        default: true,
      },
      lastSession: {
        type: 'array',
        default: [],
        items: { type: 'string' },
      },
    },
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: '#1E1E1E',
    title: 'Onyx',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // In dev, load from Vite dev server; in prod, load built files
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // PRODUCTION MODE
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

    // Remove the default menu bar in production for a cleaner look
    mainWindow.setMenuBarVisibility(false);
  }

  // ── Download Manager (with Pause/Cancel/Resume) ──
  session.defaultSession.on('will-download', (_event, item) => {
    const id = nextDownloadId++;
    const fileName = item.getFilename();
    const totalBytes = item.getTotalBytes();
    downloadItems.set(id, item);

    mainWindow.webContents.send('download-started', {
      id,
      fileName,
      totalBytes,
      url: item.getURL(),
    });

    item.on('updated', (_event, state) => {
      if (state === 'interrupted') {
        mainWindow.webContents.send('download-paused', { id });
      } else if (state === 'progressing') {
        if (item.isPaused()) {
          mainWindow.webContents.send('download-paused', { id });
        } else {
          const received = item.getReceivedBytes();
          const percent = totalBytes > 0 ? Math.round((received / totalBytes) * 100) : 0;
          mainWindow.webContents.send('download-progress', {
            id,
            fileName,
            percent,
            received,
            totalBytes,
          });
        }
      }
    });

    item.once('done', (_event, state) => {
      downloadItems.delete(id);
      mainWindow.webContents.send('download-complete', {
        id,
        fileName,
        state, // 'completed', 'cancelled', 'interrupted'
        path: item.getSavePath(),
      });
    });
  });

  // ── Popups & New Windows (OAuth, target="_blank") ──
  mainWindow.webContents.setWindowOpenHandler(({ url, disposition }) => {
    // OAuth popups (small login windows)
    if (disposition === 'new-window' || disposition === 'foreground-tab') {
      // Open popups in a new BrowserWindow sharing the same session
      const popup = new BrowserWindow({
        width: 500,
        height: 700,
        parent: mainWindow,
        backgroundColor: '#1E1E1E',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          // Share session so login cookies persist
          partition: 'persist:main',
        },
      });
      popup.loadURL(url);
      return { action: 'deny' }; // We handled it manually
    }
    // Default: deny and let the renderer handle it
    return { action: 'deny' };
  });

  // ── Permission Handling (Camera, Mic, Notifications) ──
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = ['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write'];
    if (allowedPermissions.includes(permission)) {
      console.log(`[Permission] Granted: ${permission}`);
      callback(true);
    } else {
      console.log(`[Permission] Denied: ${permission}`);
      callback(false);
    }
  });

  // ── Crash Recovery ──
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Crash Recovery] Renderer process gone:', details.reason);
    // Don't crash the main process — just reload
    setTimeout(() => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.reload();
      }
    }, 1000);
  });

  // ── Certificate Error Handling (allow localhost) ──
  mainWindow.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
        event.preventDefault();
        callback(true); // Allow localhost self-signed certs
        return;
      }
    } catch { }
    callback(false); // Reject other cert errors
  });
}

// ── YouTube Ad-Skipper: MutationObserver (lightweight, zero-polling) ──

const fs = require('fs');
const observerPath = path.join(__dirname, '..', 'src', 'adblocker', 'observer.js');
let observerScript = '';
try {
  observerScript = fs.readFileSync(observerPath, 'utf-8');
  console.log('[AdBlocker] MutationObserver script loaded');
} catch (err) {
  console.error('[AdBlocker] Failed to load observer script:', err.message);
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.on('did-finish-load', () => {
      try {
        const url = contents.getURL();
        if (url && url.includes('youtube.com') && observerScript) {
          // contents.executeJavaScript(observerScript).catch(() => { });
          // console.log('[AdBlocker] Observer injected:', url.substring(0, 50));
        }
      } catch { }
    });

    // SPA navigation
    contents.on('did-navigate-in-page', () => {
      try {
        const url = contents.getURL();
        if (url && url.includes('youtube.com') && observerScript) {
          contents.executeJavaScript(observerScript).catch(() => { });
        }
      } catch { }
    });

    // ── Context Menu for webview content ──
    import('electron-context-menu').then(({ default: contextMenu }) => {
      contextMenu({
        window: contents,
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
            click: () => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('new-tab', params.linkURL);
              }
            },
          },
        ],
      });
      console.log('[ContextMenu] Attached to webview');
    }).catch((err) => console.error('[ContextMenu] Webview attach failed:', err.message));

    // ── Security Status (HTTPS detection) ──
    contents.on('did-navigate', () => {
      try {
        const url = contents.getURL();
        if (!url || !mainWindow || mainWindow.isDestroyed()) return;
        const isSecure = url.startsWith('https://');
        mainWindow.webContents.send('security-status', {
          secure: isSecure,
          url,
        });
      } catch { }
    });

    // ── Audio State Tracking ──
    contents.on('media-started-playing', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tab-audio-state', {
          webContentsId: contents.id,
          isPlaying: true,
          isMuted: contents.isAudioMuted(),
        });
      }
    });

    contents.on('media-paused', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tab-audio-state', {
          webContentsId: contents.id,
          isPlaying: false,
          isMuted: contents.isAudioMuted(),
        });
      }
    });
  }
});

// ── IPC Handlers ──

// Existing handler
ipcMain.handle('send-prompt', (_event, text) => {
  console.log('[send-prompt]', text);
  return { ok: true };
});

// History
ipcMain.handle('get-history', () => {
  if (!store) return [];
  const history = store.get('history', []);
  // Already sorted newest-first (we prepend on save)
  return history;
});

ipcMain.handle('save-history', (_event, url, title) => {
  if (!store) return;
  const history = store.get('history', []);
  history.unshift({
    url,
    title: title || url,
    date: new Date().toISOString(),
  });
  // Cap at 500 items
  if (history.length > 500) history.length = 500;
  store.set('history', history);
});

ipcMain.handle('clear-history', () => {
  if (!store) return;
  store.set('history', []);
});

// Bookmarks
ipcMain.handle('get-bookmarks', () => {
  if (!store) return [];
  return store.get('bookmarks', []);
});

ipcMain.handle('add-bookmark', (_event, url, title) => {
  if (!store) return { added: false };
  const bookmarks = store.get('bookmarks', []);
  // Skip duplicates
  if (bookmarks.some((b) => b.url === url)) {
    return { added: false, reason: 'duplicate' };
  }
  bookmarks.push({ url, title: title || url, folder: 'General' });
  store.set('bookmarks', bookmarks);
  return { added: true };
});

ipcMain.handle('remove-bookmark', (_event, url) => {
  if (!store) return;
  const bookmarks = store.get('bookmarks', []);
  store.set('bookmarks', bookmarks.filter((b) => b.url !== url));
});

// ── Ad-Blocker: blocked count IPC ──

ipcMain.handle('get-blocked-count', () => blockedCount);

ipcMain.handle('reset-blocked-count', () => {
  blockedCount = 0;
  return 0;
});

// ── Settings IPC ──

ipcMain.handle('get-settings', () => {
  if (!store) return { searchEngine: 'google', homePage: 'https://www.google.com', adBlock: true };
  return {
    searchEngine: store.get('searchEngine', 'google'),
    homePage: store.get('homePage', 'https://www.google.com'),
    adBlock: store.get('adBlock', true),
  };
});

ipcMain.handle('set-setting', (_event, key, value) => {
  if (!store) return;
  store.set(key, value);
  // If ad-blocker toggled, enable/disable it
  if (key === 'adBlock' && blocker) {
    if (value) {
      blocker.enableBlockingInSession(session.defaultSession);
      console.log('[AdBlocker] Re-enabled');
    } else {
      blocker.disableBlockingInSession(session.defaultSession);
      console.log('[AdBlocker] Disabled');
    }
  }
});

ipcMain.handle('clear-cache', async () => {
  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData();
    console.log('[Settings] Cache and cookies cleared');
    return { ok: true };
  } catch (err) {
    console.error('[Settings] Clear cache failed:', err.message);
    return { ok: false, error: err.message };
  }
});

// ── AI Content Extraction ──

ipcMain.handle('get-page-content', async (_event, webContentsId) => {
  try {
    const { webContents } = require('electron');
    const wc = webContents.fromId(webContentsId);
    if (!wc) return '';

    // Execute script in the renderer to get text content
    const content = await wc.executeJavaScript(`
      document.body.innerText
        .replace(/\\s+/g, ' ')
        .substring(0, 30000)
    `);
    return content || '';
  } catch (err) {
    console.error('[AI] Content extraction failed:', err.message);
    return '';
  }
});

// ── Agent Action IPC — Smart DOM Traversal Engine ──

const SMART_FIND_SCRIPT = `
(() => {
  // ── Inject Onyx Pulse Animation (once) ──
  if (!document.getElementById('onyx-pulse-style')) {
    const style = document.createElement('style');
    style.id = 'onyx-pulse-style';
    style.textContent = \`
      @keyframes onyxPulse {
        0%, 100% { box-shadow: 0 0 8px rgba(0,242,234,0.4); }
        50% { box-shadow: 0 0 20px rgba(0,242,234,0.8); }
      }
      .onyx-highlight {
        outline: 2px solid #00f2ea !important;
        box-shadow: 0 0 15px #00f2ea !important;
        border-radius: 4px !important;
        animation: onyxPulse 1.5s ease-in-out infinite !important;
        transition: all 0.3s ease !important;
      }
      .onyx-overlay {
        position: absolute;
        pointer-events: none;
        border: 2px solid #00f2ea;
        box-shadow: 0 0 15px rgba(0,242,234,0.6);
        border-radius: 4px;
        animation: onyxPulse 1.5s ease-in-out infinite;
        z-index: 99999;
      }
    \`;
    document.head.appendChild(style);
  }

  // ── Remove previous highlights ──
  document.querySelectorAll('.onyx-highlight').forEach(el => el.classList.remove('onyx-highlight'));
  document.querySelectorAll('.onyx-overlay').forEach(el => el.remove());

  // ── Helper: Extract keywords from selector string ──
  function extractKeywords(selector) {
    return selector
      .replace(/[\\[\\](){}#.>~+*=:^$|"']/g, ' ')
      .split(/\\s+/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 1 && !['div','span','class','id','name','type','input','button','a','href','src','data','aria','label','value','placeholder'].includes(w));
  }

  // ── Helper: Traverse Shadow DOMs recursively ──
  function getAllElements(root = document) {
    const elements = Array.from(root.querySelectorAll('*'));
    const fromShadow = [];
    elements.forEach(el => {
      if (el.shadowRoot) {
        fromShadow.push(...getAllElements(el.shadowRoot));
      }
    });
    return [...elements, ...fromShadow];
  }

  // ── Strategy 1: Exact CSS Selector ──
  function tryExactSelector(selector) {
    try {
      const els = Array.from(document.querySelectorAll(selector));
      if (els.length > 0) return { elements: els, strategy: 'exact-css', detail: selector };
    } catch(e) { /* invalid selector, continue */ }
    return null;
  }

  // ── Strategy 2: Attribute Match ──
  function tryAttributeMatch(keywords) {
    const attrs = ['id', 'name', 'aria-label', 'placeholder', 'title', 'alt', 'data-testid', 'role'];
    const allEls = getAllElements();
    const matches = [];

    for (const el of allEls) {
      for (const attr of attrs) {
        const val = (el.getAttribute(attr) || '').toLowerCase();
        if (val && keywords.some(kw => val.includes(kw))) {
          matches.push(el);
          break;
        }
      }
    }
    if (matches.length > 0) return { elements: matches, strategy: 'attribute-match', detail: 'id/name/aria-label/placeholder' };
    return null;
  }

  // ── Strategy 3: Text Content Match ──
  function tryTextMatch(keywords) {
    const interactiveTags = ['A', 'BUTTON', 'LABEL', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'P', 'SUMMARY', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION'];
    const allEls = getAllElements();
    const matches = [];

    for (const el of allEls) {
      if (!interactiveTags.includes(el.tagName)) continue;

      // Get direct text (not children's text)
      const directText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim())
        .join(' ')
        .toLowerCase();
      const fullText = (el.innerText || el.value || '').toLowerCase().substring(0, 200);

      if (keywords.some(kw => directText.includes(kw) || fullText.includes(kw))) {
        matches.push(el);
      }
    }

    // Prefer shortest match (most specific)
    matches.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
    if (matches.length > 0) return { elements: matches.slice(0, 20), strategy: 'text-match', detail: 'innerText/value' };
    return null;
  }

  // ── Main: findBestElement ──
  function findBestElement(selector) {
    // Strategy 1: Exact CSS
    const exact = tryExactSelector(selector);
    if (exact) return exact;

    // Extract keywords for fuzzy strategies
    const keywords = extractKeywords(selector);
    if (keywords.length === 0) return null;

    // Strategy 2: Attribute Match
    const attrMatch = tryAttributeMatch(keywords);
    if (attrMatch) return attrMatch;

    // Strategy 3: Text Content Match
    const textMatch = tryTextMatch(keywords);
    if (textMatch) return textMatch;

    return null;
  }

  // ── Apply Highlight with Onyx Pulse ──
  function applyHighlight(elements) {
    elements.forEach((el, i) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'img' || tag === 'canvas' || tag === 'video' || tag === 'svg') {
        // Overlay for replaced elements
        const rect = el.getBoundingClientRect();
        const overlay = document.createElement('div');
        overlay.className = 'onyx-overlay';
        overlay.style.top = (rect.top + window.scrollY) + 'px';
        overlay.style.left = (rect.left + window.scrollX) + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.position = 'absolute';
        document.body.appendChild(overlay);
      } else {
        el.classList.add('onyx-highlight');
      }

      // Scroll first element into view
      if (i === 0) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    });
  }

  // ── Scrape with fallback ──
  function smartScrape(selector) {
    const result = findBestElement(selector);
    if (!result) return { data: [], strategy: 'none', error: "Could not find '" + selector + "' via selector, text, or attributes." };

    const data = result.elements.map(el => (el.innerText || el.value || '').trim()).filter(t => t.length > 0).slice(0, 100);
    return { data, strategy: result.strategy, count: result.elements.length };
  }

  // ── Highlight with fallback ──
  function smartHighlight(selector) {
    const result = findBestElement(selector);
    if (!result) return { count: 0, strategy: 'none', error: "Could not find '" + selector + "' via selector, text, or attributes." };

    applyHighlight(result.elements);
    const label = result.elements[0]?.innerText?.substring(0, 40) || result.elements[0]?.tagName || 'element';
    return { count: result.elements.length, strategy: result.strategy, label: label.trim() };
  }

  return { smartScrape, smartHighlight };
})()`;

ipcMain.handle('perform-agent-action', async (_event, webContentsId, command) => {
  try {
    const { webContents } = require('electron');
    const wc = webContents.fromId(webContentsId);
    if (!wc) return { error: 'No active webview found.' };

    const { tool, params } = command;
    const selector = (params.selector || params.target || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`');

    if (tool === 'navigate') {
      const url = params.url || '';
      if (!url.startsWith('http')) return { error: 'Invalid URL: ' + url };
      try {
        // Navigate the webview and wait for load
        const loadPromise = new Promise((resolve) => {
          const timeout = setTimeout(() => resolve('timeout'), 10000);
          wc.once('did-finish-load', () => { clearTimeout(timeout); resolve('loaded'); });
          wc.once('did-fail-load', (_e, code, desc) => { clearTimeout(timeout); resolve('error: ' + desc); });
        });
        wc.loadURL(url);
        const status = await loadPromise;
        const title = await wc.executeJavaScript('document.title').catch(() => url);
        return `Navigated to "${title}" (${status})`;
      } catch (e) {
        return { error: 'Navigation failed: ' + e.message };
      }
    }

    else if (tool === 'scrape') {
      const result = await wc.executeJavaScript(`
        (() => {
          const engine = ${SMART_FIND_SCRIPT};
          return engine.smartScrape(\`${selector}\`);
        })()
      `);

      if (result.error) return result.error;
      if (result.data.length === 0) return `No text content found for "${params.selector}" (searched via ${result.strategy}).`;
      return result.data;
    }

    else if (tool === 'highlight') {
      const result = await wc.executeJavaScript(`
        (() => {
          const engine = ${SMART_FIND_SCRIPT};
          return engine.smartHighlight(\`${selector}\`);
        })()
      `);

      if (result.error) return result.error;
      return `Found '${result.label}' — highlighted ${result.count} element(s) using ${result.strategy} strategy.`;
    }

    else if (tool === 'click') {
      const safeTarget = (params.selector || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      const result = await wc.executeJavaScript(`
        (() => {
          try {
            const target = "${safeTarget}".toLowerCase();
            const engine = ${SMART_FIND_SCRIPT};

            // ── Scoring function: Button > Link > Role > Input ──
            const scoreElement = (el) => {
              let score = 0;
              const text = (el.innerText || '').toLowerCase().trim();
              const value = (el.value || '').toLowerCase().trim();
              const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase().trim();
              const title = (el.getAttribute('title') || '').toLowerCase().trim();

              // Must match target in at least one property
              const matches = text.includes(target) || value.includes(target) 
                           || ariaLabel.includes(target) || title.includes(target);
              if (!matches) return -1;

              // Exact text match bonus
              if (text === target || value === target || ariaLabel === target) score += 100;

              // Tag-type priority (THE CRITICAL FIX)
              if (el.tagName === 'BUTTON') score += 50;
              if (el.tagName === 'A') score += 50;
              if (el.getAttribute('role') === 'button') score += 40;
              if (el.type === 'submit') score += 40;
              if (el.tagName === 'SUMMARY') score += 30;
              if (el.tagName === 'LABEL') score += 20;

              // Penalize text inputs (we don't want to "click" a search box)
              if (el.tagName === 'INPUT' && el.type !== 'submit' && el.type !== 'button') score -= 20;
              if (el.tagName === 'TEXTAREA') score -= 30;

              // Boost visible elements
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) score += 10;

              return score;
            };

            // ── Strategy A: Score all interactive elements ──
            const allEls = Array.from(document.querySelectorAll(
              'button, a, input, [role="button"], [role="link"], [role="tab"], [role="menuitem"], summary, label, select, textarea'
            ));
            const scored = allEls
              .map(el => ({ el, score: scoreElement(el) }))
              .filter(m => m.score > 0)
              .sort((a, b) => b.score - a.score);

            let bestEl = scored.length > 0 ? scored[0].el : null;
            let strategy = bestEl ? 'scored-text-match' : 'none';

            // ── Strategy B: Smart DOM Engine fallback ──
            if (!bestEl) {
              const found = engine.smartHighlight(target);
              if (found.count > 0) {
                bestEl = document.querySelector('.onyx-highlight');
                strategy = 'smart-dom';
              }
              document.querySelectorAll('.onyx-highlight').forEach(e => e.classList.remove('onyx-highlight'));
              document.querySelectorAll('.onyx-overlay').forEach(e => e.remove());
            }

            // ── Strategy C: Raw CSS selector (last resort) ──
            if (!bestEl) {
              try { bestEl = document.querySelector("${safeTarget}"); strategy = 'css-selector'; } catch(e) {}
            }

            if (!bestEl) {
              return { error: "Could not find '" + target + "' — searched text, attributes, and CSS." };
            }

            // ── Visual feedback: Scroll + Onyx Pulse + Click ──
            bestEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            bestEl.classList.add('onyx-highlight');

            // If it's a text input with a form, submit the form instead
            if (bestEl.tagName === 'INPUT' && (bestEl.type === 'text' || bestEl.type === 'search') && bestEl.form) {
              setTimeout(() => {
                bestEl.form.requestSubmit();
                bestEl.classList.remove('onyx-highlight');
              }, 400);
              return { success: true, label: 'Form submitted', strategy: 'form-submit', tag: bestEl.tagName };
            }

            // Click after brief highlight
            setTimeout(() => {
              bestEl.click();
              setTimeout(() => bestEl.classList.remove('onyx-highlight'), 1000);
            }, 400);

            const label = (bestEl.innerText || bestEl.value || bestEl.getAttribute('aria-label') || "${safeTarget}").substring(0, 50).trim();
            return { success: true, label: label, strategy: strategy, tag: bestEl.tagName };

          } catch (err) {
            return { error: "Click failed: " + err.message };
          }
        })()
      `);

      if (result.error) return result.error;
      return "Clicked " + (result.tag || '') + " '" + result.label + "' — found using " + result.strategy + " strategy.";
    }

    else if (tool === 'type') {
      const safeText = (params.text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      const safeSel = (params.selector || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      const result = await wc.executeJavaScript(`
        (() => {
          try {
            const selector = "${safeSel}".toLowerCase();
            const text = "${safeText}";

            // 1. PRIORITY: Find actual INPUT/TEXTAREA elements first (never target divs/containers)
            let targetEl = null;
            let strategy = 'none';

            // 1a. Try exact CSS selector on inputs only
            try {
              const el = document.querySelector(selector);
              if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
                targetEl = el;
                strategy = 'exact-css';
              }
            } catch(e) {}

            // 1b. Search by input attributes (name, id, placeholder, aria-label, type)
            if (!targetEl) {
              const allInputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
              for (const el of allInputs) {
                const r = el.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) continue;
                if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'checkbox' || el.type === 'radio') continue;
                const attrs = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.type, el.className].filter(Boolean).join(' ').toLowerCase();
                if (attrs.includes(selector)) {
                  targetEl = el;
                  strategy = 'input-attribute-match';
                  break;
                }
              }
            }

            // 1c. Find the largest/most prominent visible input
            if (!targetEl) {
              const inputs = [...document.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), textarea, [role="searchbox"], [role="textbox"]')];
              const visible = inputs.filter(el => {
                const r = el.getBoundingClientRect();
                return r.width > 50 && r.height > 10;
              }).sort((a, b) => {
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                return (rb.width * rb.height) - (ra.width * ra.height);
              });
              if (visible.length > 0) {
                targetEl = visible[0];
                strategy = 'largest-visible-input';
              }
            }

            if (!targetEl) {
              return { error: "Could not find any input field to type into." };
            }

            // 2. Focus, highlight, scroll into view
            targetEl.focus();
            targetEl.click();
            targetEl.classList.add('onyx-highlight');
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // 3. Clear existing value and set new (React-compatible)
            try {
              const proto = targetEl.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
              const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
              if (nativeSetter) {
                nativeSetter.call(targetEl, text);
              } else {
                targetEl.value = text;
              }
            } catch(e) {
              targetEl.value = text;
            }

            // 4. Dispatch events for all frameworks
            targetEl.dispatchEvent(new Event('focus', { bubbles: true }));
            targetEl.dispatchEvent(new Event('input', { bubbles: true }));
            targetEl.dispatchEvent(new Event('change', { bubbles: true }));

            // 5. Auto-submit: Press Enter key to submit the form
            setTimeout(() => {
              targetEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              targetEl.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              targetEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              // Also try form submit
              const form = targetEl.closest('form');
              if (form) { try { form.submit(); } catch(e) {} }
            }, 300);

            // 6. Cleanup
            setTimeout(() => {
              document.querySelectorAll('.onyx-highlight').forEach(e => e.classList.remove('onyx-highlight'));
            }, 2000);

            const label = targetEl.placeholder || targetEl.name || targetEl.id || targetEl.tagName;
            return { success: true, strategy: strategy, label: label };

          } catch (err) {
            return { error: "Crash prevented: " + err.message };
          }
        })()
      `);

      if (result.error) return result.error;
      return 'Typed "' + params.text + '" into \'' + result.label + '\' and submitted (Enter). Found using ' + result.strategy + ' strategy.';
    }

    else if (tool === 'scroll') {
      const direction = (params.direction || 'down').toLowerCase();
      const result = await wc.executeJavaScript(`
        (() => {
          try {
            const dir = "${direction}";
            if (dir === 'down') {
              window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
            } else if (dir === 'up') {
              window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
            } else if (dir === 'bottom') {
              window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            } else if (dir === 'top') {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            const scrollY = Math.round(window.scrollY);
            const maxScroll = Math.round(document.body.scrollHeight - window.innerHeight);
            return "Scrolled " + dir + ". Position: " + scrollY + "/" + maxScroll + "px";
          } catch(e) {
            return "Scroll failed: " + e.message;
          }
        })()
      `);
      return result;
    }

    else if (tool === 'get-url') {
      return wc.getURL();
    }

    else if (tool === 'get-html') {
      return await wc.executeJavaScript(`
        (() => {
          try {
            const parts = [];
            parts.push("PAGE: " + document.title);
            parts.push("URL: " + location.href);
            const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
            if (inputs.length > 0) {
              parts.push("\\nINPUT FIELDS:");
              [...inputs].slice(0, 15).forEach(el => {
                const nm = el.name || el.id || (el.className || '').split(' ')[0] || '';
                const ph = el.placeholder || '';
                const tp = el.type || el.tagName.toLowerCase();
                parts.push("  - " + tp + ": " + (nm || ph || 'unnamed') + (ph ? ' (placeholder: ' + ph + ')' : ''));
              });
            }
            const btns = document.querySelectorAll('button, input[type="submit"], [role="button"]');
            if (btns.length > 0) {
              parts.push("\\nBUTTONS:");
              [...btns].slice(0, 10).forEach(el => {
                const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
                if (t && t.length < 50) parts.push("  - " + t);
              });
            }
            const links = document.querySelectorAll('a[href]');
            const lt = [];
            [...links].forEach(el => {
              if (lt.length > 20) return;
              const t = (el.innerText || '').trim();
              if (t && t.length > 2 && t.length < 80) lt.push("  - " + t);
            });
            if (lt.length > 0) { parts.push("\\nKEY LINKS:"); parts.push(lt.join("\\n")); }
            parts.push("\\nPAGE TEXT:\\n" + document.body.innerText.substring(0, 40000));
            return parts.join("\\n");
          } catch(e) {
            return document.body.innerText.substring(0, 50000);
          }
        })()
      `);
    }

    return { error: 'Unknown tool: ' + tool };
  } catch (err) {
    console.error('[Agent] Action failed:', err.message);
    return { error: err.message };
  }
});

// ── OpenRouter AI Proxy (Multi-Model Fallback) ──

const OPENROUTER_MODELS = [
  'nvidia/nemotron-3-nano-30b-a3b:free',       // Fastest: 3B active MoE, 256k ctx
  'mistralai/mistral-small-3.1-24b-instruct:free', // Fast: 24B, 128k ctx
  'google/gemma-3-27b-it:free',                // Solid: Gemma 3 27B, 131k ctx
  'meta-llama/llama-3.3-70b-instruct:free',    // Fallback: Llama 3.3 70B, 128k ctx
];

ipcMain.handle('openrouter-chat', async (_event, apiKey, messages) => {
  for (let i = 0; i < OPENROUTER_MODELS.length; i++) {
    const model = OPENROUTER_MODELS[i];
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Onyx Browser'
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.1,
          max_tokens: 4096
        })
      });

      // Rate-limited or overloaded → try next model
      if (response.status === 429 || response.status === 503) {
        console.log(`[OpenRouter] ${model} → ${response.status}. Trying next model...`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`[OpenRouter] ${model} Error:`, response.status, errBody);
        // Provider error → try next model
        if (errBody.includes('Provider returned error') || errBody.includes('rate-limit')) {
          console.log(`[OpenRouter] ${model} provider error. Trying next...`);
          continue;
        }
        try {
          const errJson = JSON.parse(errBody);
          return { error: errJson.error?.message || `API Error (${response.status})` };
        } catch {
          return { error: `API Error (${response.status})` };
        }
      }

      const data = await response.json();
      console.log(`[OpenRouter] ✅ Success with ${model}`);
      return { content: data.choices[0].message.content };

    } catch (err) {
      console.error(`[OpenRouter] ${model} failed:`, err.message);
      if (i < OPENROUTER_MODELS.length - 1) continue;
      return { error: err.message };
    }
  }
  return { error: 'All free models are rate-limited. Please try again in a minute.' };
});

// ── Download Control IPC ──

ipcMain.handle('pause-download', (_event, id) => {
  const item = downloadItems.get(id);
  if (item) item.pause();
});

ipcMain.handle('resume-download', (_event, id) => {
  const item = downloadItems.get(id);
  if (item) item.resume();
});

ipcMain.handle('cancel-download', (_event, id) => {
  const item = downloadItems.get(id);
  if (item) item.cancel();
  downloadItems.delete(id);
});

// ── Session Restore IPC ──

ipcMain.handle('get-last-session', () => {
  if (!store) return [];
  return store.get('lastSession', []);
});

ipcMain.handle('save-session', (_event, urls) => {
  if (!store) return;
  // Filter out empty/internal URLs, keep only web URLs
  const webUrls = (urls || []).filter(u => u && (u.startsWith('http://') || u.startsWith('https://')));
  store.set('lastSession', webUrls);
});

// ── Incognito Window ──

ipcMain.handle('create-incognito-window', () => {
  const incognitoWin = new BrowserWindow({
    width: 1100,
    height: 750,
    backgroundColor: '#0a0a0a',
    title: 'Onyx — Incognito',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    autoHideMenuBar: true,
    webPreferences: {
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      // Ephemeral partition — NO 'persist:' prefix means all data stays in RAM
      partition: 'incognito',
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    incognitoWin.loadURL('http://localhost:5173?incognito=1');
  } else {
    incognitoWin.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { incognito: '1' },
    });
  }

  console.log('[Incognito] Window opened with ephemeral partition');
  return { ok: true };
});

// ── Audio Toggle Mute ──

ipcMain.handle('toggle-mute', (_event, webContentsId) => {
  try {
    const { webContents } = require('electron');
    const wc = webContents.fromId(webContentsId);
    if (wc) {
      const muted = !wc.isAudioMuted();
      wc.setAudioMuted(muted);
      return { muted };
    }
  } catch (err) {
    console.error('[Audio] Toggle mute failed:', err.message);
  }
  return { muted: false };
});

// ── Certificate Details ──

ipcMain.handle('get-cert-details', (_event, webContentsId) => {
  try {
    const { webContents } = require('electron');
    const wc = webContents.fromId(webContentsId);
    if (!wc) return null;
    // getCertificate() returns the certificate for the current page
    // We need to use session's getSSLCertificate approach or the webContents approach
    const url = wc.getURL();
    if (!url || !url.startsWith('https://')) return null;
    // Use the webContents session to resolve
    return new Promise((resolve) => {
      const { net } = require('electron');
      const req = net.request({ url, method: 'HEAD', session: wc.session });
      req.on('response', (resp) => {
        try {
          // getCurrentWebContents approach — not available, use URL parsing
          resolve({
            issuer: resp.headers['server'] || 'Unknown',
            subject: new URL(url).hostname,
            secure: true,
          });
        } catch {
          resolve(null);
        }
        req.abort();
      });
      req.on('error', () => resolve(null));
      req.end();
    });
  } catch {
    return null;
  }
});

// ── App Lifecycle ──

app.whenReady().then(async () => {
  // ── CSP: Allow WalletConnect & YouTube ──
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https://* wss://*; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://* blob:; connect-src 'self' https://* wss://*; img-src 'self' data: https://*; frame-src 'self' https://*;",
        ],
      },
    });
  });

  // 1. Initialize Store (Fast, blocking to ensure data is ready)
  await initStore();

  // 2. Launch UI immediately
  createWindow();

  // 3. Load heavy services in the background
  (async () => {
    // ── Load uBlock Origin Extension (default session only) ──
    try {
      const uBlockPath = path.join(__dirname, '..', 'extensions', 'ublock');
      await session.defaultSession.loadExtension(uBlockPath, { allowFileAccess: true });
      console.log('[uBlock] Loaded into default session');
    } catch (err) {
      console.error('[uBlock] Failed to load:', err.message);
    }

    // ── Initialize Network Ad-Blocker ──
    try {
      blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
        path: path.join(app.getPath('userData'), 'adblocker-cache.bin'),
        read: require('fs').promises.readFile,
        write: require('fs').promises.writeFile,
      });
      // blocker.enableBlockingInSession(session.defaultSession);

      // Also block in the main webview partition
      const webviewSession = session.fromPartition('persist:main');
      // blocker.enableBlockingInSession(webviewSession);

      blocker.on('request-blocked', () => {
        blockedCount++;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ad-blocked', blockedCount);
        }
      });
      console.log('[AdBlocker] Network blocker initialized');
    } catch (err) {
      console.error('[AdBlocker] Failed to initialize:', err.message);
    }
  })();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit(); // Crucial for Windows installer to work
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
