import React, { useState, useRef, useEffect } from 'react';

export default function FindBar({ tabId, onClose }) {
    const [query, setQuery] = useState('');
    const [matchInfo, setMatchInfo] = useState(null); // { activeMatchOrdinal, matches }
    const inputRef = useRef(null);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Listen for found-in-page events via IPC
    useEffect(() => {
        if (!window.browserAPI?.onTabFoundInPage) return;
        const unsub = window.browserAPI.onTabFoundInPage((data) => {
            if (data.tabId === tabId && data.result) {
                setMatchInfo({
                    activeMatchOrdinal: data.result.activeMatchOrdinal,
                    matches: data.result.matches,
                });
            }
        });
        return () => unsub();
    }, [tabId]);

    // Clear matches when query clears
    useEffect(() => {
        if (!query) {
            setMatchInfo(null);
            if (tabId) window.browserAPI?.stopFindInPage(tabId, 'clearSelection');
        }
    }, [query, tabId]);

    const findNext = (forward = true) => {
        if (!tabId || !query) return;
        window.browserAPI.findInPage(tabId, query, { forward, findNext: true });
    };

    const handleInputChange = (e) => {
        const text = e.target.value;
        setQuery(text);
        if (text && tabId) {
            window.browserAPI.findInPage(tabId, text, {});
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            findNext(!e.shiftKey); // Shift+Enter = prev
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    const handleClose = () => {
        if (tabId) window.browserAPI?.stopFindInPage(tabId, 'clearSelection');
        onClose();
    };

    return (
        <div className="find-bar">
            <div className="find-bar-inner">
                <input
                    ref={inputRef}
                    type="text"
                    className="find-bar-input"
                    placeholder="Find in page…"
                    value={query}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                />
                {matchInfo && query && (
                    <span className="find-bar-count">
                        {matchInfo.matches === 0
                            ? 'No matches'
                            : `${matchInfo.activeMatchOrdinal} of ${matchInfo.matches}`}
                    </span>
                )}
                {/* Prev */}
                <button className="find-bar-btn" onClick={() => findNext(false)} title="Previous (Shift+Enter)">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3.5 8.5L7 5L10.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                {/* Next */}
                <button className="find-bar-btn" onClick={() => findNext(true)} title="Next (Enter)">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3.5 5.5L7 9L10.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                {/* Close */}
                <button className="find-bar-btn find-bar-close" onClick={handleClose} title="Close (Esc)">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
