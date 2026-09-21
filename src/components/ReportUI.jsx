// ReportUI — presentational primitives ของ /situation (จับกุม/บำบัด/ร้องเรียน)
// ดีไซน์เรียบ/ทางการ: hairline card + accent น้ำเงินกรมเดียว · bar เป็น CSS (ไม่ใช้ Recharts) · tabular-nums ทุกตัวเลข
import { useState, useRef } from 'react'
import { Download, Table2, Image as ImageIcon, Scale } from 'lucide-react'
import { COLORS, readableOn } from '../utils/reportStyle'

const CARD = 'rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,22,38,0.05)]'

export function Panel({ children, className = '', ...rest }) {
  return <div className={`${CARD} p-5 md:p-6 ${className}`} {...rest}>{children}</div>
}

// icon/badge (optional): ไอคอน chip + chip เล็กข้างชื่อ (เช่น "9 ประเภท") · right (optional): ข้อความชิดขวา (เช่น "ฐาน: 6,809 คน") ซ่อนบนจอเล็ก
export function SectionHead({ title, sub, icon: Icon, badge, right }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <div className="flex items-baseline gap-2 min-w-0">
        {Icon && <Icon size={14} className="self-center shrink-0 text-slate-400" />}
        <h3 className="text-[14.5px] font-semibold tracking-tight text-slate-800">{title}</h3>
        {badge && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
            style={{ background: COLORS.accentSoft, color: COLORS.accentInk }}>{badge}</span>
        )}
      </div>
      {sub && <p className="text-[11.5px] text-slate-400">{sub}</p>}
      {right && <p className="hidden sm:block shrink-0 text-[11.5px] text-slate-400 tabular-nums">{right}</p>}
    </div>
  )
}

