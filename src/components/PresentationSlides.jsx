import React, { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

const BAR_H = 56  // PresentationBar height in px

export default function PresentationSlides({ children, isPresentation, normalClassName = 'space-y-6' }) {
  const containerRef = useRef(null)
  const slideRefs = useRef([])
  const [current, setCurrent] = useState(0)

  const slides = React.Children.toArray(children)
  const total = slides.length

  // Reset to slide 0 when entering presentation mode
  useEffect(() => {
    if (isPresentation) {
      setCurrent(0)
      if (containerRef.current) containerRef.current.scrollTop = 0
    }
  }, [isPresentation])

  // Track current slide via scroll position
  useEffect(() => {
    if (!isPresentation) return
    const container = containerRef.current
    if (!container) return
    const onScroll = () => {
      const { scrollTop } = container
      let best = 0, bestDist = Infinity
      slideRefs.current.forEach((el, i) => {
        if (!el) return
        const dist = Math.abs(el.offsetTop - scrollTop)
        if (dist < bestDist) { bestDist = dist; best = i }
      })
      setCurrent(best)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [isPresentation])

  const goTo = useCallback((idx) => {
    const clamped = Math.max(0, Math.min(idx, total - 1))
    const el = slideRefs.current[clamped]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [total])

  // Keyboard ↑ ↓ (also PageUp/PageDown)
  useEffect(() => {
    if (!isPresentation) return
    const onKey = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault(); goTo(current + 1)
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault(); goTo(current - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPresentation, current, goTo])

  // ── Normal mode: plain wrapper ──────────────────────────────────────────
  if (!isPresentation) {
    return <div className={normalClassName}>{children}</div>
  }

  // ── Presentation mode: scroll-snap container ────────────────────────────
  const slideH = `calc(100dvh - ${BAR_H}px)`

  return (
    <>
      <div
        ref={containerRef}
        style={{
          height: slideH,
          overflowY: 'scroll',
          scrollSnapType: 'y mandatory',
          background: '#f1f5f9',
          fontFamily: 'Sarabun, sans-serif',
        }}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            ref={el => { slideRefs.current[i] = el }}
            style={{
              scrollSnapAlign: 'start',
              minHeight: slideH,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: 'clamp(16px, 2.5vw, 40px) clamp(16px, 3.5vw, 56px)',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ maxWidth: 1400, margin: '0 auto', width: '100%' }}>
              {slide}
            </div>
          </div>
        ))}
      </div>

      {/* Fixed navigation — bottom-right */}
      <div
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          fontFamily: 'Sarabun, sans-serif',
        }}
      >
        <button
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          title="สไลด์ก่อนหน้า (↑)"
          className="w-10 h-10 bg-white/95 border border-slate-200 rounded-xl shadow-md flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-blue-600 disabled:opacity-25 transition backdrop-blur-sm"
        >
          <ChevronUp size={18} />
        </button>

        <div className="bg-white/95 border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm backdrop-blur-sm text-center min-w-[44px]">
          <span className="text-xs font-bold text-slate-700 tabular-nums">{current + 1}</span>
          <span className="text-[11px] text-slate-400"> / {total}</span>
        </div>

        <button
          onClick={() => goTo(current + 1)}
          disabled={current === total - 1}
          title="สไลด์ถัดไป (↓)"
          className="w-10 h-10 bg-white/95 border border-slate-200 rounded-xl shadow-md flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-blue-600 disabled:opacity-25 transition backdrop-blur-sm"
        >
          <ChevronDown size={18} />
        </button>
      </div>
    </>
  )
}
