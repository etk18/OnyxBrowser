import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Features from './components/Features'
import ReleaseNotes from './components/ReleaseNotes'
import Download from './components/Download'
import Guide from './components/Guide'
import Disclaimer from './components/Disclaimer'
import Footer from './components/Footer'

export default function App() {
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
        <Navbar />
        <Hero />
        <Features />
        <ReleaseNotes />
        <Download />
        <Guide />
        <Disclaimer />
        <Footer />
      </div>
    </>
  )
}
