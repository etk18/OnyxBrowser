import React, { useState, useEffect, useRef } from 'react';

const API = 'http://localhost:8000';

export default function MemoryDashboard() {
    const [memories, setMemories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [isSearchResult, setIsSearchResult] = useState(false);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    // Load all memories on mount
    useEffect(() => {
        fetchAll();
        if (inputRef.current) inputRef.current.focus();
    }, []);

    const fetchAll = async () => {
        setLoading(true);
        setError(null);
        setIsSearchResult(false);
        try {
            const resp = await fetch(`${API}/api/memory/all`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            setMemories(data);
        } catch (err) {
            setError(err.message);
            setMemories([]);
        }
        setLoading(false);
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        const q = searchQuery.trim();
        if (!q) {
            fetchAll();
            return;
        }
        setSearching(true);
        setError(null);
        try {
            const resp = await fetch(`${API}/api/memory/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q }),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            setMemories(data);
            setIsSearchResult(true);
        } catch (err) {
            setError(err.message);
        }
        setSearching(false);
    };

    const handleDelete = async (docId) => {
        try {
            const resp = await fetch(`${API}/api/memory/${encodeURIComponent(docId)}`, {
                method: 'DELETE',
            });
            if (resp.ok) {
                setMemories((prev) => prev.filter((m) => m.id !== docId));
            }
        } catch {
            // silent fail, card stays
        }
    };

    const handleClearSearch = () => {
        setSearchQuery('');
        fetchAll();
        if (inputRef.current) inputRef.current.focus();
    };

    return (
        <div style={styles.root}>
            {/* Header */}
            <div style={styles.header}>
                <h1 style={styles.title}>
                    <span style={styles.titleIcon}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00f2ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 6v6l4 2" />
                        </svg>
                    </span>
                    Onyx Memory
                </h1>
                <p style={styles.subtitle}>
                    {isSearchResult
                        ? `${memories.length} result${memories.length !== 1 ? 's' : ''} for "${searchQuery}"`
                        : `${memories.length} page${memories.length !== 1 ? 's' : ''} in memory`
                    }
                </p>
            </div>

            {/* Search */}
            <form onSubmit={handleSearch} style={styles.searchForm}>
                <div style={styles.searchWrap}>
                    <svg style={styles.searchIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        style={styles.searchInput}
                        placeholder="Search your memory semantically..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button type="button" style={styles.clearBtn} onClick={handleClearSearch} title="Clear search">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        </button>
                    )}
                    <button type="submit" style={styles.searchBtn} disabled={searching}>
                        {searching ? 'Searching...' : 'Search'}
                    </button>
                </div>
            </form>

            {/* Error / Loading */}
            {error && <div style={styles.error}>Error: {error}</div>}
            {loading && <div style={styles.loadingText}>Loading memories...</div>}

            {/* Empty State */}
            {!loading && !error && memories.length === 0 && (
                <div style={styles.emptyState}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                    </svg>
                    <p style={styles.emptyText}>
                        {isSearchResult ? 'No matching memories found.' : 'No memories yet. Browse the web and pages will appear here.'}
                    </p>
                </div>
            )}

            {/* Memory Grid */}
            {!loading && memories.length > 0 && (
                <div style={styles.grid}>
                    {memories.map((mem) => (
                        <MemoryCard key={mem.id} memory={mem} onDelete={handleDelete} />
                    ))}
                </div>
            )}
        </div>
    );
}

function MemoryCard({ memory, onDelete }) {
    const [hovered, setHovered] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const displayUrl = (memory.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

    return (
        <div
            style={{
                ...styles.card,
                ...(hovered ? styles.cardHover : {}),
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Title row */}
            <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>{memory.title || 'Untitled'}</h3>
                <button
                    style={{
                        ...styles.trashBtn,
                        opacity: hovered ? 1 : 0,
                    }}
                    onClick={async () => {
                        setDeleting(true);
                        await onDelete(memory.id);
                        setDeleting(false);
                    }}
                    title="Delete memory"
                    disabled={deleting}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                </button>
            </div>

            {/* URL */}
            <p style={styles.cardUrl}>{displayUrl || 'unknown'}</p>

            {/* Snippet */}
            <p style={styles.cardSnippet}>
                {(memory.snippet || '').substring(0, 200) || 'No content preview.'}
            </p>

            {/* Distance badge (for search results) */}
            {memory.distance != null && (
                <span style={styles.distanceBadge}>
                    {(1 - memory.distance).toFixed(0) === '1' ? '99' : ((1 - memory.distance) * 100).toFixed(0)}% match
                </span>
            )}
        </div>
    );
}

const styles = {
    root: {
        background: '#09090b',
        color: '#fff',
        minHeight: '100vh',
        padding: '40px 32px 60px',
        overflowY: 'auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    header: {
        textAlign: 'center',
        marginBottom: 32,
    },
    title: {
        fontSize: 28,
        fontWeight: 700,
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        letterSpacing: '-0.5px',
    },
    titleIcon: {
        display: 'flex',
    },
    subtitle: {
        margin: '8px 0 0',
        color: 'rgba(255,255,255,0.45)',
        fontSize: 14,
    },
    searchForm: {
        maxWidth: 640,
        margin: '0 auto 36px',
    },
    searchWrap: {
        display: 'flex',
        alignItems: 'center',
        background: '#18181b',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#27272a',
        borderRadius: 12,
        padding: '4px 6px 4px 14px',
        transition: 'border-color 0.2s',
    },
    searchIcon: {
        flexShrink: 0,
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: '#fff',
        fontSize: 16,
        padding: '10px 0',
        fontFamily: 'inherit',
    },
    clearBtn: {
        background: 'none',
        border: 'none',
        color: 'rgba(255,255,255,0.4)',
        cursor: 'pointer',
        padding: '4px 8px',
        display: 'flex',
        alignItems: 'center',
    },
    searchBtn: {
        background: 'linear-gradient(135deg, #00f2ea, #0099ff)',
        border: 'none',
        borderRadius: 8,
        color: '#000',
        fontWeight: 600,
        fontSize: 13,
        padding: '8px 18px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    },
    error: {
        textAlign: 'center',
        color: '#ff6b6b',
        margin: '20px 0',
        fontSize: 14,
    },
    loadingText: {
        textAlign: 'center',
        color: 'rgba(255,255,255,0.35)',
        margin: '60px 0',
        fontSize: 15,
    },
    emptyState: {
        textAlign: 'center',
        margin: '80px auto',
        maxWidth: 300,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.3)',
        marginTop: 16,
        fontSize: 14,
        lineHeight: 1.5,
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 16,
        maxWidth: 1200,
        margin: '0 auto',
    },
    card: {
        background: '#18181b',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#27272a',
        borderRadius: 12,
        padding: '18px 20px',
        transition: 'all 0.2s ease',
        cursor: 'default',
        position: 'relative',
    },
    cardHover: {
        borderColor: 'rgba(0,242,234,0.5)',
        boxShadow: '0 0 20px rgba(0,242,234,0.08)',
    },
    cardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 8,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: 600,
        margin: 0,
        lineHeight: 1.35,
        color: '#f0f0f0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
    },
    trashBtn: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 4,
        display: 'flex',
        alignItems: 'center',
        transition: 'opacity 0.15s',
        flexShrink: 0,
    },
    cardUrl: {
        fontSize: 12,
        color: '#00f2ea',
        margin: '6px 0 10px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        opacity: 0.8,
    },
    cardSnippet: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 1.5,
        margin: 0,
        display: '-webkit-box',
        WebkitLineClamp: 4,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
    },
    distanceBadge: {
        display: 'inline-block',
        marginTop: 10,
        fontSize: 11,
        fontWeight: 600,
        color: '#00f2ea',
        background: 'rgba(0,242,234,0.1)',
        border: '1px solid rgba(0,242,234,0.2)',
        borderRadius: 6,
        padding: '2px 8px',
    },
};
