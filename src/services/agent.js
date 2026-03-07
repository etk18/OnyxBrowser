/**
 * Onyx Lite Agent — Lightweight ReAct Loop
 *
 * Optimized for free API tiers:
 * - MAX_STEPS = 5 (basic tasks only)
 * - 12k char context (≈3k tokens — safe zone for free models)
 * - Minimal system prompt to reduce token consumption
 *
 * Tools: navigate, click, type, scroll, scrape, answer
 * Exit: Only "answer" breaks the loop.
 */

import { askOnyx } from './ai';

const MAX_STEPS = 5;
const PAGE_CONTEXT_LIMIT = 12000;

const SYSTEM_PROMPT = `You are Onyx Lite. You help users navigate the web. Perform simple actions: clicking links, typing searches, or summarizing visible text. Keep responses short and JSON-only.

OUTPUT ONLY a JSON object. No text before or after.
{"thought":"brief reasoning","tool":"tool_name","params":{}}

TOOLS:
- navigate: {"tool":"navigate","params":{"url":"https://..."}} — Use to go to ANY website. Works from blank/new tab pages.
- type: {"tool":"type","params":{"selector":"search","text":"query"}} — Types text into an input field. Does NOT auto-submit.
- keypress: {"tool":"keypress","params":{"key":"Enter"}} — Simulates pressing a key. Use IMMEDIATELY after type to submit a form.
- click: {"tool":"click","params":{"selector":"visible button text"}}
- scroll: {"tool":"scroll","params":{"direction":"down"}}
- scrape: {"tool":"scrape","params":{"selector":"h1"}}
- answer: {"tool":"answer","params":{"text":"final answer"}} — Use ONLY when done.

CRITICAL RULES:
1. ALWAYS use "navigate" to go to a website. NEVER try to type a URL into the address bar.
2. After using "type", you MUST use "keypress" with key "Enter" to submit. NEVER skip this step.
3. Do NOT click Search/Submit buttons after typing — use keypress Enter instead.
4. If the goal is just to navigate (e.g. "open amazon"), use navigate then answer "Done".
5. If extracting info, INTERACT with the page first.
6. Read the PAGE TEXT to find information — you often don't need to scrape.
7. Keep thoughts to one short sentence.
8. For search engines (Google, Bing, etc.), use selector [name="q"] for the type action.`;


/**
 * Single-step command processing (for quick questions only)
 */
export async function processUserCommand(userPrompt, pageContext = "") {
    const truncated = (pageContext || '').substring(0, PAGE_CONTEXT_LIMIT).replace(/\s+/g, ' ');

    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `PAGE CONTENT:\n"${truncated}"\n\nUSER REQUEST: ${userPrompt}` }
    ];

    const result = await askOnyx(messages, true);

    try {
        return JSON.parse(result);
    } catch (e) {
        console.error("Agent Parse Error:", e, "Raw:", result);
        return { tool: "chat", params: { message: "I couldn't parse the AI response. Please try again." } };
    }
}

/**
 * Autonomous ReAct Loop — Lite edition (5 steps max)
 */
