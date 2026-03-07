import { motion } from 'framer-motion'

const cardAnim = (delay) => ({
    initial: { opacity: 0, y: 40 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
})

export default function Download() {
    return (
        <section className="container section-pad" id="download">
            <motion.div
                className="section-header"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
            >
                <h2 className="section-title">
                    Download <span className="gradient-text">OnyxBrowser</span>
                </h2>
                <p className="section-sub">
                    Free to use. Source code on GitHub. Available for macOS and Windows.
                </p>
            </motion.div>

            <div className="download-grid">
                {/* macOS */}
                <motion.div className="glass-card download-card" {...cardAnim(0)}>
                    <div className="dl-platform-icon">
                        <AppleIcon />
                    </div>
                    <h3>macOS</h3>
                    <p className="dl-arch">Apple Silicon (arm64)</p>
                    <a href="https://github.com/etk18/OnyxBrowser/releases/download/v0.1.0-beta/OnyxBrowser-Mac-arm64.dmg" className="btn btn-primary dl-btn">
                        <DownloadIcon /> Download .dmg
                    </a>
                    <span className="dl-size">~123 MB</span>
                </motion.div>

                {/* Windows */}
                <motion.div className="glass-card download-card" {...cardAnim(0.12)}>
                    <div className="dl-platform-icon">
                        <WindowsIcon />
                    </div>
                    <h3>Windows</h3>
                    <p className="dl-arch">x64 (64-bit)</p>
                    <a href="https://github.com/etk18/OnyxBrowser/releases/download/v0.1.0-beta/OnyxBrowser-Setup-0.1.0-beta.exe" className="btn btn-primary dl-btn">
                        <DownloadIcon /> Download .exe
                    </a>
                    <span className="dl-size">~140 MB</span>
                </motion.div>
            </div>
        </section>
    )
}

function DownloadIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function AppleIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83" />
            <path d="M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
    )
}

function WindowsIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
            <path d="M3 12l8.5-1.2V3.3L3 5.2V12zm0 0l8.5 1.2v7.5L3 18.8V12zm9.5-1.4L21 9.2V3l-8.5 1.5v6.9zm0 2.8L21 14.8V21l-8.5-1.5v-6.1z" />
        </svg>
    )
}
