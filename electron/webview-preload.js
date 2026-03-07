/**
 * webview-preload.js — Injected into every <webview> guest page.
 *
 * Provides an EIP-1193 compatible `window.ethereum` provider so dApps
 * detect Onyx as a wallet without needing a MetaMask extension.
 * All RPC calls are forwarded to the Electron main process via IPC.
 */
const { contextBridge, ipcRenderer } = require('electron');

// ── Event emitter internals (stored in preload isolation context) ──
const listeners = {};

function emit(event, ...args) {
  if (listeners[event]) {
    listeners[event].forEach((fn) => {
      try { fn(...args); } catch (e) { console.error('[OnyxWallet] listener error:', e); }
    });
  }
}

// Forward events from main process to page-side listeners
ipcRenderer.on('web3-event', (_event, { event: eventName, data }) => {
  emit(eventName, data);
});

// ── EIP-1193 Provider ──
const provider = {
  // Identity
  isOnyx: true,
  isMetaMask: true, // Legacy dApp compat — many hardcode this check

  // EIP-1193: Primary RPC method
  request: async (args) => {
    return await ipcRenderer.invoke('web3-request', args);
  },

  // EIP-1193: Event emitter interface
  on: (event, callback) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
    return provider;
  },

  removeListener: (event, callback) => {
    if (listeners[event]) {
      listeners[event] = listeners[event].filter((fn) => fn !== callback);
    }
    return provider;
  },

  // Legacy: MetaMask-style enable() (deprecated EIP-1102)
  enable: async () => {
    return await ipcRenderer.invoke('web3-request', { method: 'eth_requestAccounts' });
  },

  // Legacy: old-style send (synchronous shape, async under the hood)
  send: (methodOrPayload, paramsOrCallback) => {
    // MetaMask-compatible overloaded send()
    if (typeof methodOrPayload === 'string') {
      return provider.request({ method: methodOrPayload, params: paramsOrCallback || [] });
    }
    // JSON-RPC payload object
    if (typeof paramsOrCallback === 'function') {
      provider.request({ method: methodOrPayload.method, params: methodOrPayload.params || [] })
        .then((result) => paramsOrCallback(null, { id: methodOrPayload.id, jsonrpc: '2.0', result }))
        .catch((err) => paramsOrCallback(err, null));
      return;
    }
    return provider.request({ method: methodOrPayload.method, params: methodOrPayload.params || [] });
  },

  // Legacy: sendAsync (callback-based)
  sendAsync: (payload, callback) => {
    provider.request({ method: payload.method, params: payload.params || [] })
      .then((result) => callback(null, { id: payload.id, jsonrpc: '2.0', result }))
      .catch((err) => callback(err, null));
  },
};

// Expose as window.ethereum for dApp detection
contextBridge.exposeInMainWorld('ethereum', provider);
