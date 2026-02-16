/**
 * YouTube Ad-Killer — Injected into YouTube webviews.
 * Runs every 500ms. Detects video ads and skips them instantly.
 *
 * Strategy:
 * 1. Detect: Check for `.ad-showing` class on the player
 * 2. Skip: Set video.currentTime = video.duration to force-end the ad
 * 3. Click: Hit skip button or overlay close button
 * 4. Mute during ads, restore after
 */

(function AetherYouTubeAdKiller() {
    'use strict';

    if (window.__aether_yt_adkiller_active) return;
    window.__aether_yt_adkiller_active = true;

    let wasMutedByUs = false;
    let originalVolume = 1;

    function killAd() {
        const player = document.querySelector('.html5-video-player');
        if (!player) return;

        const isAdPlaying = player.classList.contains('ad-showing');
        const video = player.querySelector('video');

        if (isAdPlaying && video) {
            // ── Mute the ad ──
            if (!wasMutedByUs) {
                originalVolume = video.volume;
                video.muted = true;
                wasMutedByUs = true;
            }

            // ── Fast-forward: skip to end ──
            if (video.duration && isFinite(video.duration)) {
                video.currentTime = video.duration;
            }

            // ── Click skip button (multiple selectors for resilience) ──
            const skipSelectors = [
                '.ytp-skip-ad-button',
                '.ytp-ad-skip-button',
                '.ytp-ad-skip-button-modern',
                'button.ytp-ad-skip-button',
                '.ytp-ad-overlay-close-button',
                '.ytp-ad-skip-button-slot button',
            ];

            for (const sel of skipSelectors) {
                const btn = document.querySelector(sel);
                if (btn) {
                    btn.click();
                    break;
                }
            }

            // ── Also close overlay ads ──
            const overlayClose = document.querySelector('.ytp-ad-overlay-close-button');
            if (overlayClose) overlayClose.click();

        } else if (wasMutedByUs && video) {
            // ── Restore audio after ad ends ──
            video.muted = false;
            video.volume = originalVolume;
            wasMutedByUs = false;
        }
    }

    // ── Run every 500ms ──
    setInterval(killAd, 500);

    // ── Also use MutationObserver for instant detection ──
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'attributes' && m.attributeName === 'class') {
                const el = m.target;
                if (el.classList && el.classList.contains('ad-showing')) {
                    killAd();
                }
            }
        }
    });

    // Start observing once the player loads
    function startObserver() {
        const player = document.querySelector('.html5-video-player');
        if (player) {
            observer.observe(player, { attributes: true, attributeFilter: ['class'] });
        } else {
            setTimeout(startObserver, 1000);
        }
    }

    startObserver();

    console.log('[Aether] YouTube Ad-Killer active');
})();
