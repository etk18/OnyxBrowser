import { motion } from 'framer-motion'

const RELEASES = [
    {
        version: 'v2.0.0',
        date: 'March 8, 2026',
        tag: 'Stable',
        highlights: [
            'Onyx graduates to v2.0.0 Stable — a fully packaged Agentic Web Engine with an integrated AI Brain.',
        ],
        sections: [
            {
                title: 'Production Packaging',
                items: [
                    'PyInstaller-frozen FastAPI backend shipped as a single "onyx-brain" binary',
                    'Electron spawns the backend process automatically on startup with stdout/stderr logging',
                    'Zombie killer — app.on("will-quit") ensures the Python server never orphans',
                    'electron-builder config: NSIS installer (Windows), DMG + ZIP (macOS), maximum compression, GitHub auto-publish',
                    'extraResources packages the frozen binary into the OS installer\'s protected resources folder',
                    'Programmatic Uvicorn entry point (run.py) with multiprocessing.freeze_support() for PyInstaller compatibility',
                ],
            },
            {
                title: 'AI Brain Integration',
                items: [
                    'API Key Settings Bridge — three-path sync: IPC handler on save, startup sync with retry loop, direct POST endpoint',
                    'Sync uses Node native http module (not electron.net) for maximum reliability across platforms',
                    'Backend environment hot-reloads API keys via os.environ + dotenv set_key() persistence',
                    'Settings UI shows real-time "Backend synced" / "Backend sync failed" status indicators',
                ],
            },
            {
                title: 'Spatial DOM Execution',
                items: [
                    'LLM-powered /click command — describe elements in natural language ("Sign In button") instead of numeric IDs',
                    'Agent matches user intent against the viewport DOM map using Groq (Llama 3.3 70B) or OpenAI (GPT-4o-mini)',
                    'Automatic code fence stripping and JSON parsing with graceful error handling',
                    'Falls back to direct numeric ID passthrough for explicit targeting',
                ],
            },
            {
                title: 'Semantic Memory Dashboard',
                items: [
                    'New onyx://memory internal page with Onyx Glass aesthetic — glass cards, hover glow, distance badges',
                    'ChromaDB endpoints: GET /api/memory/all, POST /api/memory/search (semantic similarity), DELETE /api/memory/{doc_id}',
                    'Accessible from AI Sidebar footer with dedicated Memory button',
                    'Search form with real-time results, responsive grid layout, trash-delete per card',
                ],
            },
            {
                title: 'Stability & Bug Fixes (v2.0)',
                items: [
                    'Fixed React CSS shorthand warning — decomposed border shorthand into borderWidth/borderStyle/borderColor',
                    'Fixed Omnibox double-navigation — moved e.preventDefault() to top of Enter handler before any branching',
                    'Fixed electron.net.fetch startup failures — replaced with Node native http module',
                    'Fixed SyntaxError from duplicate closing brace in click executor block',
                    'Fixed Menu buildFromTemplate crash when running without Vite dev server',
                ],
            },
        ],
    },
    {
        version: 'v0.1.0-beta',
        date: 'March 7, 2026',
        tag: 'Public Beta',
        highlights: [
            'First public release of OnyxBrowser — the Agentic Web Engine.',
        ],
        sections: [
            {
                title: 'Core Browser',
                items: [
                    'Multi-tab browsing with favicon extraction (4-source cascade: Google S2 → DuckDuckGo → Clearbit → letter fallback), audio indicators, and tab management',
                    'Smart Omnibox with URL auto-detection, HTTPS auto-prepend, and multi-engine search (Google, DuckDuckGo, Bing, Perplexity)',
                    'Full download manager — start, pause, resume, cancel with real-time progress tracking',
                    'Persistent bookmarks with duplicate detection and folder support',
                    'Searchable browsing history grouped by date (Today, Yesterday, older) — capped at 500 entries',
                    'Session restore — automatically saves and restores all open tabs across launches',
                    'Find in Page with live match count (X of Y), next/previous navigation',
                    'Page zoom controls — keyboard shortcuts (Cmd+/Cmd-/Cmd+0) and trackpad pinch zoom with auto-hiding level badge',
                    'HTTPS security indicators — lock icon, certificate detail popover (protocol, domain, security status)',
                    'Incognito mode — ephemeral RAM-only session in a separate window',
                    'Rich right-click context menu — Open in New Tab, Save Image, Copy Link, Copy Image, Search with Google, Inspect Element',
                    'Keyboard shortcuts — Cmd+T (new tab), Cmd+W (close), Cmd+R (reload), Cmd+[ ] (back/forward), Cmd+L (focus omnibox), Cmd+F (find)',
                    'OAuth popup handling — target="_blank" and OAuth flows open in child windows sharing the main session',
                    'Custom onyx:// protocol — internal pages for newtab, history, settings, and ledger',
                    'Native macOS application menu with standard Edit, View, and Window menus',
                    'GPU rendering optimization with ignore-gpu-blacklist flag',
                ],
            },
            {
                title: 'Onyx Shield (Ad Blocker)',
                items: [
                    'Dual-layer ad/tracker blocking with live blocked-count badge (capped at 99+)',
                    'Tier 1: Rust NAPI-RS engine — HashSet of 45+ tracker domains with O(1) lookup, domain hierarchy walking, and path-based rules',
                    'Tier 2: Cliqz deep-filter engine — EasyList + EasyPrivacy with cached filter data for fast startup',
                    'Unified onBeforeRequest handler on both persistent and default sessions — Rust fast-path short-circuits before Cliqz fires',
                    'YouTube-specific ad blocking — MutationObserver + polling to detect ad-showing class, fast-forward to end, auto-click 7 skip button selectors, hide 9 banner/promo element types',
                    'YouTube data interceptor — hijacks ytInitialPlayerResponse setter, overrides Response.prototype.json and XMLHttpRequest.prototype.open to strip adPlacements, playerAds, adSlots at the data level',
                    'Bundled uBlock Origin extension loaded from extensions/ublock directory',
                    'Graceful fallback: if Rust module unavailable, falls back to Cliqz-only mode',
                    'User toggle in Settings to enable/disable the shield',
                ],
            },
            {
                title: 'AI Agent (Onyx Intelligence)',
                items: [
                    'Natural language commands — tell the agent what to do in plain English',
                    'Dual-mode agent: "Onyx Intelligence" (backend-powered) for action tasks, "Onyx Lite" (in-process ReAct loop) as offline fallback',
                    'Automatic mode routing — action keywords trigger Intelligence, questions trigger Lite',
                    '9 action types: click, type, keypress, scroll, navigate, extract, summarize, answer, analyze_ui',
                    'Spatial DOM Mapping (Vimium-style) — injects numbered overlay on all visible interactive elements (links, buttons, inputs, ARIA roles), capped at 100 elements, targets by integer ID',
                    'Semantic vector memory — ChromaDB with cosine similarity and ONNX embeddings. Pages silently embedded on load via did-finish-load listener. Top 3 relevant pages recalled and injected into every LLM prompt',
                    'Smart DOM Traversal — 3-strategy cascade: exact CSS selector → attribute match (id, name, aria-label, placeholder, title, alt, data-testid, role) → text content match with Shadow DOM traversal',
                    'Onyx Pulse highlights — cyan glow animation on targeted elements with smooth scroll into view',
                    'Dual LLM support: Groq (Llama 3.3 70B, fast & free) or OpenAI (GPT-4o-mini) — auto-selects based on available keys',
                    'Multi-model fallback chain: llama-3.3-70b-versatile → llama-3.1-8b-instant → gemma2-9b-it on rate limit',
                    'Structured output via LangChain PydanticOutputParser — type-safe BrowserActionPlan with chain-of-thought reasoning',
                    'Lite agent: 5-step ReAct loop with 12K context limit, tool guard (blocks click-before-type on search buttons), 3 consecutive error limit, 1s rate limiting between steps',
                    'Quick action buttons: Summarize, Find Links, Extract Headings',
                    'Backend health check with green/red status dot in sidebar',
                    'Abort/stop agent mid-execution',
                    'Graceful degradation: Intelligence → Lite fallback if backend unreachable',
                ],
            },
            {
                title: 'Voice Commands',
                items: [
                    'MediaRecorder capture (WebM/Opus format) with mic button toggle',
                    'Groq Whisper transcription (whisper-large-v3-turbo) — primary engine',
                    'OpenAI Whisper (whisper-1) — automatic fallback',
                    'Minimum audio size check (>1KB) to avoid empty transcriptions',
                    'Auto-submit transcript to agent pipeline — no typing needed',
                ],
            },
            {
                title: 'Web3 Wallet',
                items: [
                    'Native EIP-1193 window.ethereum provider injected into every webview — zero extensions required',
                    'Full request() method, event emitter (on, removeListener), and legacy support (enable, send, sendAsync)',
                    'MetaMask-compatible flags (isMetaMask: true) for dApp detection',
                    'User approval modal — shows requesting origin with Connect/Reject choice',
                    'Supported RPC methods: eth_requestAccounts, eth_accounts, eth_chainId, net_version, wallet_requestPermissions, wallet_getPermissions',
                    'Web3Modal (WalletConnect) for QR code and mobile wallet connections',
                    'Supported chains: Ethereum Mainnet, Sepolia, Polygon, Goerli, Mumbai, Arbitrum, Optimism, BSC, Avalanche',
                    'ENS reverse lookup (mainnet), balance display, gradient avatar derived from address',
                    'Wallet panel with connected/disconnected states, copy address, view on Etherscan',
                ],
            },
            {
                title: 'Chrome Extensions',
                items: [
                    'Developer-mode extension sideloading via session.loadExtension (MV2/MV3)',
                    'Native directory picker to load unpacked extension folders',
                    'Live extension list in Settings with name, version, and individual remove buttons',
                    'will-attach-webview security handler — validates preload paths against whitelist before creation',
                ],
            },
            {
                title: 'Security',
                items: [
                    'nodeIntegration: false, contextIsolation: true — all IPC through preload bridge',
                    'asar: true — source bundled into encrypted archive',
                    'Permission handler — allowlist for media, notifications, clipboard; all others denied',
                    'Certificate error handling — allows self-signed on localhost only, rejects all others',
                    'Custom CSP headers injected via onHeadersReceived — allows WalletConnect WSS, YouTube, general HTTPS',
                    'API keys stored securely in electron-store (userData directory), never in project root or bundled builds',
                    'Backend bundled as extraResources excluding venv, .env, __pycache__, and database files',
                ],
            },
            {
                title: 'Build & CI/CD',
                items: [
                    'macOS Apple Silicon (.dmg) and Windows x64 (.exe NSIS installer)',
                    'GitHub Actions pipeline: Rust toolchain install, Cargo cache, Onyx Shield compilation per platform',
                    'electron-builder with --publish always — automatic GitHub Release upload on tagged push',
                    'Path-filtered website deployment job to GitHub Pages (triggers only on website/ changes)',
                    'electron-rebuild for native modules (keccak) per architecture',
                ],
            },
            {
                title: 'Home Page & UI',
                items: [
                    'ONYX-branded new tab page with ambient glow background',
                    'Time-based greeting (Good morning/afternoon/evening)',
                    'Quick links: YouTube, GitHub, ChatGPT, Hacker News, Reddit, X',
                    'Onyx Ledger "What\'s New" page at onyx://ledger with timeline layout',
                    'BETA badge in TopBar — pulsing cyan, links to Ledger',
                    'Menu panel with tabs for: Tabs, History, Bookmarks, Downloads, Wallet',
                    'Onyx Glass design system — dark background, glassmorphism cards, cyan accent (#00F2EA)',
                ],
            },
        ],
    },
]

