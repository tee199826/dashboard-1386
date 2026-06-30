import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LabelList,
} from 'recharts'
import {
  BarChart2, Activity, AlertTriangle, Users, RefreshCw, Calendar,
  X, ArrowRight, Maximize2,
} from 'lucide-react'
import { BKN_COLORS } from '../utils/bknMapping'
import FilterPill from './FilterPill'

const isSpw = b => b?.includes('สปพ')

// ดึงปีงบจาก period string "01 ต.ค. 68-30 เม.ย. 69" → 2569 (ต.ค.=เริ่มปีงบถัดไป)
function fiscalYearOf(period) {
  if (!period) return null
  const m = String(period).match(/(\d{2})\s*$/)        // เลขปี 2 หลักท้ายสุด
  if (!m) return null
  return 2500 + parseInt(m[1], 10)
}

/**
 * Section 1 — ผลการดำเนินการตาม บก.น. (จาก bkn_summary / RPT_115_B)
 * KPI ×4 + stacked bar บก.น.1-9 (+สปพ.) คลิกแท่ง → popover → ปุ่ม "ดูระดับ สน."
 */
export default function BknSection1({ onDrilldown, onPeriodReady, lastUpload, totalReceived = 0 }) {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [popup, setPopup] = useState(null)   // { row, x, y, w }
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey(k => k + 1)

  useEffect(() => {
    const go = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('bkn_summary')
        .select('bkn,total,done,pending,period')
        .eq('report_id', '115_B')
        .limit(500)
      setRows(data || [])
      const ps = [...new Set((data || []).map(r => r.period).filter(Boolean))].sort()
      if (ps.length > 0) { setSelectedPeriod(ps[ps.length - 1]); onPeriodReady?.(ps[ps.length - 1]) }
      setLoading(false)
    }
    go()
  }, [reloadKey])   // eslint-disable-line react-hooks/exhaustive-deps

  const periods = useMemo(
    () => [...new Set((rows || []).map(r => r.period).filter(Boolean))].sort(),
    [rows])

  // ปีงบ (distinct) — ใช้ทำ pill "ปี 2569"
  const fyOptions = useMemo(() => {
    const ys = [...new Set(periods.map(fiscalYearOf).filter(Boolean))].sort((a, b) => b - a)
    return ys.map(y => [String(y), `ปี ${y}`])
  }, [periods])
  const fy = fiscalYearOf(selectedPeriod)
  const pickFy = y => {
    const ps = periods.filter(p => String(fiscalYearOf(p)) === String(y)).sort()
    const np = ps[ps.length - 1]
    if (np) { setSelectedPeriod(np); onPeriodReady?.(np) }
  }

  const model = useMemo(() => {
    if (!rows) return null
    const fr = selectedPeriod ? rows.filter(r => r.period === selectedPeriod) : rows
    const map = {}
    fr.forEach(r => {
      if (!r.bkn) return
      if (!map[r.bkn]) map[r.bkn] = { total: 0, done: 0, pending: 0 }
      map[r.bkn].total += r.total || 0
      map[r.bkn].done += r.done || 0
      map[r.bkn].pending += r.pending || 0
    })
    const entries = Object.entries(map)
    const bknEntries = entries.filter(([b]) => !isSpw(b))
      .sort(([a], [b]) => (parseInt(a.replace(/\D+/g, '')) || 999) - (parseInt(b.replace(/\D+/g, '')) || 999))
    const spwEntries = entries.filter(([b]) => isSpw(b))
    const sum = es => es.reduce((a, [, v]) => ({
      total: a.total + v.total, done: a.done + v.done, pending: a.pending + v.pending,
    }), { total: 0, done: 0, pending: 0 })
    const bknTotals = sum(bknEntries)
    const spwTotals = sum(spwEntries)
    const mkRow = ([name, v], spw = false) => ({
      name, done: v.done, pending: v.pending, total: v.total, isSPW: spw,
      pctDone: v.total > 0 ? ((v.done / v.total) * 100).toFixed(0) : '0',
    })
    return {
      bknTotals, spwTotals,
      spwName: spwEntries[0]?.[0] || null,
      pctDone: bknTotals.total > 0 ? ((bknTotals.done / bknTotals.total) * 100).toFixed(1) : '0.0',
      pctPending: bknTotals.total > 0 ? ((bknTotals.pending / bknTotals.total) * 100).toFixed(1) : '0.0',
      chart: [...bknEntries.map(e => mkRow(e)), ...spwEntries.map(e => mkRow(e, true))],
    }
  }, [rows, selectedPeriod])

  if (loading) return (
    <Shell><div className="h-40 flex items-center justify-center text-slate-400 text-sm">
      <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mr-2" />
      กำลังโหลดข้อมูล 115_B...
    </div></Shell>
  )

  if (!model || model.chart.length === 0) return (
    <Shell><div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-800">
      <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
      ยังไม่มีข้อมูล RPT_115_B — กรุณาอัปโหลดไฟล์ที่หน้า /upload
    </div></Shell>
  )

  const { bknTotals, spwTotals, spwName, pctDone, pctPending, chart } = model

  return (
    <Shell>
      {/* ── header + filters ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex flex-col items-center justify-center flex-shrink-0">
            <span className="text-blue-700 font-extrabold text-[11px] leading-none">115</span>
            <span className="text-blue-500 font-bold text-[9px] leading-none mt-0.5">B</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">ผลการดำเนินการตาม บก.น. จำแนกตามกลุ่ม 1–5</h3>
            <p className="text-xs text-slate-400 mt-0.5">📊 ข้อมูลจาก RPT 115_B (snapshot รายเดือน · ปัจจุบันมีเฉพาะปีงบ 2569)</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterPill variant="white" icon={<Calendar size={14} className="text-slate-400" />}
            label="ปีงบประมาณ" value={String(fy || '')} onChange={pickFy} options={fyOptions}
            disabled={fyOptions.length <= 1}
            title={fyOptions.length <= 1 ? 'ข้อมูล RPT 115_B มีเฉพาะปีงบ 2569' : undefined} />
          <button onClick={reload} title="รีเฟรช"
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-300 shadow-sm transition">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          {lastUpload && (
            <span className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">
              115_B · {lastUpload}
            </span>
          )}
          <button title="เต็มจอ"
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-300 shadow-sm transition">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      {/* ── KPI ×4 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {/* card1 = ยอดรับเข้าทั้งหมด จาก drug_incidents (cumulative ทุกปี) ไม่ใช่ subset bkn_summary */}
        <Kpi icon={<BarChart2 size={20} />} bg="from-blue-700 to-blue-600"
          label="จำนวนเรื่องร้องเรียนรวมทั้งหมด"
          value={(totalReceived || (bknTotals.total + spwTotals.total)).toLocaleString()} unit="เรื่อง"
          sub="บก.น.1–9 + โรงพยาบาล สส." />
        <Kpi icon={<Activity size={20} />} bg="from-emerald-600 to-green-500"
          label="เรื่องร้องเรียนแจ้ง บก.น. ที่ดำเนินการแล้ว"
          value={bknTotals.done.toLocaleString()} unit="ดำเนินการแล้ว"
          sub={`${pctDone}% ของทั้งหมด`} />
        <Kpi icon={<AlertTriangle size={20} />} bg="from-red-600 to-rose-500"
          label="จำนวนเรื่องร้องเรียนที่ยังไม่ได้รับ"
          value={bknTotals.pending.toLocaleString()} unit="เรื่อง"
          sub={`${pctPending}% ของทั้งหมด`} />
        {spwName ? (
          <Kpi icon={<Users size={20} />} bg="from-violet-700 to-purple-600"
            label={`เรื่องร้องเรียน ${spwName}`}
            value={spwTotals.total.toLocaleString()} unit="เรื่องทั้งหมด"
            badges={[
              { label: 'เสร็จสิ้น', value: spwTotals.done.toLocaleString() },
              { label: 'ค้าง', value: spwTotals.pending.toLocaleString() },
            ]} />
        ) : (
          <Kpi icon={<Users size={20} />} bg="from-slate-400 to-slate-500"
            label="เรื่องร้องเรียน บก.สส. (191)" value="—" sub="ไม่มีข้อมูลในชุดนี้" />
        )}
      </div>

      {/* ── stacked bar ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-red-500" />
        <div className="p-5">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h4 className="text-sm font-bold text-slate-800">ผลการดำเนินการแยกตาม บก.น.</h4>
              <FilterPill variant="blue" value={String(fy || '')} onChange={pickFy} options={fyOptions}
                disabled={fyOptions.length <= 1}
                title={fyOptions.length <= 1 ? 'ข้อมูล RPT 115_B มีเฉพาะปีงบ 2569' : undefined} />
            </div>
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <Legend color="#10b981" label="เสร็จสิ้น" />
              <Legend color="#f87171" label="ค้าง" />
              <Legend color="#6366f1" label="สพป.เสร็จ" />
              <Legend color="#f59e0b" label="สพป.ค้าง" />
            </div>
          </div>
          <div className="relative">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={chart} margin={{ top: 28, right: 16, left: 0, bottom: 36 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={<PillTick />} interval={0} height={34} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
                  formatter={(v, name) => [v.toLocaleString(), name === 'done' ? 'เสร็จ' : 'ค้าง']} />
                <Bar dataKey="done" stackId="a" name="done" cursor="pointer"
                  onClick={(d) => openPopup(d, setPopup)}>
                  {chart.map((d, i) => <Cell key={i} fill={d.isSPW ? '#6366f1' : '#10b981'} />)}
                </Bar>
                <Bar dataKey="pending" stackId="a" name="pending" radius={[5, 5, 0, 0]} cursor="pointer"
                  onClick={(d) => openPopup(d, setPopup)}>
                  <LabelList dataKey="pctDone" position="top"
                    style={{ fontSize: 11, fontWeight: 700, fill: '#334155' }}
                    formatter={v => `${v}%`} />
                  {chart.map((d, i) => <Cell key={i} fill={d.isSPW ? '#f59e0b' : '#f87171'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* anchored popover */}
            {popup && (
              <>
                <div className="absolute inset-0 z-10" onClick={() => setPopup(null)} />
                <Popover popup={popup} onClose={() => setPopup(null)}
                  onDrilldown={n => { onDrilldown?.(n); setPopup(null) }} />
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}

/* ─── helpers ─── */
function openPopup(d, setPopup) {
  if (!d) return
  // d มีทั้ง field ของแถว (name/total/...) และตำแหน่งแท่ง (x/y/width)
  setPopup({ row: d, x: d.x ?? 0, y: d.y ?? 0, w: d.width ?? 0 })
}

function Popover({ popup, onClose, onDrilldown }) {
  const r = popup.row
  const color = BKN_COLORS[r.name] || '#6366f1'
  const CARD_W = 224
  const left = Math.max(4, Math.min((popup.x + popup.w / 2) - CARD_W / 2, 9999))
  const top = Math.max(0, popup.y - 8)
  return (
    <div className="absolute z-20 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
      style={{ left, top, width: CARD_W, transform: 'translateY(-100%)' }}
      onClick={e => e.stopPropagation()}>
      <div className="h-1.5" style={{ background: color }} />
      <div className="p-4">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-base font-extrabold" style={{ color }}>{r.name}</span>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500"><X size={16} /></button>
        </div>
        <div className="space-y-1.5 mb-3">
          <PopRow dot="#1e293b" label="ทั้งหมด" value={r.total} />
          <PopRow dot="#059669" label="เสร็จ" value={r.done} />
          <PopRow dot="#dc2626" label="ค้าง" value={r.pending} />
        </div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-400">% ดำเนินการ</span>
          <span className="font-bold text-emerald-600">{r.pctDone}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${r.pctDone}%` }} />
        </div>
        {r.isSPW ? (
          <div className="text-center text-[11px] text-slate-400 py-1">หน่วยพิเศษ — ไม่มีระดับเขต</div>
        ) : (
          <button onClick={() => onDrilldown(r.name)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-white font-semibold text-xs shadow-sm transition hover:brightness-110"
            style={{ background: color }}>
            คลิกเพื่อดูระดับเขต <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function PopRow({ dot, label, value }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-slate-500">
        <span className="w-2 h-2 rounded-full" style={{ background: dot }} />{label}
      </span>
      <span className="font-bold tabular-nums text-slate-700">{(value || 0).toLocaleString()}</span>
    </div>
  )
}

// x-axis tick แบบ pill "บก.น. 1"
function PillTick({ x, y, payload }) {
  const label = String(payload?.value || '')
  const w = Math.max(46, label.length * 6.5 + 14)
  return (
    <g transform={`translate(${x},${y + 6})`}>
      <rect x={-w / 2} y={0} width={w} height={20} rx={10} fill="#f1f5f9" />
      <text x={0} y={11} textAnchor="middle" dominantBaseline="central"
        fontSize={10} fontWeight={700} fill="#475569">{label}</text>
    </g>
  )
}

function Shell({ children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600" />
      <div className="p-6">{children}</div>
    </div>
  )
}

function Kpi({ icon, label, value, unit, sub, badges, bg }) {
  return (
    <div className={`relative rounded-2xl text-white overflow-hidden shadow-sm bg-gradient-to-br ${bg} px-5 py-4 min-h-[132px]`}>
      <div className="absolute right-3 top-3 opacity-15 pointer-events-none"
        style={{ transform: 'scale(2.8)', transformOrigin: 'top right' }}>{icon}</div>
      <div className="relative z-10 flex flex-col h-full">
        <div className="text-[11px] font-semibold opacity-90 leading-snug min-h-[30px]">{label}</div>
        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="text-3xl lg:text-4xl font-extrabold tabular-nums leading-none">{value}</span>
          {unit && <span className="text-xs opacity-75">{unit}</span>}
        </div>
        {badges ? (
          <div className="flex gap-1.5 mt-2">
            {badges.map(b => (
              <span key={b.label} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/20">
                {b.label} {b.value}
              </span>
            ))}
          </div>
        ) : sub ? <div className="text-[11px] opacity-75 mt-auto pt-1.5">{sub}</div> : null}
      </div>
    </div>
  )
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block w-3 h-3 rounded" style={{ background: color }} />{label}
    </span>
  )
}
