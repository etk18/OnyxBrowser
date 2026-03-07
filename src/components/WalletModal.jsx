import React from 'react';

function WalletModal({ origin, onApprove, onReject }) {
  return (
    <div className="modal-backdrop" onClick={onReject}>
      <div className="modal-content wallet-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wallet-modal-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="5" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
            <path d="M2 10H22" stroke="currentColor" strokeWidth="1.6" />
            <rect x="15" y="13" width="4.5" height="3" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6 2.5L12 5L18 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 className="wallet-modal-title">Connection Request</h2>

        <p className="wallet-modal-origin">{origin || 'Unknown dApp'}</p>

        <p className="wallet-modal-desc">
          This site wants to connect to your Onyx Wallet. It will be able to view
          your wallet address and request transaction approvals.
        </p>

        <div className="wallet-modal-actions">
          <button className="wallet-btn wallet-btn-reject" onClick={onReject}>
            Reject
          </button>
          <button className="wallet-btn wallet-btn-connect" onClick={onApprove}>
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}

export default WalletModal;