export async function runAgentLoop(userGoal, webContentsId, updateUI) {
    const history = [];
    let step = 0;
    let errors = 0;
    let hasTyped = false;

    updateUI('system', `🧠 Goal: "${userGoal}"`);

    while (step < MAX_STEPS) {
        step++;
        updateUI('system', `📍 Step ${step}/${MAX_STEPS}`);

        try {
            // ── 1. Get page content (truncated for token safety) ──
            let pageText = '';
            try {
                if (webContentsId && window.browserAPI?.performAgentAction) {
                    const html = await window.browserAPI.performAgentAction(webContentsId, { tool: 'get-html', params: {} });
                    if (typeof html === 'string') pageText = html;
                }
                if (!pageText && webContentsId && window.browserAPI?.getPageContent) {
                    pageText = await window.browserAPI.getPageContent(webContentsId);
                }
            } catch (e) {
                pageText = '[Could not read page]';
            }

            const truncated = (pageText || '[Empty page]').substring(0, PAGE_CONTEXT_LIMIT);

            // ── 2. Build message (minimal context to save tokens) ──
            const userMsg = `PAGE TEXT:\n"${truncated}"\n\nGOAL: "${userGoal}"\nSTEP: ${step}/${MAX_STEPS}${step === MAX_STEPS ? '\nLAST STEP — answer now with whatever you have.' : ''}`;

            const messages = [
                { role: "system", content: SYSTEM_PROMPT },
                ...history,
                { role: "user", content: userMsg }
            ];

            // ── 3. Ask AI ──
            const raw = await askOnyx(messages, true);
            let cmd;
            try {
                cmd = JSON.parse(raw);
            } catch (e) {
                errors++;
                history.push(
                    { role: "assistant", content: raw },
                    { role: "user", content: 'Invalid JSON. Reply with ONLY: {"thought":"...","tool":"...","params":{}}' }
                );
                if (errors >= 3) break;
                continue;
            }

            history.push({ role: "assistant", content: JSON.stringify(cmd) });
            errors = 0;

            // ── 4. Show thought (minimal) ──
            if (cmd.thought) updateUI('thought', cmd.thought);

            // ── 5. Guard: block click-before-type on search buttons ──
            if (cmd.tool === 'click' && !hasTyped) {
                const target = (cmd.params?.selector || '').toLowerCase();
                if (['search', 'go', 'submit', 'find'].some(b => target.includes(b))) {
                    history.push({ role: "user", content: "BLOCKED: Use keypress Enter to submit instead of clicking search buttons." });
                    continue;
                }
            }
            if (cmd.tool === 'type') hasTyped = true;
            if (cmd.tool === 'navigate') hasTyped = false;

            // ── 6. Handle answer ──
            if (cmd.tool === 'answer' || cmd.tool === 'chat') {
                const text = cmd.params?.text || cmd.params?.message || 'Done.';
                updateUI('answer', text);
                return text;
            }

            // ── 7. Handle navigate without webContentsId (New Tab page) ──
            if (cmd.tool === 'navigate' && (!webContentsId || !window.browserAPI?.performAgentAction)) {
                const url = cmd.params?.url || '';
                updateUI('action', `⚡ navigate(${url})`);
                window.dispatchEvent(new CustomEvent('onyx-agent-navigate', { detail: { url } }));
                // Wait for page to load
                await new Promise(r => setTimeout(r, 3000));
                history.push({ role: "user", content: `OBSERVATION: Navigated to ${url}. Page is loading.` });
                continue;
            }

            // ── 8. Execute tool ──
            if (!cmd.tool) {
                history.push({ role: "user", content: "ERROR: You returned an empty response or invalid JSON. Please try again with a valid tool." });
                errors++;
                continue;
            }

            updateUI('action', `⚡ ${cmd.tool}(${JSON.stringify(cmd.params || {})})`);

            if (!webContentsId || !window.browserAPI?.performAgentAction) {
                history.push({ role: "user", content: "OBSERVATION: No active page." });
                errors++;
                continue;
            }

            const result = await window.browserAPI.performAgentAction(webContentsId, cmd);

            // ── 8. Process result ──
            let obs = '';
            if (result?.error) {
                obs = `ERROR: ${result.error}`;
                errors++;
                updateUI('observation', `❌ ${obs}`);
            } else if (Array.isArray(result)) {
                obs = `Found ${result.length} items: ${result.slice(0, 5).join(' | ')}`;
                updateUI('observation', `✅ ${result.length} items found`);
            } else if (typeof result === 'string') {
                obs = result;
                updateUI('observation', `✅ ${result.substring(0, 80)}`);
            } else {
                obs = JSON.stringify(result);
                updateUI('observation', `✅ Done`);
            }

            if (cmd.tool === 'navigate') {
                obs += '\nPage loaded. Now interact — type, click, or read. Do NOT answer yet.';
            }

            history.push({ role: "user", content: `OBSERVATION: ${obs}` });

            if (errors >= 3) {
                updateUI('answer', "Multiple errors. Please try a simpler request.");
                return "Multiple errors. Stopping.";
            }

            // Rate limit breathing room
            await new Promise(r => setTimeout(r, 1000));

        } catch (err) {
            errors++;
            history.push({ role: "user", content: `ERROR: ${err.message}` });
            if (errors >= 3) {
                updateUI('answer', "Something went wrong. Please try again.");
                return "Agent stopped due to errors.";
            }
        }
    }

    updateUI('answer', `Completed ${MAX_STEPS} steps for: "${userGoal}".`);
    return `Reached step limit.`;
}
