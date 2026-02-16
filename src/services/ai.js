/**
 * Onyx Intelligence — OpenRouter Gateway (Gemma 3 27B)
 *
 * Routes API calls through Electron's main process IPC
 * to bypass CORS and provide reliable connectivity.
 *
 * Model: google/gemma-3-27b-it:free
 * Context: 131k tokens | Output: 8,192 tokens
 */

/**
 * Strips markdown code fences from Gemma's JSON output.
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
    const apiKey = localStorage.getItem('onyx_openrouter_key');
    if (!apiKey) throw new Error("OpenRouter API Key is missing. Please add it in Settings.");

    try {
        // Route through main process IPC to bypass CORS
        const result = await window.browserAPI.openrouterChat(apiKey, messages);

        if (result.error) {
            console.error("OpenRouter Error:", result.error, result.details || '');
            if (jsonMode) {
                return JSON.stringify({ tool: "answer", params: { text: "AI Error: " + result.error } });
            }
            return "Error: " + result.error;
        }

        let content = result.content;

        // Clean markdown fences from Gemma output when expecting JSON
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
