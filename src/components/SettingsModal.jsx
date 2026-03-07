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
    const [extensions, setExtensions] = useState([]);
    const [extLoading, setExtLoading] = useState(false);
    const [extError, setExtError] = useState(null);

    useEffect(() => {
        if (window.browserAPI?.getSettings) {
            window.browserAPI.getSettings().then((s) => {
                if (s) setSettings(s);
            });
        }
        // Load API key from secure electron-store
        if (window.browserAPI?.getApiKey) {
            window.browserAPI.getApiKey('groq').then((key) => {
                setApiKey(key || '');
            });
        } else {
            // Fallback for dev mode without preload
            setApiKey(localStorage.getItem('onyx_groq_key') || '');
        }

        // Migrate old OpenRouter key from localStorage
        const oldKey = localStorage.getItem('onyx_openrouter_key');
        if (oldKey) {
            localStorage.removeItem('onyx_openrouter_key');
            alert('OnyxBrowser now uses Groq instead of OpenRouter. Please re-enter your Groq API Key in Settings.');
        }

        // Load installed extensions
        if (window.browserAPI?.getExtensions) {
            window.browserAPI.getExtensions().then(setExtensions);
        }
    }, []);

    const handleChange = (key, value) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
        if (window.browserAPI?.setSetting) {
            window.browserAPI.setSetting(key, value);
        }
    };

    const handleSave = () => {
        // Save API key to secure electron-store
        if (window.browserAPI?.setApiKey) {
            window.browserAPI.setApiKey('groq', apiKey.trim());
        }
        // Also keep in localStorage as fallback for ai.js in dev
        if (apiKey.trim()) {
            localStorage.setItem('onyx_groq_key', apiKey.trim());
        } else {
            localStorage.removeItem('onyx_groq_key');
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

    const handleLoadExtension = async () => {
        if (!window.browserAPI?.loadExtension) return;
        setExtLoading(true);
        setExtError(null);
        const result = await window.browserAPI.loadExtension();
        setExtLoading(false);
        if (result?.canceled) return;
        if (result?.ok) {
            // Refresh the list
            const updated = await window.browserAPI.getExtensions();
            setExtensions(updated);
        } else {
            setExtError(result?.error || 'Failed to load extension');
        }
    };

    const handleRemoveExtension = async (id) => {
        if (!window.browserAPI?.removeExtension) return;
        await window.browserAPI.removeExtension(id);
        const updated = await window.browserAPI.getExtensions();
        setExtensions(updated);
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
                    <label className="settings-label">Groq API Key</label>
                    <div className="settings-key-row">
                        <input
                            type={showKey ? 'text' : 'password'}
                            className="settings-input"
                            placeholder="gsk_..."
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
                        Get a free key at <strong>console.groq.com</strong> — powers Onyx Agent & Voice.
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

                {/* Extensions */}
                <div className="settings-group">
                    <label className="settings-label">Extensions</label>
                    <button
                        className="settings-ext-btn"
                        onClick={handleLoadExtension}
                        disabled={extLoading}
                    >
                        {extLoading ? 'Loading…' : 'Load Unpacked Extension'}
                    </button>
                    {extError && <p className="settings-ext-error">{extError}</p>}
                    {extensions.length > 0 && (
                        <ul className="settings-ext-list">
                            {extensions.map((ext) => (
                                <li key={ext.id} className="settings-ext-item">
                                    <span className="settings-ext-name">{ext.name}</span>
                                    <span className="settings-ext-id">{ext.id}</span>
                                    <button
                                        className="settings-ext-remove"
                                        onClick={() => handleRemoveExtension(ext.id)}
                                        title="Remove extension"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Footer: Save & Cancel */}
                <div className="settings-version">OnyxBrowser | Public Beta v0.1.0</div>
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
