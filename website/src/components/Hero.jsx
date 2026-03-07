import { useRef, useEffect } from 'react'
import { motion } from 'framer-motion'

const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
})

export default function Hero() {
    const stageRef = useRef(null)

    useEffect(() => {
        const handleMouse = (e) => {
            if (!stageRef.current) return
            const cx = window.innerWidth / 2
            const cy = window.innerHeight / 2
            const dx = (e.clientX - cx) / cx
            const dy = (e.clientY - cy) / cy
            stageRef.current.style.transform =
                `rotateY(${dx * 18}deg) rotateX(${-dy * 12}deg)`
        }
        window.addEventListener('mousemove', handleMouse)
        return () => window.removeEventListener('mousemove', handleMouse)
    }, [])

    return (
        <section className="container hero" id="hero">
            <div className="hero-content">
                <motion.div className="hero-badge" {...fadeUp(0)}>
                    ⚡ Public Beta v0.1.0
                </motion.div>
                <motion.h1 className="hero-title" {...fadeUp(0.1)}>
                    The Agentic{' '}
                    <span className="gradient-text">Web Engine</span>
                </motion.h1>
                <motion.p className="hero-sub" {...fadeUp(0.2)}>
                    Onyx doesn't just automate pre-programmed tasks; it understands your intent.
                    Powered by Llama 3 and LangChain, the Onyx Intelligence engine dynamically reads
                    the DOM, reasons through complex workflows, and executes contextual actions on the fly.
                </motion.p>
                <motion.div className="hero-buttons" {...fadeUp(0.3)}>
                    <a href="#download" className="btn btn-primary">
                        <DownloadIcon /> Download Beta v0.1.0
                    </a>
                    <a
                        href="https://github.com/etk18/OnyxBrowser"
                        target="_blank"
                        rel="noopener"
                        className="btn btn-ghost"
                    >
                        <GitHubIcon /> View Source
                    </a>
                </motion.div>
            </div>

            <motion.div
                className="logo-stage"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
                <div className="logo-container" ref={stageRef}>
                    <div className="logo-glow" />
                    <img src="/icon.ico" alt="OnyxBrowser" className="logo-img" />
                </div>
                <div className="orbit-ring ring-1"><span className="ring-dot" /></div>
                <div className="orbit-ring ring-2"><span className="ring-dot" /></div>
                <div className="orbit-ring ring-3"><span className="ring-dot" /></div>
            </motion.div>
        </section>
    )
}

function DownloadIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function GitHubIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
    )
}
