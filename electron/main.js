const { app, BrowserWindow, Menu, ipcMain, session, dialog } = require('electron');
const path = require('path');
const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const { Request: AdblockerRequest } = require('@cliqz/adblocker');
const fetch = require('cross-fetch');

// ── Rust-powered Onyx Shield Engine (NAPI-RS) ──
let rustShield = null;
try {
  const { ShieldEngine } = require('../onyx-shield');
  rustShield = new ShieldEngine();
  console.log(`[OnyxShield] Rust engine loaded — ${rustShield.domainCount()} domains in HashSet`);
} catch (e) {
  console.warn('[OnyxShield] Rust native module not available, falling back to Cliqz only:', e.message);
}

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
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // ── Webview security: validate preload paths ──
  const allowedPreload = path.resolve(__dirname, 'webview-preload.js');
  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences) => {
    // Normalize: Electron may pass the path with or without file:// prefix
    const incomingPreload = (webPreferences.preload || '')
      .replace(/^file:\/\//, '');

    if (incomingPreload && path.resolve(incomingPreload) !== allowedPreload) {
      console.warn('[Security] Blocked unauthorized webview preload:', webPreferences.preload);
      delete webPreferences.preload;
    } else if (!incomingPreload) {
      // No preload set — inject ours for Web3 support
      webPreferences.preload = allowedPreload;
    }
    // Lock down webview security
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
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

ipcMain.handle('set-api-key', (_event, provider, key) => {
  if (!store) return;
  store.set(`apiKeys.${provider}`, key || '');
  console.log(`[Settings] API key ${key ? 'saved' : 'cleared'} for: ${provider}`);
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

    // Sync shieldEnabled with stored user preference
    if (store) {
      shieldEnabled = store.get('adBlock', true);
    }

    // ── Unified Onyx Shield: Rust O(1) fast-path + Cliqz deep filter ──
    // Electron only supports one onBeforeRequest handler per session, so we
    // unify both engines into a single interceptor. The Rust HashSet provides
    // instant domain-level blocking; Cliqz handles complex filter rules
    // (cosmetic, exception lists, regex patterns) that the HashSet can't.
    {
      const webviewSession = session.fromPartition('persist:main');
      const filter = { urls: ['http://*/*', 'https://*/*'] };

      const unifiedHandler = (details, callback) => {
        // If shield is disabled by user, pass everything through
        if (!shieldEnabled) return callback({ cancel: false });

        // Fast path: Rust HashSet O(1) domain check
        if (rustShield && rustShield.shouldBlock(details.url)) {
          blockedCount++;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ad-blocked', blockedCount);
          }
          return callback({ cancel: true });
        }

        // Deep path: Cliqz EasyList/EasyPrivacy filter matching
        if (blocker) {
          const request = AdblockerRequest.fromRawDetails({
            url: details.url,
            type: details.resourceType || 'other',
            sourceUrl: details.referrer || '',
          });
          const { match } = blocker.match(request);
          if (match) {
            blockedCount++;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('ad-blocked', blockedCount);
            }
            return callback({ cancel: true });
          }
        }

        callback({ cancel: false });
      };

      webviewSession.webRequest.onBeforeRequest(filter, unifiedHandler);
      session.defaultSession.webRequest.onBeforeRequest(filter, unifiedHandler);
      console.log(`[OnyxShield] Unified interceptor active — Rust (${rustShield ? rustShield.domainCount() + ' domains' : 'unavailable'}) + Cliqz (${blocker ? 'loaded' : 'unavailable'})`);
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
