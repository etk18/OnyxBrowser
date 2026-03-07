/**
 * Onyx Intelligence — DOM Execution Engine
 *
 * Takes a BrowserActionPlan (from the FastAPI backend) and executes
 * each action sequentially on the active browser tab via the existing
 * Electron IPC bridge (window.browserAPI.performAgentAction).
 *
 * Supports two targeting modes:
 *   1. Spatial DOM Map (preferred) — `target_id` integer from analyze_ui
 *   2. Legacy text match — `target_selector` string (CSS or visible text)
 */

import { DOM_MAPPER_SCRIPT } from './domMapper.js';

const ACTION_DELAY_MS = 600;     // breathing room between DOM interactions
const POST_NAVIGATE_MS = 3000;   // wait after navigation for page to settle
const POST_TYPE_MS = 400;        // let input frameworks react before keypress

/**
 * Wait helper
 * @param {number} ms
 */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Execute a single BrowserAction via the Electron IPC bridge.
 *
 * @param {object}  action           — { action_type, target_selector, target_id, value }
 * @param {number}  webContentsId    — ID of the active webview
 * @param {Function} onStatus        — callback(text) for UI updates
 * @returns {Promise<string>}        — result description
 */
async function executeSingleAction(action, webContentsId, onStatus) {
    const { action_type, target_selector, target_id, value } = action;
    const bridge = window.browserAPI?.performAgentAction;

    if (!bridge) throw new Error('Browser IPC bridge unavailable.');

    // Navigate does NOT require an active webContentsId — the main process
    // sends an IPC to the renderer which triggers React's handleNavigate,
    // properly transitioning from New Tab (internal page) to a real URL.
    if (action_type === 'navigate') {
        const url = value || target_selector;
        onStatus?.(`Navigating to ${url}…`);

        // If we have a webContentsId, use the IPC bridge as normal
        if (webContentsId) {
            const result = await bridge(webContentsId, {
                tool: 'navigate',
                params: { url },
            });
            if (result?.error) return `${result.error}`;
            if (typeof result === 'string') return result;
            return JSON.stringify(result);
        }

        // No webContentsId (New Tab page) — trigger navigation via
        // the custom DOM event which App.jsx listens for
        window.dispatchEvent(new CustomEvent('onyx-agent-navigate', { detail: { url } }));
        // Wait for the page to load — the webview needs time to mount and navigate
        await delay(POST_NAVIGATE_MS);
        return `Navigating to ${url}…`;
    }

    if (!webContentsId) throw new Error('No active tab to execute on.');

    // ── Analyze UI: inject DOM mapper and return the spatial map ──
    if (action_type === 'analyze_ui') {
        onStatus?.('Mapping interactive elements…');
        const result = await bridge(webContentsId, {
            tool: 'analyze_ui',
            params: {},
        });
        if (result?.error) return `${result.error}`;
        if (typeof result === 'string') return result;
        return JSON.stringify(result);
    }

    // Build the selector: prefer data-onyx-id when target_id is set
    const selectorForIpc = target_id != null
        ? `[data-onyx-id="${target_id}"]`
        : (target_selector || '');

    let ipcCommand;

    switch (action_type) {
        // ── Click ────────────────────────────────────
        case 'click':
            onStatus?.(`Clicking ${target_id != null ? `element #${target_id}` : `"${target_selector}"`}…`);
            ipcCommand = {
                tool: 'click',
                params: target_id != null
                    ? { onyxId: target_id }
                    : { selector: target_selector },
            };
            break;

        // ── Type / Input ─────────────────────────────
        case 'type':
            onStatus?.(`Typing "${(value || '').substring(0, 40)}"…`);
            ipcCommand = {
                tool: 'type',
                params: target_id != null
                    ? { onyxId: target_id, text: value }
                    : { selector: target_selector || 'search', text: value },
            };
            break;

        // ── Keypress ──────────────────────────────────
        case 'keypress':
            onStatus?.(`Pressing ${value || 'Enter'}…`);
            ipcCommand = {
                tool: 'keypress',
                params: { value: value || 'Enter' },
            };
            break;

        // ── Scroll ───────────────────────────────────
        case 'scroll':
            onStatus?.(`Scrolling ${value || 'down'}…`);
            ipcCommand = {
                tool: 'scroll',
                params: { direction: value || 'down' },
            };
            break;

        // ── Extract / Scrape ─────────────────────────
        case 'extract':
            onStatus?.(`Extracting from "${target_selector}"…`);
            ipcCommand = {
                tool: 'scrape',
                params: { selector: target_selector || 'body' },
            };
            break;

        // ── Summarize / Answer (text-only, no DOM) ───
        case 'summarize':
        case 'answer':
            return value || 'No content returned.';

        default:
            return `Unknown action type: ${action_type}`;
    }

    // ── Execute via IPC ────────────────────────────
    const result = await bridge(webContentsId, ipcCommand);

    // Normalize the result into a readable string
    if (result?.error) return `${result.error}`;
    if (Array.isArray(result)) {
        return result.length > 0
            ? `Found ${result.length} items: ${result.slice(0, 5).join(' | ')}`
            : 'No matching elements found.';
    }
    if (typeof result === 'string') return result;
    return JSON.stringify(result);
}

/**
 * Execute a full BrowserActionPlan sequentially.
 *
 * @param {Array}    actions        — Array of BrowserAction objects
 * @param {number}   webContentsId  — Active webview's webContentsId
 * @param {Function} onStatus       — callback(text) for live UI updates
 * @returns {Promise<{results: string[], hasErrors: boolean}>}
 */
export async function executeBrowserActions(actions, webContentsId, onStatus) {
    if (!actions || actions.length === 0) {
        return { results: ['No actions to execute.'], hasErrors: false };
    }

    const results = [];
    let hasErrors = false;

    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const label = `[${i + 1}/${actions.length}]`;

        try {
            onStatus?.(`${label} Executing ${action.action_type}…`);

            const result = await executeSingleAction(action, webContentsId, onStatus);
            results.push(`${label} ${result}`);

            // Action-aware delays: navigate needs more time than a keypress
            if (i < actions.length - 1) {
                const nextAction = actions[i + 1]?.action_type;
                if (action.action_type === 'navigate') {
                    // Navigation already waited in executeSingleAction for
                    // did-finish-load (IPC path) or POST_NAVIGATE_MS (custom event path).
                    // Add a small extra buffer for DOM hydration.
                    await delay(1000);
                } else if (action.action_type === 'type' && nextAction === 'keypress') {
                    // Short pause to let the input framework (React, Angular, etc.)
                    // process the value before we fire Enter
                    await delay(POST_TYPE_MS);
                } else {
                    await delay(ACTION_DELAY_MS);
                }
            }
        } catch (err) {
            results.push(`${label} ${err.message}`);
            hasErrors = true;
            // Continue executing remaining actions (best-effort)
        }
    }

    return { results, hasErrors };
}
