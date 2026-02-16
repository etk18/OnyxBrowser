import React, { useState, useRef, useEffect } from 'react';
import './HomePage.css';

const QUICK_LINKS = [
    { name: 'YouTube', url: 'https://www.youtube.com', icon: '▶️', color: '#ff0000' },
    { name: 'GitHub', url: 'https://github.com', icon: '🐙', color: '#8b5cf6' },
    { name: 'ChatGPT', url: 'https://chat.openai.com', icon: '🤖', color: '#10a37f' },
    { name: 'Hacker News', url: 'https://news.ycombinator.com', icon: '📰', color: '#ff6600' },
    { name: 'Reddit', url: 'https://www.reddit.com', icon: '🔴', color: '#ff4500' },
    { name: 'Twitter', url: 'https://x.com', icon: '𝕏', color: '#1da1f2' },
];

function isUrl(input) {
    const trimmed = input.trim();
    // Contains a dot with no spaces → likely a URL
    if (/^\S+\.\S+$/.test(trimmed)) return true;
    // Starts with protocol
    if (/^https?:\/\//i.test(trimmed)) return true;
    return false;
}

export default function HomePage({ onNavigate }) {
    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState(false);
    const inputRef = useRef(null);

    // Auto-focus search bar
    useEffect(() => {
        const timer = setTimeout(() => inputRef.current?.focus(), 200);
        return () => clearTimeout(timer);
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        const text = query.trim();
        if (!text) return;

        if (isUrl(text)) {
            // Navigate to URL
            const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
            onNavigate(url);
        } else {
            // Search via Google
            onNavigate(`https://www.google.com/search?q=${encodeURIComponent(text)}`);
        }
    };

    // Current time greeting
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    return (
        <div className="homepage">
            {/* Ambient glow background */}
            <div className="homepage-glow homepage-glow-1" />
            <div className="homepage-glow homepage-glow-2" />

            <div className="homepage-content">
                {/* Brand */}
                <h1 className="homepage-brand">ONYX</h1>
                <p className="homepage-subtitle">The Agentic Browser</p>

                {/* Search Bar */}
                <form className="homepage-search-form" onSubmit={handleSubmit}>
                    <div className={`homepage-search-wrapper ${focused ? 'homepage-search-focused' : ''}`}>
                        <svg className="homepage-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
                            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <input
                            ref={inputRef}
                            className="homepage-search-input"
                            type="text"
                            placeholder="Search or enter URL..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            autoComplete="off"
                            spellCheck="false"
                        />
                        {query && (
                            <button
                                type="button"
                                className="homepage-search-clear"
                                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                            >
                                ×
                            </button>
                        )}
                    </div>
                </form>

                {/* Greeting */}
                <p className="homepage-greeting">{greeting}</p>

                {/* Quick Links */}
                <div className="homepage-quick-links">
                    {QUICK_LINKS.map((link) => (
                        <button
                            key={link.name}
                            className="homepage-quick-link"
                            onClick={() => onNavigate(link.url)}
                            title={link.name}
                        >
                            <span className="homepage-quick-link-icon">{link.icon}</span>
                            <span className="homepage-quick-link-name">{link.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="homepage-footer">
                <span>Onyx Browser — Built for the future</span>
            </div>
        </div>
    );
}
