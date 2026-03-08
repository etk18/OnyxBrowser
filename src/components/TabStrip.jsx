import React, { memo } from 'react';
import Favicon from './Favicon';

/**
 * TabStrip — Horizontal pill-shaped tab bar (40px).
 * macOS drag region with no-drag clickable tabs.
 */
function TabStrip({ tabs, activeTabId, onSwitchTab, onCloseTab, onNewTab, isIncognito, isProcessingTab }) {
  return (
    <div className="tab-strip">
      {/* macOS drag region — behind the tabs */}
      <div className="tab-strip-drag" />

      <div className="tab-strip-tabs">
        {/* macOS Traffic Light Spacer */}
        <div className="tab-strip-os-spacer" />
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              className={`tab-pill ${isActive ? 'tab-pill-active' : ''} ${tab.isIncognito ? 'tab-pill-incognito' : ''} ${tab.crashed ? 'tab-pill-crashed' : ''}`}
              onClick={() => onSwitchTab(tab.id)}
              title={tab.title || tab.url}
            >
              <span className="tab-pill-icon">
                {tab.isLoading ? (
                  <span className="spinner-xs" />
                ) : tab.isIncognito ? (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M3 6H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <path d="M5 9C5 9 6 14 8 14C10 14 11 9 11 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <Favicon url={tab.url} size={12} />
                )}
              </span>
              <span className="tab-pill-title">{tab.title || 'New Tab'}</span>
              <span
                className="tab-pill-close"
                onClick={(e) => { e.stopPropagation(); onCloseTab(e, tab.id); }}
                title="Close tab"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 1.5L6.5 6.5M6.5 1.5L1.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </span>
            </button>
          );
        })}

        {/* New tab button — inline after last tab */}
        <button
          className={`tab-strip-new ${isProcessingTab ? 'tab-strip-new-disabled' : ''}`}
          onClick={onNewTab}
          disabled={isProcessingTab}
          title="New Tab (⌘T)"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1.5V10.5M1.5 6H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Incognito indicator */}
      {isIncognito && (
        <span className="tab-strip-ghost">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" />
            <path d="M3 6H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </span>
      )}
    </div>
  );
}

export default memo(TabStrip);
