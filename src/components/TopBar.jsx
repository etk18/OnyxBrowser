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
                <button className="nav-btn" onClick={onToggleAI} title="Onyx Intelligence">
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>✨</span>
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
