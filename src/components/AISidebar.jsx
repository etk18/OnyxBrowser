import React, { useState, useEffect, useRef } from 'react';
import { processUserCommand, runAgentLoop } from '../services/agent';

/**
 * Onyx Intelligence Sidebar — Autonomous Agent Mode
 *
 * Capabilities:
 * - Quick commands (single-step: scrape, highlight, chat)
 * - Autonomous goals (multi-step ReAct loop)
 * - Real-time step-by-step progress display
 *
 * Props:
 * - isOpen: boolean
 * - onClose: function
 * - currentWebContentsId: number (ID of the active tab's webview)
 */

export default function AISidebar({ isOpen, onClose, currentWebContentsId }) {
    const [messages, setMessages] = useState([
        { role: 'ai', text: "👋 How can I help you browse today?\n\nTry things like:\n• \"Search for latest news\"\n• \"Summarize this page\"\n• \"Find prices on Amazon\"" }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isAutonomous, setIsAutonomous] = useState(false);
    const messagesEndRef = useRef(null);
    const abortRef = useRef(false);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addMessage = (text, role) => {
        setMessages((prev) => [...prev, { role, text }]);
    };

    // ── Autonomous Loop Handler ──
    const handleAutonomousGoal = async (goal) => {
        addMessage(goal, 'user');
        setInput('');
        setLoading(true);
        setIsAutonomous(true);
        abortRef.current = false;

        const updateUI = (type, data) => {
            if (abortRef.current) return;
            switch (type) {
                case 'thought':
                    addMessage(`💭 ${data}`, 'thought');
                    break;
                case 'action':
                    addMessage(data, 'system');
                    break;
                case 'observation':
                    addMessage(data, 'system');
                    break;
                case 'answer':
                    addMessage(data, 'ai');
                    break;
                case 'error':
                    addMessage(`❌ ${data}`, 'system');
                    break;
                case 'system':
                    addMessage(data, 'system');
                    break;
                default:
                    addMessage(data, 'system');
            }
        };

        try {
            await runAgentLoop(goal, currentWebContentsId, updateUI);
        } catch (err) {
            addMessage(`❌ Agent loop error: ${err.message}`, 'system');
        } finally {
            setLoading(false);
            setIsAutonomous(false);
        }
    };

    // ── Single-step Handler (for simple questions) ──
    const handleSingleStep = async (text) => {
        addMessage(text, 'user');
        setInput('');
        setLoading(true);

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
        }
    };

    // ── Route: Autonomous vs Single-Step ──
    const handleSend = (text = input) => {
        if (!text.trim()) return;
        const trimmed = text.trim();
        const lower = trimmed.toLowerCase();

        // Single-step: pure questions about the current page
        const questionPatterns = [
            /^(what|how|why|when|where|who|which|is |are |can |does |do |tell me|explain|describe|summarize|sum up)/i
        ];
        const isSimpleQuestion = questionPatterns.some(p => p.test(trimmed));

        // Autonomous: action words, URLs, or multi-step tasks
        const actionWords = [
            'search', 'go', 'navigate', 'open', 'visit', 'find',
            'look', 'buy', 'order', 'fill', 'sign', 'log',
            'download', 'compare', 'check', 'click', 'type',
            'scroll', 'submit', 'add', 'remove', 'get', 'show'
        ];
        const hasActionWord = actionWords.some(w => lower.includes(w));
        const hasUrl = /https?:\/\/|\.com|\.org|\.net|www\./i.test(trimmed);
        const mentionsSite = /(amazon|google|wikipedia|youtube|ebay|reddit|twitter|github|facebook|instagram)/i.test(trimmed);

        const isGoal = (hasActionWord || hasUrl || mentionsSite) && !isSimpleQuestion;

        if (isGoal) {
            handleAutonomousGoal(trimmed);
        } else {
            handleSingleStep(trimmed);
        }
    };

    const handleStop = () => {
        abortRef.current = true;
        setLoading(false);
        setIsAutonomous(false);
        addMessage('🛑 Agent loop stopped by user.', 'system');
    };

    const handleSummarize = () => handleSingleStep("Summarize this page in 3 key bullet points.");
    const handleFindLinks = () => handleSingleStep("Find all the links on this page.");
    const handleExtractHeadings = () => handleSingleStep("Extract all the headings from this page.");

    if (!isOpen) return null;

    return (
        <div className="ai-sidebar">
            <div className="ai-header">
                <div className="ai-title">
                    <span className="ai-sparkle">⚡</span> Onyx Lite
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
                        <div className="ai-bubble ai-loading">
                            <span className="dot" /> <span className="dot" /> <span className="dot" />
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

            <div className="ai-input-area">
                {isAutonomous ? (
                    <button className="ai-stop-btn" onClick={handleStop}>
                        🛑 Stop Agent
                    </button>
                ) : (
                    <>
                        <textarea
                            className="ai-input"
                            placeholder="How can I help you browse today?"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            disabled={loading}
                            rows={1}
                        />
                        <button className="ai-send-btn" onClick={() => handleSend()} disabled={loading || !input.trim()}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
