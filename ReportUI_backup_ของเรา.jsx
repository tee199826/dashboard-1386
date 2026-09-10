// ReportUI — presentational primitives ใช้ร่วม /complaints /situation (จับกุม/บำบัด/ร้องเรียน)
// design เข้ม: slate+rose+emerald+amber เท่านั้น · ห้าม gradient/emoji · tabular-nums ทุกตัวเลข
import {
  BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { Download, Table2, Image as ImageIcon, Inbox, Scale } from 'lucide-react'
import { COLORS, barTooltipStyle, labelStyle } from '../utils/reportStyle'

export function Panel({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl ring-1 ring-slate-900/[0.06] shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-6 md:p-8 ${className}`}>
      {children}
    </div>
  )
}

// badge (optional): chip เล็กข้างชื่อ (เช่น "9 ประเภท") · right (optional): ข้อความชิดขวา (เช่น "ฐาน: 6,809 คน") ซ่อนบนจอเล็ก
export function SectionHead({ title, sub, icon: Icon, badge, right }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        {Icon && (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-slate-900/[0.06]">
            <Icon size={14} className="text-slate-500" />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h3>
            {badge && <span className="bg-amber-100/70 text-amber-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">{badge}</span>}
          </div>
          {sub && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{sub}</p>}
        </div>
      </div>
      {right && <div className="hidden sm:block shrink-0 text-right text-xs text-slate-400 font-mono">{right}</div>}
    </div>
  )
}

// icon (optional): lucide component — วางเป็น chip เล็กเหนือ eyebrow ให้ metric มี anchor สายตา
export function Metric({ span, accent = 'text-slate-900', eyebrow, value, unit, sub, divider, icon: Icon }) {
  return (
    <div className={`col-span-12 ${span} ${divider ? 'sm:border-l sm:border-slate-200 sm:pl-6' : ''}`}>
      <div className="flex items-center gap-2 min-h-[20px]">
        {Icon && <Icon size={13} className="text-slate-400 shrink-0" />}
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 leading-tight">{eyebrow}</div>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`text-[2.25rem] font-semibold tracking-tight tabular-nums leading-none ${accent}`}>{value}</span>
        {unit && <span className="text-xs text-slate-400">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-xs text-slate-500 tabular-nums">{sub}</div>}
    </div>
  )
}

// KpiCard — การ์ด KPI เดี่ยว icon+eyebrow บนหัว, ตัวเลขใหญ่กลาง, footer อธิบายด้านล่าง (ใช้แทน Metric ตอนอยากได้การ์ดแยกแทนแถวเดียวกัน)
// iconBg/iconColor: จำกัด slate/rose/emerald/amber เท่านั้น (ห้าม blue ตาม design rule ของ /situation)
// delta (optional): { pct } — ชิป % เทียบช่วงก่อนหน้า ต่อท้ายค่าหลัก
// เพิ่มขึ้น = rose (คดี/ผู้ต้องหาเพิ่มคือสัญญาณแย่) ลดลง = emerald — คุมโทนตาม palette ของ /situation
// pct == null (ไม่มีปีก่อนให้เทียบ) หรือไม่ส่ง delta มาเลย → ไม่แสดงชิป = พฤติกรรมเดิมทุกที่ที่ใช้อยู่
export function KpiCard({ icon: Icon, iconBg = 'bg-slate-100', iconColor = 'text-slate-600', label, value, valueColor = 'text-slate-900', unit, footer, delta }) {
  return (
    <div className="bg-white p-5 rounded-xl ring-1 ring-slate-900/[0.06] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        {Icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}>
            <Icon size={16} />
          </span>
        )}
      </div>
      <div className="mt-4 flex items-baseline gap-1.5 flex-wrap">
        <span className={`text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums leading-none ${valueColor}`}>{value}</span>
        {unit && <span className="text-sm font-semibold text-slate-500">{unit}</span>}
        {delta && delta.pct != null && (
          <span className={`ml-0.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
            delta.pct > 0 ? 'bg-rose-50 text-rose-600' : delta.pct < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {delta.pct > 0 ? '▲' : delta.pct < 0 ? '▼' : ''}{Math.abs(delta.pct).toFixed(1)}%
          </span>
        )}
      </div>
      {footer && <div className="mt-3 text-xs text-slate-500 tabular-nums leading-relaxed">{footer}</div>}
    </div>
  )
}

