import React, { memo } from 'react';
import Omnibox from './Omnibox';

/**
 * NavigationBar — Horizontal chrome-style toolbar (50px).
 * Left: Nav buttons | Center: Agentic Omnibox | Right: Actions
 */
function NavigationBar({
  canGoBack,
  canGoForward,
  isLoading,
  currentUrl,
  onBack,
  onForward,
  onReload,
  onNavigate,
  onAgentCommand,
  onAddBookmark,
  onToggleMenu,
  onToggleAI,
  menuOpen,
  aiOpen,
  blockedCount,
  securityStatus,
  isIncognito,
  onLedger,
}) {
  return (
    <nav className="navbar">
      {/* Left: Navigation controls */}
      <div className="navbar-left">
        {isIncognito ? (
          <span className="navbar-ghost-badge" title="Incognito Mode">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" />
              <path d="M3 6H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M5 9C5 9 6 14 8 14C10 14 11 9 11 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            GHOST
          </span>
        ) : (
          <button className="navbar-beta" onClick={onLedger} title="What's New in v0.1.0">
            BETA
          </button>
        )}
        <button className="nav-btn nav-btn-sm" onClick={onBack} disabled={!canGoBack} title="Back (⌘[)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="nav-btn nav-btn-sm" onClick={onForward} disabled={!canGoForward} title="Forward (⌘])">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="nav-btn nav-btn-sm" onClick={onReload} title={isLoading ? 'Stop' : 'Reload (⌘R)'}>
          {isLoading ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M8 1V4L10.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Center: Agentic Omnibox */}
      <Omnibox
        currentUrl={currentUrl}
        isLoading={isLoading}
        onNavigate={onNavigate}
        onAgentCommand={onAgentCommand}
        blockedCount={blockedCount}
        securityStatus={securityStatus}
      />

      {/* Right: Actions */}
      <div className="navbar-right">
        <button className="nav-btn nav-btn-sm" onClick={onAddBookmark} title="Bookmark this page">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 2H12V14L8 11L4 14V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </button>
        <button className={`nav-btn nav-btn-sm ai-toggle-btn ${aiOpen ? 'ai-toggle-active' : ''}`} onClick={onToggleAI} title="Onyx Intelligence">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C7.6 2 4 5.6 4 10c0 2.4 1 4.5 2.6 6H8v4h8v-4h1.4C19 14.5 20 12.4 20 10c0-4.4-3.6-8-8-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <g className="ai-brain-circuit">
              <path d="M9 8c1.5 0 2 1 3 1s1.5-1 3-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M8.5 11c1.5 0 2.5 1 3.5 1s2-1 3.5-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="10" cy="9.5" r="0.8" fill="currentColor" />
              <circle cx="14" cy="9.5" r="0.8" fill="currentColor" />
              <circle cx="12" cy="12" r="0.8" fill="currentColor" />
            </g>
          </svg>
        </button>
        <button
          className={`nav-btn nav-btn-sm menu-toggle ${menuOpen ? 'menu-toggle-active' : ''}`}
          onClick={onToggleMenu}
          title="Menu"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2.5 4.5H13.5M2.5 8H13.5M2.5 11.5H13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </nav>
  );
}

export default memo(NavigationBar);
