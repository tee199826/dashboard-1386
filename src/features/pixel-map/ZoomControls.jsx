import { useEffect, useRef, useState } from 'react'
import { Plus, Minus, Maximize2, LocateFixed } from 'lucide-react'

// overlay HTML ล้วน (ไม่ใช่ SVG) — เป็น UI ควบคุม ไม่ใช่เนื้อหาแผนที่ จึงไม่ควรติดไปกับ export PNG/SVG
// วางบน parent ที่ position:relative เสมอ (MapCanvas wrapper / compare panel wrapper)
// แผนที่กว้าง 900px แต่กล่องแผนที่มักแคบกว่า (ต้องเลื่อนดู) — ปุ่มที่ปักมุมขวาบนของ canvas เฉย ๆ จะหลุดออกนอกส่วนที่มองเห็น
// จึงเลื่อนปุ่มตามส่วนที่มองเห็นจริงเสมอ (ทั้งเลื่อนกล่องแผนที่และเลื่อนทั้งหน้า) แต่ไม่ให้หลุดออกนอก canvas ของตัวเอง
// (โหมด compare จะได้ไม่ไปทับ panel อื่น)
const GUTTER = 8

// กรอบที่มองเห็นจริงของ el = ส่วนที่ซ้อนกันของ viewport กับทุก ancestor ที่ตัด/เลื่อนเนื้อหาได้
function visibleRect(el) {
  const r = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p)
    if (!/(auto|scroll|hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) continue
    const pr = p.getBoundingClientRect() // clientLeft/clientWidth ตัดเส้นขอบกับแถบเลื่อนออกแล้ว
    r.left = Math.max(r.left, pr.left + p.clientLeft)
    r.top = Math.max(r.top, pr.top + p.clientTop)
    r.right = Math.min(r.right, pr.left + p.clientLeft + p.clientWidth)
    r.bottom = Math.min(r.bottom, pr.top + p.clientTop + p.clientHeight)
  }
  return r
}

function scrollableAncestors(el) {
  const out = []
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p)
    if (/(auto|scroll)/.test(cs.overflow + cs.overflowX + cs.overflowY)) out.push(p)
  }
  return out
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export default function ZoomControls({ onZoomIn, onZoomOut, onReset, onCenter, disabled }) {
  const ref = useRef(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const el = ref.current
    const box = el?.offsetParent // กล่อง canvas (position:relative) ที่ปุ่มเกาะอยู่
    if (!el || !box) return

    let raf = 0
    const measure = () => {
      raf = 0
      const vis = visibleRect(el)
      const boxRect = box.getBoundingClientRect()
      const x = clamp(vis.right - boxRect.right - GUTTER, -Math.max(0, boxRect.width - el.offsetWidth - GUTTER * 2), 0)
      const y = clamp(vis.top - boxRect.top, 0, Math.max(0, boxRect.height - el.offsetHeight - GUTTER * 2))
      setOffset(prev => (Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5 ? prev : { x, y }))
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure) }

    measure()
    // capture:true — scroll ของ element ไม่ bubble แต่จับได้ตอน capture จึงรับได้ทุกกล่องที่เลื่อน
    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)
    const ro = new ResizeObserver(schedule)
    ro.observe(box)
    scrollableAncestors(el).forEach(p => ro.observe(p))
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      ro.disconnect()
    }
  }, [])

  const btn = 'w-8 h-8 flex items-center justify-center rounded-lg bg-white/95 ring-1 ring-slate-200 shadow-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed'
  return (
    <div ref={ref} className="absolute top-2 right-2 z-10 flex flex-col gap-1"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
      <button type="button" onClick={onZoomIn} disabled={disabled} className={btn} title="ซูมเข้า"><Plus size={15} /></button>
      <button type="button" onClick={onZoomOut} disabled={disabled} className={btn} title="ซูมออก"><Minus size={15} /></button>
      <button type="button" onClick={onReset} disabled={disabled} className={btn} title="รีเซ็ตมุมมอง"><Maximize2 size={15} /></button>
      <button type="button" onClick={onCenter} disabled={disabled} className={btn} title="ไปที่เขตที่เลือก"><LocateFixed size={15} /></button>
    </div>
  )
}