export function Metric({ span, accent = 'text-slate-900', eyebrow, value, unit, sub, divider, icon: Icon }) {
  return (
    <div className={`col-span-12 ${span} ${divider ? 'sm:border-l sm:border-slate-200 sm:pl-6' : ''}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 leading-tight min-h-[18px]">
        {Icon && <Icon size={13} className="shrink-0 text-slate-400" />}{eyebrow}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`text-[38px] font-semibold tracking-tight tabular-nums leading-none ${accent}`}>{value}</span>
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-xs text-slate-400 tabular-nums">{sub}</div>}
    </div>
  )
}

// RankedBarChart — แท่งแนวนอนเรียงมาก→น้อย (สี accent, ตัวแรกเข้มสุด) ; width = value/max
// percent: true = แสดงเป็น "%" (ตัวหาร = ผลรวมของค่าในกราฟ → รวม 100%) + จำนวนจริงตัวเล็กจางไว้อ้างอิง ; false = แสดงจำนวน
// hover แท่งไหน → bubble ตามเมาส์บอกชื่อ + จำนวน (+ %)
export function RankedBarChart({ data, percent = false, highlightFirst = true, unit = '' }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const sum = data.reduce((s, d) => s + d.value, 0) || 1
  const [hover, setHover] = useState(null) // { name, value, x, y }
  const ref = useRef(null)
  const onMove = (d) => (e) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    setHover({ name: d.name, value: d.value, x: e.clientX - r.left, y: e.clientY - r.top })
  }
  return (
    <div ref={ref} className="relative flex flex-col gap-3.5" onMouseLeave={() => setHover(null)}>
      {data.map((d, i) => (
        <div key={d.name} onMouseMove={onMove(d)}
          className="grid grid-cols-[92px_1fr_auto] items-center gap-3 cursor-default rounded-md hover:bg-slate-50 -mx-1 px-1 py-0.5 transition-colors">
          <span className="truncate text-[13px] text-slate-500" title={d.name}>{d.name}</span>
          <span className="h-2 rounded-full overflow-hidden" style={{ background: COLORS.track }}>
            <span className="block h-full rounded-full" style={{
              width: `${(d.value / max) * 100}%`,
              background: COLORS.accent,
              opacity: highlightFirst && i > 0 ? 0.5 : 1,
            }} />
          </span>
          <span className="text-right tabular-nums min-w-[56px] text-[13px] font-semibold text-slate-800">
            {percent ? `${((d.value / sum) * 100).toFixed(1)}%` : d.value.toLocaleString()}
          </span>
        </div>
      ))}
      {hover && (
        <div className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full" style={{ left: hover.x, top: hover.y - 10 }}>
          <div className="rounded-lg bg-slate-900/95 text-white px-2.5 py-1.5 shadow-lg whitespace-nowrap text-center">
            <div className="text-xs font-semibold">{hover.name}</div>
            <div className="text-[11px] text-slate-300 tabular-nums">
              <span className="font-bold text-white">{hover.value.toLocaleString()}</span>{unit && ` ${unit}`}
            </div>
          </div>
          <div className="mx-auto h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-slate-900/95" />
        </div>
      )}
    </div>
  )
}

// DrugTileGrid — ของกลางยาเสพติดแบบการ์ดไทล์ : ตัวแรกเข้มสุด, ไทล์ "อื่น ๆ" กดเพื่อกางรายการที่เหลือ
export function DrugTileGrid({ data, unit = 'คดี', topN = 5, onOther }) {
  const [open, setOpen] = useState(false)
  const sum = data.reduce((s, d) => s + d.value, 0) || 1
  const pct = (v) => ((v / sum) * 100).toFixed(1)
  const head = data.slice(0, topN)
  const rest = data.slice(topN)
  const shown = open ? data : head
  const restTotal = rest.reduce((s, d) => s + d.value, 0)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {shown.map((d, i) => {
        const lead = i === 0
        return (
          <div key={d.name}
            className={`rounded-xl px-3.5 py-3 flex flex-col justify-center min-h-[92px] ${lead ? 'ring-1 ring-[#2f49c9]/25' : ''}`}
            style={{ background: lead ? COLORS.accent : COLORS.accentSoft, color: lead ? '#ffffff' : COLORS.accentInk }}>
            <div className="text-[15px] font-bold leading-tight truncate" title={d.name}>{d.name}</div>
            <div className="mt-1 text-[13px] font-semibold tabular-nums opacity-95">{d.value.toLocaleString()} {unit}</div>
            <div className="text-[13px] font-bold tabular-nums opacity-90">{pct(d.value)}%</div>
          </div>
        )
      })}
      {rest.length > 0 && (
        <button type="button" onClick={(e) => { if (onOther) { e.stopPropagation(); onOther() } else setOpen((o) => !o) }}
          className="rounded-xl px-3.5 py-3 flex flex-col justify-center min-h-[92px] text-left transition hover:brightness-95"
          style={{ background: COLORS.accentSoft, color: COLORS.accentInk }}>
          <div className="text-[15px] font-bold leading-tight">{!onOther && open ? 'ย่อกลับ' : 'อื่น ๆ'}</div>
          <div className="text-[11.5px] opacity-80 leading-tight">
            {!onOther && open ? 'แสดงเฉพาะอันดับต้น' : `แสดงรายละเอียด · อีก ${rest.length} ชนิด`}
          </div>
          {!open && <div className="mt-1 text-[13px] font-bold tabular-nums opacity-90">{restTotal.toLocaleString()} {unit} · {pct(restTotal)}%</div>}
        </button>
      )}
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

// KpiCard — การ์ด KPI เดี่ยว: label+ไอคอนบนหัว, ตัวเลขใหญ่กลาง, footer อธิบายด้านล่าง
// (ใช้แทน Metric ตอนอยากได้การ์ดแยกแทนแถวเดียวกัน — เช่น แถบ KPI ของแท็บจับกุม)
// delta (optional): { pct } — ชิป % เทียบปีงบก่อน ต่อท้ายค่าหลัก
// เพิ่มขึ้น = rose (คดี/ผู้ต้องหาเพิ่มคือสัญญาณแย่) ลดลง = emerald · pct == null → ไม่แสดงชิป
export function KpiCard({ icon: Icon, iconBg = 'bg-slate-100', iconColor = 'text-slate-600', label, value, valueColor = 'text-slate-900', unit, footer, delta }) {
  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {Icon && (
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${iconBg} ${iconColor}`}>
            <Icon size={16} />
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span className={`text-[30px] font-semibold tracking-tight tabular-nums leading-none ${valueColor}`}>{value}</span>
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
        {delta && delta.pct != null && (
          <span className={`ml-0.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
            delta.pct > 0 ? 'bg-rose-50 text-rose-600' : delta.pct < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {delta.pct > 0 ? '▲' : delta.pct < 0 ? '▼' : ''}{Math.abs(delta.pct).toFixed(1)}%
          </span>
        )}
      </div>
      {footer && <div className="mt-3 text-[11.5px] leading-relaxed text-slate-400 tabular-nums">{footer}</div>}
    </div>
  )
}

// RankedList — เวอร์ชันเน้นอันดับของ RankedBarChart: อันดับ 1 เด่นสุด, #2-4 มี badge อันดับ,
// รายการที่เหลือแสดงแบบเรียบ, รายการเล็กมาก (< minorPct) รวบเป็น grid การ์ดเล็กท้ายสุด (กันแท่งบางเกินอ่านไม่ออก)
// data ต้องเรียงมาก→น้อยมาแล้ว · pctBase: ฐาน % (ไม่ส่งมา = sum ของ data เอง)
export function RankedList({ data, unit = 'ครั้ง', pctBase, minorPct = 0.5 }) {
  if (!data.length) return <EmptyChart />
  const base = pctBase ?? data.reduce((s, d) => s + d.value, 0)
  const withPct = data.map((d) => ({ ...d, pct: base ? (d.value / base) * 100 : 0 }))
  const [top, ...rest] = withPct
  const major = rest.filter((d) => d.pct >= minorPct)
  const ranked = major.slice(0, 3)
  const plain = major.slice(3)
  const minor = rest.filter((d) => d.pct < minorPct)

  const fmt = (d) => (
    <span className="shrink-0 text-xs tabular-nums">
      <b className="font-semibold text-slate-800">{d.pct.toFixed(1)}%</b>
      <span className="ml-1 text-slate-400">({d.value.toLocaleString()} {unit})</span>
    </span>
  )
  const bar = (pct, h, opacity) => (
    <span className={`block ${h} rounded-full overflow-hidden`} style={{ background: COLORS.track }}>
      <span className="block h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, pct)}%`, background: COLORS.accent, opacity }} />
    </span>
  )

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: COLORS.accentSoft, color: COLORS.accentInk }}>อันดับ 1</span>
            <span className="truncate font-semibold text-slate-800">{top.name}</span>
          </span>
          {fmt(top)}
        </div>
        {bar(top.pct, 'h-3', 1)}
      </div>

      {ranked.map((d, i) => (
        <div key={d.name}>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">#{i + 2}</span>
              <span className="truncate font-medium text-slate-700">{d.name}</span>
            </span>
            {fmt(d)}
          </div>
          {bar(d.pct, 'h-2.5', 0.55)}
        </div>
      ))}

      {plain.map((d) => (
        <div key={d.name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-slate-600">{d.name}</span>
            {fmt(d)}
          </div>
          {bar(d.pct, 'h-2', 0.4)}
        </div>
      ))}

      {minor.length > 0 && (
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
          {minor.map((d) => (
            <div key={d.name} className="rounded-lg bg-slate-50 px-2 py-2 text-center ring-1 ring-slate-100">
              <span className="mb-0.5 block truncate text-[11px] text-slate-500">{d.name}</span>
              <span className="block text-xs font-semibold tabular-nums text-slate-800">
                {d.pct < 0.1 ? '< 0.1%' : `${d.pct.toFixed(1)}%`}
              </span>
              <span className="text-[10px] tabular-nums text-slate-400">({d.value.toLocaleString()} {unit})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// tone ของ SplitRatioCard — จำกัดตาม palette ของ /situation (slate กลาง ๆ + rose/amber/emerald เมื่อสีมีความหมาย)
const RATIO_TONES = {
  slate:   { bar: '#94a3b8',      soft: 'bg-slate-50',      track: 'bg-slate-200/70', label: 'text-slate-800',   value: 'text-slate-800',   sub: 'text-slate-500' },
  rose:    { bar: COLORS.rose,    soft: 'bg-rose-50/50',    track: 'bg-rose-100',     label: 'text-rose-900',    value: 'text-rose-600',    sub: 'text-rose-600/80' },
  amber:   { bar: COLORS.amber,   soft: 'bg-amber-50/60',   track: 'bg-amber-100',    label: 'text-amber-900',   value: 'text-amber-600',   sub: 'text-amber-600/80' },
  emerald: { bar: COLORS.emerald, soft: 'bg-emerald-50/50', track: 'bg-emerald-100',  label: 'text-emerald-900', value: 'text-emerald-700', sub: 'text-emerald-700/80' },
}

// SplitRatioCard — สัดส่วน 2 (หรือมากกว่า) หมวดที่อยากเน้นความต่าง: stacked bar รวม + การ์ดย่อยรายหมวดพร้อมคำอธิบาย
// items: [{ name, value, tone: 'slate'|'rose'|'amber'|'emerald', description? }] · ratioNote (optional): บรรทัดสรุปท้ายการ์ด
export function SplitRatioCard({ items, unit = 'ครั้ง', ratioNote }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (!total) return <EmptyChart />
  const withPct = items.map((i) => ({ ...i, pct: (i.value / total) * 100, t: RATIO_TONES[i.tone] || RATIO_TONES.slate }))
  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <span className="text-xs font-semibold text-slate-600">สัดส่วน</span>
        <span className="text-xs tabular-nums text-slate-400">รวม {total.toLocaleString()} {unit}</span>
      </div>
      <div className="flex h-8 gap-0.5 overflow-hidden rounded-lg border border-slate-200 p-1">
        {withPct.map((i) => (
          <div key={i.name} className="grid h-full place-items-center rounded transition-all duration-700"
            style={{ width: `${i.pct}%`, background: i.t.bar }}>
            {i.pct >= 8 && <span className="text-[11px] font-bold tabular-nums" style={{ color: readableOn(i.t.bar) }}>{i.pct.toFixed(1)}%</span>}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3.5">
        {withPct.map((i) => (
          <div key={i.name} className={`rounded-xl p-4 ${i.t.soft}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i.t.bar }} />
                <span className={`truncate text-sm font-semibold ${i.t.label}`}>{i.name}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`text-lg font-semibold tracking-tight tabular-nums ${i.t.value}`}>{i.pct.toFixed(1)}%</span>
                <span className={`ml-1.5 text-xs font-medium tabular-nums ${i.t.sub}`}>({i.value.toLocaleString()} {unit})</span>
              </span>
            </div>
            <div className={`mt-2 h-2.5 w-full overflow-hidden rounded-full ${i.t.track}`}>
              <div className="h-full rounded-full" style={{ width: `${i.pct}%`, background: i.t.bar }} />
            </div>
            {i.description && <p className={`mt-2 text-[11.5px] ${i.t.sub}`}>{i.description}</p>}
          </div>
        ))}
      </div>

      {ratioNote && (
        <div className="mt-5 flex items-center gap-1.5 border-t border-slate-100 pt-3.5 text-xs text-slate-500">
          <Scale size={14} className="shrink-0 text-slate-400" />
          <span className="tabular-nums">{ratioNote}</span>
        </div>
      )}
    </div>
  )
}
