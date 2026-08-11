import { useState, useMemo } from 'react'
import {
  ComposedChart, Area, PieChart, Pie, Cell, Sector,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot,
} from 'recharts'
import { RefreshCw } from 'lucide-react'
import { BKN_COLORS, BKN_ORDER, getBknByDistrict } from '../utils/bknMapping'
import { MONTH_TH_SHORT } from '../utils/constants'
import FilterPill from './FilterPill'

const BKN_LIST = BKN_ORDER.filter(b => b !== 'ไม่ระบุ')
const FISCAL_MONTHS = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9]   // ปีงบ ต.ค.→ก.ย.
const BEH_KEYS = ['เสพ', 'ค้า', 'เสพ/ค้า', 'ผลิต']

// palette — slate + emerald + amber + rose เท่านั้น
const BEH_COLOR = { 'เสพ': '#64748b', 'ค้า': '#f59e0b', 'เสพ/ค้า': '#e11d48', 'ผลิต': '#059669' }

function Panel({ children }) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-slate-200 p-6 md:p-8">{children}</div>
  )
}

function renderActiveShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector cx={cx} cy={cy} innerRadius={innerRadius - 3} outerRadius={outerRadius + 10}
      startAngle={startAngle} endAngle={endAngle} fill={fill} />
  )
}

/**
 * Section 2 — สถิติเหตุการณ์ยาเสพติด (จาก drug_incidents)
 * groupBy: 'bkn' (ภาพรวม) | 'district' (drill-down ระดับเขต)
 * baseColor: สีฐานเมื่อ groupBy='district' (ใช้สี บก.น. ที่ drill เข้าไป)
 */
export default function BknDrugStats({ incidents = [], onDrilldown, groupBy = 'bkn', baseColor = '#6366f1', compact = false }) {
  const isDistrict = groupBy === 'district'

  const fiscalYears = useMemo(() => {
    const s = new Set()
    incidents.forEach(r => { if (r.fiscal_year) s.add(r.fiscal_year) })
    return Array.from(s).sort((a, b) => b - a)
  }, [incidents])
  const latestFy = fiscalYears[0]
  const prevFy = fiscalYears[1]

  const rows = useMemo(
    () => incidents.map(r => ({ ...r, _bkn: getBknByDistrict(r.district) })),
    [incidents])

  // config การจัดกลุ่ม (บก.น. หรือ เขต)
  const g = useMemo(() => {
    if (isDistrict) {
      const list = [...new Set(rows.map(r => r.district).filter(Boolean))].sort()
      return { list, keyOf: r => r.district, allLabel: 'ทุกเขต', noun: 'เขต', colorOf: () => baseColor, drill: false }
    }
    return { list: BKN_LIST, keyOf: r => r._bkn, allLabel: 'ทุก บก.น.', noun: 'กองบังคับการ', colorOf: n => BKN_COLORS[n], drill: true }
  }, [rows, isDistrict, baseColor])

  return (
    <>
      {!compact && (
        <div className="pt-2">
          <div className="text-[11px] font-medium uppercase tracking-widest text-slate-500">Drug incidents</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">สถิติเหตุการณ์ยาเสพติด</h2>
          <p className="text-sm text-slate-500 mt-1">
            ข้อมูลรายเหตุการณ์ · ปีงบ {fiscalYears.length ? `${fiscalYears[fiscalYears.length - 1]}–${fiscalYears[0]}` : '—'}
          </p>
        </div>
      )}

      <TrendChart rows={rows} g={g} fiscalYears={fiscalYears} latestFy={latestFy} prevFy={prevFy} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BehaviorDonut rows={rows} g={g} fiscalYears={fiscalYears} latestFy={latestFy} />
        <TopChart rows={rows} g={g} fiscalYears={fiscalYears} onDrilldown={onDrilldown} />
      </div>
    </>
  )
}

