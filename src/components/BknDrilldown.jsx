import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { ArrowLeft, ChevronLeft, ChevronRight, BarChart2, Activity, AlertTriangle, MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { BKN_COLORS, getBknByDistrict, getDistricts, BKN_AREA_GROUP } from '../utils/bknMapping'
import BknDrugStats from './BknDrugStats'

const bknNo = bkn => parseInt(String(bkn).replace(/\D+/g, '')) || 1
const wrap = n => ((n - 1 + 9) % 9) + 1
const GROUP_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
const GROUP_RGB = ['59,130,246', '16,185,129', '245,158,11', '239,68,68', '139,92,246']
const GROUPS = [1, 2, 3, 4, 5]

/**
 * Drill-down ระดับเขต ของ บก.น. ที่เลือก
 * Bar + Heatmap = จำนวนเหตุการณ์ (drug_incidents) รายเขต
 * KPI เสร็จ/ค้าง = ยอดรวม บก.น. N (bkn_summary — แตกรายเขตไม่ได้)
 */
export default function BknDrilldown({ bkn, incidents = [], onBack, onSelect }) {
  const no = bknNo(bkn)
  const color = BKN_COLORS[bkn] || '#4f46e5'
  const districts = getDistricts(bkn)              // ["เขตดุสิต", ...]
  const areaGroup = BKN_AREA_GROUP[bkn] || ''
  const prevBkn = `บก.น.${wrap(no - 1)}`
  const nextBkn = `บก.น.${wrap(no + 1)}`
  const short = d => d.replace(/^เขต/, '')

  // drug_incidents เฉพาะเขตในสังกัด
  const dInc = useMemo(() => incidents.filter(r => getBknByDistrict(r.district) === bkn), [incidents, bkn])

  // bkn_summary done/pending ของ บก.น. นี้
  const [sum, setSum] = useState(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('bkn_summary')
        .select('total,done,pending,period').eq('report_id', '115_B').eq('bkn', bkn).limit(200)
      if (!alive) return
      const ps = [...new Set((data || []).map(r => r.period).filter(Boolean))].sort()
      const latest = ps[ps.length - 1]
      const rs = latest ? (data || []).filter(r => r.period === latest) : (data || [])
      setSum(rs.reduce((a, r) => ({ total: a.total + (r.total || 0), done: a.done + (r.done || 0), pending: a.pending + (r.pending || 0) }), { total: 0, done: 0, pending: 0 }))
    })()
    return () => { alive = false }
  }, [bkn])
  const pctDone = sum && sum.total > 0 ? ((sum.done / sum.total) * 100).toFixed(1) : '0.0'

  // bar: จำนวนเหตุการณ์รายเขต
  const barData = useMemo(() => {
    const m = {}; districts.forEach(d => { m[d] = 0 })
    dInc.forEach(r => { if (m[r.district] !== undefined) m[r.district]++ })
    return districts.map(d => ({ name: short(d), count: m[d] })).sort((a, b) => b.count - a.count)
  }, [dInc, districts])

  // heatmap เขต × กลุ่ม (1-5)
  const heat = useMemo(() => {
    const m = {}; districts.forEach(d => { m[d] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0 } })
    dInc.forEach(r => { const c = m[r.district]; if (c && c[r.group_no] !== undefined) { c[r.group_no]++; c.total++ } })
    return districts.map(d => ({ name: short(d), ...m[d] })).sort((a, b) => b.total - a.total)
  }, [dInc, districts])
  const maxByGroup = useMemo(() => { const o = {}; GROUPS.forEach(g => { o[g] = Math.max(...heat.map(h => h[g]), 1) }); return o }, [heat])

  return (
    <div style={{ animation: 'bknFade .22s ease' }} className="space-y-6">
      <style>{`@keyframes bknFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      {/* NAV BAR */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-blue-600 transition">
          <ArrowLeft size={16} /> กลับสู่ภาพรวม
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => onSelect(prevBkn)} title={prevBkn}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300 transition">
            <ChevronLeft size={14} /> {prevBkn}
          </button>
          <span className="px-3 py-1.5 rounded-lg text-sm font-bold text-white shadow-sm" style={{ background: color }}>● {bkn}</span>
          <button onClick={() => onSelect(nextBkn)} title={nextBkn}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300 transition">
            {nextBkn} <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* HERO */}
      <div className="rounded-2xl overflow-hidden shadow-md text-white" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
        <div className="px-7 py-6">
          <div className="text-xs font-bold tracking-widest opacity-80 mb-1">DISTRICT BREAKDOWN · สังกัด {bkn}</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">เขตในสังกัด {bkn}</h1>
          <p className="text-sm opacity-85 mt-1">{areaGroup} · {districts.length} เขตในสังกัด</p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<BarChart2 size={20} />} bg="from-blue-700 to-blue-600"
          label="เหตุการณ์ยาเสพติดรวม" value={dInc.length.toLocaleString()} unit="เหตุการณ์" sub={`${districts.length} เขตในสังกัด`} />
        <Kpi icon={<Activity size={20} />} bg="from-emerald-600 to-green-500"
          label="ดำเนินการแล้ว (บก.น.)" value={(sum?.done ?? 0).toLocaleString()} unit="เรื่อง" sub={`${pctDone}% ของ บก.น.`} />
        <Kpi icon={<AlertTriangle size={20} />} bg="from-red-600 to-rose-500"
          label="ค้างดำเนินการ (บก.น.)" value={(sum?.pending ?? 0).toLocaleString()} unit="เรื่อง" sub={`${(100 - parseFloat(pctDone)).toFixed(1)}% ของ บก.น.`} />
        <Kpi icon={<MapPin size={20} />} bg="from-violet-700 to-purple-600"
          label="เขตในสังกัด" value={districts.length} unit="เขต" sub={areaGroup} />
      </div>

      {/* BAR — จำนวนเหตุการณ์รายเขต */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
        <div className="h-1.5" style={{ background: color }} />
        <div className="p-6">
          <h3 className="text-base font-bold text-slate-800 mb-0.5">จำนวนเหตุการณ์ยาเสพติด รายเขต</h3>
          <p className="text-xs text-slate-400 mb-4">📊 จาก drug_incidents · {districts.length} เขตในสังกัด {bkn}</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} margin={{ top: 24, right: 16, left: 0, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} angle={-25} textAnchor="end" height={56} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
                formatter={v => [v.toLocaleString(), 'เหตุการณ์']} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} name="เหตุการณ์">
                <LabelList dataKey="count" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#334155' }} />
                {barData.map((d, i) => <Cell key={i} fill={color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* HEATMAP เขต × กลุ่ม */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-violet-500 to-pink-500" />
        <div className="p-6">
          <h3 className="text-base font-bold text-slate-800 mb-0.5">ตารางเขต × กลุ่ม (จำนวนเหตุการณ์)</h3>
          <p className="text-xs text-slate-400 mb-4">📊 จาก drug_incidents · group_no 1–5</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="py-3 px-4 text-left text-white font-bold bg-slate-800 sticky left-0 z-10 min-w-[120px]">เขต</th>
                  {GROUPS.map((g, gi) => (
                    <th key={g} className="py-3 px-3 text-center font-bold text-white min-w-[80px]" style={{ background: GROUP_COLORS[gi] }}>
                      <div className="text-[10px] opacity-75 leading-none mb-0.5">กลุ่ม</div>
                      <div className="text-sm font-extrabold leading-none">{g}</div>
                    </th>
                  ))}
                  <th className="py-3 px-4 text-center font-bold text-white bg-slate-800 min-w-[80px]">รวม</th>
                </tr>
              </thead>
              <tbody>
                {heat.map((row, ri) => (
                  <tr key={row.name} style={{ background: ri % 2 ? '#f8fafc' : '#fff' }}>
                    <td className="py-3 px-4 font-bold sticky left-0 z-10" style={{ color, background: ri % 2 ? '#f8fafc' : '#fff' }}>{row.name}</td>
                    {GROUPS.map((g, gi) => {
                      const op = maxByGroup[g] > 0 ? 0.08 + (row[g] / maxByGroup[g]) * 0.32 : 0
                      return (
                        <td key={g} className="py-3 px-3 text-center font-bold text-slate-800 tabular-nums"
                          style={{ background: `rgba(${GROUP_RGB[gi]},${op.toFixed(3)})` }}>{row[g].toLocaleString()}</td>
                      )
                    })}
                    <td className="py-3 px-4 text-center font-extrabold text-slate-800 tabular-nums bg-slate-100 border-l-2 border-slate-300">{row.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 2 — scoped ระดับเขต */}
      <div className="flex items-center gap-3 pt-1">
        <span className="w-1.5 h-7 rounded-full bg-gradient-to-b from-pink-500 to-violet-600" />
        <div>
          <h2 className="text-lg font-bold text-slate-800">สถิติเหตุการณ์ยาเสพติด · {bkn}</h2>
          <p className="text-xs text-slate-400 mt-0.5">📊 drug_incidents · กรองเฉพาะเขตในสังกัด {bkn}</p>
        </div>
      </div>
      <BknDrugStats incidents={dInc} groupBy="district" baseColor={color} compact />
    </div>
  )
}

function Kpi({ icon, label, value, unit, sub, bg }) {
  return (
    <div className={`relative rounded-2xl text-white overflow-hidden shadow-sm bg-gradient-to-br ${bg} px-5 py-4 min-h-[120px]`}>
      <div className="absolute right-3 top-3 opacity-15 pointer-events-none" style={{ transform: 'scale(2.8)', transformOrigin: 'top right' }}>{icon}</div>
      <div className="relative z-10">
        <div className="text-[11px] font-semibold opacity-90 leading-snug min-h-[28px]">{label}</div>
        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="text-3xl lg:text-4xl font-extrabold tabular-nums leading-none">{value}</span>
          {unit && <span className="text-xs opacity-75">{unit}</span>}
        </div>
        {sub && <div className="text-[11px] opacity-75 mt-1.5">{sub}</div>}
      </div>
    </div>
  )
}
