import { motion } from 'framer-motion'

const STEPS = [
    {
        num: 1,
        title: 'Install OnyxBrowser',
        body: 'Download the installer for your platform above. On macOS, drag OnyxBrowser to your Applications folder. On Windows, run the setup wizard.',
    },
    {
        num: 2,
        title: 'Get an OpenRouter API Key',
        body: <>The AI agent requires an API key to function. Visit <a href="https://openrouter.ai" target="_blank" rel="noopener">openrouter.ai</a>, create a free account, and copy your API key.</>,
    },
    {
        num: 3,
        title: 'Paste Key in Settings',
        body: <>Open OnyxBrowser → click <strong>⚙️ Settings</strong> in the top menu → paste your OpenRouter API Key → click <strong>Save</strong>. You're ready to go!</>,
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
                    <strong>Pro Tip:</strong> Once your key is saved, open the AI sidebar (⚡ icon) and try:{' '}
                    <em>"Open YouTube and search for lofi music"</em> — watch Onyx navigate autonomously!
                </div>
            </motion.div>
        </section>
    )
}
