import React, { memo } from 'react';

/**
 * AgentOverlay — Floating glassmorphism panel below the Omnibox.
 * Shows AI thinking state, then displays the response text.
 */
function AgentOverlay({ isThinking, command, response, onClose }) {
  if (!isThinking && !response) return null;

  return (
    <div className="agent-overlay">
      <div className="agent-overlay-header">
        <div className="agent-overlay-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C7.6 2 4 5.6 4 10c0 2.4 1 4.5 2.6 6H8v4h8v-4h1.4C19 14.5 20 12.4 20 10c0-4.4-3.6-8-8-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="10" cy="9.5" r="0.8" fill="currentColor" />
            <circle cx="14" cy="9.5" r="0.8" fill="currentColor" />
          </svg>
          <span>Onyx AI</span>
        </div>
        {command && <span className="agent-overlay-cmd">{command}</span>}
        <button className="agent-overlay-close" onClick={onClose} title="Dismiss">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="agent-overlay-body">
        {isThinking ? (
          <div className="agent-thinking">
            <div className="agent-thinking-dots">
              <span /><span /><span />
            </div>
            <span className="agent-thinking-text">Onyx AI is processing...</span>
          </div>
        ) : response ? (
          <div className="agent-response">
            {response.error ? (
              <p className="agent-error">{response.error}</p>
            ) : (
              <p className="agent-text">{response.text}</p>
            )}
            {response.action && response.action !== 'respond' && (
              <div className="agent-action-badge">
                Action: <strong>{response.action}</strong>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default memo(AgentOverlay);
