import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { AlertCircle, CheckCircle2, TrendingUp, Activity, Clock, BarChart2 } from 'lucide-react'
import { MONTH_LONG } from '../utils/constants'
import PeriodBadge from './PeriodBadge'

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtThai = iso => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()} ${MONTH_LONG[d.getMonth()+1]} ${d.getFullYear()+543}`
}
const n  = v => Number(v ?? 0)
const fmt = v => n(v).toLocaleString()
const pct = (a, b) => n(b) > 0 ? ((n(a)/n(b))*100).toFixed(1)+'%' : '—'
const getSummary = rows => rows.find(r => r.group_no == null) ?? null
const getGroups  = rows => rows.filter(r => r.group_no != null).sort((a,b) => a.group_no - b.group_no)

// ── drug metadata ────────────────────────────────────────────────────────────
const DRUG_META = [
  { key:'drug_yaba',     label:'ยาบ้า',     color:'#EF4444', unit:'เม็ด' },
  { key:'drug_ice',      label:'ไอซ์',      color:'#0EA5E9', unit:'กรัม' },
  { key:'drug_heroin',   label:'เฮโรอีน',  color:'#7C3AED', unit:'กรัม' },
  { key:'drug_cannabis', label:'กัญชา',    color:'#22C55E', unit:'กรัม' },
  { key:'drug_kratom',   label:'กระท่อม',  color:'#65A30D', unit:'กรัม' },
  { key:'drug_inhalant', label:'สารระเหย', color:'#0891B2', unit:'กรัม' },
  { key:'drug_cough',    label:'ยาแก้ไอ',  color:'#D97706', unit:'กรัม' },
  { key:'drug_none',     label:'ไม่พบ',    color:'#94A3B8', unit:'' },
  { key:'drug_other',    label:'อื่นๆ',    color:'#6366F1', unit:'กรัม' },
]

// ── aggregate helpers ────────────────────────────────────────────────────────
const NUM_KEYS = [
  'complaints','processed','found','not_found','not_in_area','investigating','deceased',
  'arrested','more_invest','rehab','framed','closed','action_other',
  'charge_use','charge_possess','charge_sell','charge_possess_sell','charge_none',
  'drug_yaba','drug_ice','drug_heroin','drug_cannabis','drug_kratom',
  'drug_inhalant','drug_cough','drug_none','drug_other',
]
function sumRows(arr) {
  if (!arr.length) return null
  const result = {}
  NUM_KEYS.forEach(k => { result[k] = arr.reduce((s, r) => s + n(r[k]), 0) })
  result.group_no   = null
  result.group_name = 'รวมทั้งหมด'
  result.percent    = result.complaints > 0 ? ((result.processed / result.complaints) * 100) : 0
  return result
}
function sumGroups(arr) {
  const map = {}
  arr.forEach(r => {
    if (r.group_no == null) return
    if (!map[r.group_no]) {
      map[r.group_no] = { group_no: r.group_no, group_name: `กลุ่ม ${r.group_no}` }
      NUM_KEYS.forEach(k => { map[r.group_no][k] = 0 })
    }
    NUM_KEYS.forEach(k => { map[r.group_no][k] += n(r[k]) })
  })
  return Object.values(map).sort((a, b) => a.group_no - b.group_no)
}

// ── sub-components ───────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, gradient, delta }) {
  return (
    <div className={`bg-gradient-to-br ${gradient} text-white rounded-2xl p-5 shadow-md relative overflow-hidden`}>
      <div className="absolute -right-2 -top-3 opacity-10 text-8xl select-none pointer-events-none">
        {icon}
      </div>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80 mb-2 leading-tight">{label}</div>
      <div className="text-4xl font-black leading-none">{value}</div>
      {sub && <div className="text-xs mt-2 opacity-75">{sub}</div>}
      {delta != null && delta !== 0 && (
        <div className={`inline-flex items-center gap-1 mt-2 text-xs font-bold px-2 py-0.5 rounded-full ${
          delta > 0 ? 'bg-white/25' : 'bg-black/20'
        }`}>
          {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString()}
        </div>
      )}
    </div>
  )
}

function SecHead({ emoji, title, sub }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center text-lg flex-shrink-0 shadow">
        {emoji}
      </div>
      <div>
        <div className="font-bold text-slate-800 text-base leading-tight">{title}</div>
        {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-sm max-w-[200px]">
      {label && <div className="font-semibold text-slate-700 mb-2 text-xs">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color || p.fill }} />
          <span className="text-slate-500 text-xs truncate">{p.name}:</span>
          <span className="font-bold text-slate-800 text-xs">{n(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function DonutChart({ data }) {
  const [active, setActive] = useState(null)
  const total = data.reduce((s, d) => s + n(d.value), 0)
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%"
            innerRadius={65} outerRadius={98} paddingAngle={2}
            onClick={(_, i) => setActive(p => p === i ? null : i)}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color}
                style={{ opacity: active === null || active === i ? 1 : 0.3, cursor:'pointer', transition:'opacity .2s' }}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1">
        {data.map((d, i) => (
          <button key={d.name} onClick={() => setActive(p => p === i ? null : i)}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-all text-left"
            style={active === i ? { background: d.color+'18', outline:`2px solid ${d.color}50` } : {}}
          >
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
            <div className="min-w-0">
              <div className="text-xs text-slate-600 leading-tight truncate">{d.name}</div>
              <div className="font-bold text-slate-800 text-sm leading-tight">{fmt(d.value)}</div>
              <div className="text-[10px] font-medium" style={{ color: d.color }}>{pct(d.value, total)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function EmptyChart({ msg = 'ไม่มีข้อมูล' }) {
  return (
    <div className="flex items-center justify-center h-28 text-slate-400 text-sm bg-slate-50 rounded-xl">
      {msg}
    </div>
  )
}

function HBarChart({ data, height }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, data.length * 48)}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 36, top: 2, bottom: 2 }}>
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => v.toLocaleString()} />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill:'#475569' }} width={88} />
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" name="จำนวน" radius={[0,6,6,0]}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── main ─────────────────────────────────────────────────────────────────────
export default function Rpt114Dashboard() {
  const [years,        setYears]        = useState([])
  const [selectedYear, setSelectedYear] = useState('all')
  const [compareOn,    setCompareOn]    = useState(false)
  const [rows,         setRows]         = useState([])
  const [prevRows,     setPrevRows]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [lastUpdated,  setLastUpdated]  = useState(null)

  // fetch distinct years + last uploaded_at
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.from('report_114').select('fiscal_year')
      if (!data || data.length === 0) { setLoading(false); return }
      const ys = [...new Set(data.map(r => r.fiscal_year))].filter(Boolean).sort((a,b) => b - a)
      setYears(ys)
      // selectedYear stays 'all' (default)
    }
    init()
    supabase.from('upload_batches').select('uploaded_at')
      .eq('target_table','report_114')
      .order('uploaded_at',{ ascending:false }).limit(1)
      .then(({ data }) => setLastUpdated(data?.[0]?.uploaded_at ?? null))
  }, [])

  // fetch rows (all years when selectedYear==='all', else specific year)
  useEffect(() => {
    setLoading(true)
    const doFetch = async () => {
      let q = supabase.from('report_114').select('*')
      if (selectedYear !== 'all') q = q.eq('fiscal_year', selectedYear)
      const { data } = await q
      setRows(data ?? [])

      if (compareOn && selectedYear !== 'all' && years.length >= 2) {
        const prev = years.find(y => y < selectedYear)
        if (prev) {
          const { data: pd } = await supabase.from('report_114').select('*').eq('fiscal_year', prev)
          setPrevRows(pd ?? [])
        } else {
          setPrevRows([])
        }
      } else {
        setPrevRows([])
      }
      setLoading(false)
    }
    doFetch()
  }, [selectedYear, compareOn, years])

  const summary = useMemo(() => {
    if (selectedYear !== 'all') return getSummary(rows)
    return sumRows(rows.filter(r => r.group_no == null))
  }, [rows, selectedYear])

  const groups = useMemo(() => {
    if (selectedYear !== 'all') return getGroups(rows)
    return sumGroups(rows)
  }, [rows, selectedYear])

  const prevSummary = useMemo(() => getSummary(prevRows), [prevRows])

  const periodLabel = useMemo(() => {
    if (selectedYear !== 'all') return summary?.period ?? null
    if (!years.length) return null
    const sorted = [...years].sort((a, b) => a - b)
    return sorted.length === 1
      ? `ปีงบ ${sorted[0]}`
      : `ปีงบ ${sorted[0]}–${sorted[sorted.length - 1]}`
  }, [selectedYear, years, summary])

  const { drugData, drugLogScale } = useMemo(() => {
    if (!summary) return { drugData:[], drugLogScale:false }
    const vals = DRUG_META
      .map(d => ({ ...d, value: n(summary[d.key]) }))
      .filter(d => d.value > 0)
      .sort((a,b) => b.value - a.value)
    if (!vals.length) return { drugData:[], drugLogScale:false }
    const nonZero = vals.map(d => d.value)
    const useLog = nonZero.length >= 2 && Math.max(...nonZero) / Math.min(...nonZero) > 20
    return { drugData: vals, drugLogScale: useLog }
  }, [summary])

  const inspectionData = useMemo(() => [
    { name:'พบพฤติการณ์',       value: n(summary?.found),         color:'#EF4444' },
    { name:'ไม่พบพฤติการณ์',    value: n(summary?.not_found),     color:'#94A3B8' },
    { name:'ไม่พบตัวในพื้นที่',  value: n(summary?.not_in_area),   color:'#0EA5E9' },
    { name:'อยู่ระหว่างสืบสวน', value: n(summary?.investigating), color:'#F59E0B' },
    { name:'เสียชีวิต',          value: n(summary?.deceased),      color:'#1E293B' },
  ].filter(d => d.value > 0), [summary])

  const actionData = useMemo(() => [
    { label:'จับกุม',          value: n(summary?.arrested),    color:'#DC2626' },
    { label:'บำบัด',           value: n(summary?.rehab),       color:'#F59E0B' },
    { label:'กลั่นแกล้ง',      value: n(summary?.framed),      color:'#991B1B' },
    { label:'สืบสวนเพิ่มเติม', value: n(summary?.more_invest), color:'#0EA5E9' },
    { label:'ยุติเรื่อง',      value: n(summary?.closed),      color:'#64748B' },
    { label:'อื่นๆ',           value: n(summary?.action_other),color:'#94A3B8' },
  ].filter(d => d.value > 0).sort((a,b) => b.value - a.value), [summary])

  const chargeData = useMemo(() => [
    { name:'ฐานเสพ',           value: n(summary?.charge_use),          color:'#8B5CF6' },
    { name:'ครอบครอง',         value: n(summary?.charge_possess),      color:'#6366F1' },
    { name:'จำหน่าย',          value: n(summary?.charge_sell),         color:'#0284C7' },
    { name:'ครอบครอง+จำหน่าย', value: n(summary?.charge_possess_sell), color:'#0D9488' },
    { name:'ไม่แจ้งข้อหา',     value: n(summary?.charge_none),         color:'#94A3B8' },
  ].filter(d => d.value > 0), [summary])

  const groupChartData = useMemo(() =>
    groups.map(g => ({
      name: `กลุ่ม ${g.group_no}`,
      ดำเนินการแล้ว: n(g.processed),
      ยังไม่เสร็จ: Math.max(0, n(g.complaints) - n(g.processed)),
    }))
  , [groups])

  const delta = key => (compareOn && prevSummary)
    ? n(summary?.[key]) - n(prevSummary?.[key])
    : null

  // loading
  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-3" />
      <span className="text-sm">กำลังโหลดข้อมูล RPT_114...</span>
    </div>
  )

  // empty state
  if (!loading && (!rows.length || !summary)) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
      <BarChart2 size={48} className="mb-3 text-slate-300" />
      <div className="text-base font-semibold text-slate-500">ยังไม่มีข้อมูล RPT_114</div>
      <div className="text-sm mt-1 text-slate-400">กรุณาอัปโหลดไฟล์ RPT_114 ผ่านปุ่ม "นำเข้า RPT_114" ด้านบน</div>
    </div>
  )

  return (
    <div className="space-y-6 mt-8">

      {/* ── Section title ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg">
            📋
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-slate-800">รายงาน RPT_114 รายละเอียด</h2>
            <p className="text-sm text-slate-500 mt-0.5">ผลการดำเนินการตามข้อร้องเรียน จำแนกตามกลุ่ม 1–5</p>
          </div>
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-full border border-slate-200">
            <Clock size={12} />
            <span>ข้อมูลอัปเดต: {fmtThai(lastUpdated)}</span>
          </div>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-md">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">ปีงบประมาณ:</label>
            <select
              value={selectedYear}
              onChange={e => {
                const v = e.target.value
                setSelectedYear(v === 'all' ? 'all' : Number(v))
                if (v === 'all') setCompareOn(false)
              }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="all">รวมทุกปีงบ</option>
              {years.map(y => <option key={y} value={y}>ปีงบ {y}</option>)}
            </select>
          </div>
          {selectedYear !== 'all' && years.length >= 2 && (
            <button onClick={() => setCompareOn(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                compareOn ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
              }`}>
              <Activity size={14} />
              เทียบกับปีก่อนหน้า
            </button>
          )}
          {compareOn && prevSummary && (
            <span className="text-xs text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
              เปรียบเทียบกับปีงบ {years.find(y => y < selectedYear)}
            </span>
          )}
        </div>
        {periodLabel && <div className="mt-2"><PeriodBadge period={periodLabel} /></div>}
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<AlertCircle size={56}/>}  label="เรื่องร้องเรียนทั้งหมด"
          value={fmt(summary?.complaints)}  sub="รวมทุกกลุ่ม"
          gradient="from-blue-600 to-blue-500" delta={delta('complaints')} />
        <KpiCard icon={<CheckCircle2 size={56}/>} label="ดำเนินการแล้ว"
          value={fmt(summary?.processed)}
          sub={`คิดเป็น ${pct(summary?.processed, summary?.complaints)}`}
          gradient="from-emerald-600 to-emerald-500" delta={delta('processed')} />
        <KpiCard icon={<TrendingUp size={56}/>}   label="กำลังจับกุม"
          value={fmt(summary?.arrested)}
          sub={`${pct(summary?.arrested, summary?.complaints)} ของเรื่องทั้งหมด`}
          gradient="from-rose-600 to-rose-500" delta={delta('arrested')} />
        <KpiCard icon={<Activity size={56}/>}     label="ยาบ้าที่ยึดได้"
          value={fmt(summary?.drug_yaba)}   sub="เม็ด"
          gradient="from-amber-500 to-orange-500" delta={delta('drug_yaba')} />
      </div>

      {/* ── Inspection + Action ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-8">
          <SecHead emoji="🔍" title="ผลตรวจสอบพฤติการณ์" sub="แถวรวมทั้งหมด · คลิกกราฟเพื่อดูรายละเอียด" />
          {inspectionData.length > 0 ? <DonutChart data={inspectionData} /> : <EmptyChart />}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-8">
          <SecHead emoji="⚖️" title="ผลดำเนินการ" sub="เรียงจากมาก → น้อย" />
          {actionData.length > 0
            ? <HBarChart data={actionData} />
            : <EmptyChart />}
        </div>
      </div>

      {/* ── Charge pie ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-8">
        <SecHead emoji="📜" title="ฐานความผิด" sub="สัดส่วนข้อหาที่แจ้งดำเนินคดี" />
        {chargeData.length > 0
          ? <div className="max-w-lg mx-auto"><DonutChart data={chargeData} /></div>
          : <EmptyChart />}
      </div>

      {/* ── Drug chart ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-8">
        <div className="flex items-start justify-between gap-3 mb-4">
          <SecHead emoji="💊" title="ปริมาณยาเสพติดที่ยึดได้" sub="หน่วย: เม็ด / กรัม" />
          {drugLogScale && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full flex-shrink-0 mt-1">
              log scale
            </span>
          )}
        </div>
        {drugData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(160, drugData.length * 44)}>
            <BarChart data={drugData} layout="vertical" margin={{ left: 4, right: 48, top: 2, bottom: 2 }}>
              <XAxis type="number"
                scale={drugLogScale ? 'log' : 'auto'}
                domain={drugLogScale ? [0.5, 'auto'] : [0, 'auto']}
                allowDataOverflow={drugLogScale}
                tick={{ fontSize: 11 }}
                tickFormatter={v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v.toLocaleString()}
              />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill:'#475569' }} width={88} />
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="จำนวน" radius={[0,6,6,0]}>
                {drugData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyChart msg="ไม่มีข้อมูลยาเสพติด" />}
      </div>

      {/* ── Groups stacked bar ── */}
      {groups.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-8">
          <SecHead emoji="📊" title="เทียบบุคคลผู้ถูกร้องเรียนรายกลุ่ม 1–5" sub="เรื่องร้องเรียน เปรียบเทียบกับ ดำเนินการแล้วของแต่ละกลุ่ม" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={groupChartData} margin={{ top:10, right:20, bottom:5, left:10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize:12, fill:'#475569' }} />
              <YAxis tick={{ fontSize:11 }} tickFormatter={v => v.toLocaleString()} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ดำเนินการแล้ว" stackId="a" fill="#10B981" />
              <Bar dataKey="ยังไม่เสร็จ" stackId="a" fill="#E2E8F0" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-5 justify-center mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />ดำเนินการแล้ว
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-slate-200 inline-block" />ยังไม่เสร็จ
            </span>
          </div>
        </div>
      )}

      {/* ── Detail table ── */}
      {(groups.length > 0 || summary) && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-5 text-white">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-2xl">📋</div>
              <div>
                <div className="font-bold text-lg">ตารางรายละเอียดรายกลุ่ม</div>
                <div className="text-xs text-slate-300 mt-0.5">กลุ่ม 1–5 + รวมทั้งหมด · {selectedYear === 'all' ? 'รวมทุกปีงบประมาณ' : `ปีงบ ${selectedYear}`}</div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 780 }}>
              <thead>
                <tr className="bg-slate-800 text-white text-xs font-bold uppercase">
                  <th className="text-left px-5 py-4">กลุ่ม</th>
                  <th className="text-right px-4 py-4">ร้องเรียน</th>
                  <th className="text-right px-4 py-4">ดำเนินการ</th>
                  <th className="text-right px-4 py-4 text-blue-300">%</th>
                  <th className="text-right px-4 py-4">พบพฤติการณ์</th>
                  <th className="text-right px-4 py-4">ไม่พบ</th>
                  <th className="text-right px-4 py-4">ไม่พบตัว</th>
                  <th className="text-right px-4 py-4">สืบสวน</th>
                  <th className="text-right px-4 py-4 text-rose-300">จับกุม</th>
                  <th className="text-right px-4 py-4">บำบัด</th>
                  <th className="text-right px-4 py-4">กลั่นแกล้ง</th>
                  <th className="text-right px-4 py-4">ยุติ</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, i) => (
                  <tr key={g.id ?? g.group_no}
                    className={`border-t border-slate-100 ${i%2 ? 'bg-slate-50/60':'bg-white'} hover:bg-blue-50/40 transition`}>
                    <td className="px-5 py-4 font-semibold text-slate-700">{g.group_name}</td>
                    <td className="text-right px-4 py-4 text-blue-700 font-semibold">{fmt(g.complaints)}</td>
                    <td className="text-right px-4 py-4 text-emerald-700 font-semibold">{fmt(g.processed)}</td>
                    <td className="text-right px-4 py-4">
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        {pct(g.processed, g.complaints)}
                      </span>
                    </td>
                    <td className="text-right px-4 py-4 text-rose-600 font-semibold">{fmt(g.found)}</td>
                    <td className="text-right px-4 py-4">{fmt(g.not_found)}</td>
                    <td className="text-right px-4 py-4">{fmt(g.not_in_area)}</td>
                    <td className="text-right px-4 py-4 text-amber-600">{fmt(g.investigating)}</td>
                    <td className="text-right px-4 py-4 text-rose-700 font-bold">{fmt(g.arrested)}</td>
                    <td className="text-right px-4 py-4">{fmt(g.rehab)}</td>
                    <td className="text-right px-4 py-4">{fmt(g.framed)}</td>
                    <td className="text-right px-4 py-4 text-slate-500">{fmt(g.closed)}</td>
                  </tr>
                ))}
                {summary && (
                  <tr className="border-t-2 border-slate-300 bg-gradient-to-r from-blue-800 to-blue-700 text-white font-bold text-sm">
                    <td className="px-5 py-5 text-base">รวมทั้งหมด</td>
                    <td className="text-right px-4 py-5">{fmt(summary.complaints)}</td>
                    <td className="text-right px-4 py-5">{fmt(summary.processed)}</td>
                    <td className="text-right px-4 py-5 text-yellow-200 text-xs">{pct(summary.processed, summary.complaints)}</td>
                    <td className="text-right px-4 py-5">{fmt(summary.found)}</td>
                    <td className="text-right px-4 py-5">{fmt(summary.not_found)}</td>
                    <td className="text-right px-4 py-5">{fmt(summary.not_in_area)}</td>
                    <td className="text-right px-4 py-5">{fmt(summary.investigating)}</td>
                    <td className="text-right px-4 py-5 text-red-200">{fmt(summary.arrested)}</td>
                    <td className="text-right px-4 py-5">{fmt(summary.rehab)}</td>
                    <td className="text-right px-4 py-5">{fmt(summary.framed)}</td>
                    <td className="text-right px-4 py-5">{fmt(summary.closed)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
