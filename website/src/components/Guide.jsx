import { motion } from 'framer-motion'

const STEPS = [
    {
        num: 1,
        title: 'Install OnyxBrowser',
        body: 'Download the installer for your platform above. On macOS, drag OnyxBrowser to your Applications folder. On Windows, run the setup wizard.',
    },
    {
        num: 2,
        title: 'Get a Groq API Key (free)',
        body: <>The AI agent and voice transcription run on Groq. Visit <a href="https://console.groq.com" target="_blank" rel="noopener">console.groq.com</a>, create a free account, and copy your API key. OpenAI is supported as a fallback.</>,
    },
    {
        num: 3,
        title: 'Add Your Key to the Backend',
        body: <>Navigate to the <code>backend/</code> folder, copy <code>.env.example</code> to <code>.env</code>, and paste your Groq API key. Start the backend with <code>uvicorn main:app</code> — you're ready to go!</>,
    },
]

const stepAnim = (i) => ({
    initial: { opacity: 0, y: 40 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.6, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] },
})

export default function Guide() {
    return (
        <section className="container section-pad" id="guide">
            <motion.div
                className="section-header"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
            >
                <h2 className="section-title">
                    Setup <span className="gradient-text">Guide</span>
                </h2>
                <p className="section-sub">Get up and running in 3 simple steps.</p>
            </motion.div>

            <div className="steps-grid">
                {STEPS.map((s, i) => (
                    <motion.div
                        key={s.num}
                        className="glass-card step-card"
                        {...stepAnim(i)}
                    >
                        <div className="step-num">{s.num}</div>
                        <h3>{s.title}</h3>
                        <p>{s.body}</p>
                    </motion.div>
                ))}
            </div>

            <motion.div
                className="tip-box"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
            >
                <span className="tip-icon">💡</span>
                <div>
                    <strong>Pro Tip:</strong> Once your backend is running, open the AI sidebar (brain icon in the toolbar) and try:{' '}
                    <em>"Open YouTube and search for lofi music"</em> — watch Onyx navigate autonomously!
                </div>
            </motion.div>
        </section>
    )
}