const BUGFIXES = [
    {
        version: 'v2.0.0',
        items: [
            'React CSS shorthand/specific property conflict — MemoryDashboard card and searchWrap used border shorthand alongside borderColor, causing React warnings; decomposed to borderWidth + borderStyle + borderColor',
            'Omnibox double-navigation on Enter — e.preventDefault() was only in slash/NL branches, not the URL else branch; moved to top of handler',
            'electron.net.fetch failing with net::ERR_FAILED during startup sync — replaced with Node native http module for all main-process backend communication',
            'SyntaxError: Missing catch or finally after try — duplicate closing brace in click executor block in main.js',
            'TypeError: Menu.buildFromTemplate undefined — caused by running npx electron . without Vite dev server; documented npm run dev as required startup',
            'API key sync not reaching backend — React renderer fetch to localhost:8000 unreliable from Electron; routed through IPC + Node http instead',
            'Backend process orphaning on quit — added will-quit handler to kill spawned Python process',
        ],
    },
    {
        version: 'v0.1.0-beta',
        items: [
            'Active tab recovery — if activeTabId becomes invalid after a close race condition, auto-resets to first available tab',
            'Webview readiness guard — prevents method calls on uninitialized webview webContents',
            'Loading timer safety — 15-second fallback in case did-stop-loading never fires',
            'Back button fix — cameFromInternal tracking enables correct behavior when navigating from onyx:// pages to web pages',
            'React-compatible input typing — uses native HTMLInputElement.prototype value setter to bypass React controlled component interception',
            'Form submission fix — keypress Enter + form.requestSubmit() fallback for sites that swallow keyboard events',
            'Click target scoring — prevents clicking search/text inputs instead of buttons; uses tag-type priority scoring (Button 50pts > Link 50pts > Role button 40pts > Submit 40pts)',
            'Click-before-type guard — Lite agent blocks clicking search/submit buttons before any type action has occurred',
            'OpenRouter to Groq migration — auto-removes old onyx_openrouter_key from localStorage with user notification',
            'Markdown fence stripping — cleanModelOutput() strips ```json fences from LLM responses before parsing',
            'Post-navigate DOM hydration delay — extra 1-second buffer after navigation for page JavaScript to stabilize',
            'Shadow DOM traversal — Smart DOM engine recursively enters shadowRoot for web component compatibility',
            'Webview history clearing on internal-to-external transition — prevents confusing back button state',
            'Download items Map cleanup — removes completed downloads from tracking Map to prevent memory leaks',
            'Duplicate bookmark prevention — checks URL before adding new bookmark',
            'Crash recovery — auto-reloads renderer on process crash after 1-second delay without losing the main window',
            'Self-signed certificate bypass on localhost for local development',
            'Secure API key storage — migrated from localStorage to electron-store in userData, hardened build exclusions to prevent key leakage',
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
        <section className="container rn-page" id="releases">
            <motion.div
                className="section-header"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
            >
                <a href="#" className="rn-back-link">&larr; Back to Home</a>
                <h2 className="section-title">
                    Release <span className="gradient-text">Notes</span>
                </h2>
                <p className="section-sub">
                    Every feature and fix shipped in Onyx Browser.
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
                                {...sectionAnim(si * 0.06)}
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

                    {/* Bug Fixes */}
                    {BUGFIXES.filter((b) => b.version === release.version).map((bf) => (
                        <motion.div
                            key="bugfixes"
                            className="glass-card rn-section-card rn-bugfix-card"
                            {...sectionAnim(0.1)}
                        >
                            <h4 className="rn-section-title rn-bugfix-title">Bug Fixes & Stability</h4>
                            <ul className="rn-list rn-bugfix-list">
                                {bf.items.map((item, ii) => (
                                    <li key={ii}>{item}</li>
                                ))}
                            </ul>
                        </motion.div>
                    ))}
                </div>
            ))}
        </section>
    )
}
