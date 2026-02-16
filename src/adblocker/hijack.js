/**
 * ZERO-LATENCY YouTube Ad Blocker — Proactive Data Interceptor
 *
 * This script runs in the MAIN world BEFORE YouTube's player JS (base.js).
 * It hijacks the data pipeline so ads never reach the player.
 *
 * Strategy:
 * 1. Redefine `ytInitialPlayerResponse` setter to strip ad fields on write
 * 2. Override `Response.prototype.json` to clean AJAX player data
 * 3. Override `XMLHttpRequest.prototype.open` to block ad-serving endpoints
 */

console.log('--- ZERO-LATENCY AD BLOCKER ACTIVE ---');

(function () {
    'use strict';

    if (window.__aether_hijack_active) return;
    window.__aether_hijack_active = true;

    // ── Helper: recursively strip ad fields from any object ──
    const stripAds = (data) => {
        if (!data || typeof data !== 'object') return data;

        // Top-level ad fields
        delete data.adPlacements;
        delete data.playerAds;
        delete data.adSlots;
        delete data.adBreakHeartbeatParams;

        // Nested in playerResponse
        if (data.playerResponse) {
            delete data.playerResponse.adPlacements;
            delete data.playerResponse.playerAds;
            delete data.playerResponse.adSlots;
            delete data.playerResponse.adBreakHeartbeatParams;
        }

        // Nested in playerResponse.adPlacements via onResponseReceivedActions
        if (Array.isArray(data.onResponseReceivedActions)) {
            data.onResponseReceivedActions = data.onResponseReceivedActions.filter(
                (a) => !a.adPlacementRenderer
            );
        }

        return data;
    };

    // ══════════════════════════════════════════════════════════
    // 1. Intercept ytInitialPlayerResponse (page load)
    // ══════════════════════════════════════════════════════════

    let _ytInitialPlayerResponse;
    try {
        Object.defineProperty(window, 'ytInitialPlayerResponse', {
            get: () => _ytInitialPlayerResponse,
            set: (val) => {
                _ytInitialPlayerResponse = stripAds(val);
            },
            configurable: true,
        });
    } catch (e) {
        // Fallback: overwrite after a tick
        const checkAndStrip = () => {
            if (window.ytInitialPlayerResponse) {
                window.ytInitialPlayerResponse = stripAds(window.ytInitialPlayerResponse);
            }
        };
        setTimeout(checkAndStrip, 0);
        setTimeout(checkAndStrip, 100);
        setTimeout(checkAndStrip, 500);
    }

    // ══════════════════════════════════════════════════════════
    // 2. Intercept ytInitialData (homepage/search ad tiles)
    // ══════════════════════════════════════════════════════════

    let _ytInitialData;
    try {
        Object.defineProperty(window, 'ytInitialData', {
            get: () => _ytInitialData,
            set: (val) => {
                _ytInitialData = stripAds(val);
            },
            configurable: true,
        });
    } catch { }

    // ══════════════════════════════════════════════════════════
    // 3. Override Response.prototype.json (AJAX / Fetch)
    // ══════════════════════════════════════════════════════════

    const _originalJson = Response.prototype.json;
    Response.prototype.json = async function () {
        const data = await _originalJson.apply(this, arguments);
        // Only clean YouTube player/browse data
        if (data && typeof data === 'object' && (data.adPlacements || data.playerAds || data.playerResponse)) {
            return stripAds(data);
        }
        return data;
    };

    // ══════════════════════════════════════════════════════════
    // 4. Block ad-serving XHR endpoints entirely
    // ══════════════════════════════════════════════════════════

    const _originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        if (typeof url === 'string') {
            const blocked = [
                'pagead2.googlesyndication.com',
                'googleads.g.doubleclick.net',
                'ad.doubleclick.net',
                '/pagead/',
                '/get_midroll_',
                'doubleclick.net/gampad',
            ];
            for (const pattern of blocked) {
                if (url.includes(pattern)) {
                    // Redirect to a no-op instead of making the request
                    return _originalXHROpen.call(this, method, 'about:blank');
                }
            }
        }
        return _originalXHROpen.apply(this, arguments);
    };

    console.log('[Aether] Proactive data interceptors installed');
})();
