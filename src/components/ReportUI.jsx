// ReportUI — presentational primitives ใช้ร่วม /complaints /situation (จับกุม/บำบัด/ร้องเรียน)
// design เข้ม: slate+rose+emerald+amber เท่านั้น · ห้าม gradient/emoji · tabular-nums ทุกตัวเลข
import {
  BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { Download, Table2, Image as ImageIcon } from 'lucide-react'
import { COLORS, barTooltipStyle, labelStyle } from '../utils/reportStyle'

export function Panel({ children, className = '' }) {
  return <div className={`bg-white rounded-lg ring-1 ring-slate-200 p-6 md:p-8 ${className}`}>{children}</div>
}

export function SectionHead({ title, sub }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

export function Metric({ span, accent = 'text-slate-900', eyebrow, value, unit, sub, divider }) {
  return (
    <div className={`col-span-12 ${span} ${divider ? 'sm:border-l sm:border-slate-200 sm:pl-6' : ''}`}>
      <div className="text-[11px] font-medium uppercase tracking-widest text-slate-500 leading-tight min-h-[28px]">{eyebrow}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={`text-4xl font-semibold tracking-tight tabular-nums leading-none ${accent}`}>{value}</span>
        {unit && <span className="text-xs text-slate-400">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-xs text-slate-500 tabular-nums">{sub}</div>}
    </div>
  )
}

export function RankedBarChart({ data, unit = 'ครั้ง', highlightFirst = true }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 12, fill: '#475569' }} />
        <Tooltip contentStyle={barTooltipStyle} formatter={(v) => [v.toLocaleString(), unit]} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => <Cell key={d.name} fill={highlightFirst && i === 0 ? COLORS.amber : COLORS.slateSoft} />)}
          <LabelList dataKey="value" position="right" formatter={(v) => v.toLocaleString()} style={labelStyle} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// DonutChart — โดนัท + legend % ข้างๆ (แทน bar เมื่ออยากได้ฟีล infographic) — data: [{ name, value, color }]
// pctBase/centerValue: ใช้เมื่อ data ไม่ mutually exclusive (เช่น ตัวยา 1 คดีมีได้หลายตัว รวม value กันแล้วเกินจำนวนคดีจริง)
// ถ้าไม่ส่งมา ใช้ sum(value) เป็นทั้งฐาน % และเลขกลาง (กรณี mutually exclusive เช่น ข้อหา/ร้ายแรง sum ตรงกับ total อยู่แล้ว)
export function DonutChart({ data, unit = 'ครั้ง', size = 180, pctBase, centerValue, centerLabel }) {
  const sum = data.reduce((s, d) => s + d.value, 0)
  if (!sum) return <EmptyChart />
  const base = pctBase ?? sum
  const shownCenter = centerValue ?? sum
  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
              innerRadius={size * 0.32} outerRadius={size * 0.48} paddingAngle={2} strokeWidth={0}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={barTooltipStyle} formatter={(v, n) => [`${v.toLocaleString()} ${unit}`, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-xl font-semibold text-slate-900 tabular-nums leading-none">{shownCenter.toLocaleString()}</div>
          <div className="mt-1 text-[11px] text-slate-400 text-center px-2">{centerLabel || unit}</div>
        </div>
      </div>
      <div className="flex-1 w-full min-w-0 space-y-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{d.name}</span>
            <span className="text-sm font-semibold text-slate-900 tabular-nums shrink-0">{d.value.toLocaleString()}</span>
            <span className="text-xs text-slate-400 tabular-nums w-11 text-right shrink-0">{base ? ((d.value / base) * 100).toFixed(0) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function EmptyChart() {
  return <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">ไม่มีข้อมูลในช่วงที่เลือก</div>
}

// PlaceholderCard — ใช้กับ dimension ที่ยังไม่มีข้อมูล (เช่น ข้อมูลรายบุคคลของหน้าบำบัด, field ที่ไม่มีใน drug_incidents)
export function PlaceholderCard({ title, note = 'รอไฟล์บำบัดรายบุคคล (re-export filter กทม. จากระบบ บสต.)' }) {
  return (
    <div className="rounded-lg ring-1 ring-dashed ring-slate-300 bg-slate-50/60 p-6 flex flex-col items-center justify-center text-center h-full min-h-[160px]">
      <div className="text-sm font-semibold text-slate-500">{title}</div>
      <div className="mt-2 text-xs text-slate-400 max-w-[220px]">{note}</div>
    </div>
  )
}

// Top3List — เขต top3 พร้อม % จากยอดรวม (data: [{ name, value, pct }] เรียงมาก→น้อยมาแล้ว)
export function Top3List({ data }) {
  if (!data.length) return <EmptyChart />
  const sumPct = data.reduce((s, d) => s + d.pct, 0)
  return (
    <div>
      <ol className="space-y-2.5">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-3">
            <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold tabular-nums shrink-0 ${
              i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
            }`}>{i + 1}</span>
            <span className="flex-1 text-sm text-slate-700 truncate">{d.name}</span>
            <span className="text-sm font-semibold text-slate-900 tabular-nums">{d.value.toLocaleString()}</span>
            <span className="text-xs text-slate-400 tabular-nums w-14 text-right">{d.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 text-xs text-slate-400 tabular-nums">รวม {data.length} เขต = {sumPct.toFixed(1)}% ของทั้งหมด</div>
    </div>
  )
}

// SplitBarChart — bar แนวนอน 2 หมวด (เช่น ในชุมชน/นอกชุมชน, ร้ายแรง/ไม่ร้ายแรง)
export function SplitBarChart({ data, unit = 'ครั้ง', colorFor }) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: '#475569' }} />
        <Tooltip contentStyle={barTooltipStyle} formatter={(v) => [v.toLocaleString(), unit]} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((d) => <Cell key={d.name} fill={colorFor ? colorFor(d.name) : COLORS.slateSoft} />)}
          <LabelList dataKey="value" position="right" formatter={(v) => v.toLocaleString()} style={labelStyle} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ActionBar — ดูตาราง/Export Excel/Infographic(placeholder) ใช้ร่วมทุก section ของ /situation
export function ActionBar({ tableOpen, onToggleTable, onExport, exporting }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={onToggleTable}
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md ring-1 ring-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
        <Table2 size={15} /> {tableOpen ? 'ซ่อนตาราง' : 'ดูตาราง'}
      </button>
      <button onClick={onExport} disabled={exporting}
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md ring-1 ring-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-wait">
        <Download size={15} /> {exporting ? 'กำลังสร้างไฟล์...' : 'Export Excel'}
      </button>
      <button disabled title="เร็วๆนี้ — ตาม template PDF"
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md ring-1 ring-slate-200 bg-white text-sm font-medium text-slate-400 cursor-not-allowed">
        <ImageIcon size={15} /> Infographic
      </button>
    </div>
  )
}

// TablePager — ใช้ร่วมทุกตารางรายละเอียดของ /situation
export function TablePager({ page, totalPages, total, onPrev, onNext }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
      <span className="tabular-nums">หน้า {page} / {totalPages} · {total.toLocaleString()} รายการ</span>
      <div className="flex gap-1.5">
        <button onClick={onPrev} disabled={page === 1}
          className="px-3 py-1.5 rounded-md ring-1 ring-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
          ก่อนหน้า
        </button>
        <button onClick={onNext} disabled={page === totalPages}
          className="px-3 py-1.5 rounded-md ring-1 ring-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
          ถัดไป
        </button>
      </div>
    </div>
  )
}
