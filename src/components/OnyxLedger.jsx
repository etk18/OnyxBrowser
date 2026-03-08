import React from 'react';

const UPDATES = [
    {
        icon: '\u{1F680}',
        title: 'Production Packaging',
        tag: 'v2.0.0',
        description:
            'Onyx is now a fully packaged desktop application. PyInstaller-frozen FastAPI backend (onyx-brain), electron-builder with NSIS (Windows) and DMG+ZIP (macOS), maximum compression, and GitHub Releases auto-publish.',
    },
    {
        icon: '\u{1F9E0}',
        title: 'Local AI Brain',
        tag: 'v2.0.0',
        description:
            'The FastAPI backend now ships as a bundled binary spawned by Electron. Automatic startup, stdout/stderr logging, and a zombie-killer on quit ensures no orphaned processes. API key sync bridge connects the React Settings UI to the Python backend in real time.',
    },
    {
        icon: '\u{1F3AF}',
        title: 'Spatial DOM Execution',
        tag: 'v2.0.0',
        description:
            'LLM-powered /click command with natural language element targeting. Describe what you want to click ("Sign In button") and the agent matches it against the viewport DOM map using Groq or OpenAI — no numeric IDs needed.',
    },
    {
        icon: '\u{1F4BE}',
        title: 'Semantic Memory Dashboard',
        tag: 'v2.0.0',
        description:
            'Full onyx://memory internal page with ChromaDB-powered semantic search, browsable memory cards, delete capability, and distance scoring. Accessible from the AI Sidebar for instant recall of your browsing history.',
    },
    {
        icon: '\u{1F511}',
        title: 'API Key Settings Bridge',
        tag: 'v2.0.0',
        description:
            'Three-path sync pipeline: IPC handler forwards saves to backend, startup sync pushes all keys on launch with retry, and direct POST endpoint. Your Groq/OpenAI keys flow from Settings UI to the Python brain instantly.',
    },
    {
        icon: '\u{1F6E1}\uFE0F',
        title: 'The Onyx Shield',
        tag: 'v2.0.0',
        description:
            'High-performance Rust-based network interception (NAPI-RS) for ad and tracker blocking. Two-tier architecture: O(1) HashSet domain lookup in Rust, backed by Cliqz deep filter analysis.',
    },
    {
        icon: '\u{1F517}',
        title: 'Native Web3 Provider',
        tag: 'v2.0.0',
        description:
            'Zero-extension dApp support via injected EIP-1193 window.ethereum provider. Connect to any dApp with a custom wallet approval modal — no MetaMask required.',
    },
    {
        icon: '\u{1F9E9}',
        title: 'Chrome Extension Loader',
        tag: 'v2.0.0',
        description:
            'Developer-mode support for sideloading unpacked Chrome extensions. Load, manage, and remove extensions from the Settings panel with a native directory picker.',
    },
    {
        icon: '\u{1F41B}',
        title: 'Stability Fixes',
        tag: 'v2.0.0',
        description:
            'Fixed React CSS shorthand/specific property conflict warnings, Omnibox double-navigation on Enter, event handler ordering, and startup reliability. Electron spawner uses Node http module for maximum compatibility.',
    },
];

export default function OnyxLedger() {
    return (
        <div className="ledger">
            <div className="ledger-glow ledger-glow-1" />
            <div className="ledger-glow ledger-glow-2" />

            <div className="ledger-content">
                <div className="ledger-header">
                    <h1 className="ledger-title">Onyx Ledger</h1>
                    <p className="ledger-subtitle">What's New in Stable v2.0.0</p>
                </div>

                <div className="ledger-timeline">
                    {UPDATES.map((update, i) => (
                        <div key={i} className="ledger-entry">
                            <div className="ledger-entry-line" />
                            <div className="ledger-entry-dot" />
                            <div className="ledger-entry-card">
                                <div className="ledger-entry-header">
                                    <span className="ledger-entry-icon">{update.icon}</span>
                                    <h3 className="ledger-entry-title">{update.title}</h3>
                                    <span className="ledger-entry-tag">{update.tag}</span>
                                </div>
                                <p className="ledger-entry-desc">{update.description}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="ledger-footer">
                    <span>Onyx | Stable v2.0.0</span>
                </div>
            </div>
        </div>
    );
}