/* ─────────── 1. TREND (2 เส้น เปรียบเทียบปี) ─────────── */
function TrendChart({ rows, g, fiscalYears, latestFy, prevFy }) {
  const [keyF, setKeyF] = useState('all')
  const [yearF, setYearF] = useState(latestFy ? String(latestFy) : 'all')
  const [prevYearF, setPrevYearF] = useState(prevFy ? String(prevFy) : '')

  const monthCount = (fy, key) => {
    const m = {}; FISCAL_MONTHS.forEach(mo => { m[mo] = 0 })
    rows.forEach(r => {
      if (String(r.fiscal_year) !== String(fy)) return
      if (key !== 'all' && g.keyOf(r) !== key) return
      if (!r.received_date) return
      const mo = parseInt(r.received_date.slice(5, 7))
      if (m[mo] !== undefined) m[mo]++
    })
    return m
  }

  const data = useMemo(() => {
    if (yearF === 'all') return null
    const cur = monthCount(yearF, keyF)
    const prev = prevYearF ? monthCount(prevYearF, keyF) : null
    return FISCAL_MONTHS.map(mo => ({ label: MONTH_TH_SHORT[mo], cur: cur[mo], ...(prev ? { prev: prev[mo] } : {}) }))
  }, [rows, yearF, keyF, prevYearF])   // eslint-disable-line react-hooks/exhaustive-deps

  const peakCur = useMemo(() => data?.reduce((mx, d) => (d.cur > (mx?.cur ?? -1) ? d : mx), null), [data])
  const peakPrev = useMemo(() => (data && prevYearF) ? data.reduce((mx, d) => ((d.prev ?? -1) > (mx?.prev ?? -1) ? d : mx), null) : null, [data, prevYearF])

  const yearOpts = [['all', 'เลือกปี'], ...fiscalYears.map(y => [String(y), `ปี ${y}`])]
  const prevOpts = fiscalYears.map(y => [String(y), `ปี ${y}`])

  return (
    <Panel>
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-lg font-semibold tracking-tight text-slate-900">แนวโน้มรายเดือน</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterPill variant="white" value={keyF} onChange={setKeyF}
            options={[['all', g.allLabel], ...g.list.map(b => [b, b])]} />
          <FilterPill variant="slate" value={yearF} onChange={setYearF} options={yearOpts} />
          <span className="text-xs font-semibold text-slate-500">เปรียบเทียบปี</span>
          <FilterPill variant="amber" value={prevYearF} onChange={setPrevYearF} options={prevOpts} />
          <button className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-blue-600 shadow-sm transition">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {data ? (
        <ResponsiveContainer width="100%" height={290}>
          <ComposedChart data={data} margin={{ top: 24, right: 24, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="curGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#334155" stopOpacity={0.16} />
                <stop offset="100%" stopColor="#334155" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="prevGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
              formatter={(v, n) => [v.toLocaleString(), n === 'cur' ? `ปี ${yearF}` : `ปี ${prevYearF}`]} />
            {prevYearF && (
              <Area type="monotone" dataKey="prev" stroke="#f59e0b" strokeWidth={2}
                strokeDasharray="5 4" fill="url(#prevGrad)" dot={false} name="prev" />
            )}
            <Area type="monotone" dataKey="cur" stroke="#334155" strokeWidth={2.5}
              fill="url(#curGrad)" dot={false} activeDot={{ r: 5, fill: '#334155' }} name="cur" />
            {peakPrev && peakPrev.prev > 0 && (
              <ReferenceDot x={peakPrev.label} y={peakPrev.prev} r={4} fill="#f59e0b" stroke="#fff" strokeWidth={2}
                label={{ value: peakPrev.prev.toLocaleString(), position: 'top', fontSize: 11, fontWeight: 700, fill: '#b45309' }} />
            )}
            {peakCur && peakCur.cur > 0 && (
              <ReferenceDot x={peakCur.label} y={peakCur.cur} r={5} fill="#334155" stroke="#fff" strokeWidth={2}
                label={{ value: peakCur.cur.toLocaleString(), position: 'top', fontSize: 11, fontWeight: 700, fill: '#334155' }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[290px] text-slate-400 text-sm">เลือกปีเพื่อแสดงแนวโน้ม</div>
      )}
    </Panel>
  )
}

/* ─────────── 2. BEHAVIOR DONUT ─────────── */
function BehaviorDonut({ rows, g, fiscalYears, latestFy }) {
  const [keyF, setKeyF] = useState('all')
  const [yearF, setYearF] = useState(latestFy ? String(latestFy) : 'all')   // default = ปีงบล่าสุด
  const [activeIdx, setActiveIdx] = useState(null)

  const data = useMemo(() => {
    const counts = { 'เสพ': 0, 'ค้า': 0, 'เสพ/ค้า': 0, 'ผลิต': 0 }
    rows.forEach(r => {
      if (keyF !== 'all' && g.keyOf(r) !== keyF) return
      if (yearF !== 'all' && String(r.fiscal_year) !== yearF) return
      if (!r.behaviors) return
      String(r.behaviors).split(',').forEach(k => { const t = k.trim(); if (counts[t] !== undefined) counts[t]++ })
    })
    return BEH_KEYS.filter(k => counts[k] > 0).map(k => ({ name: k, value: counts[k], color: BEH_COLOR[k] || '#64748b' }))
  }, [rows, keyF, yearF])   // eslint-disable-line react-hooks/exhaustive-deps
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <Panel>
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-lg font-semibold tracking-tight text-slate-900">สัดส่วนพฤติการณ์ยาเสพติด</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterPill variant="white" value={keyF} onChange={setKeyF}
            options={[['all', g.allLabel], ...g.list.map(b => [b, b])]} />
          <FilterPill variant="white" value={yearF} onChange={setYearF}
            options={[['all', 'ทุกปี'], ...fiscalYears.map(y => [String(y), `ปี ${y}`])]} />
        </div>
      </div>
      {data.length > 0 ? (
        <>
          <div className="relative" onClick={() => setActiveIdx(null)}>
            <ResponsiveContainer width="100%" height={195}>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={52} outerRadius={90} paddingAngle={2} strokeWidth={0}
                  activeIndex={activeIdx} activeShape={renderActiveShape}
                  onClick={(_, i, e) => { e.stopPropagation(); setActiveIdx(p => p === i ? null : i) }}
                  label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                    if (percent < 0.05 || index === activeIdx) return null
                    const R = Math.PI / 180
                    const r = innerRadius + (outerRadius - innerRadius) * 0.55
                    return (
                      <text x={cx + r * Math.cos(-midAngle * R)} y={cy + r * Math.sin(-midAngle * R)}
                        fill="white" textAnchor="middle" dominantBaseline="central"
                        style={{ fontSize: 12, fontWeight: 800, pointerEvents: 'none' }}>
                        {(percent * 100).toFixed(0)}%
                      </text>
                    )
                  }}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.color}
                      style={{ opacity: activeIdx === null || activeIdx === i ? 1 : 0.25, cursor: 'pointer', transition: 'opacity 0.2s' }} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-xl font-extrabold text-slate-800 tabular-nums">{total.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-1">รวม</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {data.map(d => (
              <div key={d.name} className="flex items-center gap-2 p-2.5 rounded-xl"
                style={{ background: d.color + '10', border: `1px solid ${d.color}20` }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-slate-500">{d.name}</div>
                  <div className="text-base font-extrabold text-slate-800 tabular-nums leading-snug">{d.value.toLocaleString()}</div>
                </div>
                <span className="text-xs font-bold flex-shrink-0" style={{ color: d.color }}>
                  {total > 0 ? ((d.value / total) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-72 text-slate-400 text-sm">ไม่มีข้อมูล</div>
      )}
    </Panel>
  )
}

/* ─────────── 3. TOP 5 (บก.น. หรือ เขต) ─────────── */
function TopChart({ rows, g, fiscalYears, onDrilldown }) {
  const [yearF, setYearF] = useState('all')

  const top5 = useMemo(() => {
    const m = {}
    rows.forEach(r => {
      if (yearF !== 'all' && String(r.fiscal_year) !== yearF) return
      const k = g.keyOf(r)
      if (!k || k === 'ไม่ระบุ') return
      m[k] = (m[k] || 0) + 1
    })
    return Object.entries(m).map(([name, count]) => ({ name, count, color: g.colorOf(name) || '#94a3b8' }))
      .sort((a, b) => b.count - a.count).slice(0, 5)
  }, [rows, yearF, g])
  const maxCount = top5[0]?.count || 1

  return (
    <Panel>
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">5 อันดับ{g.noun}ที่มีคดีสูงสุด</h3>
          <p className="text-sm text-slate-500 mt-1">
            {g.drill ? 'กองบัญชาการตำรวจนครบาล · คลิกเพื่อดูรายละเอียด' : 'เขตในสังกัด · เรียงตามจำนวนคดี'}
          </p>
        </div>
        <FilterPill variant="white" value={yearF} onChange={setYearF}
          options={[['all', 'ทุกปี'], ...fiscalYears.map(y => [String(y), `ปี ${y}`])]} />
      </div>
      <div className="space-y-3.5">
        {top5.length > 0 && top5[0].count > 0 ? top5.map((d, i) => {
          const barW = (d.count / maxCount) * 100
          const barColor = i === 0 ? '#f59e0b' : '#64748b'   // อันดับ 1 = amber, ที่เหลือ slate
          return (
            <div key={d.name} onClick={() => g.drill && onDrilldown?.(d.name)}
              className={g.drill ? 'cursor-pointer group' : ''}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                <span className="font-semibold text-slate-800 text-sm">{d.name}</span>
              </div>
              <div className="relative h-7 bg-slate-100 rounded-md overflow-hidden">
                <div className="h-full rounded-md transition-all"
                  style={{ width: `${Math.max(barW, 18)}%`, background: barColor }} />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded-full bg-white/90 text-xs font-bold tabular-nums"
                  style={{ color: barColor }}>
                  {d.count.toLocaleString()} เรื่อง
                </span>
              </div>
            </div>
          )
        }) : (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">ไม่มีข้อมูล</div>
        )}
      </div>
    </Panel>
  )
}
