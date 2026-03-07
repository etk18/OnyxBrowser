import { motion } from 'framer-motion'

const FEATURES = [
    { icon: '🤖', title: 'Agentic AI Core', desc: 'Give it a goal, and let it think. Onyx autonomously navigates, types, and clicks, adapting to website changes in real-time without rigid scripts.' },
    { icon: '🎤', title: 'Zero-Latency Voice', desc: 'MediaRecorder captures your voice natively. Audio is transcribed server-side by Groq Whisper (whisper-large-v3-turbo) in real time — no typing needed.' },
    { icon: '🧠', title: 'Groq + LangChain Brain', desc: 'FastAPI backend powered by Groq Llama 3.3 70B (primary) with OpenAI GPT-4o-mini fallback. Structured Pydantic output ensures reliable action plans.' },
    { icon: '🛡️', title: 'Built-in Ad Blocker', desc: 'Cliqz-powered ad and tracker blocking out of the box. See the blocked count update in real-time on every page.' },
    { icon: '🔗', title: 'Native Web3 Integration', desc: 'Integrated Ethereum wallet panel with Web3Modal + ethers.js. Connect your wallet and interact with dApps without leaving the browser.' },
    { icon: '🔒', title: 'Security First', desc: 'nodeIntegration off, contextIsolation on, asar-packed source. API keys stored securely in the OS user-data directory — never bundled.' },
]

const cardVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: (i) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
    }),
}

export default function Features() {
    return (
        <section className="container section-pad" id="features">
            <motion.div
                className="section-header"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.6 }}
            >
                <h2 className="section-title">
                    Why <span className="gradient-text">OnyxBrowser</span>?
                </h2>
                <p className="section-sub">
                    A browser built for the AI era — not just another Chrome clone.
                </p>
            </motion.div>

            <div className="features-grid">
                {FEATURES.map((f, i) => (
                    <motion.div
                        key={f.title}
                        className="glass-card feature-card"
                        custom={i}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-60px' }}
                        variants={cardVariants}
                    >
                        <div className="feature-icon">{f.icon}</div>
                        <h3>{f.title}</h3>
                        <p>{f.desc}</p>
                    </motion.div>
                ))}
            </div>
        </section>
    )
}
