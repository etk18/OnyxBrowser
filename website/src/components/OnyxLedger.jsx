import { motion } from 'framer-motion'

const MILESTONES = [
    {
        icon: '\u{1F6E1}\uFE0F',
        title: 'The Onyx Shield',
        description:
            'A two-tier, high-performance network interception engine built for zero-compromise browsing. ' +
            'The first tier is a native Rust module compiled via NAPI-RS into a 604 KB binary. It holds a ' +
            'HashSet of 50+ known ad/tracker domains and performs O(1) domain lookups, benchmarked at 1.27 million ' +
            'operations per second. URLs are parsed with the url crate, www-prefixes are stripped, and domain hierarchies ' +
            'are walked to catch subdomains. The second tier is the Cliqz deep-filter engine, which downloads and parses ' +
            'EasyList and EasyPrivacy filter lists for granular path-based and cosmetic rule matching. Both tiers run inside ' +
            'a single unified onBeforeRequest handler \u2014 solving Electron\'s one-handler-per-session limitation \u2014 ' +
            'with the Rust fast-path short-circuiting known domains before Cliqz ever fires.',
    },
    {
        icon: '\u{1F517}',
        title: 'Native Web3 Provider',
        description:
            'Full EIP-1193 compliant window.ethereum provider injected into every webview via a dedicated ' +
            'webview-preload.js script using Electron\'s contextBridge.exposeInMainWorld. The provider exposes ' +
            'request(), on(), removeListener(), and legacy enable()/send()/sendAsync() methods for maximum dApp ' +
            'compatibility. When a dApp calls eth_requestAccounts, the main process creates a pending Promise and ' +
            'sends a wallet-connection-request IPC event to the renderer. The renderer surfaces a custom WalletModal ' +
            'with the requesting origin, a Connect/Reject choice, and Onyx Glass styling (dark glass, cyan accents). ' +
            'The user\'s decision flows back through wallet-connection-response IPC to resolve or reject the original ' +
            'Promise \u2014 zero extensions required, MetaMask-compatible flags set for dApp detection.',
    },
    {
        icon: '\u{1F9E9}',
        title: 'Extension Sideloading',
        description:
            'Developer-mode Chrome extension support built on Electron\'s session.loadExtension API. A native ' +
            'dialog.showOpenDialog directory picker lets users browse to any unpacked extension folder. The backend ' +
            'loads it into the default session and returns extension metadata (name, ID, version). The Settings panel ' +
            'renders a live list of all loaded extensions with individual remove buttons. A will-attach-webview security ' +
            'handler validates all webview preload paths against a whitelist before creation, ensuring sideloaded ' +
            'extensions cannot inject unauthorized preload scripts.',
    },
    {
        icon: '\u{1F9E0}',
        title: 'Agentic Memory',
        description:
            'A semantic vector memory system powered by ChromaDB\'s PersistentClient (cosine similarity, local ' +
            'ONNX embeddings). Every page the user visits triggers a silent did-finish-load listener in the frontend ' +
            'that extracts document.title and the first 1,500 characters of body text via executeJavaScript, then POSTs ' +
            'it to a FastAPI /api/memory/ingest endpoint. The endpoint runs ingest_page() as a BackgroundTask \u2014 ' +
            'SHA-256 hashing the URL into a stable document ID and upserting into the browser_history collection with ' +
            'up to 8,000 characters of content. Before every LLM call, the agent runs search_history(user_prompt) to ' +
            'retrieve the top 3 semantically relevant pages and injects them into the prompt as RELEVANT BROWSING HISTORY, ' +
            'giving the AI continuity across sessions and the ability to recall forgotten URLs.',
    },
    {
        icon: '\u{1F3AF}',
        title: 'Spatial DOM Mapping',
        description:
            'A Vimium-inspired spatial element mapper that replaces brittle CSS selectors with deterministic integer IDs. ' +
            'When the agent issues an analyze_ui action, an injectable script scans the viewport for all visible interactive ' +
            'elements (a, button, input, textarea, select, ARIA roles, [onclick]) using getBoundingClientRect and ' +
            'getComputedStyle visibility checks. Each qualifying element receives a data-onyx-id attribute (capped at 100 ' +
            'elements) and is catalogued into a JSON array of {id, tag, text, href}. The LLM receives this map in the prompt ' +
            'and issues click/type commands using target_id integers. The execution engine resolves these via ' +
            'document.querySelector(\'[data-onyx-id="N"]\') for pixel-precise interaction \u2014 no fuzzy text matching, ' +
            'no DOM traversal heuristics, no selector guessing.',
    },
]

const cardVariants = {
    hidden: { opacity: 0, x: -40 },
    visible: (i) => ({
        opacity: 1,
        x: 0,
        transition: { duration: 0.6, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] },
    }),
}

export default function OnyxLedger() {
    return (
        <section className="container section-pad" id="ledger">
            <motion.div
                className="section-header"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
                <h2 className="section-title">
                    The <span className="gradient-text">Onyx Ledger</span>
                </h2>
                <p className="section-sub">
                    Engineering milestones shipping in Public Beta v0.1.0
                </p>
            </motion.div>

            <div className="ledger-timeline">
                {MILESTONES.map((m, i) => (
                    <motion.div
                        key={m.title}
                        className="ledger-entry"
                        custom={i}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-40px' }}
                        variants={cardVariants}
                    >
                        <div className="ledger-rail">
                            <span className="ledger-dot" />
                            {i < MILESTONES.length - 1 && <span className="ledger-line" />}
                        </div>
                        <div className="glass-card ledger-card">
                            <div className="ledger-card-header">
                                <span className="ledger-icon">{m.icon}</span>
                                <h3 className="ledger-card-title">{m.title}</h3>
                                <span className="ledger-tag">v0.1.0</span>
                            </div>
                            <p className="ledger-card-desc">{m.description}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            <motion.p
                className="ledger-sig"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.5 }}
            >
                Architected by Eesh Sagar Singh | MAIT, Delhi.
            </motion.p>
        </section>
    )
}
