/**
 * Aether YouTube Ad-Skipper — MutationObserver (Zero-Polling)
 *
 * Attaches to #movie_player and watches for class/attribute changes.
 * When ad-interrupting or ad-showing is detected:
 *   1. Fast-forward video to end
 *   2. Click skip button
 *   3. Hide banner/overlay ads
 *
 * No setInterval, no polling = no lag, no crashes.
 */

(function AetherAdObserver() {
    'use strict';

    if (window.__aether_observer_active) return;
    window.__aether_observer_active = true;

    const skipAd = () => {
        const player = document.querySelector('#movie_player');
        const video = document.querySelector('video');

        if (!player) return;

        const isAd = player.classList.contains('ad-interrupting') ||
            player.classList.contains('ad-showing');

        if (isAd) {
            // Force-end the ad
            if (video && isFinite(video.duration) && video.duration > 0) {
                video.currentTime = video.duration;
            }

            // Click any available skip button
            const skipSelectors = [
                '.ytp-skip-ad-button',
                '.ytp-ad-skip-button',
                '.ytp-ad-skip-button-modern',
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
        }
    };

    // Hide banner/promo ads on sight
    const hideBannerAds = () => {
        const bannerSelectors = [
            'ytd-banner-promo-renderer',
            'ytd-in-feed-ad-layout-renderer',
            'ytd-promoted-sparkles-web-renderer',
            'ytd-display-ad-renderer',
            'ytd-ad-slot-renderer',
            '#masthead-ad',
            '.ytp-ad-overlay-container',
            'ytd-promoted-sparkles-text-search-renderer',
            'ytd-mealbar-promo-renderer',
        ];
        for (const sel of bannerSelectors) {
            document.querySelectorAll(sel).forEach((el) => {
                el.style.display = 'none';
            });
        }
    };

    // The Observer — reacts to DOM changes, no polling
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' &&
                (mutation.attributeName === 'class' || mutation.attributeName === 'style')) {
                skipAd();
            }
            if (mutation.addedNodes.length) {
                skipAd();
                hideBannerAds();
            }
        }
    });

    // Attach once #movie_player exists (lightweight check, clears itself)
    const init = setInterval(() => {
        const player = document.querySelector('#movie_player');
        if (player) {
            observer.observe(player, {
                attributes: true,
                childList: true,
                subtree: true,
            });
            clearInterval(init);

            // Also observe the page body for banner ads
            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });

            // Initial sweep
            skipAd();
            hideBannerAds();

            console.log('[Aether] Ad-Skipper: MutationObserver attached to player');
        }
    }, 50);

    // Safety: stop trying after 30s if player never appears
    setTimeout(() => clearInterval(init), 30000);
})();
