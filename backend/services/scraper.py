"""
OnyxBrowser Backend — Async Web-Scraping Engine

Uses Playwright's async API to fetch pages headlessly,
strip scripts/styles, and return clean text content.
"""

from __future__ import annotations

import logging
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

# Match the 30 000-char ceiling used in the Electron agent (agent.js)
MAX_CONTENT_LENGTH = 30_000


async def extract_page_context(url: str) -> str:
    """
    Launch a headless Chromium instance, navigate to *url*,
    remove all <script> and <style> elements, and return the
    remaining visible text content.

    Returns
    -------
    str
        Cleaned page text (up to MAX_CONTENT_LENGTH characters).

    Raises
    ------
    Exception
        Propagated from Playwright on network / timeout errors.
    """
    logger.info("Scraping page context for: %s", url)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 720},
        )
        page = await context.new_page()

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=15_000)

            # Strip noisy DOM nodes
            clean_text: str = await page.evaluate(
                """
                () => {
                    // Remove scripts, styles, noscript, and SVG blocks
                    const selectors = ['script', 'style', 'noscript', 'svg'];
                    selectors.forEach(tag => {
                        document.querySelectorAll(tag).forEach(el => el.remove());
                    });

                    // Return visible text, collapse whitespace
                    return document.body.innerText
                        .replace(/\\s+/g, ' ')
                        .trim();
                }
                """
            )

            return clean_text[:MAX_CONTENT_LENGTH]

        finally:
            await context.close()
            await browser.close()
