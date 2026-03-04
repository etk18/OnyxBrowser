/**
 * Onyx Intelligence — DOM Execution Engine
 *
 * Takes a BrowserActionPlan (from the FastAPI backend) and executes
 * each action sequentially on the active browser tab via the existing
 * Electron IPC bridge (window.browserAPI.performAgentAction).
 *
 * The engine translates the FastAPI schema (action_type, target_selector, value)
 * into the IPC tool format (tool, params) already understood by electron/main.js.
 */

const ACTION_DELAY_MS = 500; // breathing room between actions

/**
 * Wait helper
 * @param {number} ms
 */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Execute a single BrowserAction via the Electron IPC bridge.
 *
 * @param {object}  action           — { action_type, target_selector, value }
 * @param {number}  webContentsId    — ID of the active webview
 * @param {Function} onStatus        — callback(text) for UI updates
 * @returns {Promise<string>}        — result description
 */
async function executeSingleAction(action, webContentsId, onStatus) {
    const { action_type, target_selector, value } = action;
    const bridge = window.browserAPI?.performAgentAction;

    if (!bridge) throw new Error('Browser IPC bridge unavailable.');
    if (!webContentsId) throw new Error('No active tab to execute on.');

    let ipcCommand;

    switch (action_type) {
        // ── Navigate ─────────────────────────────────
        case 'navigate':
            onStatus?.(`🌐 Navigating to ${value || target_selector}…`);
            ipcCommand = {
                tool: 'navigate',
                params: { url: value || target_selector },
            };
            break;

        // ── Click ────────────────────────────────────
        case 'click':
            onStatus?.(`👆 Clicking "${target_selector}"…`);
            ipcCommand = {
                tool: 'click',
                params: { selector: target_selector },
            };
            break;

        // ── Type / Input ─────────────────────────────
        case 'type':
            onStatus?.(`⌨️ Typing "${(value || '').substring(0, 40)}"…`);
            ipcCommand = {
                tool: 'type',
                params: { selector: target_selector || 'search', text: value },
            };
            break;

        // ── Scroll ───────────────────────────────────
        case 'scroll':
            onStatus?.(`📜 Scrolling ${value || 'down'}…`);
            ipcCommand = {
                tool: 'scroll',
                params: { direction: value || 'down' },
            };
            break;

        // ── Extract / Scrape ─────────────────────────
        case 'extract':
            onStatus?.(`🔍 Extracting from "${target_selector}"…`);
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
            return `⚠️ Unknown action type: ${action_type}`;
    }

    // ── Execute via IPC ────────────────────────────
    const result = await bridge(webContentsId, ipcCommand);

    // Normalize the result into a readable string
    if (result?.error) return `❌ ${result.error}`;
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
            results.push(`${label} ✅ ${result}`);

            // Add breathing room between actions so the page can react
            if (i < actions.length - 1) {
                await delay(ACTION_DELAY_MS);
            }
        } catch (err) {
            results.push(`${label} ❌ ${err.message}`);
            hasErrors = true;
            // Continue executing remaining actions (best-effort)
        }
    }

    return { results, hasErrors };
}
