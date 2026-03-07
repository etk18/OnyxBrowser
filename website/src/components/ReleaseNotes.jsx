import { motion } from 'framer-motion'

const RELEASES = [
    {
        version: 'v0.1.0-beta',
        date: 'March 7, 2026',
        tag: 'Public Beta',
        highlights: [
            'First public release of OnyxBrowser',
        ],
        sections: [
            {
                title: 'Core Browser',
                items: [
                    'Tabbed browsing with favicon extraction, audio indicators, and session restore',
                    'Smart Omnibox with URL detection and multi-engine search (Google, Bing, DuckDuckGo, Brave)',
                    'Full download manager — progress tracking, pause, resume, cancel',
                    'Bookmarks & searchable history with persistent local storage',
                    'Find in Page, HTTPS security indicators, incognito mode',
                    'Right-click context menus (Open in New Tab, Save Image, Copy Link)',
                    'Automatic crash recovery without losing the main window',
                ],
            },
            {
                title: 'Onyx Shield (Ad Blocker)',
                items: [
                    'Dual-layer ad/tracker blocking engine',
                    'Tier 1: Rust NAPI module — HashSet of 50+ domains, O(1) lookups, compiled to native binary via NAPI-RS',
                    'Tier 2: Cliqz deep-filter engine with EasyList + EasyPrivacy filter lists',
                    'Unified onBeforeRequest handler with Rust fast-path short-circuiting',
                    'Live blocked-count badge in the toolbar',
                ],
            },
            {
                title: 'AI Agent (Onyx Intelligence)',
                items: [
                    'Natural language commands — tell the agent what to do in plain English',
                    'Voice commands via Groq Whisper (whisper-large-v3-turbo) transcription',
                    'Spatial DOM Mapping — Vimium-style numbered element overlay for precise interactions',
                    'Semantic vector memory powered by ChromaDB — pages silently embedded on load, recalled during queries',
                    '5-step ReAct reasoning loop with thought → action → observation cycles',
                    'Dual LLM support: Groq (Llama 3.3 70B) or OpenAI (GPT-4o-mini)',
                    'Structured output via LangChain PydanticOutputParser',
                    'Cyan pulse highlights on targeted elements',
                    'Graceful degradation: Intelligence → Lite fallback if backend unreachable',
                ],
            },
            {
                title: 'Web3',
                items: [
                    'Native EIP-1193 window.ethereum provider injected into every webview',
                    'Custom wallet connect modal with origin-aware Connect/Reject flow',
                    'MetaMask-compatible flags for dApp detection — zero extensions required',
                ],
            },
            {
                title: 'Extensions',
                items: [
                    'Chrome extension sideloading via session.loadExtension (MV2/MV3)',
                    'Directory picker to load unpacked extensions from Settings',
                    'Live extension list with individual remove buttons',
                ],
            },
            {
                title: 'Build & CI/CD',
                items: [
                    'macOS Apple Silicon (.dmg) and Windows x64 (.exe) installers',
                    'GitHub Actions pipeline with Rust compilation, artifact upload, and auto-publish to Releases',
                    'Separate website deployment job to GitHub Pages',
                ],
            },
        ],
    },
]

const sectionAnim = (delay) => ({
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-40px' },
    transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
})

export default function ReleaseNotes() {
    return (
        <section className="container section-pad" id="releases">
            <motion.div
                className="section-header"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
            >
                <h2 className="section-title">
                    Release <span className="gradient-text">Notes</span>
                </h2>
                <p className="section-sub">
                    What shipped in each version of OnyxBrowser.
                </p>
            </motion.div>

            {RELEASES.map((release) => (
                <div key={release.version} className="rn-release">
                    <motion.div className="rn-header" {...sectionAnim(0)}>
                        <div className="rn-version-row">
                            <h3 className="rn-version">{release.version}</h3>
                            <span className="rn-tag">{release.tag}</span>
                        </div>
                        <span className="rn-date">{release.date}</span>
                        {release.highlights.map((h, i) => (
                            <p key={i} className="rn-highlight">{h}</p>
                        ))}
                    </motion.div>

                    <div className="rn-sections">
                        {release.sections.map((section, si) => (
                            <motion.div
                                key={section.title}
                                className="glass-card rn-section-card"
                                {...sectionAnim(si * 0.08)}
                            >
                                <h4 className="rn-section-title">{section.title}</h4>
                                <ul className="rn-list">
                                    {section.items.map((item, ii) => (
                                        <li key={ii}>{item}</li>
                                    ))}
                                </ul>
                            </motion.div>
                        ))}
                    </div>
                </div>
            ))}
        </section>
    )
}
