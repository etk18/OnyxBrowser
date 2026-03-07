/**
 * Onyx Intelligence — Groq Gateway (Onyx Lite fallback)
 *
 * Routes API calls through Electron's main process IPC
 * to bypass CORS and provide reliable connectivity.
 *
 * Primary model: llama-3.3-70b-versatile (Groq)
 */

/**
 * Strips markdown code fences from LLM JSON output.
 */
function cleanModelOutput(text) {
    if (!text) return text;
    let cleaned = text.trim();

    // Full response wrapped in fence
    const fullFence = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
    if (fullFence) return fullFence[1].trim();

    // Embedded fence with text around it
    const innerFence = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (innerFence) return innerFence[1].trim();

    return cleaned;
}

export async function askOnyx(messages, jsonMode = false) {
    // Try secure electron-store first, fallback to localStorage
    let apiKey;
    if (window.browserAPI?.getApiKey) {
        apiKey = await window.browserAPI.getApiKey('groq');
    }
    if (!apiKey) {
        apiKey = localStorage.getItem('onyx_groq_key');
    }
    if (!apiKey) throw new Error("Groq API Key is missing. Please add it in Settings.");

    try {
        // Route through main process IPC to bypass CORS
        const result = await window.browserAPI.groqChat(apiKey, messages);

        if (result.error) {
            console.error("Groq Error:", result.error, result.details || '');
            if (jsonMode) {
                return JSON.stringify({ tool: "answer", params: { text: "AI Error: " + result.error } });
            }
            return "Error: " + result.error;
        }

        let content = result.content;

        // Clean markdown fences from LLM output when expecting JSON
        if (jsonMode && content) {
            content = cleanModelOutput(content);
        }

        return content;

    } catch (error) {
        console.error("AI Error:", error);
        return jsonMode
            ? JSON.stringify({ tool: "answer", params: { text: "Connection error: " + error.message } })
            : "I encountered a connection error: " + error.message;
    }
}
