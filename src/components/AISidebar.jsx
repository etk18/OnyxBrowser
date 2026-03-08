import React, { useState, useEffect, useRef, useCallback } from 'react';
import { processUserCommand, runAgentLoop } from '../services/agent';
import { requestAgentAction, checkBackendHealth } from '../services/onyxApi';
import { executeBrowserActions } from '../utils/executor';
import useVoiceCommand from '../hooks/useVoiceCommand';

/**
 * Onyx Intelligence Sidebar — Dual-Mode Agent
 *
 * Modes:
 * 1. "Onyx Intelligence" — FastAPI backend (LangChain brain + Playwright scraper)
 *    ↳ Used for action-oriented tasks (navigate, click, type, search…)
 *    ↳ Calls /api/agent/execute → BrowserActionPlan → executor.js → IPC
 *
 * 2. "Onyx Lite" — Fallback to the in-process ReAct loop (agent.js)
 *    ↳ Used when backend is unavailable or for simple page questions
 *    ↳ Routes directly through Groq / Llama 3
 *
 * Props:
 * - isOpen: boolean
 * - onClose: function
 * - currentWebContentsId: number (ID of the active tab's webview)
 * - currentUrl: string (URL of the active tab)
 */

export default function AISidebar({ isOpen, onClose, currentWebContentsId, currentUrl, onNavigate }) {
    const [messages, setMessages] = useState([
        { role: 'ai', text: "⚡ **Onyx Intelligence** ready.\n\nI can browse for you autonomously. Try:\n• \"Open Amazon and search for headphones\"\n• \"Summarize this page\"\n• \"Click the Sign In button\"" }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isAutonomous, setIsAutonomous] = useState(false);
    const [agentStatus, setAgentStatus] = useState('');      // futuristic status text
    const [backendOnline, setBackendOnline] = useState(null); // null=unknown, true/false
    const messagesEndRef = useRef(null);
    const abortRef = useRef(false);
    const handleSendRef = useRef(null);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Check backend health on mount
    useEffect(() => {
        if (isOpen) {
            checkBackendHealth().then(setBackendOnline);
        }
    }, [isOpen]);

    const addMessage = (text, role) => {
        setMessages((prev) => [...prev, { role, text }]);
    };

    // ── Voice Command Hook ──
    const onVoiceResult = useCallback((finalTranscript) => {
        if (finalTranscript && handleSendRef.current) {
            handleSendRef.current(finalTranscript);
        }
    }, []);

    const {
        isListening,
        interimText,
        error: voiceError,
        toggleListening,
    } = useVoiceCommand({ onResult: onVoiceResult });

    // ── Backend-Powered Agent (FastAPI + LangChain) ──

    const handleIntelligenceMode = async (goal) => {
        addMessage(goal, 'user');
        setInput('');
        setLoading(true);
        setIsAutonomous(true);
        abortRef.current = false;

        setAgentStatus('🔬 Analyzing DOM context…');

        try {
            // 1. Call FastAPI backend
            setAgentStatus('🧠 Onyx Intelligence is thinking…');
            const tabUrl = currentUrl || 'about:blank';
            const plan = await requestAgentAction(goal, tabUrl);

            if (abortRef.current) return;

            // 2. Show the AI's reasoning
            if (plan.thought) {
                addMessage(`💭 ${plan.thought}`, 'thought');
            }

            // 3. Check for answer-only responses (no DOM actions needed)
            if (plan.actions?.length === 1 &&
                (plan.actions[0].action_type === 'answer' || plan.actions[0].action_type === 'summarize')) {
                addMessage(plan.actions[0].value || 'Done.', 'ai');
                return;
            }

            // 4. Execute actions on the active tab
            setAgentStatus(`⚡ Executing ${plan.actions?.length || 0} action(s)…`);
            addMessage(`⚡ Executing ${plan.actions.length} action(s)…`, 'system');

            const { results, hasErrors } = await executeBrowserActions(
                plan.actions,
                currentWebContentsId,
                (statusText) => { if (!abortRef.current) setAgentStatus(statusText); }
            );

            if (abortRef.current) return;

            // 5. Report results
            results.forEach((r) => addMessage(r, 'system'));

            if (hasErrors) {
                addMessage('⚠️ Some actions encountered errors. The page may have changed.', 'ai');
            } else {
                addMessage('✅ All actions executed successfully.', 'ai');
            }

        } catch (err) {
            console.error('[OnyxIntelligence] Error:', err);
            addMessage(`❌ Backend error: ${err.message}`, 'system');

            // Offer fallback
            addMessage('💡 Falling back to Onyx Lite (in-browser agent)…', 'system');
            try {
                await handleLiteAgentFallback(goal);
            } catch (fallbackErr) {
                addMessage(`❌ Lite fallback also failed: ${fallbackErr.message}`, 'system');
            }
        } finally {
            setLoading(false);
            setIsAutonomous(false);
            setAgentStatus('');
        }
    };

    // ── Lite Agent Fallback (in-process ReAct loop) ──

    const handleLiteAgentFallback = async (goal) => {
        const updateUI = (type, data) => {
            if (abortRef.current) return;
            switch (type) {
                case 'thought': addMessage(`💭 ${data}`, 'thought'); break;
                case 'action': addMessage(data, 'system'); break;
                case 'observation': addMessage(data, 'system'); break;
                case 'answer': addMessage(data, 'ai'); break;
                case 'error': addMessage(`❌ ${data}`, 'system'); break;
                default: addMessage(data, 'system');
            }
        };
        await runAgentLoop(goal, currentWebContentsId, updateUI);
    };

    // ── Single-step questions (page summarization, etc.) ──

    const handleSingleStep = async (text) => {
        addMessage(text, 'user');
        setInput('');
        setLoading(true);
        setAgentStatus('🤔 Processing…');

        try {
            let pageContext = '';
            if (currentWebContentsId && window.browserAPI?.getPageContent) {
                pageContext = await window.browserAPI.getPageContent(currentWebContentsId);
            }

            const command = await processUserCommand(text, pageContext);

            if (command.tool === 'chat' || command.tool === 'answer') {
                addMessage(command.params?.message || command.params?.text || 'Done.', 'ai');
            } else {
                addMessage(`⚡ ${command.tool}(${JSON.stringify(command.params)})`, 'system');

                if (!currentWebContentsId || !window.browserAPI?.performAgentAction) {
                    addMessage('⚠️ No active page. Navigate to a site first.', 'system');
                    return;
                }

                const result = await window.browserAPI.performAgentAction(currentWebContentsId, command);

                if (result?.error) {
                    addMessage(`❌ ${result.error}`, 'system');
                } else if (Array.isArray(result)) {
                    if (result.length === 0) {
                        addMessage('No matching elements found.', 'ai');
                    } else {
                        const preview = result.slice(0, 15);
                        let resultText = `Found **${result.length}** items:\n\n`;
                        resultText += preview.map((item, i) => `${i + 1}. ${item}`).join('\n');
                        if (result.length > 15) resultText += `\n\n...and ${result.length - 15} more.`;
                        addMessage(resultText, 'ai');
                    }
                } else {
                    addMessage(`✅ ${result}`, 'ai');
                }
            }
        } catch (error) {
            addMessage(`Error: ${error.message}`, 'system');
        } finally {
            setLoading(false);
            setAgentStatus('');
        }
    };

    // ── Route: Intelligence (backend) vs Lite (in-process) ──

    const handleSend = (text = input) => {
        if (!text.trim()) return;
        const trimmed = text.trim();

        // Simple questions → Lite single-step
        const questionPatterns = [
            /^(what|how|why|when|where|who|which|is |are |can |does |do |tell me|explain|describe|summarize|sum up)/i,
        ];
        const isSimpleQuestion = questionPatterns.some((p) => p.test(trimmed));

        // Action words → Intelligence mode (FastAPI backend)
        const actionWords = [
            'search', 'go', 'navigate', 'open', 'visit', 'find',
            'look', 'buy', 'order', 'fill', 'sign', 'log',
            'download', 'compare', 'check', 'click', 'type',
            'scroll', 'submit', 'add', 'remove', 'get', 'show',
        ];
        const lower = trimmed.toLowerCase();
        const hasActionWord = actionWords.some((w) => lower.includes(w));
        const hasUrl = /https?:\/\/|\.com|\.org|\.net|www\./i.test(trimmed);
        const mentionsSite = /(amazon|google|wikipedia|youtube|ebay|reddit|twitter|github|facebook|instagram)/i.test(trimmed);

        const isGoal = (hasActionWord || hasUrl || mentionsSite) && !isSimpleQuestion;

        if (isGoal && backendOnline) {
            handleIntelligenceMode(trimmed);
        } else if (isGoal) {
            // Backend offline — use Lite as autonomous fallback
            addMessage(trimmed, 'user');
            setInput('');
            setLoading(true);
            setIsAutonomous(true);
            abortRef.current = false;
            const updateUI = (type, data) => {
                if (abortRef.current) return;
                switch (type) {
                    case 'thought': addMessage(`💭 ${data}`, 'thought'); break;
                    case 'action': addMessage(data, 'system'); break;
                    case 'observation': addMessage(data, 'system'); break;
                    case 'answer': addMessage(data, 'ai'); break;
                    case 'error': addMessage(`❌ ${data}`, 'system'); break;
                    default: addMessage(data, 'system');
                }
            };
            runAgentLoop(trimmed, currentWebContentsId, updateUI)
                .catch((err) => addMessage(`❌ ${err.message}`, 'system'))
                .finally(() => { setLoading(false); setIsAutonomous(false); });
        } else {
            handleSingleStep(trimmed);
        }
    };

    // Keep ref in sync so voice callback can call latest handleSend
    handleSendRef.current = handleSend;

    const handleStop = () => {
        abortRef.current = true;
        setLoading(false);
        setIsAutonomous(false);
        setAgentStatus('');
        addMessage('🛑 Agent stopped by user.', 'system');
    };

    const handleSummarize = () => handleSingleStep("Summarize this page in 3 key bullet points.");
    const handleFindLinks = () => handleSingleStep("Find all the links on this page.");
    const handleExtractHeadings = () => handleSingleStep("Extract all the headings from this page.");

    if (!isOpen) return null;

    return (
        <div className="ai-sidebar">
            <div className="ai-header">
                <div className="ai-title">
                    <span className="ai-sparkle">⚡</span>
                    {' '}Onyx Intelligence
                    {backendOnline === true && <span className="ai-status-dot ai-dot-online" title="Backend connected" />}
                    {backendOnline === false && <span className="ai-status-dot ai-dot-offline" title="Backend offline — Lite mode" />}
                    {isAutonomous && <span className="ai-autonomous-badge">WORKING</span>}
                </div>
                <button className="ai-close-btn" onClick={onClose}>×</button>
            </div>

            <div className="ai-messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`ai-message ${msg.role === 'user' ? 'ai-user' :
                        msg.role === 'system' ? 'ai-system' :
                            msg.role === 'thought' ? 'ai-thought' :
                                'ai-bot'
                        }`}>
                        <div className="ai-bubble">
                            {msg.text}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="ai-message ai-bot">
                        <div className="ai-bubble ai-loading-intelligence">
                            <div className="ai-pulse-ring" />
                            <span className="ai-status-text">{agentStatus || 'Processing…'}</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="ai-actions">
                {messages.length === 1 && (
                    <div className="ai-quick-actions">
                        <button className="ai-quick-btn" onClick={handleSummarize} disabled={loading}>
                            📄 Summarize
                        </button>
                        <button className="ai-quick-btn" onClick={handleFindLinks} disabled={loading}>
                            🔗 Find Links
                        </button>
                        <button className="ai-quick-btn" onClick={handleExtractHeadings} disabled={loading}>
                            📑 Headings
                        </button>
                    </div>
                )}
            </div>

            {/* Voice error banner */}
            {voiceError && (
                <div className="ai-voice-error">
                    🎤 {voiceError}
                </div>
            )}

            <div className="ai-input-area">
                {isAutonomous ? (
                    <button className="ai-stop-btn" onClick={handleStop}>
                        🛑 Stop Agent
                    </button>
                ) : (
                    <>
                        <textarea
                            className="ai-input"
                            placeholder={isListening ? (interimText || '🎤 Listening…') : 'Tell Onyx what to do…'}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            disabled={loading || isListening}
                            rows={1}
                        />
                        <button
                            className={`ai-mic-btn ${isListening ? 'ai-mic-active' : ''}`}
                            onClick={toggleListening}
                            disabled={loading}
                            title={isListening ? 'Stop listening' : 'Voice command'}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <rect x="9" y="1" width="6" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
                                <path d="M5 10C5 13.866 8.134 17 12 17C15.866 17 19 13.866 19 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M12 17V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M8 21H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                        </button>
                        <button className="ai-send-btn" onClick={() => handleSend()} disabled={loading || !input.trim()}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </>
                )}
            </div>

            <div className="ai-sidebar-footer">
                <button className="ai-memory-btn" onClick={() => { if (onNavigate) onNavigate('onyx://memory'); onClose(); }} title="Open Memory Dashboard">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                    </svg>
                    Memory
                </button>
                <span className="ai-sidebar-version-text">v0.1.0-beta</span>
            </div>
        </div>
    );
}
