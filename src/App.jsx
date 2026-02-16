import React, { useState, useRef, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import Favicon from './components/Favicon';
import TopBar from './components/TopBar';
import AboutModal from './components/AboutModal';
import SettingsModal, { SEARCH_ENGINES } from './components/SettingsModal';
import FindBar from './components/FindBar';
import HistoryPage from './components/HistoryPage';
import Web3Panel from './components/Web3Panel';
import AISidebar from './components/AISidebar';
import HomePage from './components/HomePage';
import ErrorBoundary from './components/ErrorBoundary';
import { useWallet } from './hooks/useWallet';
import './App.css';

// Helper: detect internal onyx:// URLs
function isInternalUrl(url) {
  return url && url.startsWith('onyx://');
}
function getInternalPage(url) {
  if (!url) return null;
  const match = url.match(/^onyx:\/\/(.*)/);
  return match ? match[1].toLowerCase() : null;
}

dayjs.extend(relativeTime);

let nextTabId = 2;

// Detect if this window is incognito
const isIncognito = new URLSearchParams(window.location.search).get('incognito') === '1';

function createTab(url = 'onyx://newtab') {
  return { id: nextTabId++, url, title: 'New Tab', isLoading: false, favicon: null };
}

function App() {
  const [tabs, setTabs] = useState([
    { id: 1, url: 'onyx://newtab', title: 'New Tab', isLoading: false, favicon: null },
  ]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [currentUrl, setCurrentUrl] = useState('onyx://newtab');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Overlay menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState('tabs'); // 'tabs' | 'history' | 'bookmarks' | 'downloads' | 'wallet'
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /* REMOVED DUPLICATE */
  const [searchEngine, setSearchEngine] = useState('google');

  // AI Sidebar
  const [aiOpen, setAiOpen] = useState(false);

  // Find-in-page
  const [showFindBar, setShowFindBar] = useState(false);

  // Zoom badge
  const [zoomBadge, setZoomBadge] = useState(null);
  const zoomBadgeTimer = useRef(null);

  // Library data
  const [history, setHistory] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [downloads, setDownloads] = useState([]);

  // Ad-blocker
  const [blockedCount, setBlockedCount] = useState(0);

  // Audio state per tab (keyed by webContentsId)
  const [audioState, setAudioState] = useState({}); // { webContentsId: { isPlaying, isMuted } }
  // Map tabId -> webContentsId to safe lookup without calling methods in render
  const [wcIds, setWcIds] = useState({});
  const activeWebContentsId = wcIds[activeTabId];

  // Security status
  const [securityStatus, setSecurityStatus] = useState(null); // { secure: bool, url: string }

  // Web3 wallet
  const wallet = useWallet();

  const webviewRefs = useRef({});
  const initialUrls = useRef({ 1: 'onyx://newtab' });
  const cameFromInternal = useRef({}); // Track tabs that navigated from internal pages
  const [webviewGen, setWebviewGen] = useState({}); // Per-tab generation counter for force-remounting webviews
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeIsLoading = activeTab?.isLoading ?? false;

  const loadingTimers = useRef({});

  // ── Helpers ──

  const updateTab = useCallback((id, patch) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const getActiveWebview = useCallback(() => {
    return webviewRefs.current[activeTabId] ?? null;
  }, [activeTabId]);


  // ── Sync URL display on tab switch ──

  useEffect(() => {
    if (activeTab) {
      setCurrentUrl(activeTab.url);
      const wv = webviewRefs.current[activeTabId];
      if (wv) {
        try {
          setCanGoBack(wv.canGoBack() || !!cameFromInternal.current[activeTabId]);
          setCanGoForward(wv.canGoForward());
        } catch {
          setCanGoBack(false);
          setCanGoForward(false);
        }
      } else {
        setCanGoBack(false);
        setCanGoForward(false);
      }
    }
  }, [activeTabId]);

  // ── Recovery: If active tab is lost, reset to first available tab ──
  useEffect(() => {
    // If we have tabs but the activeTabId is invalid, default to the first tab
    if (tabs.length > 0 && !tabs.find(t => t.id === activeTabId)) {
      console.warn('Active tab ID invalid, resetting to first tab');
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  // ── Initialize Library Data ──

  useEffect(() => {
    if (!window.browserAPI) return;
    window.browserAPI.onDownloadStarted((data) => {
      setDownloads((prev) => [...prev, { id: data.id, fileName: data.fileName, percent: 0, state: 'progressing', totalBytes: data.totalBytes }]);
    });
    window.browserAPI.onDownloadProgress((data) => {
      setDownloads((prev) => prev.map((d) => d.id === data.id ? { ...d, percent: data.percent } : d));
    });
    window.browserAPI.onDownloadPaused((data) => {
      setDownloads((prev) => prev.map((d) => d.id === data.id ? { ...d, state: 'paused' } : d));
    });
    window.browserAPI.onDownloadComplete((data) => {
      setDownloads((prev) => prev.map((d) => d.id === data.id ? { ...d, state: data.state, percent: 100, path: data.path } : d));
    });
  }, []);

  // ── New Tab from context menu IPC ──

  useEffect(() => {
    if (!window.browserAPI?.onNewTab) return;
    window.browserAPI.onNewTab((url) => {
      const tab = createTab(url);
      initialUrls.current[tab.id] = url;
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    });
  }, []);

  // ── Audio state listener ──

  useEffect(() => {
    if (!window.browserAPI?.onTabAudioState) return;
    window.browserAPI.onTabAudioState((data) => {
      setAudioState((prev) => ({
        ...prev,
        [data.webContentsId]: { isPlaying: data.isPlaying, isMuted: data.isMuted },
      }));
    });
  }, []);

  // ── Security status listener ──

  useEffect(() => {
    if (!window.browserAPI?.onSecurityStatus) return;
    window.browserAPI.onSecurityStatus((data) => {
      setSecurityStatus(data);
    });
  }, []);

  // ── Load settings on mount ──

  useEffect(() => {
    if (window.browserAPI?.getSettings) {
      window.browserAPI.getSettings().then((s) => {
        if (s?.searchEngine) setSearchEngine(s.searchEngine);
      });
    }
  }, []);

  // ── Session Restore on mount ──

  useEffect(() => {
    if (!window.browserAPI?.getLastSession) return;
    window.browserAPI.getLastSession().then((urls) => {
      if (!urls || urls.length === 0) return;
      // Build tabs from saved session
      const restoredTabs = urls.map((url) => {
        const tab = createTab(url);
        initialUrls.current[tab.id] = url;
        return tab;
      });
      setTabs(restoredTabs);
      setActiveTabId(restoredTabs[0].id);
      setCurrentUrl(restoredTabs[0].url);
    });
  }, []);

  // ── Auto-save session whenever tabs change ──

  useEffect(() => {
    if (!window.browserAPI?.saveSession) return;
    const urls = tabs.map((t) => t.url).filter(Boolean);
    window.browserAPI.saveSession(urls);
  }, [tabs]);

  // ── Load library data when menu section changes ──

  useEffect(() => {
    if (!menuOpen || !window.browserAPI) return;
    if (menuTab === 'history') window.browserAPI.getHistory().then(setHistory);
    else if (menuTab === 'bookmarks') window.browserAPI.getBookmarks().then(setBookmarks);
  }, [menuOpen, menuTab]);

  // ── Ad-blocker listener ──

  /* Ad-blocker listener */
  useEffect(() => {
    if (!window.browserAPI?.onAdBlocked) return;
    window.browserAPI.onAdBlocked((count) => setBlockedCount(count));
  }, []);

  // ── Keyboard shortcuts (Chrome-style) ──

  // ── Zoom badge helper ──
  const showZoomBadge = useCallback((level) => {
    // Convert zoom level to percentage (level 0 = 100%, each step ≈ 10%)
    const percent = Math.round(100 * Math.pow(1.2, level));
    setZoomBadge(`${percent}%`);
    if (zoomBadgeTimer.current) clearTimeout(zoomBadgeTimer.current);
    zoomBadgeTimer.current = setTimeout(() => setZoomBadge(null), 2000);
  }, []);

  useEffect(() => {
    const handleZoom = (direction) => {
      const wv = webviewRefs.current[activeTabIdRef.current];
      if (!wv) return;
      const current = wv.getZoomLevel() || 0;
      let newLevel = current;

      if (direction === 'in') newLevel += 0.5;
      else if (direction === 'out') newLevel -= 0.5;
      else if (direction === '0') newLevel = 0;

      newLevel = Math.max(-5, Math.min(5, newLevel));
      wv.setZoomLevel(newLevel);
      showZoomBadge(newLevel);
    };

    const handleKeyDown = (e) => {
      // Esc to close find bar
      if (e.key === 'Escape') {
        if (showFindBar) {
          e.preventDefault();
          setShowFindBar(false);
          return;
        }
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      switch (e.key) {
        case 'f': // Cmd+F → Find in Page
          e.preventDefault();
          setShowFindBar((prev) => !prev);
          break;

        case 't': // Cmd+T → New Tab
          e.preventDefault();
          handleNewTab();
          break;

        case 'w': // Cmd+W → Close Active Tab
          e.preventDefault();
          handleCloseTab(null, activeTabIdRef.current);
          break;

        case 'r': // Cmd+R → Reload
          e.preventDefault();
          handleReload();
          break;

        case '[': // Cmd+[ → Back
          e.preventDefault();
          handleBack();
          break;

        case ']': // Cmd+] → Forward
          e.preventDefault();
          handleForward();
          break;

        case '=': // Cmd+= → Zoom In
        case '+':
          e.preventDefault();
          handleZoom('in');
          break;

        case '-': // Cmd+- → Zoom Out
          e.preventDefault();
          handleZoom('out');
          break;

        case '0': // Cmd+0 → Reset Zoom
          e.preventDefault();
          handleZoom('0');
          break;

        default:
          break;
      }
    };

    // Cmd+Scroll → Zoom
    const handleWheel = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      const wv = webviewRefs.current[activeTabIdRef.current];
      if (!wv) return;
      const current = wv.getZoomLevel() || 0;
      const delta = e.deltaY < 0 ? 0.5 : -0.5;
      const newLevel = Math.max(-5, Math.min(5, current + delta));
      wv.setZoomLevel(newLevel);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // ── Navigation ──

  const handleNavigate = useCallback((url) => {
    // Handle internal onyx:// URLs
    if (/^onyx:\/\//i.test(url)) {
      const internalUrl = url.toLowerCase();
      updateTab(activeTabId, { url: internalUrl, title: internalUrl.replace('onyx://', '').charAt(0).toUpperCase() + internalUrl.replace('onyx://', '').slice(1) });
      setCurrentUrl(internalUrl);
      setCanGoBack(false);
      return;
    }

    // Track if we're leaving an internal page (so back button stays enabled)
    const leavingInternal = isInternalUrl(currentUrl);

    // If it's a raw search query (no protocol, no dot), redirect to the selected search engine
    let finalUrl = url;
    if (!/^https?:\/\//i.test(url) && !/^\S+\.\S+$/.test(url)) {
      const engine = SEARCH_ENGINES.find((e) => e.value === searchEngine) || SEARCH_ENGINES[0];
      finalUrl = engine.url + encodeURIComponent(url);
    } else if (!/^https?:\/\//i.test(url)) {
      finalUrl = 'https://' + url;
    }
    updateTab(activeTabId, { url: finalUrl });
    setCurrentUrl(finalUrl);

    if (leavingInternal) {
      // Force-remount the webview so it starts with zero history
      cameFromInternal.current[activeTabId] = true;
      initialUrls.current[activeTabId] = finalUrl;
      delete webviewRefs.current[activeTabId];
      setWebviewGen(prev => ({ ...prev, [activeTabId]: (prev[activeTabId] || 0) + 1 }));
      setCanGoBack(true);
    } else {
      const wv = getActiveWebview();
      if (wv) wv.loadURL(finalUrl);
    }
  }, [activeTabId, updateTab, getActiveWebview, searchEngine, currentUrl]);

  const handleBack = useCallback(() => {
    const wv = getActiveWebview();
    const fromInternal = !!cameFromInternal.current[activeTabId];

    if (wv && wv.canGoBack()) {
      // Webview has real history — go back within the site
      wv.goBack();
    } else if (fromInternal) {
      // No webview history but started from Start Page — go home
      delete cameFromInternal.current[activeTabId];
      updateTab(activeTabId, { url: 'onyx://newtab', title: 'New Tab' });
      setCurrentUrl('onyx://newtab');
      setCanGoBack(false);
    }
  }, [getActiveWebview, activeTabId, updateTab]);

  const handleForward = useCallback(() => {
    const wv = getActiveWebview();
    if (wv && wv.canGoForward()) wv.goForward();
  }, [getActiveWebview]);

  const handleReload = useCallback(() => {
    const wv = getActiveWebview();
    if (wv) wv.reload();
  }, [getActiveWebview]);

  // ── Tab actions ──

  const handleNewTab = () => {
    const tab = createTab();
    initialUrls.current[tab.id] = tab.url;
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id); // Switch view immediately
    setMenuOpen(false); // Close menu if open
  };

  const handleCloseTab = (e, id) => {
    if (e) e.stopPropagation();

    // Cleanup refs
    delete webviewRefs.current[id];
    delete initialUrls.current[id];

    // 1. Filter out the closed tab (using callback to ensure fresh state)
    setTabs((currentTabs) => {
      const remainingTabs = currentTabs.filter(tab => tab.id !== id);

      // 2. Handle "Empty Browser" Case
      if (remainingTabs.length === 0) {
        const newTab = createTab(); // Use our helper for consistency
        initialUrls.current[newTab.id] = newTab.url;
        setActiveTabId(newTab.id);
        return [newTab];
      }

      // 3. Handle "Closing the Active Tab" Case
      if (id === activeTabIdRef.current) { // Use ref for current active ID inside callback
        const index = currentTabs.findIndex(tab => tab.id === id);
        // Try to switch to the tab on the right (index), or the one on the left (index - 1)
        // If we closed the last tab (index == length-1), use index-1.
        // If we closed a middle tab, use index (which is now the next tab).
        const newActiveTab = remainingTabs[index] || remainingTabs[index - 1];
        if (newActiveTab) {
          setActiveTabId(newActiveTab.id);
        }
      }
      return remainingTabs;
    });
  };

  const handleSwitchTab = (id) => {
    setActiveTabId(id);
  };

  // ── Library actions ──

  const handleAddBookmark = async () => {
    if (!window.browserAPI || !activeTab) return;
    const result = await window.browserAPI.addBookmark(activeTab.url, activeTab.title);
    if (result?.added) {
      const updated = await window.browserAPI.getBookmarks();
      setBookmarks(updated);
    }
  };

  const handleRemoveBookmark = async (url) => {
    if (!window.browserAPI) return;
    await window.browserAPI.removeBookmark(url);
    const updated = await window.browserAPI.getBookmarks();
    setBookmarks(updated);
  };

  const handleClearHistory = async () => {
    if (!window.browserAPI) return;
    await window.browserAPI.clearHistory();
    setHistory([]);
  };

  const handleMenuNavigate = (url) => {
    handleNavigate(url);
    setMenuOpen(false);
  };

  // ── Webview event binding (stable — uses refs, not state) ──

  const bindWebviewEvents = useCallback(
    (wv, tabId) => {
      if (!wv || wv.__bound) return;
      wv.__bound = true;

      wv.addEventListener('did-navigate', (e) => {
        // Ignore about:blank (used to reset webview history)
        if (e.url === 'about:blank') return;
        let favicon = null;
        try { favicon = `https://www.google.com/s2/favicons?sz=64&domain_url=${new URL(e.url).origin}`; } catch { }
        updateTab(tabId, { url: e.url, favicon });
        if (tabId === activeTabIdRef.current) {
          setCurrentUrl(e.url);
          setCanGoBack(wv.canGoBack() || !!cameFromInternal.current[tabId]);
          setCanGoForward(wv.canGoForward());
        }
      });

      wv.addEventListener('did-navigate-in-page', (e) => {
        if (e.isMainFrame) {
          updateTab(tabId, { url: e.url });
          if (tabId === activeTabIdRef.current) {
            setCurrentUrl(e.url);
            setCanGoBack(wv.canGoBack());
            setCanGoForward(wv.canGoForward());
          }
        }
      });

      wv.addEventListener('page-title-updated', (e) => updateTab(tabId, { title: e.title }));

      wv.addEventListener('page-favicon-updated', (e) => {
        if (e.favicons && e.favicons.length > 0) {
          let faviconUrl = e.favicons[0];
          if (faviconUrl && /^(https?:|data:)/.test(faviconUrl)) {
            updateTab(tabId, { favicon: faviconUrl });
          } else {
            try {
              const origin = new URL(wv.getURL()).origin;
              updateTab(tabId, { favicon: `https://www.google.com/s2/favicons?sz=64&domain_url=${origin}` });
            } catch { }
          }
        }
      });

      wv.addEventListener('did-start-loading', () => updateTab(tabId, { isLoading: true }));

      wv.addEventListener('did-stop-loading', () => {
        updateTab(tabId, { isLoading: false });
      });

      wv.addEventListener('dom-ready', () => {
        // Force 125% scale by default for better readability
        try {
          wv.setZoomFactor(1.25);
          wv.insertCSS('html, body { overflow-x: hidden; }');
        } catch { }

        // Store webContentsId for audio state lookup
        try {
          const id = wv.getWebContentsId();
          setWcIds((prev) => {
            if (prev[tabId] === id) return prev;
            return { ...prev, [tabId]: id };
          });
        } catch { }

        if (tabId === activeTabIdRef.current) {
          setCanGoBack(wv.canGoBack() || !!cameFromInternal.current[tabId]);
          setCanGoForward(wv.canGoForward());
        }
        try {
          const url = wv.getURL();
          const title = wv.getTitle();
          if (url && window.browserAPI?.saveHistory) window.browserAPI.saveHistory(url, title || url);
        } catch { }
      });
    },
    [updateTab]
  );

  useEffect(() => {
    tabs.forEach((tab) => {
      const wv = webviewRefs.current[tab.id];
      if (wv) bindWebviewEvents(wv, tab.id);
    });
  });

  useEffect(() => {
    const wv = webviewRefs.current[activeTabId];
    if (wv) {
      try {
        setCanGoBack(wv.canGoBack() || !!cameFromInternal.current[activeTabId]);
        setCanGoForward(wv.canGoForward());
      } catch { }
    }
  }, [activeTabId, activeIsLoading]);

  // ── Render ──

  const handleToggleMenu = useCallback(() => {
    setMenuOpen((v) => !v);
    setAiOpen(false); // Close AI sidebar when opening menu
  }, []);
  const handleToggleAI = useCallback(() => {
    setAiOpen((v) => !v);
    setMenuOpen(false); // Close menu when opening AI sidebar
  }, []);

  return (
    <div className="browser-shell">
      {/* ── Top Bar (z-index: 1000) ── */}
      <TopBar
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        isLoading={activeIsLoading}
        currentUrl={currentUrl}
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        onNavigate={handleNavigate}
        onAddBookmark={handleAddBookmark}
        onToggleMenu={handleToggleMenu}
        onToggleAI={handleToggleAI}
        menuOpen={menuOpen}
        tabCount={tabs.length}
        blockedCount={blockedCount}
        securityStatus={securityStatus}
        isIncognito={isIncognito}
      />

      {/* ── Viewport (webview fills everything below topbar) ── */}
      <div className="viewport">
        {activeIsLoading && <div className="loading-bar" />}

        {/* Incognito Banner */}
        {isIncognito && (
          <div className="incognito-banner">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" />
              <path d="M3 6H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M5 9C5 9 6 14 8 14C10 14 11 9 11 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span>You're browsing in Incognito mode — no history or cookies will be saved</span>
          </div>
        )}

        {/* Find-in-page bar */}
        {showFindBar && (
          <FindBar
            webview={webviewRefs.current[activeTabId]}
            onClose={() => setShowFindBar(false)}
          />
        )}

        {/* Zoom badge */}
        {zoomBadge !== null && (
          <div className="zoom-badge">{zoomBadge}</div>
        )}
        <div className="webview-container">
          {/* Internal page rendering for active tab */}
          {isInternalUrl(activeTab?.url) && (
            <div className="internal-page" style={{ display: 'flex' }}>
              {getInternalPage(activeTab.url) === 'history' && (
                <HistoryPage onNavigate={handleNavigate} />
              )}
              {getInternalPage(activeTab.url) === 'newtab' && (
                <HomePage onNavigate={handleNavigate} />
              )}
              {!['history', 'newtab'].includes(getInternalPage(activeTab.url)) && (
                <div className="internal-page-unknown">
                  <p>Unknown page: {activeTab.url}</p>
                </div>
              )}
            </div>
          )}
          {tabs.map((tab) => (
            <webview
              key={`${tab.id}-${webviewGen[tab.id] || 0}`}
              ref={(el) => { if (el) webviewRefs.current[tab.id] = el; }}
              src={initialUrls.current[tab.id] || tab.url}
              partition={isIncognito ? 'incognito' : 'persist:main'}
              userAgent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              className="browser-webview"
              style={{
                flex: tab.id === activeTabId && !isInternalUrl(tab.url) ? 1 : undefined,
                display: tab.id === activeTabId && !isInternalUrl(tab.url) ? 'inline-flex' : 'none',
                width: '100%',
                height: '100%',
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Overlay backdrop (click to close) ── */}
      {menuOpen && <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />}

      {/* ── Slide-Over Menu Panel (z-index: 999) ── */}
      <div className={`menu-panel ${menuOpen ? 'menu-panel-open' : ''}`}>
        {/* Menu navigation */}
        <div className="menu-nav">
          {[
            {
              key: 'tabs', label: 'Tabs', icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" /><path d="M2 6H14" stroke="currentColor" strokeWidth="1.3" /></svg>
              )
            },
            {
              key: 'history', label: 'History', icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" /><path d="M8 4.5V8L10.5 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )
            },
            {
              key: 'bookmarks', label: 'Bookmarks', icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2H12V14L8 11L4 14V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
              )
            },
            {
              key: 'downloads', label: 'Downloads', icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2V10M8 10L5 7.5M8 10L11 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 12H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
              )
            },
            {
              key: 'wallet', label: 'Wallet', icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" /><path d="M2 7H14" stroke="currentColor" strokeWidth="1.3" /><rect x="10" y="9" width="3" height="2" rx="0.8" stroke="currentColor" strokeWidth="1" /><path d="M4 2.5L8 4L12 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )
            },
          ].map((item) => (
            <button
              key={item.key}
              className={`menu-nav-btn ${menuTab === item.key ? 'menu-nav-btn-active' : ''}`}
              onClick={() => setMenuTab(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}

          <div className="menu-divider" />

          <button className="menu-nav-btn" onClick={() => { setMenuOpen(false); setAiOpen(!aiOpen); }} title="Onyx Intelligence">
            <span style={{ fontSize: '16px' }}>✨</span>
            <span>Onyx AI</span>
          </button>

          <button className="menu-nav-btn" onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 1V3M8 13V15M1 8H3M13 8H15M2.5 2.5L4 4M12 12L13.5 13.5M13.5 2.5L12 4M4 12L2.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span>Settings</span>
          </button>

          <button className="menu-nav-btn" onClick={() => { setMenuOpen(false); setAboutOpen(true); }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 8V11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="8" cy="5" r="0.8" fill="currentColor" />
            </svg>
            <span>About</span>
          </button>

          {!isIncognito && (
            <button className="menu-nav-btn menu-nav-incognito" onClick={() => { setMenuOpen(false); window.browserAPI?.createIncognitoWindow(); }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" />
                <path d="M3 6H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M5 9C5 9 6 14 8 14C10 14 11 9 11 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span>Incognito Window</span>
            </button>
          )}
        </div>

        {/* Menu content */}
        <div className="menu-content">
          {/* ── Tabs Section ── */}
          {menuTab === 'tabs' && (
            <div className="menu-section">
              <div className="menu-section-header">
                <span className="menu-section-title">Open Tabs ({tabs.length})</span>
                <button className="menu-action-btn" onClick={handleNewTab}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                  New Tab
                </button>
              </div>
              <div className="menu-list">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`menu-tab-item ${tab.id === activeTabId ? 'menu-tab-active' : ''}`}
                    onClick={() => { handleSwitchTab(tab.id); setMenuOpen(false); }}
                  >
                    <div className="menu-tab-icon">
                      {tab.isLoading ? <span className="spinner-sm" /> : <Favicon url={tab.url} size={16} />}
                    </div>
                    <div className="menu-tab-info">
                      <span className="menu-tab-title">{tab.title || 'New Tab'}</span>
                      <span className="menu-tab-url">{tab.url}</span>
                    </div>
                    {/* Audio indicator */}
                    {(() => {
                      const wcId = wcIds[tab.id];
                      const audio = wcId && audioState[wcId];
                      if (!audio?.isPlaying && !audio?.isMuted) return null;
                      return (
                        <button
                          className={`tab-audio-btn ${audio.isMuted ? 'tab-audio-muted' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (wcId) window.browserAPI?.toggleMute(wcId).then((res) => {
                              setAudioState((prev) => ({
                                ...prev,
                                [wcId]: { ...prev[wcId], isMuted: res.muted },
                              }));
                            });
                          }}
                          title={audio.isMuted ? 'Unmute tab' : 'Mute tab'}
                        >
                          {audio.isMuted ? (
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                              <path d="M2 6H5L9 3V13L5 10H2V6Z" fill="currentColor" />
                              <path d="M12 6L14 8M14 6L12 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            </svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                              <path d="M2 6H5L9 3V13L5 10H2V6Z" fill="currentColor" />
                              <path d="M11 5.5C12 6.5 12 9.5 11 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                              <path d="M13 4C14.5 5.5 14.5 10.5 13 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                          )}
                        </button>
                      );
                    })()}
                    <button className="menu-tab-close" onClick={(e) => handleCloseTab(e, tab.id)} title="Close">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── History Section ── */}
          {menuTab === 'history' && (
            <div className="menu-section">
              {history.length > 0 && (
                <div className="menu-section-header">
                  <span className="menu-section-title">Browsing History</span>
                  <button className="menu-action-btn menu-action-danger" onClick={handleClearHistory}>Clear All</button>
                </div>
              )}
              <div className="menu-list">
                {history.length === 0 ? (
                  <div className="menu-empty">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.3" /><path d="M16 8V16L20 19" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <p>No history yet</p>
                  </div>
                ) : history.map((item, i) => (
                  <div key={i} className="menu-link-item" onClick={() => handleMenuNavigate(item.url)}>
                    <div className="menu-tab-icon"><Favicon url={item.url} size={14} /></div>
                    <div className="menu-tab-info">
                      <span className="menu-tab-title">{item.title}</span>
                      <span className="menu-tab-url">{item.url}</span>
                    </div>
                    <span className="menu-item-time">{dayjs(item.date).fromNow()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Bookmarks Section ── */}
          {menuTab === 'bookmarks' && (
            <div className="menu-section">
              <div className="menu-section-header">
                <span className="menu-section-title">Bookmarks</span>
                <button className="menu-action-btn" onClick={handleAddBookmark}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                  Add Page
                </button>
              </div>
              <div className="menu-list">
                {bookmarks.length === 0 ? (
                  <div className="menu-empty">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M8 4H24V28L16 22L8 28V4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
                    <p>No bookmarks saved</p>
                  </div>
                ) : bookmarks.map((item, i) => (
                  <div key={i} className="menu-link-item">
                    <div className="menu-tab-icon"><Favicon url={item.url} size={14} /></div>
                    <div className="menu-tab-info" onClick={() => handleMenuNavigate(item.url)}>
                      <span className="menu-tab-title">{item.title}</span>
                      <span className="menu-tab-url">{item.url}</span>
                    </div>
                    <button className="menu-tab-close" onClick={() => handleRemoveBookmark(item.url)} title="Remove">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Downloads Section ── */}
          {menuTab === 'downloads' && (
            <div className="menu-section">
              <div className="menu-list">
                {downloads.length === 0 ? (
                  <div className="menu-empty">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M16 4V20M16 20L10 15M16 20L22 15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 26H26" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    <p>No downloads</p>
                  </div>
                ) : downloads.map((dl) => (
                  <div key={dl.id} className="menu-link-item">
                    <div className="menu-tab-icon dl-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V9M7 9L4.5 7M7 9L9.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M2.5 11H11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                    </div>
                    <div className="menu-tab-info">
                      <span className="menu-tab-title">{dl.fileName}</span>
                      {dl.state === 'progressing' || dl.state === 'paused' ? (
                        <div className="dl-progress">
                          <div className="dl-bar"><div className="dl-fill" style={{ width: `${dl.percent}%` }} /></div>
                          <span className="dl-pct">{dl.state === 'paused' ? 'Paused' : `${dl.percent}%`}</span>
                        </div>
                      ) : (
                        <span className={`dl-status dl-${dl.state}`}>
                          {dl.state === 'completed' ? '✓ Complete' : dl.state === 'cancelled' ? '✕ Cancelled' : '⚠ Interrupted'}
                        </span>
                      )}
                    </div>
                    {/* ── Download Controls ── */}
                    {(dl.state === 'progressing' || dl.state === 'paused') && (
                      <div className="dl-controls">
                        {dl.state === 'progressing' ? (
                          <button className="dl-ctrl-btn" title="Pause" onClick={() => window.browserAPI?.pauseDownload(dl.id)}>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="2" y="1" width="2" height="8" rx="0.5" fill="currentColor" /><rect x="6" y="1" width="2" height="8" rx="0.5" fill="currentColor" /></svg>
                          </button>
                        ) : (
                          <button className="dl-ctrl-btn dl-resume" title="Resume" onClick={() => window.browserAPI?.resumeDownload(dl.id)}>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 1L8.5 5L2 9V1Z" fill="currentColor" /></svg>
                          </button>
                        )}
                        <button className="dl-ctrl-btn dl-cancel" title="Cancel" onClick={() => window.browserAPI?.cancelDownload(dl.id)}>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* ── Wallet Section ── */}
          {menuTab === 'wallet' && (
            <Web3Panel
              account={wallet.account}
              shortAddress={wallet.shortAddress}
              balance={wallet.balance}
              ensName={wallet.ensName}
              chainName={wallet.chainName}
              error={wallet.error}
              connecting={wallet.connecting}
              connect={wallet.connect}
              disconnect={wallet.disconnect}
            />
          )}
        </div>
      </div>

      {/* ── AI Sidebar ── */}
      <AISidebar
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
        currentWebContentsId={activeWebContentsId}
      />

      {/* ── About Modal ── */}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {/* ── Settings Modal ── */}
      {settingsOpen && <SettingsModal onClose={() => { setSettingsOpen(false); if (window.browserAPI?.getSettings) { window.browserAPI.getSettings().then((s) => { if (s?.searchEngine) setSearchEngine(s.searchEngine); }); } }} />}
    </div>
  );
}

export default App;
