// ReportUI — presentational primitives ของ /situation (จับกุม/บำบัด/ร้องเรียน)
// ดีไซน์เรียบ/ทางการ: hairline card + accent น้ำเงินกรมเดียว · bar เป็น CSS (ไม่ใช้ Recharts) · tabular-nums ทุกตัวเลข
import { Download, Table2, Image as ImageIcon } from 'lucide-react'
import { COLORS, readableOn } from '../utils/reportStyle'

const CARD = 'rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,22,38,0.05)]'

export function Panel({ children, className = '' }) {
  return <div className={`${CARD} p-5 md:p-6 ${className}`}>{children}</div>
}

export function SectionHead({ title, sub }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <h3 className="text-[14.5px] font-semibold tracking-tight text-slate-800">{title}</h3>
      {sub && <p className="text-[11.5px] text-slate-400">{sub}</p>}
    </div>
  )
}

export function Metric({ span, accent = 'text-slate-900', eyebrow, value, unit, sub, divider }) {
  return (
    <div className={`col-span-12 ${span} ${divider ? 'sm:border-l sm:border-slate-200 sm:pl-6' : ''}`}>
      <div className="text-xs font-medium text-slate-500 leading-tight min-h-[18px]">{eyebrow}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`text-[38px] font-semibold tracking-tight tabular-nums leading-none ${accent}`}>{value}</span>
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-xs text-slate-400 tabular-nums">{sub}</div>}
    </div>
  )
}

// RankedBarChart — แท่งแนวนอนเรียงมาก→น้อย (สี accent, ตัวแรกเข้มสุด) ; width = value/max
export function RankedBarChart({ data, highlightFirst = true }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex flex-col gap-3.5">
      {data.map((d, i) => (
        <div key={d.name} className="grid grid-cols-[92px_1fr_auto] items-center gap-3">
          <span className="truncate text-[13px] text-slate-500" title={d.name}>{d.name}</span>
          <span className="h-2 rounded-full overflow-hidden" style={{ background: COLORS.track }}>
            <span className="block h-full rounded-full" style={{
              width: `${(d.value / max) * 100}%`,
              background: COLORS.accent,
              opacity: highlightFirst && i > 0 ? 0.5 : 1,
            }} />
          </span>
          <span className="text-[13px] font-semibold text-slate-800 tabular-nums text-right min-w-[52px]">{d.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

export function EmptyChart() {
  return <div className="h-[180px] flex items-center justify-center text-sm text-slate-400">ไม่มีข้อมูลในช่วงที่เลือก</div>
}

// PlaceholderCard — dimension ที่ยังไม่มีข้อมูล : กล่องเส้นประเรียบ ๆ (title/note ไม่บังคับ — ไม่พูดซ้ำหัวข้อ)
export function PlaceholderCard({ title, note }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-4 py-6 flex flex-1 flex-col items-center justify-center text-center min-h-[124px] gap-1.5">
      {title && <div className="text-sm font-semibold text-slate-500 leading-tight">{title}</div>}
      {note && <div className="text-xs text-slate-400 leading-snug max-w-[230px]">{note}</div>}
    </div>
  )
}

// SplitBarChart — แถบเดียวแบ่ง 2 หมวด + legend (เช่น ในชุมชน/นอกชุมชน, ร้ายแรง/ไม่ร้ายแรง)
export function SplitBarChart({ data, unit = 'ครั้ง', colorFor }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const colorOf = (n) => (colorFor ? colorFor(n) : COLORS.slateSoft)
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex h-9 rounded-lg overflow-hidden border border-slate-200">
        {data.map((d) => {
          const pct = (d.value / total) * 100
          const bg = colorOf(d.name)
          return (
            <div key={d.name} className="flex items-center px-3 text-[13px] font-semibold tabular-nums whitespace-nowrap"
              style={{ width: `${pct}%`, background: bg, color: readableOn(bg) }}>
              {pct >= 11 ? `${pct.toFixed(0)}%` : ''}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-slate-500">
        {data.map((d) => (
          <span key={d.name} className="inline-flex items-center gap-1.5">
            <i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: colorOf(d.name) }} />
            {d.name} · <b className="font-semibold text-slate-700 tabular-nums">{d.value.toLocaleString()}</b> {unit}
          </span>
        ))}
      </div>
    </div>
  )
}

// Top3List — เขต top3 พร้อมแถบ % (data: [{ name, value, pct }] เรียงมาก→น้อยมาแล้ว)
export function Top3List({ data }) {
  if (!data.length) return <EmptyChart />
  const max = Math.max(1, ...data.map((d) => d.pct))
  const sumPct = data.reduce((s, d) => s + d.pct, 0)
  return (
    <div>
      <ol className="flex flex-col gap-3.5">
        {data.map((d, i) => (
          <li key={d.name} className="grid grid-cols-[24px_1fr_auto] items-center gap-3">
            <span className="grid place-items-center w-6 h-6 rounded-md text-xs font-semibold tabular-nums shrink-0"
              style={i === 0
                ? { background: COLORS.accentSoft, color: COLORS.accentInk }
                : { background: '#f1f5f9', color: '#64748b' }}>{i + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-slate-700">{d.name}</span>
              <span className="mt-1.5 block h-1.5 rounded-full overflow-hidden" style={{ background: COLORS.track }}>
                <span className="block h-full rounded-full" style={{ width: `${(d.pct / max) * 100}%`, background: COLORS.accent, opacity: i === 0 ? 1 : 0.5 }} />
              </span>
            </span>
            <span className="text-sm font-semibold text-slate-800 tabular-nums min-w-[52px] text-right">{d.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 text-xs text-slate-400 tabular-nums">รวม {data.length} เขต = {sumPct.toFixed(1)}% ของทั้งหมด</div>
    </div>
  )
}

// ActionBar — ดูตาราง/Export Excel/Infographic(placeholder) ใช้ร่วมทุก section
export function ActionBar({ tableOpen, onToggleTable, onExport, exporting }) {
  const base = 'inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-sm font-medium transition'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={onToggleTable} className={`${base} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
        <Table2 size={15} /> {tableOpen ? 'ซ่อนตาราง' : 'ดูตาราง'}
      </button>
      <button onClick={onExport} disabled={exporting}
        className={`${base} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-wait`}>
        <Download size={15} /> {exporting ? 'กำลังสร้างไฟล์...' : 'Export Excel'}
      </button>
      <button disabled title="เร็วๆนี้ — ตาม template PDF"
        className={`${base} border border-slate-200 bg-white text-slate-400 cursor-not-allowed`}>
        <ImageIcon size={15} /> Infographic
      </button>
    </div>
  )
}

// TablePager — ใช้ร่วมทุกตารางรายละเอียด
export function TablePager({ page, totalPages, total, onPrev, onNext }) {
  const btn = 'px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition'
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
      <span className="tabular-nums">หน้า {page} / {totalPages} · {total.toLocaleString()} รายการ</span>
      <div className="flex gap-1.5">
        <button onClick={onPrev} disabled={page === 1} className={btn}>ก่อนหน้า</button>
        <button onClick={onNext} disabled={page === totalPages} className={btn}>ถัดไป</button>
      </div>
    </div>
  )
}
