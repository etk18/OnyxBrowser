import React, { useState, useRef, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import Favicon from './components/Favicon';
import TopBar from './components/TopBar';
import TabStrip from './components/TabStrip';
import NavigationBar from './components/NavigationBar';
import AboutModal from './components/AboutModal';
import SettingsModal, { SEARCH_ENGINES } from './components/SettingsModal';
import FindBar from './components/FindBar';
import HistoryPage from './components/HistoryPage';
import Web3Panel from './components/Web3Panel';
import AISidebar from './components/AISidebar';
import HomePage from './components/HomePage';
import OnyxLedger from './components/OnyxLedger';
import MemoryDashboard from './components/MemoryDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import WalletModal from './components/WalletModal';
import AgentOverlay from './components/AgentOverlay';
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

function createTab(url = 'onyx://newtab', incognito = false) {
  return { id: nextTabId++, url, title: 'New Tab', isLoading: false, favicon: null, isIncognito: incognito };
}

function App() {
  const [tabs, setTabs] = useState([
    { id: 1, url: 'onyx://newtab', title: 'New Tab', isLoading: false, favicon: null, isIncognito: isIncognito },
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
  const [isProcessingTab, setIsProcessingTab] = useState(false);
  const [walletRequest, setWalletRequest] = useState(null); // { origin } when dApp requests connection
  /* REMOVED DUPLICATE */
  const [searchEngine, setSearchEngine] = useState('google');

  // AI Sidebar
  const [aiOpen, setAiOpen] = useState(false);

  // Agentic Omnibox
  const [agentThinking, setAgentThinking] = useState(false);
  const [agentCommand, setAgentCommand] = useState('');
  const [agentResponse, setAgentResponse] = useState(null);

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

  const cameFromInternal = useRef({}); // Track tabs that navigated from internal pages
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeIsLoading = activeTab?.isLoading ?? false;

  const loadingTimers = useRef({});

  // ── Helpers ──

  const updateTab = useCallback((id, patch) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);


  // ── Sync URL display on tab switch ──

  useEffect(() => {
    if (activeTab) {
      setCurrentUrl(activeTab.url);
      // Nav state will be synced via onTabNavState IPC listener
      if (isInternalUrl(activeTab.url)) {
        setCanGoBack(!!cameFromInternal.current[activeTabId]);
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
    const unsub1 = window.browserAPI.onDownloadStarted((data) => {
      setDownloads((prev) => [...prev, { id: data.id, fileName: data.fileName, percent: 0, state: 'progressing', totalBytes: data.totalBytes }]);
    });
    const unsub2 = window.browserAPI.onDownloadProgress((data) => {
      setDownloads((prev) => prev.map((d) => d.id === data.id ? { ...d, percent: data.percent } : d));
    });
    const unsub3 = window.browserAPI.onDownloadPaused((data) => {
      setDownloads((prev) => prev.map((d) => d.id === data.id ? { ...d, state: 'paused' } : d));
    });
    const unsub4 = window.browserAPI.onDownloadComplete((data) => {
      setDownloads((prev) => prev.map((d) => d.id === data.id ? { ...d, state: data.state, percent: 100, path: data.path } : d));
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, []);

  // ── New Tab from context menu IPC ──

  useEffect(() => {
    if (!window.browserAPI?.onNewTab) return;
    const unsub = window.browserAPI.onNewTab((url) => {
      const tab = createTab(url);
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      // Create WebContentsView for non-internal URLs
      if (!isInternalUrl(url)) {
        window.browserAPI.createView(tab.id, url, isIncognito);
        window.browserAPI.switchView?.(tab.id, false);
      } else {
        window.browserAPI.switchView?.(tab.id, true);
      }
    });
    return () => unsub();
  }, []);

  // ── Audio state listener ──

  useEffect(() => {
    if (!window.browserAPI?.onTabAudioState) return;
    const unsub = window.browserAPI.onTabAudioState((data) => {
      setAudioState((prev) => ({
        ...prev,
        [data.webContentsId]: { isPlaying: data.isPlaying, isMuted: data.isMuted },
      }));
    });
    return () => unsub();
  }, []);

  // ── Security status listener ──

  useEffect(() => {
    if (!window.browserAPI?.onSecurityStatus) return;
    const unsub = window.browserAPI.onSecurityStatus((data) => {
      setSecurityStatus(data);
    });
    return () => unsub();
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
      const restoredTabs = urls.map((url) => createTab(url));
      setTabs(restoredTabs);
      setActiveTabId(restoredTabs[0].id);
      setCurrentUrl(restoredTabs[0].url);
      // Create WebContentsViews for non-internal URLs
      restoredTabs.forEach((tab) => {
        if (!isInternalUrl(tab.url)) {
          window.browserAPI.createView(tab.id, tab.url, false);
        }
      });
      // Switch to the first tab
      window.browserAPI.switchView?.(restoredTabs[0].id, isInternalUrl(restoredTabs[0].url));
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
    const unsub = window.browserAPI.onAdBlocked((count) => setBlockedCount(count));
    return () => unsub();
  }, []);

  // ── Web3 wallet connection request listener ──

  useEffect(() => {
    if (!window.browserAPI?.onWalletRequest) return;
    const unsub = window.browserAPI.onWalletRequest((data) => {
      setWalletRequest(data);
    });
    return () => unsub();
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
    const handleZoom = async (direction) => {
      const tabId = activeTabIdRef.current;
      try {
        const current = await window.browserAPI.getZoomLevel(tabId) || 0;
        let newLevel = current;

        if (direction === 'in') newLevel += 0.5;
        else if (direction === 'out') newLevel -= 0.5;
        else if (direction === '0') newLevel = 0;

        newLevel = Math.max(-5, Math.min(5, newLevel));
        await window.browserAPI.setZoomLevel(tabId, newLevel);
        showZoomBadge(newLevel);
      } catch { }
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
    const handleWheel = async (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      const tabId = activeTabIdRef.current;
      try {
        const current = await window.browserAPI.getZoomLevel(tabId) || 0;
        const delta = e.deltaY < 0 ? 0.5 : -0.5;
        const newLevel = Math.max(-5, Math.min(5, current + delta));
        await window.browserAPI.setZoomLevel(tabId, newLevel);
      } catch { }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // ── Navigation ──

  const handleNavigate = useCallback(async (url) => {
    console.log('[App] handleNavigate called for:', url);
    // Handle internal onyx:// URLs
    if (/^onyx:\/\//i.test(url)) {
      const internalUrl = url.toLowerCase();
      updateTab(activeTabId, { url: internalUrl, title: internalUrl.replace('onyx://', '').charAt(0).toUpperCase() + internalUrl.replace('onyx://', '').slice(1) });
      setCurrentUrl(internalUrl);
      setCanGoBack(false);
      // Hide the WebContentsView (show internal page)
      window.browserAPI.switchView?.(activeTabId, true);
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
      // Mark that we came from internal page so we can go back
      cameFromInternal.current[activeTabId] = true;
      setCanGoBack(true);
      // Create a new WebContentsView for this tab (it was on an internal page)
      await window.browserAPI.createView(activeTabId, finalUrl, activeTab?.isIncognito || isIncognito);
      window.browserAPI.switchView?.(activeTabId, false);
    } else {
      // Navigate existing view
      window.browserAPI.navigateView(activeTabId, finalUrl);
    }
  }, [activeTabId, updateTab, searchEngine, currentUrl, activeTab]);

  const handleBack = useCallback(() => {
    const fromInternal = !!cameFromInternal.current[activeTabId];

    if (fromInternal) {
      // No webview history but started from Start Page — go home
      delete cameFromInternal.current[activeTabId];
      updateTab(activeTabId, { url: 'onyx://newtab', title: 'New Tab' });
      setCurrentUrl('onyx://newtab');
      setCanGoBack(false);
      // Close the WebContentsView, show internal page
      window.browserAPI.closeView?.(activeTabId);
      window.browserAPI.switchView?.(activeTabId, true);
    } else {
      window.browserAPI.goBackView(activeTabId);
    }
  }, [activeTabId, updateTab]);

  const handleForward = useCallback(() => {
    window.browserAPI.goForwardView(activeTabId);
  }, [activeTabId]);

  const handleReload = useCallback(() => {
    window.browserAPI.reloadView(activeTabId);
  }, [activeTabId]);

  // ── Agentic Omnibox command handler ──

  const handleAgentCommand = useCallback(async (command) => {
    setAgentCommand(command);
    setAgentThinking(true);
    setAgentResponse(null);
    try {
      const result = await window.browserAPI.executeAgentCommand(command, activeTabId);
      setAgentResponse(result);
      // If the backend returned a navigate action and the tab is on an internal page,
      // drive navigation from React so the view gets created properly
      if (result?.action === 'navigate' && result?.url && isInternalUrl(currentUrl)) {
        handleNavigate(result.url);
      }
    } catch (err) {
      setAgentResponse({ error: err.message || 'Agent command failed' });
    } finally {
      setAgentThinking(false);
    }
  }, [activeTabId, currentUrl, handleNavigate]);

  const dismissAgent = useCallback(() => {
    setAgentThinking(false);
    setAgentCommand('');
    setAgentResponse(null);
  }, []);

  // ── Tab actions ──

  const handleNewTab = () => {
    if (isProcessingTab) return;
    setIsProcessingTab(true);
    const tab = createTab('onyx://newtab', isIncognito);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id); // Switch view immediately
    setMenuOpen(false); // Close menu if open
    // Internal page — tell main process to hide any active WebContentsView
    window.browserAPI.switchView?.(tab.id, true);
    // Release lock after a short debounce
    setTimeout(() => setIsProcessingTab(false), 300);
  };

  const handleCloseTab = (e, id) => {
    if (e) e.stopPropagation();
    if (isProcessingTab) return;
    setIsProcessingTab(true);

    // Close the WebContentsView in the main process
    window.browserAPI.closeView?.(id);
    delete cameFromInternal.current[id];

    // 1. Filter out the closed tab (using callback to ensure fresh state)
    setTabs((currentTabs) => {
      const remainingTabs = currentTabs.filter(tab => tab.id !== id);

      // 2. Handle "Empty Browser" Case
      if (remainingTabs.length === 0) {
        const newTab = createTab('onyx://newtab', isIncognito);
        setActiveTabId(newTab.id);
        window.browserAPI.switchView?.(newTab.id, true);
        return [newTab];
      }

      // 3. Handle "Closing the Active Tab" Case
      if (id === activeTabIdRef.current) {
        const index = currentTabs.findIndex(tab => tab.id === id);
        const newActiveTab = remainingTabs[index] || remainingTabs[index - 1];
        if (newActiveTab) {
          setActiveTabId(newActiveTab.id);
          window.browserAPI.switchView?.(newActiveTab.id, isInternalUrl(newActiveTab.url));
        }
      }
      return remainingTabs;
    });
    // Release lock after a short debounce
    setTimeout(() => setIsProcessingTab(false), 300);
  };

  const handleSwitchTab = (id) => {
    setActiveTabId(id);
    const tab = tabs.find(t => t.id === id);
    const internal = isInternalUrl(tab?.url);
    window.browserAPI.switchView?.(id, internal);
    // Query nav state for the new tab
    if (!internal) {
      window.browserAPI.getNavState?.(id).then((state) => {
        if (state) {
          setCanGoBack(state.canGoBack || !!cameFromInternal.current[id]);
          setCanGoForward(state.canGoForward);
          if (state.webContentsId) {
            setWcIds(prev => ({ ...prev, [id]: state.webContentsId }));
          }
        }
      }).catch(() => {});
    }
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

  // Listen for Agent Navigation instructions — use refs to avoid resubscribing
  const wcIdsRef = useRef(wcIds);
  wcIdsRef.current = wcIds;
  const handleNavigateRef = useRef(handleNavigate);
  handleNavigateRef.current = handleNavigate;

  useEffect(() => {
    if (!window.browserAPI?.onAgentNavigate) return;
    const unsub = window.browserAPI.onAgentNavigate(({ webContentsId, url }) => {
      console.log('[App] Received agent-navigate:', url, webContentsId);
      const currentWcIds = wcIdsRef.current;
      const tabIdStr = Object.keys(currentWcIds).find(key => currentWcIds[key] === webContentsId);
      if (tabIdStr) {
        const tabId = parseInt(tabIdStr);
        if (tabId === activeTabIdRef.current) {
          handleNavigateRef.current(url);
        } else {
          updateTab(tabId, { url });
          window.browserAPI.navigateView(tabId, url);
        }
      } else {
        handleNavigateRef.current(url);
      }
    });
    return () => unsub();
  }, [updateTab]);

  // Listen for executor's custom navigate event (when no webContentsId, e.g. New Tab page)
  useEffect(() => {
    const handleAgentNav = (e) => {
      const url = e.detail?.url;
      if (url) {
        console.log('[App] onyx-agent-navigate custom event:', url);
        handleNavigate(url);
      }
    };
    window.addEventListener('onyx-agent-navigate', handleAgentNav);
    return () => window.removeEventListener('onyx-agent-navigate', handleAgentNav);
  }, [handleNavigate]);

  // Listen for agent-navigate-url from main process (when /open targets an internal-page tab)
  useEffect(() => {
    if (!window.browserAPI?.onAgentNavigateUrl) return;
    const unsub = window.browserAPI.onAgentNavigateUrl(({ tabId, url }) => {
      if (tabId === activeTabIdRef.current) {
        handleNavigate(url);
      }
    });
    return () => unsub();
  }, [handleNavigate]);

  // ── Tab event listeners from main process (WebContentsView) ──
  useEffect(() => {
    if (!window.browserAPI) return;
    const unsubs = [
      window.browserAPI.onTabDidNavigate?.(({ tabId, url, favicon }) => {
        if (!url || url === 'about:blank') return;
        updateTab(tabId, { url, ...(favicon ? { favicon } : {}) });
        if (tabId === activeTabIdRef.current) {
          setCurrentUrl(url);
        }
      }),
      window.browserAPI.onTabDidNavigateInPage?.(({ tabId, url }) => {
        updateTab(tabId, { url });
        if (tabId === activeTabIdRef.current) {
          setCurrentUrl(url);
        }
      }),
      window.browserAPI.onTabTitleUpdated?.(({ tabId, title }) => {
        updateTab(tabId, { title });
      }),
      window.browserAPI.onTabFaviconUpdated?.(({ tabId, favicons }) => {
        if (favicons && favicons.length > 0) {
          let faviconUrl = favicons[0];
          if (faviconUrl && /^(https?:|data:)/.test(faviconUrl)) {
            updateTab(tabId, { favicon: faviconUrl });
          }
        }
      }),
      window.browserAPI.onTabLoadingChanged?.(({ tabId, isLoading }) => {
        updateTab(tabId, { isLoading });
      }),
      window.browserAPI.onTabNavState?.(({ tabId, canGoBack: back, canGoForward: fwd, webContentsId }) => {
        if (tabId === activeTabIdRef.current) {
          setCanGoBack(back || !!cameFromInternal.current[tabId]);
          setCanGoForward(fwd);
        }
        if (webContentsId) {
          setWcIds(prev => {
            if (prev[tabId] === webContentsId) return prev;
            return { ...prev, [tabId]: webContentsId };
          });
        }
      }),
      window.browserAPI.onTabCrashed?.(({ tabId, reason }) => {
        updateTab(tabId, { crashed: true, crashReason: reason, isLoading: false });
      }),
    ].filter(Boolean);
    return () => unsubs.forEach(fn => fn());
  }, [updateTab]);

  // ── Sync tab view bounds when overlays open/close ──
  useEffect(() => {
    if (window.browserAPI?.updateViewBounds) {
      window.browserAPI.updateViewBounds(menuOpen, aiOpen);
    }
  }, [menuOpen, aiOpen]);

  // ── Native zoom badge (when WebContentsView intercepts Cmd+/- natively) ──
  useEffect(() => {
    if (!window.browserAPI?.onNativeZoomChanged) return;
    const unsub = window.browserAPI.onNativeZoomChanged(({ tabId, level }) => {
      if (tabId === activeTabIdRef.current) {
        showZoomBadge(level);
      }
    });
    return () => unsub();
  }, [showZoomBadge]);

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
      {/* ── Layer 1: Tab Strip (40px, draggable) ── */}
      <TabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitchTab={handleSwitchTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        isIncognito={isIncognito || activeTab?.isIncognito}
        isProcessingTab={isProcessingTab}
      />

      {/* ── Layer 2: Navigation Bar (50px) ── */}
      <NavigationBar
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        isLoading={activeIsLoading}
        currentUrl={currentUrl}
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        onNavigate={handleNavigate}
        onAgentCommand={handleAgentCommand}
        onAddBookmark={handleAddBookmark}
        onToggleMenu={handleToggleMenu}
        onToggleAI={handleToggleAI}
        menuOpen={menuOpen}
        aiOpen={aiOpen}
        blockedCount={blockedCount}
        securityStatus={securityStatus}
        isIncognito={isIncognito || activeTab?.isIncognito}
        onLedger={() => handleNavigate('onyx://ledger')}
      />

      {/* ── Viewport (webview fills everything below topbar) ── */}
      <div className="viewport">
        {activeIsLoading && <div className="loading-bar" />}

        {/* Agent Overlay — /command response panel */}
        <AgentOverlay
          isThinking={agentThinking}
          command={agentCommand}
          response={agentResponse}
          onClose={dismissAgent}
        />

        {/* Incognito Banner */}
        {(isIncognito || activeTab?.isIncognito) && (
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
            tabId={activeTabId}
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
                <HomePage onNavigate={handleNavigate} isIncognito={activeTab?.isIncognito || isIncognito} />
              )}
              {getInternalPage(activeTab.url) === 'ledger' && (
                <OnyxLedger />
              )}
              {getInternalPage(activeTab.url) === 'memory' && (
                <MemoryDashboard />
              )}
              {!['history', 'newtab', 'ledger', 'memory'].includes(getInternalPage(activeTab.url)) && (
                <div className="internal-page-unknown">
                  <p>Unknown page: {activeTab.url}</p>
                </div>
              )}
            </div>
          )}
          {/* Crash recovery overlay for crashed tabs */}
          {activeTab?.crashed && !isInternalUrl(activeTab?.url) && (
            <div className="tab-crash-overlay">
              <div className="tab-crash-content">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1.5" />
                  <path d="M12 8v4" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="12" cy="16" r="1" fill="#ef4444" />
                </svg>
                <h2>This tab has crashed</h2>
                <p>{activeTab.crashReason === 'oom' ? 'The page ran out of memory.' : 'Something went wrong while displaying this page.'}</p>
                <button className="tab-crash-reload" onClick={() => {
                  updateTab(activeTab.id, { crashed: false, crashReason: null });
                  window.browserAPI.reloadView?.(activeTab.id);
                }}>
                  Reload Tab
                </button>
              </div>
            </div>
          )}
          {/* WebContentsView renders web pages natively — no <webview> tags needed */}
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

          <button className="menu-nav-btn ai-toggle-btn" onClick={() => { setMenuOpen(false); setAiOpen(!aiOpen); }} title="Onyx Intelligence">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C7.6 2 4 5.6 4 10c0 2.4 1 4.5 2.6 6H8v4h8v-4h1.4C19 14.5 20 12.4 20 10c0-4.4-3.6-8-8-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <g className="ai-brain-circuit">
                <path d="M9 8c1.5 0 2 1 3 1s1.5-1 3-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M8.5 11c1.5 0 2.5 1 3.5 1s2-1 3.5-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="10" cy="9.5" r="0.8" fill="currentColor" />
                <circle cx="14" cy="9.5" r="0.8" fill="currentColor" />
                <circle cx="12" cy="12" r="0.8" fill="currentColor" />
              </g>
            </svg>
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
            <button className="menu-nav-btn menu-nav-incognito" onClick={() => {
              setMenuOpen(false);
              const tab = createTab('onyx://newtab', true);
              setTabs((prev) => [...prev, tab]);
              setActiveTabId(tab.id);
              window.browserAPI.switchView?.(tab.id, true);
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" />
                <path d="M3 6H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M5 9C5 9 6 14 8 14C10 14 11 9 11 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <span>Incognito Tab</span>
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
                <div className="menu-section-actions">
                  <button className="menu-action-btn" onClick={handleNewTab}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                    New Tab
                  </button>
                  {!isIncognito && (
                    <button className="menu-action-btn menu-action-incognito" onClick={() => {
                      const tab = createTab('onyx://newtab', true);
                      setTabs((prev) => [...prev, tab]);
                      setActiveTabId(tab.id);
                      setMenuOpen(false);
                      window.browserAPI.switchView?.(tab.id, true);
                    }} title="New Incognito Tab">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M3 6H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        <path d="M5 9C5 9 6 14 8 14C10 14 11 9 11 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                      Stealth
                    </button>
                  )}
                </div>
              </div>
              <div className="menu-list">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`menu-tab-item ${tab.id === activeTabId ? (tab.isIncognito ? 'menu-tab-active menu-tab-incognito-active' : 'menu-tab-active') : ''} ${tab.isIncognito ? 'menu-tab-incognito' : ''}`}
                    onClick={() => { handleSwitchTab(tab.id); setMenuOpen(false); }}
                  >
                    <div className="menu-tab-icon">
                      {tab.isLoading ? <span className="spinner-sm" /> : tab.isIncognito ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" />
                          <path d="M3 6H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                          <path d="M5 9C5 9 6 14 8 14C10 14 11 9 11 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        </svg>
                      ) : <Favicon url={tab.url} size={16} />}
                    </div>
                    <div className="menu-tab-info">
                      <span className="menu-tab-title">{tab.isIncognito && (!tab.title || tab.title === 'New Tab') ? 'Incognito Tab' : (tab.title || 'New Tab')}</span>
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
        currentUrl={currentUrl}
        onNavigate={handleNavigate}
      />

      {/* ── About Modal ── */}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {/* ── Settings Modal ── */}
      {settingsOpen && <SettingsModal onClose={() => { setSettingsOpen(false); if (window.browserAPI?.getSettings) { window.browserAPI.getSettings().then((s) => { if (s?.searchEngine) setSearchEngine(s.searchEngine); }); } }} />}

      {/* ── Web3 Wallet Connection Modal ── */}
      {walletRequest && (
        <WalletModal
          origin={walletRequest.origin}
          onApprove={() => {
            // Generate a deterministic stub address for this session
            const stubAddress = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
            window.browserAPI?.sendWalletResponse({ approved: true, address: stubAddress });
            setWalletRequest(null);
          }}
          onReject={() => {
            window.browserAPI?.sendWalletResponse({ approved: false });
            setWalletRequest(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
