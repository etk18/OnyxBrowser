import React, { useState, useEffect, useMemo } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export default function HistoryPage({ onNavigate }) {
    const [history, setHistory] = useState([]);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (window.browserAPI?.getHistory) {
            window.browserAPI.getHistory().then((data) => {
                setHistory(data || []);
                setIsLoading(false);
            });
        }
    }, []);

    const filtered = useMemo(() => {
        if (!search) return history;
        const q = search.toLowerCase();
        return history.filter(
            (item) =>
                (item.title && item.title.toLowerCase().includes(q)) ||
                (item.url && item.url.toLowerCase().includes(q))
        );
    }, [history, search]);

    const handleClearHistory = async () => {
        if (!window.browserAPI?.clearHistory) return;
        await window.browserAPI.clearHistory();
        setHistory([]);
    };

    // Group by date
    const grouped = useMemo(() => {
        const groups = {};
        filtered.forEach((item) => {
            const day = dayjs(item.date).format('YYYY-MM-DD');
            const label = dayjs(item.date).isToday?.()
                ? 'Today'
                : dayjs(item.date).isYesterday?.()
                    ? 'Yesterday'
                    : dayjs(item.date).format('MMMM D, YYYY');
            if (!groups[day]) groups[day] = { label: label || dayjs(item.date).format('MMMM D, YYYY'), items: [] };
            groups[day].items.push(item);
        });
        return Object.values(groups);
    }, [filtered]);

    return (
        <div className="history-page">
            <div className="history-header">
                <h1>History</h1>
                <div className="history-actions">
                    <div className="history-search-wrap">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                            <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        </svg>
                        <input
                            type="text"
                            className="history-search"
                            placeholder="Search history…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <button className="history-clear-btn" onClick={handleClearHistory} disabled={history.length === 0}>
                        Clear All History
                    </button>
                </div>
            </div>

            <div className="history-list">
                {isLoading ? (
                    <div className="history-empty">Loading…</div>
                ) : filtered.length === 0 ? (
                    <div className="history-empty">
                        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                            <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M20 10V20L26 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <p>{search ? 'No matching results' : 'No history yet'}</p>
                    </div>
                ) : (
                    grouped.map((group, gi) => (
                        <div key={gi} className="history-group">
                            <div className="history-group-label">{group.label}</div>
                            {group.items.map((item, i) => (
                                <div
                                    key={i}
                                    className="history-item"
                                    onClick={() => onNavigate(item.url)}
                                    title={item.url}
                                >
                                    <div className="history-item-time">
                                        {dayjs(item.date).format('h:mm A')}
                                    </div>
                                    <div className="history-item-info">
                                        <span className="history-item-title">{item.title || item.url}</span>
                                        <span className="history-item-url">{item.url}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
