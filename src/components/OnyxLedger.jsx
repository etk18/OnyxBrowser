import React from 'react';

const UPDATES = [
    {
        icon: '\u{1F3AF}',
        title: 'Spatial DOM Mapping',
        tag: 'v0.1.0',
        description:
            'Precise AI interaction via viewport coordinate numbering (Vimium-style). The agent now maps every interactive element in the viewport with numbered IDs, replacing brittle CSS selectors with deterministic spatial references.',
    },
    {
        icon: '\u{1F9E0}',
        title: 'Agentic Memory',
        tag: 'v0.1.0',
        description:
            'Local vector database (ChromaDB) for semantic history search and contextual retrieval. Every page you visit is silently embedded — the AI agent draws on your full browsing history when reasoning about tasks.',
    },
    {
        icon: '\u{1F9E9}',
        title: 'Chrome Extension Loader',
        tag: 'v0.1.0',
        description:
            'Developer-mode support for sideloading unpacked Chrome extensions. Load, manage, and remove extensions from the Settings panel with a native directory picker.',
    },
    {
        icon: '\u{1F517}',
        title: 'Native Web3 Provider',
        tag: 'v0.1.0',
        description:
            'Zero-extension dApp support via an injected EIP-1193 window.ethereum provider. Connect to any dApp with a custom wallet approval modal — no MetaMask required.',
    },
    {
        icon: '\u{1F6E1}\uFE0F',
        title: 'The Onyx Shield',
        tag: 'v0.1.0',
        description:
            'High-performance Rust-based network interception (NAPI-RS) for ad and tracker blocking. A two-tier architecture: O(1) HashSet domain lookup in Rust, backed by Cliqz deep filter analysis — 1.27M ops/sec.',
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
                    <p className="ledger-subtitle">What's New in Public Beta v0.1.0</p>
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
                    <span>OnyxBrowser | Public Beta v0.1.0</span>
                </div>
            </div>
        </div>
    );
}
