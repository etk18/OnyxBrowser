const { app, BrowserWindow, WebContentsView, Menu, ipcMain, session, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const { Request: AdblockerRequest } = require('@cliqz/adblocker');
const fetch = require('cross-fetch');
const TabManager = require('./tab-manager');

// ── Rust-powered Onyx Shield Engine (Brave adblock crate) ──
let rustShield = null;
try {
  // Try multiple resolution paths for packaged app compatibility (ASAR, Windows)
  let ShieldEngine;
  try {
    // Standard dev path
    ShieldEngine = require('../onyx-shield').ShieldEngine;
  } catch {
    // Packaged app: try app.asar.unpacked (native modules can't live in ASAR)
    try {
      const unpackedPath = path.join(__dirname, '..', '..', 'app.asar.unpacked', 'onyx-shield');
      ShieldEngine = require(unpackedPath).ShieldEngine;
    } catch {
      // Last resort: resolve relative to app resources dir
      const resourcePath = path.join(process.resourcesPath || '', 'onyx-shield');
      ShieldEngine = require(resourcePath).ShieldEngine;
    }
  }
  rustShield = new ShieldEngine();
  console.log(`[OnyxShield] Brave engine loaded — ${rustShield.filterCount()} fallback filters`);
} catch (e) {
  console.warn('[OnyxShield] Rust native module not available, falling back to Cliqz only:', e.message);
}

// ── Backend Process (FastAPI/Uvicorn) ──
let backendProcess = null;

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
let tabManager = null;
let store = null;
let blocker = null;
let blockedCount = 0;
let shieldEnabled = true; // Toggled by user settings
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
      apiKeys: {
        type: 'object',
        default: {},
        properties: {
          groq: { type: 'string', default: '' },
          openai: { type: 'string', default: '' },
        },
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
    title: 'OnyxBrowser | Public Beta v0.1.0',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
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
const hijackPath = path.join(__dirname, '..', 'src', 'adblocker', 'hijack.js');
let observerScript = '';
let hijackScript = '';
try {
  observerScript = fs.readFileSync(observerPath, 'utf-8');
  console.log('[AdBlocker] MutationObserver script loaded');
} catch (err) {
  console.error('[AdBlocker] Failed to load observer script:', err.message);
}
try {
  hijackScript = fs.readFileSync(hijackPath, 'utf-8');
  console.log('[AdBlocker] Hijack script loaded');
} catch (err) {
  console.error('[AdBlocker] Failed to load hijack script:', err.message);
}

// Helper: Inject cosmetic filters from Brave engine + YouTube scripts
// Tracks inserted CSS keys per webContents to properly clean up on SPA navigation
const cosmeticCssKeys = new WeakMap(); // WeakMap<WebContents, string[]>

async function injectCosmeticFilters(contents, url) {
  if (!shieldEnabled) return;

  // Remove previously injected CSS to prevent stale selectors accumulating on SPA nav
  const prevKeys = cosmeticCssKeys.get(contents) || [];
  for (const key of prevKeys) {
    try { contents.removeInsertedCSS(key); } catch { }
  }
  const newKeys = [];

  // 1. Brave engine cosmetic selectors
  if (rustShield) {
    try {
      const cosmetic = rustShield.getCosmeticFilters(url);

      // Inject hide selectors as CSS via native insertCSS (survives SPA nav)
      if (cosmetic.hideSelectors && cosmetic.hideSelectors.length > 0) {
        const css = cosmetic.hideSelectors
          .map((sel) => `${sel} { display: none !important; }`)
          .join('\n');
        try {
          const key = await contents.insertCSS(css);
          if (key) newKeys.push(key);
        } catch { }
      }

      // Inject style rules
      if (cosmetic.styleSelectors && cosmetic.styleSelectors.length > 0) {
        const css = cosmetic.styleSelectors.join('\n');
        try {
          const key = await contents.insertCSS(css);
          if (key) newKeys.push(key);
        } catch { }
      }

      // Inject scriptlets
      if (cosmetic.injectedScript && cosmetic.injectedScript.length > 0) {
        contents.executeJavaScript(cosmetic.injectedScript).catch(() => { });
      }
    } catch (e) {
      // Silently fail — cosmetic filtering is best-effort
    }
  }

  cosmeticCssKeys.set(contents, newKeys);

  // 2. YouTube-specific scripts (idempotent — each has __aether_*_active guard)
  if (url && url.includes('youtube.com')) {
    if (hijackScript) {
      contents.executeJavaScript(hijackScript).catch(() => { });
    }
    if (observerScript) {
      contents.executeJavaScript(observerScript).catch(() => { });
    }
  }
}

app.on('web-contents-created', (_event, contents) => {
  // Tab webContents events are now handled by TabManager.
  // This handler only catches webContents not managed by TabManager
  // (e.g. popup windows, devtools, etc.) — no-op for now.
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
  // If ad-blocker toggled, flip the unified shield flag
  if (key === 'adBlock') {
    shieldEnabled = !!value;
    console.log(`[OnyxShield] ${shieldEnabled ? 'Enabled' : 'Disabled'} by user`);
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

// ── Chrome Extension Loader (Developer Mode) ──

ipcMain.handle('load-extension', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Unpacked Extension Directory',
    properties: ['openDirectory'],
    buttonLabel: 'Load Extension',
  });

  if (canceled || filePaths.length === 0) return { canceled: true };

  const extPath = filePaths[0];
  try {
    const ext = await session.defaultSession.loadExtension(extPath, { allowFileAccess: true });
    console.log(`[Extensions] Loaded: ${ext.name} (${ext.id})`);
    return { ok: true, extension: { id: ext.id, name: ext.name, version: ext.version, path: ext.path } };
  } catch (err) {
    console.error('[Extensions] Load failed:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('get-extensions', () => {
  const exts = session.defaultSession.getAllExtensions();
  return exts.map((ext) => ({
    id: ext.id,
    name: ext.name,
    version: ext.version,
    path: ext.path,
  }));
});

ipcMain.handle('remove-extension', (_event, extensionId) => {
  try {
    session.defaultSession.removeExtension(extensionId);
    console.log(`[Extensions] Removed: ${extensionId}`);
    return { ok: true };
  } catch (err) {
    console.error('[Extensions] Remove failed:', err.message);
    return { ok: false, error: err.message };
  }
});

// ── Secure API Key Storage (electron-store, never in project root) ──

ipcMain.handle('get-api-key', (_event, provider) => {
  if (!store) return '';
  return store.get(`apiKeys.${provider}`, '');
});

ipcMain.handle('set-api-key', async (_event, provider, key) => {
  if (!store) return;
  store.set(`apiKeys.${provider}`, key || '');
  console.log(`[Settings] API key ${key ? 'saved' : 'cleared'} for: ${provider}`);

  // Sync to FastAPI backend so LLM commands (/click, /summarize, /ask) work immediately
  try {
    const http = require('http');
    const data = JSON.stringify({ provider, api_key: key || '' });
    await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port: 8000, path: '/api/settings/keys',
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
    console.log(`[Settings] API key synced to backend for: ${provider}`);
  } catch (err) {
    console.warn(`[Settings] Backend sync error for ${provider}:`, err.message);
  }
});

ipcMain.handle('get-all-api-keys', () => {
  if (!store) return {};
  return store.get('apiKeys', {});
});

ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

// ── Web3 Provider: Preload path for webview injection ──

ipcMain.handle('get-webview-preload-path', () => {
  return 'file://' + path.resolve(__dirname, 'webview-preload.js');
});

// ── Web3 Provider: RPC request router ──

// Pending wallet connection requests awaiting user approval
let pendingWalletRequest = null;

ipcMain.handle('web3-request', async (_event, args) => {
  const { method, params } = args || {};
  console.log(`[Web3] RPC request: ${method}`, params || []);

  switch (method) {
    // ── Account Methods ──
    case 'eth_requestAccounts': {
      // If already connected, return stored address immediately
      const existing = store?.get('web3.selectedAddress', null);
      if (existing) return [existing];

      // Prompt user for approval via the React frontend
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw { code: 4001, message: 'No browser window available.' };
      }

      // Extract the requesting origin from the sender
      let origin = 'Unknown dApp';
      try {
        const sender = _event.sender;
        origin = sender.getURL() || origin;
        const parsed = new URL(origin);
        origin = parsed.origin;
      } catch { /* keep default */ }

      return new Promise((resolve, reject) => {
        pendingWalletRequest = { resolve, reject };
        mainWindow.webContents.send('wallet-connection-request', { origin });
      });
    }

    case 'eth_accounts': {
      const address = store?.get('web3.selectedAddress', null);
      return address ? [address] : [];
    }

    // ── Chain Methods ──
    case 'eth_chainId':
      return store?.get('web3.chainId', '0x1') || '0x1';

    case 'net_version':
      return store?.get('web3.networkVersion', '1') || '1';

    // ── Signing (stub — forward to wallet later) ──
    case 'personal_sign':
    case 'eth_sign':
    case 'eth_signTypedData':
    case 'eth_signTypedData_v3':
    case 'eth_signTypedData_v4':
      console.log(`[Web3] Signing request: ${method}`, params);
      throw { code: 4001, message: 'User rejected the request.' };

    // ── Wallet Metadata ──
    case 'wallet_requestPermissions':
      return [{ parentCapability: 'eth_accounts' }];

    case 'wallet_getPermissions':
      return [{ parentCapability: 'eth_accounts' }];

    // ── Default: Forward to an RPC node later ──
    default:
      console.log(`[Web3] Unhandled method: ${method}`);
      throw { code: -32601, message: `Method ${method} not supported yet.` };
  }
});

// ── Web3: Wallet connection response from UI ──

ipcMain.handle('wallet-connection-response', (_event, { approved, address }) => {
  if (!pendingWalletRequest) return;

  if (approved && address) {
    // Store the connected address
    if (store) store.set('web3.selectedAddress', address);
    console.log(`[Web3] User approved connection: ${address}`);
    pendingWalletRequest.resolve([address]);
  } else {
    console.log('[Web3] User rejected connection');
    pendingWalletRequest.reject({ code: 4001, message: 'User rejected the request.' });
  }
  pendingWalletRequest = null;
});

// ── AI Content Extraction ──

ipcMain.handle('get-page-content', async (_event, webContentsId) => {
  try {
    const { webContents } = require('electron');
    const wc = webContents.fromId(webContentsId);
    if (!wc) return '';

    // Wait for DOM to be ready before extracting content
    await waitForDomReady(wc);

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

/** Ensure webContents is ready for executeJavaScript — resolves immediately if loaded, else waits for dom-ready */
function waitForDomReady(wc, timeoutMs = 10000) {
  if (!wc.isLoading()) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    wc.once('dom-ready', () => { clearTimeout(timer); resolve(); });
  });
}

ipcMain.handle('perform-agent-action', async (_event, webContentsId, command) => {
  try {
    const { webContents } = require('electron');
    const wc = webContents.fromId(webContentsId);
    if (!wc) return { error: 'No active webview found.' };

    const { tool, params } = command;
    const selector = (params.selector || params.target || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`');

    // For tools that execute JS in the page, wait until DOM is ready
    if (tool !== 'navigate') {
      await waitForDomReady(wc);
    }

    if (tool === 'navigate') {
      let url = params.url || '';
      if (!url.startsWith('http') && !url.startsWith('onyx://') && !url.startsWith('file://')) {
        url = 'https://' + url;
      } // Auto-prepend https if missing

      try {
        // Send IPC to Renderer to handle navigation (updates React state & UI)
        if (mainWindow) {
          mainWindow.webContents.send('agent-navigate', { webContentsId, url });
        } else {
          wc.loadURL(url);
        }

        // Wait for page to load (Renderer will trigger navigation on this wc)
        const loadPromise = new Promise((resolve) => {
          const timeout = setTimeout(() => resolve('timeout'), 15000);
          wc.once('did-finish-load', () => { clearTimeout(timeout); resolve('loaded'); });
          wc.once('did-fail-load', (_e, code, desc) => { clearTimeout(timeout); resolve('error: ' + desc); });
        });

        const status = await loadPromise;
        const title = await wc.executeJavaScript('document.title').catch(() => url);
        return `Navigated to "${title}" (${status})`;
      } catch (e) {
        return { error: 'Navigation failed: ' + e.message };
      }
    }

    // ── Analyze UI: Spatial DOM Mapper ───────────────
    else if (tool === 'analyze_ui') {
      const result = await wc.executeJavaScript(`
        (function onyxSpatialMap() {
          try {
            document.querySelectorAll('[data-onyx-id]').forEach(function(el) {
              el.removeAttribute('data-onyx-id');
            });
            var SELECTORS = 'a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [role="searchbox"], [role="textbox"], [onclick], summary, label[for]';
            var all = document.querySelectorAll(SELECTORS);
            var map = [];
            var id = 1;
            var vh = window.innerHeight;
            var vw = window.innerWidth;
            for (var i = 0; i < all.length; i++) {
              var el = all[i];
              var rect = el.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) continue;
              if (rect.bottom < -50 || rect.top > vh + 50) continue;
              if (rect.right < -50 || rect.left > vw + 50) continue;
              if (el.tagName === 'INPUT' && el.type === 'hidden') continue;
              var cs = window.getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
              var text = (
                (el.getAttribute('aria-label') || '').trim() ||
                (el.placeholder || '').trim() ||
                (el.title || '').trim() ||
                (el.alt || '').trim() ||
                (el.value && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? el.value : '').trim() ||
                (el.innerText || '').trim().substring(0, 80) ||
                ''
              );
              var tag = el.tagName.toLowerCase();
              var elType = tag;
              if (tag === 'input') elType = 'input[' + (el.type || 'text') + ']';
              var role = el.getAttribute('role');
              if (role) elType = role;
              el.setAttribute('data-onyx-id', String(id));
              var entry = { id: id, tag: elType, text: text.substring(0, 80) || '[no label]' };
              if (el.tagName === 'A' && el.getAttribute('href')) {
                entry.href = el.getAttribute('href').substring(0, 120);
              }
              map.push(entry);
              id++;
              if (id > 100) break;
            }
            return JSON.stringify(map);
          } catch (err) {
            return JSON.stringify({ error: err.message });
          }
        })()
      `);

      // result comes back as a JSON string — pass through as-is
      return result;
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
      // ── Fast-path: Spatial DOM ID from analyze_ui ──
      if (params.onyxId != null) {
        const oid = String(params.onyxId);
        const result = await wc.executeJavaScript(`
          (() => {
            try {
              const el = document.querySelector('[data-onyx-id="${oid}"]');
              if (!el) return { error: "Element #${oid} not found — the page may have changed. Run analyze_ui again." };
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('onyx-highlight');
              if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search') && el.form) {
                setTimeout(() => { el.form.requestSubmit(); el.classList.remove('onyx-highlight'); }, 400);
                return { success: true, label: 'Form submitted', strategy: 'onyx-id', tag: el.tagName };
              }
              setTimeout(() => { el.click(); setTimeout(() => el.classList.remove('onyx-highlight'), 1000); }, 400);
              const label = (el.innerText || el.value || el.getAttribute('aria-label') || '#${oid}').substring(0, 50).trim();
              return { success: true, label: label, strategy: 'onyx-id', tag: el.tagName };
            } catch (err) { return { error: "Click failed: " + err.message }; }
          })()
        `);
        if (result.error) return result.error;
        return "Clicked " + (result.tag || '') + " '" + result.label + "' via spatial ID #" + oid;
      }

      // ── Legacy: text-match / CSS selector path ──
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

      // ── Fast-path: Spatial DOM ID from analyze_ui ──
      if (params.onyxId != null) {
        const oid = String(params.onyxId);
        const result = await wc.executeJavaScript(`
          (() => {
            try {
              const el = document.querySelector('[data-onyx-id="${oid}"]');
              if (!el) return { error: "Element #${oid} not found — run analyze_ui again." };
              el.focus();
              el.click();
              el.classList.add('onyx-highlight');
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              try {
                const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                if (nativeSetter) { nativeSetter.call(el, "${safeText}"); } else { el.value = "${safeText}"; }
              } catch(e) { el.value = "${safeText}"; }
              el.dispatchEvent(new Event('focus', { bubbles: true }));
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              setTimeout(() => el.classList.remove('onyx-highlight'), 2000);
              const label = el.placeholder || el.name || el.id || el.tagName;
              return { success: true, strategy: 'onyx-id', label: label };
            } catch (err) { return { error: "Type failed: " + err.message }; }
          })()
        `);
        if (result.error) return result.error;
        return 'Typed "' + params.text + '" into \'' + result.label + '\' via spatial ID #' + oid + '. Use keypress Enter to submit.';
      }

      // ── Legacy: text-match path ──
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

            // 5. Auto-submit removed — the LLM now sends a separate "keypress" action.
            // We keep Enter dispatch as a safety net but don't report it to the LLM.

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
      return 'Typed "' + params.text + '" into \'' + result.label + '\'. Found using ' + result.strategy + ' strategy. Use keypress Enter to submit.';
    }

    else if (tool === 'keypress') {
      const keyName = (params.value || params.key || 'Enter');
      const keyCode = keyName === 'Enter' ? 13 : keyName === 'Tab' ? 9 : keyName === 'Escape' ? 27 : 0;
      const safeKey = keyName.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');

      // First: use Electron's native input API for maximum compatibility.
      // This fires a real OS-level key event that sites can't distinguish from a human.
      try {
        wc.sendInputEvent({ type: 'keyDown', keyCode: keyName });
        wc.sendInputEvent({ type: 'char', keyCode: keyName });
        wc.sendInputEvent({ type: 'keyUp', keyCode: keyName });
      } catch (e) {
        console.warn('[Agent] sendInputEvent failed, falling back to JS dispatch:', e.message);
      }

      // Second: dispatch synthetic DOM events as a belt-and-suspenders fallback.
      // composed:true ensures the event crosses shadow DOM boundaries (Google uses them).
      const result = await wc.executeJavaScript(`
        (() => {
          try {
            const el = document.activeElement || document.body;
            const opts = {
              key: "${safeKey}",
              code: "${safeKey}",
              keyCode: ${keyCode},
              which: ${keyCode},
              bubbles: true,
              cancelable: true,
              composed: true
            };
            el.dispatchEvent(new KeyboardEvent('keydown', opts));
            el.dispatchEvent(new KeyboardEvent('keypress', opts));
            el.dispatchEvent(new KeyboardEvent('keyup', opts));

            // Fail-safe for Enter: walk up to the nearest form and submit it.
            // This catches cases where the site swallows keyboard events (React, etc.)
            if ("${safeKey}" === "Enter") {
              const form = el.closest ? el.closest('form') : (el.form || null);
              if (form) {
                try { form.requestSubmit(); } catch(e) { form.submit(); }
              }
            }
            return "Pressed ${safeKey} on " + (el.tagName || "page");
          } catch(e) {
            return { error: "Keypress dispatch failed: " + e.message };
          }
        })()
      `);

      // For Enter after typing into search — also wait briefly for navigation to start,
      // then wait for the page load to complete before returning
      if (keyName === 'Enter') {
        try {
          await new Promise(resolve => {
            const timeout = setTimeout(() => resolve('no-nav'), 5000);
            // Listen for navigation triggered by the form submit
            const onNav = () => { clearTimeout(timeout); resolve('navigated'); };
            wc.once('did-start-loading', onNav);
            // If the page is already navigating (e.g. form.submit was synchronous)
            setTimeout(() => {
              if (wc.isLoading()) {
                clearTimeout(timeout);
                wc.removeListener('did-start-loading', onNav);
                wc.once('did-finish-load', () => resolve('loaded'));
              }
            }, 300);
          });
        } catch (e) {
          // Non-critical: navigation wait failed, continue anyway
        }
      }

      if (result?.error) return result.error;
      return result;
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

// ── Groq AI Proxy (Onyx Lite fallback) ──

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',      // Primary: Llama 3.3 70B
  'llama-3.1-8b-instant',         // Fast fallback: Llama 3.1 8B
  'gemma2-9b-it',                 // Backup: Gemma 2 9B
];

ipcMain.handle('groq-chat', async (_event, apiKey, messages) => {
  for (let i = 0; i < GROQ_MODELS.length; i++) {
    const model = GROQ_MODELS[i];
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.1,
          max_tokens: 4096
        })
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`[Groq] ${model} Error (${response.status}):`, errBody);
        continue;
      }

      const data = await response.json();
      console.log(`[Groq] Success with ${model}`);
      return { content: data.choices[0].message.content };

    } catch (err) {
      console.error(`[Groq] ${model} failed:`, err.message);
      if (i < GROQ_MODELS.length - 1) continue;
      return { error: err.message };
    }
  }
  return { error: 'All Groq models are rate-limited. Please try again in a minute.' };
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

// ── Custom Protocol Registration ──
// Register 'onyx://' as a protocol handled by this application.
// In development (process.defaultApp is true), Electron is the executable,
// so we must pass the script path as an extra argument.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('onyx', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('onyx');
}

// ── Single Instance Lock ──
// Ensure only one instance runs. When a second instance is launched (e.g. via
// an onyx:// link on Windows/Linux), focus the existing window and capture the URL.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    // On Windows/Linux the protocol URL is the last argument
    const url = commandLine.find((arg) => arg.startsWith('onyx://'));
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (url) {
        mainWindow.webContents.send('protocol-url', url);
      }
    }
  });

  // macOS handles protocol URLs via the 'open-url' event
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.webContents.send('protocol-url', url);
    }
  });
}

// ── App Lifecycle ──

app.whenReady().then(async () => {
  // ── CSP: Allow WalletConnect & YouTube ──
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https://* wss://*; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://* blob:; connect-src 'self' https://* wss://* http://localhost:* http://127.0.0.1:*; img-src 'self' data: https://*; font-src 'self' data: https://fonts.gstatic.com; media-src 'self' https: blob:; frame-src 'self' https://*;",
        ],
      },
    });
  });

  // 1. Initialize Store (Fast, blocking to ensure data is ready)
  await initStore();

  // 1a. Spawn FastAPI backend process (graceful degradation if missing)
  const isPackaged = app.isPackaged;
  if (isPackaged) {
    const binaryName = process.platform === 'win32' ? 'onyx-brain.exe' : 'onyx-brain';
    const backendPath = path.join(process.resourcesPath, 'onyx-brain', binaryName);
    if (fs.existsSync(backendPath)) {
      backendProcess = spawn(backendPath, [], { stdio: ['ignore', 'pipe', 'pipe'] });
      backendProcess.on('error', (err) => {
        console.log('[Backend] AI Backend failed to start:', err.message);
      });
    } else {
      console.log('[Backend] AI Backend executable not found at:', backendPath);
      console.log('[Backend] Onyx is starting in Browser-Only mode.');
    }
  } else {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(__dirname, '..', 'backend', 'run.py');
    if (fs.existsSync(scriptPath)) {
      backendProcess = spawn(pythonCmd, [scriptPath], {
        cwd: path.join(__dirname, '..', 'backend'),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      backendProcess.on('error', (err) => {
        console.log('[Backend] AI Backend failed to start:', err.message);
      });
    } else {
      console.log('[Backend] Backend script not found at:', scriptPath);
      console.log('[Backend] Onyx is starting in Browser-Only mode.');
    }
  }

  if (backendProcess) {
    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data.toString().trim()}`);
    });
    backendProcess.stderr.on('data', (data) => {
      console.log(`[Backend:err] ${data.toString().trim()}`);
    });
    backendProcess.on('close', (code) => {
      console.log(`[Backend] Process exited with code ${code}`);
      backendProcess = null;
    });
  }

  // 2. Launch UI immediately
  createWindow();

  // 2a. Startup sync: push any saved API keys to the FastAPI backend
  //     (runs in background, retries until backend is reachable)
  (async () => {
    if (!store) return;
    const keys = store.get('apiKeys', {});
    const providers = Object.entries(keys).filter(([, v]) => v);
    if (providers.length === 0) return;

    const http = require('http');
    const postKey = (provider, apiKey) => new Promise((resolve, reject) => {
      const data = JSON.stringify({ provider, api_key: apiKey });
      const req = http.request({
        hostname: '127.0.0.1', port: 8000, path: '/api/settings/keys',
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
    const healthCheck = () => new Promise((resolve, reject) => {
      const req = http.get('http://127.0.0.1:8000/health', (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject);
    });

    for (let attempt = 0; attempt < 15; attempt++) {
      try { await healthCheck(); break; } catch {
        await new Promise(r => setTimeout(r, 2000));
        if (attempt === 14) { console.warn('[Settings] Backend not reachable, skipping key sync'); return; }
      }
    }
    for (const [provider, key] of providers) {
      try {
        await postKey(provider, key);
        console.log(`[Settings] Startup sync: ${provider} key pushed to backend`);
      } catch (err) {
        console.warn(`[Settings] Startup sync failed for ${provider}:`, err.message);
      }
    }
  })();

  // 2b. Initialize TabManager (WebContentsView-based tab rendering)
  tabManager = new TabManager(mainWindow, store, {
    injectCosmeticFilters,
    observerScript,
    hijackScript,
  });

  // ── Tab Manager IPC Handlers ──
  ipcMain.handle('tab-create', (_event, { tabId, url, isIncognito }) => {
    return tabManager.createTab(tabId, url, isIncognito);
  });
  ipcMain.handle('tab-close', (_event, { tabId }) => {
    tabManager.closeTab(tabId);
  });
  ipcMain.handle('tab-switch', (_event, { tabId, isInternalPage }) => {
    tabManager.switchTab(tabId, isInternalPage);
  });
  ipcMain.handle('tab-navigate', (_event, { tabId, url }) => {
    tabManager.navigate(tabId, url);
  });
  ipcMain.handle('tab-go-back', (_event, { tabId }) => {
    tabManager.goBack(tabId);
  });
  ipcMain.handle('tab-go-forward', (_event, { tabId }) => {
    tabManager.goForward(tabId);
  });
  ipcMain.handle('tab-reload', (_event, { tabId }) => {
    tabManager.reload(tabId);
  });
  ipcMain.handle('tab-find-in-page', (_event, { tabId, text, options }) => {
    tabManager.findInPage(tabId, text, options);
  });
  ipcMain.handle('tab-stop-find-in-page', (_event, { tabId, action }) => {
    tabManager.stopFindInPage(tabId, action);
  });
  ipcMain.handle('tab-set-zoom-level', (_event, { tabId, level }) => {
    tabManager.setZoomLevel(tabId, level);
  });
  ipcMain.handle('tab-get-zoom-level', (_event, { tabId }) => {
    return tabManager.getZoomLevel(tabId);
  });
  ipcMain.handle('tab-get-nav-state', (_event, { tabId }) => {
    return tabManager.getNavState(tabId);
  });
  ipcMain.on('update-tab-bounds', (_event, { menuOpen, aiOpen }) => {
    tabManager.updateBounds(menuOpen, aiOpen);
  });

  // ── Agentic Omnibox: /command execution via FastAPI backend ──
  ipcMain.handle('execute-agent-command', async (_event, { command, tabId }) => {
    try {
      const cmd = command.trim().toLowerCase();

      // ── Normalize command aliases ──
      // Users may type /find, /go, /visit, /goto, /look — map to canonical commands.
      let normalizedCmd = cmd;
      let normalizedCommand = command.trim();
      const aliasMap = [
        { patterns: ['/find ', '/lookup ', '/look up '], canonical: '/search', sliceLengths: [6, 8, 9] },
        { patterns: ['/go ', '/visit ', '/goto ', '/navigate '], canonical: '/open', sliceLengths: [4, 7, 6, 10] },
      ];
      for (const { patterns, canonical, sliceLengths } of aliasMap) {
        for (let i = 0; i < patterns.length; i++) {
          if (cmd.startsWith(patterns[i]) || cmd === patterns[i].trim()) {
            const rest = command.trim().slice(sliceLengths[i]).trim();
            normalizedCmd = `${canonical} ${rest}`.trim().toLowerCase();
            normalizedCommand = `${canonical} ${rest}`.trim();
            break;
          }
        }
        if (normalizedCmd !== cmd) break;
      }

      // ── Local command router (no backend needed) ──

      if (normalizedCmd.startsWith('/open')) {
        const target = normalizedCommand.slice(5).trim();
        if (!target) return { action: 'respond', text: 'Usage: /open <site or URL>  (e.g. /open youtube)' };
        let url;
        if (target.includes('://')) url = target;
        else if (target.includes('.')) url = 'https://' + target;
        else url = `https://www.${target}.com`;
        const result = { action: 'navigate', url, text: `Navigating to ${url}` };
        const entry = tabManager.tabs.get(tabId);
        if (entry) {
          entry.view.webContents.loadURL(url).catch(() => {});
        } else {
          mainWindow.webContents.send('agent-navigate-url', { tabId, url });
        }
        return result;
      }

      if (normalizedCmd.startsWith('/search')) {
        const query = normalizedCommand.slice(7).trim();
        if (!query) return { action: 'respond', text: 'Usage: /search <query>  (e.g. /search wikipedia for kohli)' };
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        const result = { action: 'navigate', url, text: `Searching for "${query}"` };
        const entry = tabManager.tabs.get(tabId);
        if (entry) {
          entry.view.webContents.loadURL(url).catch(() => {});
        } else {
          mainWindow.webContents.send('agent-navigate-url', { tabId, url });
        }
        return result;
      }

      if (normalizedCmd.startsWith('/help')) {
        return {
          action: 'respond',
          text: 'Available commands:\n/open <site> \u2014 Navigate to a website (e.g. /open youtube)\n/search <query> \u2014 Search the web (e.g. /search weather today)\n/summarize \u2014 Summarize the current page\n/ask <question> \u2014 Ask a question about the page\n/click <description> \u2014 Click an element (e.g. /click Sign In button)\n/help \u2014 Show this help message',
        };
      }

      // ── Commands that need the backend ──

      let currentUrl = '';
      try {
        const navState = tabManager.getNavState(tabId);
        currentUrl = navState?.url || '';
      } catch {}

      // Extract page text from the active WebContentsView for context
      let pageContext = '';
      let domMapJson = '[]';
      try {
        const wc = tabManager._wc(tabId);
        if (wc) {
          const rawText = await wc.executeJavaScript('document.body.innerText');
          pageContext = (rawText || '').substring(0, 15000);

          // ── Spatial DOM Tagger: tag interactive elements with data-onyx-id ──
          // This runs for ALL backend-bound commands (especially /click) so the
          // LLM can reference elements by their tagged IDs.
          const domMapScript = `
            (() => {
              try {
                // Clear previous tags
                document.querySelectorAll('[data-onyx-id]').forEach(el => el.removeAttribute('data-onyx-id'));
                const SELECTORS = 'a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [role="searchbox"], [role="textbox"], [onclick], summary, label[for]';
                const all = document.querySelectorAll(SELECTORS);
                const map = [];
                let id = 0;
                const vh = window.innerHeight;
                const vw = window.innerWidth;
                for (let i = 0; i < all.length; i++) {
                  const el = all[i];
                  const rect = el.getBoundingClientRect();
                  if (rect.width <= 0 || rect.height <= 0) continue;
                  if (rect.bottom < -50 || rect.top > vh + 50) continue;
                  if (rect.right < -50 || rect.left > vw + 50) continue;
                  if (el.tagName === 'INPUT' && el.type === 'hidden') continue;
                  const cs = window.getComputedStyle(el);
                  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
                  const text = (
                    (el.getAttribute('aria-label') || '').trim() ||
                    (el.placeholder || '').trim() ||
                    (el.title || '').trim() ||
                    (el.alt || '').trim() ||
                    (el.value && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? el.value : '').trim() ||
                    (el.innerText || '').trim().substring(0, 80) ||
                    ''
                  );
                  let tag = el.tagName.toLowerCase();
                  if (tag === 'input') tag = 'input[' + (el.type || 'text') + ']';
                  const role = el.getAttribute('role');
                  if (role) tag = role;
                  el.setAttribute('data-onyx-id', String(id));
                  const entry = { id: String(id), tag: tag, text: text.substring(0, 80) || '[no label]', type: el.type || '' };
                  if (el.tagName === 'A' && el.getAttribute('href')) {
                    entry.href = el.getAttribute('href').substring(0, 120);
                  }
                  map.push(entry);
                  id++;
                  if (id > 150) break;
                }
                return JSON.stringify(map);
              } catch (err) {
                return '[]';
              }
            })()
          `;
          domMapJson = await wc.executeJavaScript(domMapScript) || '[]';
        }
      } catch {}

      let resp;
      try {
        resp = await require('electron').net.fetch('http://localhost:8000/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, current_url: currentUrl, tab_id: tabId, context: pageContext, dom_map: domMapJson }),
        });
      } catch (fetchErr) {
        return { action: 'respond', error: 'Backend is not running. Start it with: cd backend && uvicorn main:app --reload --port 8000' };
      }

      if (!resp.ok) {
        return { error: `Backend returned ${resp.status}` };
      }

      const result = await resp.json();

      // ── Action Router: execute the backend's instruction ──

      if (result.action === 'navigate' && result.url) {
        const entry = tabManager.tabs.get(tabId);
        if (entry) {
          entry.view.webContents.loadURL(result.url).catch(() => {});
        } else {
          mainWindow.webContents.send('agent-navigate-url', { tabId, url: result.url });
        }
      } else if (result.action === 'click' && result.target_id != null) {
        const wc = tabManager._wc(tabId);
        if (wc) {
          const oid = String(result.target_id);
          const clickResult = await wc.executeJavaScript(`
            (() => {
              try {
                const el = document.querySelector('[data-onyx-id="${oid}"]');
                if (!el) return { error: "Element #${oid} not found on the page." };
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Onyx Pulse highlight
                el.style.outline = '2px solid #00f2ea';
                el.style.boxShadow = '0 0 15px #00f2ea';
                el.style.borderRadius = '4px';
                el.style.transition = 'all 0.3s ease';
                setTimeout(() => {
                  el.click();
                  setTimeout(() => {
                    el.style.outline = '';
                    el.style.boxShadow = '';
                    el.style.borderRadius = '';
                  }, 1000);
                }, 400);
                const label = (el.innerText || el.value || el.getAttribute('aria-label') || '#${oid}').substring(0, 60).trim();
                return { success: true, label: label, tag: el.tagName };
              } catch (err) {
                return { error: err.message };
              }
            })()
          `).catch(() => ({ error: 'JS execution failed' }));
          // Enrich the result text with the click outcome
          if (clickResult?.success) {
            result.text = `Clicked ${clickResult.tag} "${clickResult.label}" (element #${oid}).`;
          } else if (clickResult?.error) {
            result.text = clickResult.error;
          }
        }
      }

      return result;
    } catch (err) {
      return { error: err.message || 'Agent command failed' };
    }
  });

  // 3. Register ad-blocking interceptor IMMEDIATELY with fallback filters
  //    so requests are blocked from the very first page load. The engine
  //    will be upgraded in-place once full filter lists are downloaded.
  {
    const webviewSession = session.fromPartition('persist:main');
    const filter = { urls: ['http://*/*', 'https://*/*'] };

    // Map Electron resourceType → adblock request type
    const RESOURCE_TYPE_MAP = {
      mainFrame: 'document',
      subFrame: 'subdocument',
      stylesheet: 'stylesheet',
      script: 'script',
      image: 'image',
      font: 'font',
      object: 'object',
      xhr: 'xmlhttprequest',
      ping: 'ping',
      media: 'media',
      websocket: 'websocket',
      other: 'other',
    };

    const unifiedHandler = (details, callback) => {
      // If shield is disabled by user, pass everything through
      if (!shieldEnabled) return callback({ cancel: false });

      // ── Fast-path: never block navigation or worker frames ──
      // Blocking these causes infinite reload loops and SPA breakage.
      const rt = details.resourceType;
      if (rt === 'mainFrame' || rt === 'subFrame' || rt === 'serviceWorker') {
        return callback({ cancel: false });
      }

      // ── YouTube / video stream fast-path ──
      // YouTube's ptracking and googlevideo streams must not be blocked or
      // the player triggers a hard page reload. Cosmetic CSS handles UI ads.
      const url = details.url;
      if (url.includes('youtube.com/ptracking') ||
          url.includes('youtube.com/api/stats/') ||
          url.includes('googlevideo.com')) {
        return callback({ cancel: false });
      }

      const requestType = RESOURCE_TYPE_MAP[rt] || 'other';

      // ── Async timeout valve: 50ms budget for engine checks ──
      // If the Rust + Cliqz engines can't decide within 50ms, allow the
      // request through. A leaked tracking pixel is cheaper than a 20s hang.
      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        callback(result);
      };

      // Start the 50ms deadline
      const timer = setTimeout(() => settle({ cancel: false }), 50);

      // Run engine checks asynchronously via microtask
      Promise.resolve().then(() => {
        // Primary: Brave adblock engine (full EasyList/uBlock rules)
        if (rustShield) {
          try {
            const result = rustShield.checkNetworkRequest(
              url,
              details.referrer || '',
              requestType
            );

            if (result.exception) {
              clearTimeout(timer);
              return settle({ cancel: false });
            }

            if (result.blocked) {
              blockedCount++;
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('ad-blocked', blockedCount);
              }
              clearTimeout(timer);
              return settle({ cancel: true });
            }

            // Brave says not blocked — trust it
            clearTimeout(timer);
            return settle({ cancel: false });
          } catch (e) {
            // Rust engine error — fall through to Cliqz
          }
        }

        // Fallback: Cliqz EasyList/EasyPrivacy filter matching
        if (blocker) {
          try {
            const request = AdblockerRequest.fromRawDetails({
              url,
              type: rt || 'other',
              sourceUrl: details.referrer || '',
            });
            const { match } = blocker.match(request);
            if (match) {
              blockedCount++;
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('ad-blocked', blockedCount);
              }
              clearTimeout(timer);
              return settle({ cancel: true });
            }
          } catch (e) {
            // Cliqz error — fall through to allow
          }
        }

        // Neither engine blocked — allow through
        clearTimeout(timer);
        settle({ cancel: false });
      });
    };

    webviewSession.webRequest.onBeforeRequest(filter, unifiedHandler);
    // Note: Do NOT register on session.defaultSession — that session serves the
    // BrowserWindow's renderer (React app from Vite). Intercepting it blocks
    // the app's own JS/CSS/HMR resources and causes a blank screen.
    // Webview content uses the 'persist:main' partition which IS intercepted above.
    console.log(`[OnyxShield] Interceptor registered — Rust engine ${rustShield ? 'ready (' + rustShield.filterCount() + ' fallback filters)' : 'unavailable'}`);
  }

  // 4. Load heavy services in the background (upgrades engine in-place)
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
      // Note: we do NOT call enableBlockingInSession here.
      // The unified Onyx Shield handler below manages both Rust + Cliqz
      // through a single onBeforeRequest interceptor.

      blocker.on('request-blocked', () => {
        // This fires for Cliqz's internal cosmetic filtering (CSS injection).
        // Network blocking is handled by our unified handler below.
      });
      console.log('[AdBlocker] Cliqz filter engine initialized');
    } catch (err) {
      console.error('[AdBlocker] Failed to initialize:', err.message);
    }

    // ── Download & load EasyList + uBlock Origin filter lists into Rust engine ──
    if (rustShield) {
      try {
        const fsPromises = require('fs').promises;
        const cachePath = path.join(app.getPath('userData'), 'onyx-shield-filters.json');
        const FILTER_URLS = [
          'https://easylist.to/easylist/easylist.txt',
          'https://easylist.to/easylist/easyprivacy.txt',
          'https://raw.githubusercontent.com/nickkelly1/nickkelly.github.io/refs/heads/master/nicktrackerblock/filterlist.txt',
        ];

        let filterTexts = [];
        let usedCache = false;

        // Try loading from cache first (< 24h old)
        try {
          const stat = await fsPromises.stat(cachePath);
          const ageMs = Date.now() - stat.mtimeMs;
          if (ageMs < 24 * 60 * 60 * 1000) {
            const cached = JSON.parse(await fsPromises.readFile(cachePath, 'utf-8'));
            if (Array.isArray(cached) && cached.length > 0) {
              filterTexts = cached;
              usedCache = true;
              console.log(`[OnyxShield] Loaded ${cached.length} filter lists from cache`);
            }
          }
        } catch { }

        // Download fresh if no valid cache
        if (!usedCache) {
          const results = await Promise.allSettled(
            FILTER_URLS.map(async (url) => {
              const resp = await fetch(url);
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
              return resp.text();
            })
          );
          filterTexts = results
            .filter((r) => r.status === 'fulfilled')
            .map((r) => r.value);

          // Save to cache
          if (filterTexts.length > 0) {
            await fsPromises.writeFile(cachePath, JSON.stringify(filterTexts)).catch(() => { });
          }
          console.log(`[OnyxShield] Downloaded ${filterTexts.length}/${FILTER_URLS.length} filter lists`);
        }

        if (filterTexts.length > 0) {
          const total = rustShield.loadFilterLists(filterTexts);
          console.log(`[OnyxShield] Brave engine loaded — ${total} total filter rules`);
        }
      } catch (err) {
        console.error('[OnyxShield] Failed to load filter lists:', err.message);
      }
    }

    // Sync shieldEnabled with stored user preference
    if (store) {
      shieldEnabled = store.get('adBlock', true);
    }

    console.log(`[OnyxShield] Background init complete — Brave (${rustShield ? rustShield.filterCount() + ' filters' : 'unavailable'}) + Cliqz (${blocker ? 'loaded' : 'unavailable'})`);
  })();
});

// ── Zombie Killer: Ensure backend process dies when app quits ──
app.on('will-quit', () => {
  if (backendProcess) {
    console.log('[Backend] Killing backend process...');
    backendProcess.kill();
    backendProcess = null;
  }
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
