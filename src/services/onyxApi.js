/**
 * Onyx Intelligence — FastAPI Backend Client
 *
 * Communicates with the Python backend (localhost:8000)
 * for LangChain-powered agentic actions.
 */

const BACKEND_URL = 'http://localhost:8000';

/**
 * POST /api/agent/execute
 *
 * Sends the user's prompt + current URL to the FastAPI backend,
 * which scrapes the page via Playwright, runs the LangChain brain,
 * and returns a structured BrowserActionPlan.
 *
 * @param {string} prompt  — Natural-language instruction
 * @param {string} currentUrl — URL of the active browser tab
 * @returns {Promise<{thought: string, actions: Array}>}
 */
export async function requestAgentAction(prompt, currentUrl) {
    const res = await fetch(`${BACKEND_URL}/api/agent/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_prompt: prompt,
            current_url: currentUrl,
        }),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Backend error ${res.status}: ${text || res.statusText}`);
    }

    return res.json();
}

/**
 * POST /api/agent/voice
 *
 * Sends recorded audio (WebM blob) to the backend for Whisper transcription.
 *
 * @param {Blob} audioBlob — WebM audio from MediaRecorder
 * @returns {Promise<{transcript: string}>}
 */
export async function sendVoiceAudio(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');

    const res = await fetch(`${BACKEND_URL}/api/agent/voice`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        throw new Error(`Voice endpoint error: ${res.status}`);
    }

    return res.json();
}

/**
 * GET /health — quick connectivity check
 * @returns {Promise<boolean>}
 */
export async function checkBackendHealth() {
    try {
        const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(3000) });
        return res.ok;
    } catch {
        return false;
    }
}
