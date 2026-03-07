import React, { memo } from 'react';
import Omnibox from './Omnibox';

/**
 * TopBar — Chrome-style fixed header (60px).
 * Left: Nav group | Center: Dominant Omnibox | Right: Menu icons
 * No layout shift — menus are overlays.
 */

function TopBar({
    canGoBack,
    canGoForward,
    isLoading,
    currentUrl,
    onBack,
    onForward,
    onReload,
    onNavigate,
    onAddBookmark,
    onToggleMenu,
    onToggleAI,
    menuOpen,
    aiOpen,
    tabCount,
    blockedCount,
    securityStatus,
    isIncognito,
}) {
    return (
        <header className="topbar">
            {/* macOS drag region */}
            <div className="topbar-drag" />

            {/* Left: Navigation Group */}
            <div className="topbar-nav-group">
                <button className="topbar-beta-badge" onClick={() => onNavigate('onyx://ledger')} title="What's New in v0.1.0">
                    BETA
                </button>
                <button className="nav-btn" onClick={onBack} disabled={!canGoBack} title="Back">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <button className="nav-btn" onClick={onForward} disabled={!canGoForward} title="Forward">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M7 4L12 9L7 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <button className="nav-btn" onClick={onReload} title={isLoading ? 'Stop' : 'Reload'}>
                    {isLoading ? (
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M5 5L13 13M13 5L5 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M15 9A6 6 0 1 1 9 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <path d="M9 1V4.5L12 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Center: Dominant Omnibox (60% width) */}
            <Omnibox currentUrl={currentUrl} isLoading={isLoading} onNavigate={onNavigate} blockedCount={blockedCount} securityStatus={securityStatus} />

            {/* Right: Menu Group */}
            <div className="topbar-menu-group">
                <button className="nav-btn" onClick={onAddBookmark} title="Bookmark this page">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M5 2H13V16L9 12.5L5 16V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                </button>
                <button className={`nav-btn ai-toggle-btn ${aiOpen ? 'ai-toggle-active' : ''}`} onClick={onToggleAI} title="Onyx Intelligence">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        {/* Head silhouette */}
                        <path d="M12 2C7.6 2 4 5.6 4 10c0 2.4 1 4.5 2.6 6H8v4h8v-4h1.4C19 14.5 20 12.4 20 10c0-4.4-3.6-8-8-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        {/* Brain neural circuit */}
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
                    className={`nav-btn menu-toggle ${menuOpen ? 'menu-toggle-active' : ''}`}
                    onClick={onToggleMenu}
                    title="Menu"
                >
                    {/* Hamburger with tab count badge */}
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M3 5H15M3 9H15M3 13H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    {tabCount > 1 && <span className="tab-badge">{tabCount}</span>}
                </button>
            </div>
        </header>
    );
}

export default memo(TopBar);
