import React, { useState, useEffect, useMemo } from 'react';

/**
 * Nuclear Favicon — 4 image sources + CSS letter fallback.
 *  1. Google S2 API
 *  2. DuckDuckGo Icons API
 *  3. Clearbit Logo API
 *  4. CSS letter circle (guaranteed render)
 */

function Favicon({ url, size = 24 }) {
    const { hostname, origin, letter } = useMemo(() => {
        try {
            const parsed = new URL(url);
            return {
                hostname: parsed.hostname,
                origin: parsed.origin,
                letter: parsed.hostname.replace('www.', '').charAt(0).toUpperCase() || '?',
            };
        } catch {
            return { hostname: '', origin: '', letter: '?' };
        }
    }, [url]);

    const sources = useMemo(
        () =>
            hostname
                ? [
                    `https://www.google.com/s2/favicons?sz=64&domain_url=${origin}`,
                    `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
                    `https://logo.clearbit.com/${hostname}`,
                ]
                : [],
        [hostname, origin]
    );

    const [attempt, setAttempt] = useState(0);

    // Reset when domain changes
    useEffect(() => {
        setAttempt(0);
    }, [hostname]);

    const handleError = () => {
        setAttempt((prev) => prev + 1);
    };

    // All sources exhausted or no hostname → letter circle
    if (!hostname || attempt >= sources.length) {
        return (
            <div
                className="favicon-letter"
                style={{
                    width: size,
                    height: size,
                    borderRadius: 6,
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: size * 0.5,
                    fontWeight: 700,
                    userSelect: 'none',
                    flexShrink: 0,
                    lineHeight: 1,
                }}
            >
                {letter}
            </div>
        );
    }

    return (
        <img
            src={sources[attempt]}
            alt=""
            width={size}
            height={size}
            onError={handleError}
            draggable={false}
            className="favicon-img"
            style={{
                borderRadius: 4,
                objectFit: 'contain',
                flexShrink: 0,
            }}
        />
    );
}

export default Favicon;
