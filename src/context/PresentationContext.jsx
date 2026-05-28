import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const CTX = createContext({ isPresentation: false, enter: () => {}, exit: () => {}, lastUpdateLabel: null })

const MONTH_LONG = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

function fmtThaiLong(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return `${d.getDate()} ${MONTH_LONG[d.getMonth() + 1]} ${d.getFullYear() + 543}`
}

export function PresentationProvider({ children }) {
  const [isPresentation, setIsPresentation] = useState(false)
  const [lastUpdateLabel, setLastUpdateLabel] = useState(null)

  useEffect(() => {
    ;(async () => {
      const { data: b } = await supabase.from('upload_batches').select('created_at')
        .order('created_at', { ascending: false }).limit(1)
      if (b?.[0]?.created_at) { setLastUpdateLabel(fmtThaiLong(b[0].created_at)); return }
      const { data: c } = await supabase.from('complaints').select('created_at')
        .order('created_at', { ascending: false }).limit(1)
      if (c?.[0]?.created_at) { setLastUpdateLabel(fmtThaiLong(c[0].created_at)); return }
      const { data: d } = await supabase.from('drug_incidents').select('created_at')
        .order('created_at', { ascending: false }).limit(1)
      if (d?.[0]?.created_at) setLastUpdateLabel(fmtThaiLong(d[0].created_at))
    })()
  }, [])

  const enter = useCallback(async () => {
    setIsPresentation(true)
    try { await document.documentElement.requestFullscreen() } catch {}
  }, [])

  const exit = useCallback(() => {
    setIsPresentation(false)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }, [])

  // ESC key
  useEffect(() => {
    if (!isPresentation) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setIsPresentation(false)
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isPresentation])

  // Sync when browser exits fullscreen (e.g. user presses ESC natively)
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setIsPresentation(false) }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  return (
    <CTX.Provider value={{ isPresentation, enter, exit, lastUpdateLabel }}>
      {children}
    </CTX.Provider>
  )
}

export const usePresentation = () => useContext(CTX)
