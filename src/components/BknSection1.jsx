import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LabelList, ReferenceLine,
} from 'recharts'
import {
  AlertTriangle, RefreshCw, Calendar, X, ArrowRight, Maximize2,
} from 'lucide-react'
import FilterPill from './FilterPill'

const isSpw = b => b?.includes('สปพ')

// palette — slate + emerald + amber (top) + rose (low) เท่านั้น
const C_DONE = '#059669'   // emerald-600
const C_TOP = '#f59e0b'    // amber-500
const C_LOW = '#e11d48'    // rose-600
const C_SPW = '#94a3b8'    // slate-400
const C_TRACK = '#f1f5f9'  // slate-100

// ดึงปีงบจาก period string "01 ต.ค. 68-30 เม.ย. 69" → 2569 (ต.ค.=เริ่มปีงบถัดไป)
function fiscalYearOf(period) {
  if (!period) return null
  const m = String(period).match(/(\d{2})\s*$/)        // เลขปี 2 หลักท้ายสุด
  if (!m) return null
  return 2500 + parseInt(m[1], 10)
}

/**
 * Section 1 — ผลการดำเนินการตาม บก.น. (จาก bkn_summary / RPT_115_B)
 * completion-rate bar (filled = done% · track = 100%) + เส้นเฉลี่ย + highlight top/low
 * คลิกแท่ง → popover → ปุ่ม "ดูระดับ สน."
 */
export default function BknSection1({ onDrilldown, onPeriodReady, lastUpload }) {
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
    const mkRow = ([name, v], spw = false) => ({
      name, done: v.done, pending: v.pending, total: v.total, isSPW: spw,
      pctDone: v.total > 0 ? (v.done / v.total) * 100 : 0,
    })
    const chart = [...bknEntries.map(e => mkRow(e)), ...spwEntries.map(e => mkRow(e, true))]

    // เฉลี่ยรวม (weighted) + top/low ในกลุ่ม บก.น. เท่านั้น (ไม่รวม สปพ.)
    const avgPct = bknTotals.total > 0 ? (bknTotals.done / bknTotals.total) * 100 : 0
    const bknOnly = chart.filter(r => !r.isSPW)
    const topName = bknOnly.length ? bknOnly.reduce((a, b) => (b.pctDone > a.pctDone ? b : a)).name : null
    const lowName = bknOnly.length ? bknOnly.reduce((a, b) => (b.pctDone < a.pctDone ? b : a)).name : null
    return { chart, avgPct, topName, lowName }
  }, [rows, selectedPeriod])

  if (loading) return (
    <Shell><div className="h-40 flex items-center justify-center text-slate-400 text-sm">
      <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin mr-2" />
      กำลังโหลดข้อมูล 115_B...
    </div></Shell>
  )

  if (!model || model.chart.length === 0) return (
    <Shell><div className="flex items-center gap-3 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-5 py-4 text-sm text-amber-800">
      <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
      ยังไม่มีข้อมูล RPT_115_B — กรุณาอัปโหลดไฟล์ที่หน้า /upload
    </div></Shell>
  )

  const { chart, avgPct, topName, lowName } = model
  const colorFor = d => d.isSPW ? C_SPW : d.name === topName ? C_TOP : d.name === lowName ? C_LOW : C_DONE

  return (
    <Shell>
      {/* ── header + filters ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-widest text-slate-500">RPT 115_B</div>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            อัตราดำเนินการรายกองบังคับการ
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            สัดส่วนเรื่องที่ดำเนินการแล้วต่อทั้งหมด · เทียบเส้นเฉลี่ยรวม · คลิกแท่งเพื่อดูระดับเขต
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterPill variant="white" icon={<Calendar size={14} className="text-slate-400" />}
            label="ปีงบประมาณ" value={String(fy || '')} onChange={pickFy} options={fyOptions}
            disabled={fyOptions.length <= 1}
            title={fyOptions.length <= 1 ? 'ข้อมูล RPT 115_B มีเฉพาะปีงบ 2569' : undefined} />
          <button onClick={reload} title="รีเฟรช"
            className="p-2 rounded-md ring-1 ring-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:ring-slate-300 transition">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          {lastUpload && (
            <span className="px-2.5 py-1.5 rounded-md text-xs font-medium ring-1 ring-slate-200 text-slate-600 whitespace-nowrap">
              อัปเดต {lastUpload}
            </span>
          )}
          <button title="เต็มจอ"
            className="p-2 rounded-md ring-1 ring-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:ring-slate-300 transition">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      {/* ── legend ── */}
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-2 flex-wrap">
        <Legend color={C_DONE} label="ดำเนินการแล้ว" />
        <Legend color={C_TOP} label="สูงสุด" />
        <Legend color={C_LOW} label="ต่ำสุด" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-slate-400" />เฉลี่ยรวม {avgPct.toFixed(1)}%
        </span>
      </div>

      {/* ── completion-rate bar ── */}
      <div className="relative">
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={chart} margin={{ top: 28, right: 12, left: 0, bottom: 36 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={<PillTick />} interval={0} height={34} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: '#f8fafc' }}
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
              formatter={(v, _n, p) => [
                `${p.payload.done.toLocaleString()} / ${p.payload.total.toLocaleString()} เรื่อง (${v.toFixed(1)}%)`,
                'ดำเนินการแล้ว',
              ]} />
            <ReferenceLine y={avgPct} stroke="#94a3b8" strokeDasharray="5 4"
              label={{ value: `เฉลี่ย ${avgPct.toFixed(1)}%`, position: 'right', fontSize: 10, fill: '#64748b' }} />
            <Bar dataKey="pctDone" name="ดำเนินการแล้ว" radius={[4, 4, 0, 0]} cursor="pointer"
              background={{ fill: C_TRACK, radius: 4 }}
              onClick={(d) => openPopup(d, setPopup)}>
              <LabelList dataKey="pctDone" position="top" content={<PctLabel />} />
              {chart.map((d, i) => <Cell key={i} fill={colorFor(d)} />)}
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
    </Shell>
  )
}

