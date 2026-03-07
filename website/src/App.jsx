import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Features from './components/Features'
import ReleaseNotes from './components/ReleaseNotes'
import Download from './components/Download'
import Guide from './components/Guide'
import Disclaimer from './components/Disclaimer'
import Footer from './components/Footer'

function getPage() {
  return window.location.hash === '#/releases' ? 'releases' : 'home'
}

export default function App() {
  const [page, setPage] = useState(getPage)

  useEffect(() => {
    const onHash = () => {
      setPage(getPage())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <>
      {/* Animated aurora background */}
      <div className="aurora">
        <div className="aurora-orb aurora-1" />
        <div className="aurora-orb aurora-2" />
        <div className="aurora-orb aurora-3" />
      </div>
      <div className="grid-overlay" />

      {/* Page content */}
      <div className="page-wrap">
        <Navbar page={page} />
        {page === 'releases' ? (
          <>
            <ReleaseNotes />
            <Footer />
          </>
        ) : (
          <>
            <Hero />
            <Features />
            <Download />
            <Guide />
            <Disclaimer />
            <Footer />
          </>
        )}
      </div>
    </>
  )
}
