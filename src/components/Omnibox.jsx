import React, { useRef, useState, useEffect, memo } from 'react';

/**
 * Omnibox — Uncontrolled input (ref-based). Zero typing lag.
 * State only updates on Enter. Focus select-all. Cmd+L shortcut.
 * Shield icon shows ad-blocker count. Lock icon shows security status.
 */

function Omnibox({ currentUrl, isLoading, onNavigate, blockedCount, securityStatus }) {
    const inputRef = useRef(null);
    const [showCertPopover, setShowCertPopover] = useState(false);

    // Sync the displayed value when URL changes externally (tab switch, navigation)
    useEffect(() => {
        if (inputRef.current && document.activeElement !== inputRef.current) {
            inputRef.current.value = currentUrl || '';
        }
    }, [currentUrl]);

    const isUrlLike = (text) => {
        const t = text.trim();
        if (/^https?:\/\//i.test(t)) return true;
        if (/^[^\s]+\.[^\s]+$/.test(t)) return true;
        return false;
    };

    const normalizeUrl = (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return '';
        if (!isUrlLike(trimmed)) {
            return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
        }
        if (!/^https?:\/\//i.test(trimmed)) return 'https://' + trimmed;
        return trimmed;
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            const normalized = normalizeUrl(inputRef.current.value);
            if (normalized) {
                onNavigate(normalized);
                inputRef.current.blur();
            }
        }
        if (e.key === 'Escape') {
            inputRef.current.value = currentUrl || '';
            inputRef.current.blur();
        }
    };

    const handleFocus = (e) => e.target.select();

    // Cmd+L / Ctrl+L global shortcut
    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Determine lock state from URL
    const isHttps = currentUrl && currentUrl.startsWith('https://');
    const isHttp = currentUrl && currentUrl.startsWith('http://') && !isHttps;
    const showLock = isHttps || isHttp;

    return (
        <div className="omnibox">
            <div className="omnibox-icon">
                {isLoading ? (
                    <span className="spinner-sm" />
                ) : showLock ? (
                    <button
                        className={`lock-btn ${isHttps ? 'lock-secure' : 'lock-insecure'}`}
                        onClick={() => setShowCertPopover(!showCertPopover)}
                        title={isHttps ? 'Connection is secure' : 'Connection is not secure'}
                    >
                        {isHttps ? (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                                <path d="M5 7V5C5 3.34 6.34 2 8 2C9.66 2 11 3.34 11 5V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            </svg>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                                <path d="M5 7V5C5 3.34 6.34 2 8 2C9.3 2 10.4 2.85 10.8 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            </svg>
                        )}
                    </button>
                ) : (
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                        <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                )}
            </div>

            {/* Security Popover */}
            {showCertPopover && showLock && (
                <>
                    <div className="cert-popover-backdrop" onClick={() => setShowCertPopover(false)} />
                    <div className="cert-popover">
                        <div className={`cert-status ${isHttps ? 'cert-secure' : 'cert-insecure'}`}>
                            {isHttps ? (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                                    <path d="M5 7V5C5 3.34 6.34 2 8 2C9.66 2 11 3.34 11 5V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                </svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                                    <path d="M5 7V5C5 3.34 6.34 2 8 2C9.3 2 10.4 2.85 10.8 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                </svg>
                            )}
                            <span>{isHttps ? 'Connection is secure' : 'Connection is not secure'}</span>
                        </div>
                        <div className="cert-detail">
                            <span className="cert-label">Protocol</span>
                            <span className="cert-value">{isHttps ? 'HTTPS (TLS)' : 'HTTP (Unencrypted)'}</span>
                        </div>
                        {currentUrl && (
                            <div className="cert-detail">
                                <span className="cert-label">Domain</span>
                                <span className="cert-value">{(() => { try { return new URL(currentUrl).hostname; } catch { return currentUrl; } })()}</span>
                            </div>
                        )}
                        <p className="cert-info">
                            {isHttps
                                ? 'Your data is encrypted and sent securely to this site.'
                                : 'Your connection to this site is not encrypted. Sensitive info may be visible to others.'}
                        </p>
                    </div>
                </>
            )}

            <input
                ref={inputRef}
                type="text"
                className="omnibox-input"
                defaultValue={currentUrl}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                placeholder="Search Google or type a URL"
                spellCheck={false}
                autoComplete="off"
            />

            {/* Shield icon — Ad-Blocker indicator */}
            <div className="omnibox-shield" title={`${blockedCount} ads & trackers blocked`}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1L2.5 3.5V7.5C2.5 11 5 13.5 8 15C11 13.5 13.5 11 13.5 7.5V3.5L8 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    <path d="M6 8L7.5 9.5L10.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {blockedCount > 0 && (
                    <span className="shield-badge">{blockedCount > 99 ? '99+' : blockedCount}</span>
                )}
            </div>

            <div className="omnibox-hint">
                <kbd>⌘L</kbd>
            </div>
        </div>
    );
}

export default memo(Omnibox);
