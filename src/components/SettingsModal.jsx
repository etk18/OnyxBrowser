import React, { useState, useEffect } from 'react';

const SEARCH_ENGINES = [
    { value: 'google', label: 'Google', url: 'https://www.google.com/search?q=' },
    { value: 'duckduckgo', label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    { value: 'bing', label: 'Bing', url: 'https://www.bing.com/search?q=' },
    { value: 'perplexity', label: 'Perplexity', url: 'https://www.perplexity.ai/search?q=' },
];

export { SEARCH_ENGINES };

export default function SettingsModal({ onClose }) {
    const [settings, setSettings] = useState({
        searchEngine: 'google',
        homePage: 'https://www.google.com',
        adBlock: true,
    });
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [saved, setSaved] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [cleared, setCleared] = useState(false);

    useEffect(() => {
        if (window.browserAPI?.getSettings) {
            window.browserAPI.getSettings().then((s) => {
                if (s) setSettings(s);
            });
        }
        // Load stored API key
        const storedKey = localStorage.getItem('onyx_openrouter_key') || '';
        setApiKey(storedKey);
    }, []);

    const handleChange = (key, value) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
        if (window.browserAPI?.setSetting) {
            window.browserAPI.setSetting(key, value);
        }
    };

    const handleSave = () => {
        // Save API key
        if (apiKey.trim()) {
            localStorage.setItem('onyx_openrouter_key', apiKey.trim());
        } else {
            localStorage.removeItem('onyx_openrouter_key');
        }
        // Save settings via IPC
        if (window.browserAPI?.setSetting) {
            Object.entries(settings).forEach(([key, value]) => {
                window.browserAPI.setSetting(key, value);
            });
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleClearCache = async () => {
        setClearing(true);
        setCleared(false);
        if (window.browserAPI?.clearCache) {
            await window.browserAPI.clearCache();
        }
        setClearing(false);
        setCleared(true);
        setTimeout(() => setCleared(false), 2500);
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="settings-header">
                    <h2>Settings</h2>
                    <button className="settings-close-btn" onClick={onClose}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    </button>
                </div>

                {/* Search Engine */}
                <div className="settings-group">
                    <label className="settings-label">Search Engine</label>
                    <select
                        className="settings-select"
                        value={settings.searchEngine}
                        onChange={(e) => handleChange('searchEngine', e.target.value)}
                    >
                        {SEARCH_ENGINES.map((engine) => (
                            <option key={engine.value} value={engine.value}>
                                {engine.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Home Page */}
                <div className="settings-group">
                    <label className="settings-label">Home Page</label>
                    <input
                        type="text"
                        className="settings-input"
                        value={settings.homePage}
                        onChange={(e) => handleChange('homePage', e.target.value)}
                        placeholder="https://www.google.com"
                    />
                </div>

                {/* AI API Key */}
                <div className="settings-group">
                    <label className="settings-label">OpenRouter API Key</label>
                    <div className="settings-key-row">
                        <input
                            type={showKey ? 'text' : 'password'}
                            className="settings-input"
                            placeholder="sk-or-v1..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                        />
                        <button
                            className="settings-toggle-key"
                            onClick={() => setShowKey(!showKey)}
                            title={showKey ? 'Hide key' : 'Show key'}
                        >
                            {showKey ? '🙈' : '👁️'}
                        </button>
                    </div>
                    <p className="settings-hint">
                        Get a free key at <strong>openrouter.ai</strong> — powers Onyx Agent.
                    </p>
                </div>

                {/* Ad-Blocker */}
                <div className="settings-group settings-row">
                    <label className="settings-label">Ad-Blocker</label>
                    <button
                        className={`toggle-switch ${settings.adBlock ? 'toggle-on' : 'toggle-off'}`}
                        onClick={() => handleChange('adBlock', !settings.adBlock)}
                        aria-label="Toggle Ad-Blocker"
                    >
                        <span className="toggle-knob" />
                    </button>
                </div>

                {/* Clear Cache */}
                <div className="settings-group">
                    <label className="settings-label">Data</label>
                    <button
                        className="settings-danger-btn"
                        onClick={handleClearCache}
                        disabled={clearing}
                    >
                        {clearing ? 'Clearing...' : cleared ? '✓ Cleared!' : 'Clear Cache & Cookies'}
                    </button>
                </div>

                {/* Footer: Save & Cancel */}
                <div className="settings-footer">
                    <button className="settings-cancel-btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="settings-save-btn" onClick={handleSave}>
                        {saved ? '✓ Saved!' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}
