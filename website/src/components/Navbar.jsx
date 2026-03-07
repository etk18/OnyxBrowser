import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 50)
        window.addEventListener('scroll', onScroll)
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    return (
        <motion.nav
            className={`nav${scrolled ? ' scrolled' : ''}`}
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
            <div className="container nav-inner">
                <a href="#" className="nav-brand">
                    <img src="/icon.ico" alt="Onyx" />
                    <span>OnyxBrowser</span>
                    <span className="nav-beta-badge">BETA</span>
                </a>
                <div className="nav-links">
                    <a href="#features">Features</a>
                    <a href="#releases">Releases</a>
                    <a href="#download">Download</a>
                    <a href="#guide">Setup</a>
                    <a href="https://github.com/etk18/OnyxBrowser" target="_blank" rel="noopener">GitHub</a>
                </div>
            </div>
        </motion.nav>
    )
}
