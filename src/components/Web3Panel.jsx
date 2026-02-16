import React, { memo } from 'react';

/**
 * Web3Panel — Wallet dashboard rendered inside the menu panel.
 *
 * Connected state: Glass card showing ENS/address, balance, chain.
 * Disconnected state: Neon "Connect Wallet" CTA button.
 *
 * Props: { account, shortAddress, balance, ensName, chainName, error, connecting, connect, disconnect }
 */

function Web3Panel({ account, shortAddress, balance, ensName, chainName, error, connecting, connect, disconnect }) {
    return (
        <div className="menu-section">
            <div className="menu-section-header">
                <span className="menu-section-title">Wallet</span>
                {account && (
                    <button className="menu-action-btn menu-action-danger" onClick={disconnect}>
                        Disconnect
                    </button>
                )}
            </div>

            <div className="menu-list">
                {/* Error State */}
                {error && (
                    <div className="wallet-error">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
                            <path d="M8 5V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            <circle cx="8" cy="11.5" r="0.7" fill="currentColor" />
                        </svg>
                        <span>{error}</span>
                    </div>
                )}

                {/* Disconnected State */}
                {!account && (
                    <div className="wallet-connect-cta">
                        <div className="wallet-icon-ring">
                            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                                <rect x="4" y="8" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M4 14H28" stroke="currentColor" strokeWidth="1.5" />
                                <rect x="20" y="18" width="5" height="3" rx="1" stroke="currentColor" strokeWidth="1.2" />
                                <path d="M8 5L16 8L24 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <p className="wallet-cta-title">Connect your Wallet</p>
                        <p className="wallet-cta-sub">View your ETH balance & ENS name</p>
                        <button
                            className="wallet-connect-btn"
                            onClick={connect}
                            disabled={connecting}
                        >
                            {connecting ? (
                                <>
                                    <span className="spinner-sm" />
                                    Connecting…
                                </>
                            ) : (
                                <>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <path d="M2 6L8 2L14 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d="M4 7V13H12V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                        <rect x="6.5" y="9.5" width="3" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
                                    </svg>
                                    Connect Wallet
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Connected State */}
                {account && (
                    <div className="wallet-dashboard">
                        {/* Identity Card */}
                        <div className="wallet-card wallet-identity">
                            <div className="wallet-avatar">
                                {/* Gradient Jazzicon-style avatar from address */}
                                <div
                                    className="wallet-avatar-gradient"
                                    style={{
                                        background: `linear-gradient(135deg,
                      hsl(${parseInt(account.slice(2, 6), 16) % 360}, 70%, 50%),
                      hsl(${parseInt(account.slice(6, 10), 16) % 360}, 80%, 60%))`,
                                    }}
                                />
                            </div>
                            <div className="wallet-identity-info">
                                <span className="wallet-ens">
                                    {ensName || shortAddress}
                                </span>
                                {ensName && (
                                    <span className="wallet-address-sub">{shortAddress}</span>
                                )}
                                <span className="wallet-chain-badge">{chainName}</span>
                            </div>
                        </div>

                        {/* Balance Card */}
                        <div className="wallet-card wallet-balance-card">
                            <div className="wallet-balance-label">Balance</div>
                            <div className="wallet-balance-value">
                                <span className="wallet-eth-symbol">Ξ</span>
                                {balance ? parseFloat(balance).toFixed(4) : '—'}
                            </div>
                            <div className="wallet-balance-usd">
                                {/* Rough ETH/USD — in production you'd fetch from an API */}
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="wallet-actions">
                            <button
                                className="wallet-action-pill"
                                onClick={() => {
                                    navigator.clipboard.writeText(account);
                                }}
                                title="Copy address to clipboard"
                            >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                                    <path d="M10 4V2.5C10 1.95 9.55 1.5 9 1.5H2.5C1.95 1.5 1.5 1.95 1.5 2.5V9C1.5 9.55 1.95 10 2.5 10H4" stroke="currentColor" strokeWidth="1.2" />
                                </svg>
                                Copy Address
                            </button>
                            <button
                                className="wallet-action-pill"
                                onClick={() => {
                                    // Open Etherscan in a new tab
                                    const url = `https://etherscan.io/address/${account}`;
                                    // dispatch navigate to this URL in the active webview
                                    window.open(url, '_blank');
                                }}
                                title="View on Etherscan"
                            >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M5 2H3C2.45 2 2 2.45 2 3V11C2 11.55 2.45 12 3 12H11C11.55 12 12 11.55 12 11V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                    <path d="M8 2H12V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M12 2L7 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                </svg>
                                Etherscan
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default memo(Web3Panel);
