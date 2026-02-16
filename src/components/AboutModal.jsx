import React from 'react';

function AboutModal({ onClose }) {
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content about-modal" onClick={(e) => e.stopPropagation()}>
                <div className="about-header">
                    <div className="about-logo">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <h1>ONYX</h1>
                    <span className="version-badge">v1.0.0 Public Beta</span>
                </div>

                <div className="about-body">
                    <p className="tagline">The High-Performance Agentic Browser.</p>
                    <div className="credits">
                        <p>Designed & Engineered by Eesh</p>
                        <p>© 2026 Onyx Browser</p>
                    </div>
                </div>

                <button className="modal-close-btn" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}

export default AboutModal;