// pctBase (optional): เมื่อส่งมา label ท้ายแท่งจะโชว์ % เทียบฐานนี้ต่อท้ายค่า (เช่น % จากผู้ต้องหารวม) — ไม่ส่งมาพฤติกรรมเดิมทุกที่ที่ใช้อยู่
export function RankedBarChart({ data, unit = 'ครั้ง', highlightFirst = true, pctBase }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 4 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
        <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={barTooltipStyle} formatter={(v) => [v.toLocaleString(), unit]} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((d, i) => <Cell key={d.name} fill={highlightFirst && i === 0 ? COLORS.amber : COLORS.slateSoft} />)}
          <LabelList dataKey="value" position="right" style={labelStyle}
            formatter={(v) => pctBase ? `${v.toLocaleString()} (${((v / pctBase) * 100).toFixed(0)}%)` : v.toLocaleString()} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// RankedList — เวอร์ชันเน้นอันดับของ RankedBarChart (ไม่ใช้ recharts): อันดับ 1 เด่นสุด, #2-4 มี badge อันดับ,
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
    <div className="font-mono text-xs shrink-0">
      <span className="font-bold text-slate-800 tabular-nums">{d.pct.toFixed(1)}%</span>
      <span className="text-slate-500 ml-1 tabular-nums">({d.value.toLocaleString()} {unit})</span>
    </div>
  )

  return (
    <div className="space-y-3.5">
      <div>
        <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[11px] shrink-0">อันดับ 1</span>
            <span className="font-semibold text-slate-900 truncate">{top.name}</span>
          </div>
          <div className="font-mono text-xs shrink-0">
            <span className="font-bold text-base text-amber-600 tabular-nums">{top.pct.toFixed(1)}%</span>
            <span className="text-slate-500 ml-1 tabular-nums">({top.value.toLocaleString()} {unit})</span>
          </div>
        </div>
        <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5">
          <div className="h-full bg-amber-500 rounded-full transition-all duration-700" style={{ width: `${top.pct}%` }} />
        </div>
      </div>

      {ranked.map((d, i) => (
        <div key={d.name}>
          <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] shrink-0">#{i + 2}</span>
              <span className="font-medium text-slate-800 truncate">{d.name}</span>
            </div>
            {fmt(d)}
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-slate-400 rounded-full transition-all duration-700" style={{ width: `${d.pct}%` }} />
          </div>
        </div>
      ))}

      {plain.map((d) => (
        <div key={d.name}>
          <div className="flex items-center justify-between gap-2 text-xs mb-1">
            <span className="font-normal text-slate-600 truncate">{d.name}</span>
            {fmt(d)}
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-slate-400 rounded-full" style={{ width: `${d.pct}%` }} />
          </div>
        </div>
      ))}

      {minor.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
          {minor.map((d) => (
            <div key={d.name} className="p-2 rounded-lg bg-slate-50 ring-1 ring-slate-100 text-center">
              <span className="block text-[11px] text-slate-500 mb-0.5 truncate">{d.name}</span>
              <span className="font-mono text-xs font-bold text-slate-800 block tabular-nums">
                {d.pct < 0.1 ? '< 0.1%' : `${d.pct.toFixed(1)}%`}
              </span>
              <span className="font-mono text-[10px] text-slate-400 tabular-nums">({d.value.toLocaleString()} {unit})</span>
            </div>
          ))}
        </div>
      )}
    </div>
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
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
              innerRadius={size * 0.33} outerRadius={size * 0.48} paddingAngle={2.5} strokeWidth={0}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={barTooltipStyle} formatter={(v, n) => [`${v.toLocaleString()} ${unit}`, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-xl font-semibold text-slate-900 tabular-nums leading-none">{shownCenter.toLocaleString()}</div>
          <div className="mt-1.5 text-[11px] text-slate-400 text-center px-2 leading-snug">{centerLabel || unit}</div>
        </div>
      </div>
      <div className="flex-1 w-full min-w-0 space-y-1">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50 transition-colors">
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
  return (
    <div className="h-[200px] flex flex-col items-center justify-center gap-2.5 text-slate-400">
      <Inbox size={22} strokeWidth={1.5} />
      <span className="text-sm">ไม่มีข้อมูลในช่วงที่เลือก</span>
    </div>
  )
}

// PlaceholderCard — ใช้กับ dimension ที่ยังไม่มีข้อมูล (เช่น ข้อมูลรายบุคคลของหน้าบำบัด, field ที่ไม่มีใน drug_incidents)
export function PlaceholderCard({ title, note = 'รอไฟล์บำบัดรายบุคคล (re-export filter กทม. จากระบบ บสต.)' }) {
  return (
    <div className="rounded-xl ring-1 ring-dashed ring-slate-300 bg-slate-50/60 p-6 flex flex-col items-center justify-center text-center h-full min-h-[160px]">
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
      <ol className="space-y-1">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-slate-50 transition-colors">
            <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold tabular-nums shrink-0 ${
              i === 0 ? 'bg-amber-500 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
            }`}>{i + 1}</span>
            <span className="flex-1 text-sm text-slate-700 truncate">{d.name}</span>
            <span className="text-sm font-semibold text-slate-900 tabular-nums">{d.value.toLocaleString()}</span>
            <span className="text-xs text-slate-400 tabular-nums w-14 text-right">{d.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400 tabular-nums">รวม {data.length} เขต = {sumPct.toFixed(1)}% ของทั้งหมด</div>
    </div>
  )
}

// SplitBarChart — bar แนวนอน 2 หมวด (เช่น ในชุมชน/นอกชุมชน, ร้ายแรง/ไม่ร้ายแรง)
export function SplitBarChart({ data, unit = 'ครั้ง', colorFor }) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }} barCategoryGap="32%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={barTooltipStyle} formatter={(v) => [v.toLocaleString(), unit]} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {data.map((d) => <Cell key={d.name} fill={colorFor ? colorFor(d.name) : COLORS.slateSoft} />)}
          <LabelList dataKey="value" position="right" formatter={(v) => v.toLocaleString()} style={labelStyle} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// tone จำกัดแค่ 4 สีตาม design rule ของ /situation (ห้าม blue/violet/gradient)
const RATIO_TONES = {
  slate:   { dot: 'bg-slate-500',  bar: 'bg-slate-500',  soft: 'bg-slate-50/80',  track: 'bg-slate-200/80', label: 'text-slate-800', value: 'text-slate-800', sub: 'text-slate-500',    desc: 'text-slate-500' },
  rose:    { dot: 'bg-rose-600',   bar: 'bg-rose-600',   soft: 'bg-rose-50/40',   track: 'bg-rose-100',    label: 'text-rose-900',  value: 'text-rose-600',  sub: 'text-rose-600/80',  desc: 'text-rose-600/80' },
  amber:   { dot: 'bg-amber-500',  bar: 'bg-amber-500',  soft: 'bg-amber-50/60',  track: 'bg-amber-100',   label: 'text-amber-900', value: 'text-amber-600', sub: 'text-amber-600/80', desc: 'text-amber-600/80' },
  emerald: { dot: 'bg-emerald-600',bar: 'bg-emerald-600',soft: 'bg-emerald-50/50',track: 'bg-emerald-100', label: 'text-emerald-900', value: 'text-emerald-600', sub: 'text-emerald-600/80', desc: 'text-emerald-600/80' },
}

// SplitRatioCard — สัดส่วน 2 (หรือมากกว่า) หมวดที่อยากเน้นความต่าง: stacked bar รวม + การ์ดย่อยรายหมวดพร้อมคำอธิบาย
// items: [{ name, value, tone: 'slate'|'rose'|'amber'|'emerald', description? }] · ratioNote (optional): บรรทัดสรุปท้ายการ์ด
export function SplitRatioCard({ items, unit = 'ครั้ง', ratioNote }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (!total) return <EmptyChart />
  const withPct = items.map((i) => ({ ...i, pct: (i.value / total) * 100, t: RATIO_TONES[i.tone] || RATIO_TONES.slate }))
  return (
    <div>
      <div className="flex justify-between items-end mb-2">
        <span className="text-xs font-semibold text-slate-700">สัดส่วน</span>
        <span className="text-xs font-mono font-medium text-slate-500 tabular-nums">รวม {total.toLocaleString()} {unit}</span>
      </div>
      <div className="w-full h-8 bg-slate-100 rounded-xl overflow-hidden flex gap-0.5 p-1">
        {withPct.map((i) => (
          <div key={i.name} className={`h-full ${i.t.bar} rounded-lg flex items-center justify-center transition-all duration-700`}
            style={{ width: `${i.pct}%` }}>
            {i.pct >= 8 && <span className="text-white text-[11px] font-bold font-mono tabular-nums">{i.pct.toFixed(1)}%</span>}
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {withPct.map((i) => (
          <div key={i.name} className={`p-4 rounded-xl ${i.t.soft}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-3 h-3 rounded-full shrink-0 ${i.t.dot}`} />
                <span className={`text-sm font-bold truncate ${i.t.label}`}>{i.name}</span>
              </div>
              <div className="text-right font-mono shrink-0">
                <span className={`text-xl font-extrabold tracking-tight tabular-nums ${i.t.value}`}>{i.pct.toFixed(1)}%</span>
                <span className={`text-xs ml-1.5 font-medium tabular-nums ${i.t.sub}`}>({i.value.toLocaleString()} {unit})</span>
              </div>
            </div>
            <div className={`mt-2 w-full h-3 rounded-full overflow-hidden ${i.t.track}`}>
              <div className={`h-full rounded-full ${i.t.bar}`} style={{ width: `${i.pct}%` }} />
            </div>
            {i.description && <p className={`text-[11px] mt-2 ${i.t.desc}`}>{i.description}</p>}
          </div>
        ))}
      </div>

      {ratioNote && (
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-500">
          <Scale size={14} className="text-slate-400 shrink-0" />
          <span className="tabular-nums">{ratioNote}</span>
        </div>
      )}
    </div>
  )
}

// SegmentedTabs — สลับ section (จับกุม/บำบัด/ร้องเรียน) แบบ pill สไลด์ ใช้แทน native <select> ตอนตัวเลือกน้อย+คงที่
// options: [{ id, label, count }] — count (optional) โชว์เป็น badge เล็กข้างชื่อ (tabular-nums)
// ขนาดตั้งใจให้ใหญ่กว่า control อื่นในหน้า (h~48px) — เป็น control หลักที่เปลี่ยนทั้งหน้า จึงต้องเป็นจุดสายตาแรก
// slider ใช้ width = (100% - padding ซ้าย+ขวา) / จำนวนปุ่ม — แก้ p-* เมื่อไหร่ต้องแก้ค่า 0.75rem ให้ตรงกันด้วย
export function SegmentedTabs({ options, value, onChange }) {
  const idx = Math.max(0, options.findIndex((o) => o.id === value))
  return (
    <div className="relative inline-grid rounded-xl bg-slate-100 p-1.5 ring-1 ring-slate-900/[0.04]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <div
        className="absolute top-1.5 bottom-1.5 left-1.5 rounded-lg bg-white shadow-sm ring-1 ring-slate-900/[0.06] transition-transform duration-200 ease-out"
        style={{ width: `calc((100% - 0.75rem) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => {
        const active = o.id === value
        return (
          <button key={o.id} onClick={() => onChange(o.id)}
            className={`relative z-10 flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-5 py-2.5 text-[15px] font-semibold transition-colors ${
              active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {o.label}
            {o.count != null && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                active ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/70 text-slate-500'
              }`}>{o.count.toLocaleString()}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ActionBar — ดูตาราง/Export Excel/Infographic(placeholder) ใช้ร่วมทุก section ของ /situation
// hierarchy: Export = primary (ทึบ), ดูตาราง = secondary (outline), Infographic = disabled ghost
export function ActionBar({ tableOpen, onToggleTable, onExport, exporting }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button onClick={onExport} disabled={exporting}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-wait">
        <Download size={15} /> {exporting ? 'กำลังสร้างไฟล์...' : 'Export Excel'}
      </button>
      <button onClick={onToggleTable}
        className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-lg ring-1 text-sm font-medium transition-colors ${
          tableOpen ? 'ring-slate-300 bg-slate-50 text-slate-900' : 'ring-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}>
        <Table2 size={15} /> {tableOpen ? 'ซ่อนตาราง' : 'ดูตาราง'}
      </button>
      <button disabled title="เร็วๆนี้ — ตาม template PDF"
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg ring-1 ring-slate-100 bg-transparent text-sm font-medium text-slate-300 cursor-not-allowed">
        <ImageIcon size={15} /> Infographic
      </button>
    </div>
  )
}

// TablePager — ใช้ร่วมทุกตารางรายละเอียดของ /situation
export function TablePager({ page, totalPages, total, onPrev, onNext }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500 bg-slate-50/50">
      <span className="tabular-nums">หน้า {page} / {totalPages} · {total.toLocaleString()} รายการ</span>
      <div className="flex gap-1.5">
        <button onClick={onPrev} disabled={page === 1}
          className="px-3 py-1.5 rounded-md ring-1 ring-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          ก่อนหน้า
        </button>
        <button onClick={onNext} disabled={page === totalPages}
          className="px-3 py-1.5 rounded-md ring-1 ring-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          ถัดไป
        </button>
      </div>
    </div>
  )
}