/* ─── helpers ─── */
function openPopup(d, setPopup) {
  if (!d) return
  setPopup({ row: d, x: d.x ?? 0, y: d.y ?? 0, w: d.width ?? 0 })
}

// % label เหนือแท่ง — สี slate (สี top/low อยู่ที่ตัวแท่งแล้ว)
function PctLabel({ x, y, width, value }) {
  const v = typeof value === 'number' ? value : null
  if (v == null) return null
  return (
    <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="#334155">
      {v.toFixed(0)}%
    </text>
  )
}

function Popover({ popup, onClose, onDrilldown }) {
  const r = popup.row
  const CARD_W = 224
  const left = Math.max(4, Math.min((popup.x + popup.w / 2) - CARD_W / 2, 9999))
  const top = Math.max(0, popup.y - 8)
  const pct = (r.pctDone || 0).toFixed(1)
  return (
    <div className="absolute z-20 bg-white rounded-lg shadow-xl ring-1 ring-slate-200 overflow-hidden"
      style={{ left, top, width: CARD_W, transform: 'translateY(-100%)' }}
      onClick={e => e.stopPropagation()}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-base font-semibold text-slate-900">{r.name}</span>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500"><X size={16} /></button>
        </div>
        <div className="space-y-1.5 mb-3">
          <PopRow dot="#334155" label="ทั้งหมด" value={r.total} />
          <PopRow dot="#059669" label="เสร็จ" value={r.done} />
          <PopRow dot="#e11d48" label="ค้าง" value={r.pending} />
        </div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-400">% ดำเนินการ</span>
          <span className="font-semibold text-emerald-600 tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
        </div>
        {r.isSPW ? (
          <div className="text-center text-[11px] text-slate-400 py-1">หน่วยพิเศษ — ไม่มีระดับเขต</div>
        ) : (
          <button onClick={() => onDrilldown(r.name)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md bg-slate-900 text-white font-semibold text-xs transition hover:bg-slate-700">
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
      <span className="font-semibold tabular-nums text-slate-700">{(value || 0).toLocaleString()}</span>
    </div>
  )
}

// x-axis tick แบบ pill "บก.น. 1"
function PillTick({ x, y, payload }) {
  const label = String(payload?.value || '')
  const w = Math.max(46, label.length * 6.5 + 14)
  return (
    <g transform={`translate(${x},${y + 6})`}>
      <rect x={-w / 2} y={0} width={w} height={20} rx={6} fill="#f1f5f9" />
      <text x={0} y={11} textAnchor="middle" dominantBaseline="central"
        fontSize={10} fontWeight={700} fill="#475569">{label}</text>
    </g>
  )
}

function Shell({ children }) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-slate-200 p-6 md:p-8">{children}</div>
  )
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} />{label}
    </span>
  )
}
