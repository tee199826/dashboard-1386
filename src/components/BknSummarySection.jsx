import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList, Cell,
} from 'recharts'
import { BKN_COLORS } from '../utils/bknMapping'
import { formatThaiDateLong } from '../utils/formatDate'
import PeriodBadge from './PeriodBadge'

export default function BknSummarySection({ selectedBkn, onPeriodReady }) {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [highlightBkn, setHighlightBkn] = useState(null)
  const [selectedPeriod, setSelectedPeriod] = useState(null)

  useEffect(() => {
    const go = async () => {
      setLoading(true)
      let q = supabase.from('bkn_summary').select('*').eq('report_id', '115_B')
      if (selectedBkn) q = q.eq('bkn', selectedBkn)
      const { data } = await q.limit(500)
      setRows(data || [])
      const ps = [...new Set((data || []).map(r => r.period).filter(Boolean))].sort()
      if (ps.length > 0) { setSelectedPeriod(ps[ps.length - 1]); onPeriodReady?.(ps[ps.length - 1]) }
      setLoading(false)
    }
    go()
  }, [selectedBkn])

  if (loading) return (
    <div className="flex items-center justify-center py-10 text-slate-400 text-sm">
      <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin mr-2" />
      กำลังโหลด...
    </div>
  )

  if (!rows || rows.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
      <div className="text-5xl mb-3 opacity-25">📋</div>
      <div className="text-sm font-semibold text-slate-500 mb-1">ยังไม่มีข้อมูล</div>
      <div className="text-xs text-slate-400 mb-5">กรุณาอัปโหลดไฟล์ 115_B ที่หน้า /upload</div>
      <a href="/upload"
        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition">
        ไปยังหน้าอัปโหลด
      </a>
    </div>
  )

  const isSpw = b => b?.includes('สปพ')
  const GROUP_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
  const GROUP_COLORS_RGB = ['59,130,246', '16,185,129', '245,158,11', '239,68,68', '139,92,246']

  const periods = [...new Set(rows.map(r => r.period).filter(Boolean))].sort()
  const filteredRows = selectedPeriod ? rows.filter(r => r.period === selectedPeriod) : rows

  const latestDate = rows.reduce((max, r) => {
    const d = r.uploaded_at || r.created_at || ''
    return d > max ? d : max
  }, '')

  const unitMap = {}
  filteredRows.forEach(r => {
    if (!r.bkn) return
    if (!unitMap[r.bkn]) unitMap[r.bkn] = { total: 0, done: 0, pending: 0 }
    unitMap[r.bkn].total   += r.total   || 0
    unitMap[r.bkn].done    += r.done    || 0
    unitMap[r.bkn].pending += r.pending || 0
  })

  const bknEntries = Object.entries(unitMap)
    .filter(([b]) => !isSpw(b))
    .sort(([a], [b]) => (parseInt(a.replace(/\D+/g, '')) || 999) - (parseInt(b.replace(/\D+/g, '')) || 999))
  const spwEntries = Object.entries(unitMap).filter(([b]) => isSpw(b))

  const mkPct = v => v.total > 0 ? (v.done / v.total) * 100 : 0

  const bknTotals = bknEntries.reduce((acc, [, v]) => ({
    total: acc.total + v.total, done: acc.done + v.done, pending: acc.pending + v.pending,
  }), { total: 0, done: 0, pending: 0 })
  const bknPct = bknTotals.total > 0 ? ((bknTotals.done / bknTotals.total) * 100).toFixed(1) : '0.0'

  const spwTotals = spwEntries.reduce((acc, [, v]) => ({
    total: acc.total + v.total, done: acc.done + v.done, pending: acc.pending + v.pending,
  }), { total: 0, done: 0, pending: 0 })
  const spwPct = spwTotals.total > 0 ? ((spwTotals.done / spwTotals.total) * 100).toFixed(1) : '0.0'

  const bknBarData = [...bknEntries]
    .sort(([, a], [, b]) => mkPct(b) - mkPct(a))
    .map(([bkn, v]) => ({
      name: bkn, done: v.done, pending: v.pending,
      pctDone: v.total > 0 ? ((v.done / v.total) * 100).toFixed(0) : '0',
    }))
  const spwBarData = spwEntries.map(([bkn, v]) => ({
    name: bkn, done: v.done, pending: v.pending,
    pctDone: v.total > 0 ? ((v.done / v.total) * 100).toFixed(0) : '0',
    isSPW: true,
  }))
  const chartData = [...bknBarData, ...spwBarData]

  const pivot = {}
  const allGroups = new Set()
  filteredRows.forEach(r => {
    if (!r.bkn || !r.group_no) return
    const g = String(r.group_no)
    if (!pivot[r.bkn]) pivot[r.bkn] = {}
    if (!pivot[r.bkn][g]) pivot[r.bkn][g] = { total: 0, done: 0, pending: 0 }
    pivot[r.bkn][g].total   += r.total   || 0
    pivot[r.bkn][g].done    += r.done    || 0
    pivot[r.bkn][g].pending += r.pending || 0
    allGroups.add(g)
  })
  const groups = Array.from(allGroups).sort((a, b) => Number(a) - Number(b))
  const maxByGroup = {}
  groups.forEach(g => {
    maxByGroup[g] = Math.max(...Object.values(pivot).map(u => u[g]?.total || 0), 1)
  })

  const topPct = [...bknEntries].sort(([, a], [, b]) => mkPct(b) - mkPct(a))[0]
  const mostPending = [...bknEntries].sort(([, a], [, b]) => b.pending - a.pending)[0]
  const allUnits = [...bknEntries.map(([b]) => b), ...spwEntries.map(([b]) => b)]

  return (
    <div className="space-y-7">

      {/* Period badge */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 tracking-wide">RPT 115_B</span>
        <PeriodBadge period={selectedPeriod} />
      </div>

      {/* ─── 1. KPI CARDS ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br from-blue-700 to-blue-500 text-white">
          <div className="px-5 pt-5 pb-4">
            <div className="text-4xl font-extrabold tabular-nums mb-1">{bknTotals.total.toLocaleString()}</div>
            <div className="text-sm font-semibold opacity-90">คดีรวม บก.น.1–9</div>
            <div className="text-xs opacity-65 mt-1">เรื่องทั้งหมด</div>
          </div>
          <div className="px-5 py-2 bg-blue-800/30 text-xs font-medium opacity-80">115_B · บก.น.1–9</div>
        </div>
        <div className="rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br from-emerald-600 to-green-500 text-white">
          <div className="px-5 pt-5 pb-4">
            <div className="text-4xl font-extrabold tabular-nums mb-1">{bknTotals.done.toLocaleString()}</div>
            <div className="text-sm font-semibold opacity-90">ดำเนินการแล้ว</div>
            <div className="text-xs opacity-65 mt-1">{bknPct}% ของคดีทั้งหมด</div>
          </div>
          <div className="px-5 py-2 bg-emerald-800/30 text-xs font-medium opacity-80">เสร็จสิ้น</div>
        </div>
        <div className="rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br from-red-600 to-rose-500 text-white">
          <div className="px-5 pt-5 pb-4">
            <div className="text-4xl font-extrabold tabular-nums mb-1">{bknTotals.pending.toLocaleString()}</div>
            <div className="text-sm font-semibold opacity-90">ค้างดำเนินการ</div>
            <div className="text-xs opacity-65 mt-1">{(100 - parseFloat(bknPct)).toFixed(1)}% ของคดีทั้งหมด</div>
          </div>
          <div className="px-5 py-2 bg-red-800/30 text-xs font-medium opacity-80">คดีค้าง</div>
        </div>
        {spwEntries.length > 0 ? (
          <div className="rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br from-violet-700 to-purple-600 text-white">
            <div className="px-5 pt-5 pb-4">
              <div className="text-4xl font-extrabold tabular-nums mb-1">{spwTotals.total.toLocaleString()}</div>
              <div className="text-sm font-semibold opacity-90">{spwEntries[0][0]}</div>
              <div className="text-xs opacity-65 mt-1">เสร็จ {spwTotals.done.toLocaleString()} · ค้าง {spwTotals.pending.toLocaleString()} ({spwPct}%)</div>
            </div>
            <div className="px-5 py-2 bg-violet-900/30 text-xs font-medium opacity-80">บก.สปพ.(191)</div>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br from-slate-400 to-slate-500 text-white">
            <div className="px-5 pt-5 pb-4">
              <div className="text-4xl font-extrabold tabular-nums mb-1">—</div>
              <div className="text-sm font-semibold opacity-90">บก.สปพ.(191)</div>
              <div className="text-xs opacity-65 mt-1">ไม่มีข้อมูล</div>
            </div>
            <div className="px-5 py-2 bg-slate-700/30 text-xs font-medium opacity-80">บก.สปพ.(191)</div>
          </div>
        )}
      </div>

      {/* ─── 2. STACKED BAR CHART ─── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-red-500" />
        <div className="p-5">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">ผลการดำเนินการ — เรียงตาม %เสร็จ (สูง→ต่ำ)</h4>
              <p className="text-xs text-slate-400 mt-0.5">บก.สปพ. แยกท้ายกราฟ · ตัวเลขด้านบนแท่ง = %เสร็จ</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-emerald-500" />เสร็จ</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-red-400" />ค้าง</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-indigo-400" />สปพ.เสร็จ</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-amber-400" />สปพ.ค้าง</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 28, right: 20, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }}
                angle={-35} textAnchor="end" height={65} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
                formatter={(v, name) => [v.toLocaleString(), name === 'done' ? 'เสร็จ' : 'ค้าง']} />
              <Bar dataKey="done" stackId="a" name="done">
                {chartData.map((d, i) => <Cell key={i} fill={d.isSPW ? '#6366f1' : '#10b981'} />)}
              </Bar>
              <Bar dataKey="pending" stackId="a" name="pending" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="pctDone" position="top"
                  style={{ fontSize: 10, fontWeight: 700, fill: '#334155' }}
                  formatter={v => `${v}%`} />
                {chartData.map((d, i) => <Cell key={i} fill={d.isSPW ? '#f59e0b' : '#f87171'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── 3. PIVOT GROUP TABLE ─── */}
      {groups.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-blue-500 to-violet-500" />
          <div className="p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
              <div>
                <h4 className="text-sm font-bold text-slate-800">ตารางแยกตามกลุ่ม</h4>
                {latestDate && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    ข้อมูลอัปเดตล่าสุด: <span className="font-semibold text-slate-600">{formatThaiDateLong(latestDate)}</span>
                  </p>
                )}
              </div>
              {periods.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">ช่วงเวลา:</span>
                  <select
                    value={selectedPeriod || ''}
                    onChange={e => { setSelectedPeriod(e.target.value); onPeriodReady?.(e.target.value) }}
                    className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer shadow-sm hover:border-blue-300 transition-colors"
                  >
                    {periods.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mb-4 flex-wrap">
              <span className="font-semibold text-slate-600">แต่ละช่อง:</span>
              <span className="font-bold text-slate-700">รวม</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block flex-shrink-0" />
                <span className="text-emerald-600 font-medium">เสร็จ</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block flex-shrink-0" />
                <span className="text-red-500 font-medium">ค้าง</span>
              </span>
              <span className="text-slate-200">·</span>
              <span>คลิกแถวเพื่อ highlight</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="py-4 px-4 text-left text-white font-bold bg-slate-800 sticky left-0 z-10 min-w-[110px] border-b border-slate-700 text-xs">
                      หน่วยงาน
                    </th>
                    {groups.map((g, gi) => (
                      <th key={g} className="py-3 px-3 text-center font-bold text-white min-w-[100px] border-b"
                        style={{ background: GROUP_COLORS[gi % GROUP_COLORS.length], borderColor: GROUP_COLORS[gi % GROUP_COLORS.length] }}>
                        <div className="text-xs opacity-75 font-medium leading-none mb-0.5">กลุ่ม</div>
                        <div className="text-sm font-extrabold leading-none">{g}</div>
                      </th>
                    ))}
                    <th className="py-4 px-4 text-center font-bold text-white bg-slate-800 min-w-[100px] border-b border-slate-700 text-xs">
                      รวมทุกกลุ่ม
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allUnits.map((bkn, ri) => {
                    const u = unitMap[bkn] || { total: 0, done: 0, pending: 0 }
                    const isSPWRow = isSpw(bkn)
                    const isHL = highlightBkn === bkn
                    const evenBg = isSPWRow ? '#f5f3ff' : ri % 2 === 0 ? '#ffffff' : '#f8fafc'
                    const hlBg = isSPWRow ? '#ede9fe' : '#eff6ff'
                    const rowBg = isHL ? hlBg : evenBg
                    return (
                      <tr key={bkn}
                        onClick={() => setHighlightBkn(h => h === bkn ? null : bkn)}
                        className={`cursor-pointer transition-colors hover:brightness-95 ${isSPWRow ? 'border-t-[3px] border-violet-400' : ''}`}
                        style={{ background: rowBg }}>
                        <td className="py-4 px-4 font-bold sticky left-0 z-10"
                          style={{ color: BKN_COLORS[bkn] || (isSPWRow ? '#7c3aed' : '#64748b'), background: rowBg }}>
                          <div className="whitespace-nowrap">{bkn}</div>
                          {isSPWRow && (
                            <span className="text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-bold tracking-wide mt-0.5 inline-block border border-violet-200">
                              หน่วยพิเศษ
                            </span>
                          )}
                        </td>
                        {groups.map((g, gi) => {
                          const cell = pivot[bkn]?.[g] || { total: 0, done: 0, pending: 0 }
                          const opacity = maxByGroup[g] > 0 ? 0.08 + (cell.total / maxByGroup[g]) * 0.27 : 0
                          return (
                            <td key={g} className="py-4 px-4 text-center"
                              style={{ background: `rgba(${GROUP_COLORS_RGB[gi % 5]},${opacity.toFixed(3)})` }}>
                              <div className="font-bold text-slate-800 text-sm tabular-nums">{cell.total.toLocaleString()}</div>
                              <div className="flex items-center justify-center gap-2 mt-1">
                                <span className="flex items-center gap-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                                  <span className="text-emerald-600 text-xs tabular-nums">{cell.done.toLocaleString()}</span>
                                </span>
                                <span className="flex items-center gap-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                                  <span className="text-red-500 text-xs tabular-nums">{cell.pending.toLocaleString()}</span>
                                </span>
                              </div>
                            </td>
                          )
                        })}
                        <td className="py-4 px-4 text-center bg-slate-100 border-l-2 border-slate-300">
                          <div className="font-bold text-slate-800 text-sm tabular-nums">{u.total.toLocaleString()}</div>
                          <div className="flex items-center justify-center gap-2 mt-1">
                            <span className="flex items-center gap-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                              <span className="text-emerald-600 text-xs tabular-nums">{u.done.toLocaleString()}</span>
                            </span>
                            <span className="flex items-center gap-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                              <span className="text-red-500 text-xs tabular-nums">{u.pending.toLocaleString()}</span>
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── 4. HIGHLIGHTS PANEL ─── */}
      {bknEntries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {topPct && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-3">ดำเนินการได้สูงสุด</div>
              <div className="text-xl font-extrabold text-emerald-800 mb-1">{topPct[0]}</div>
              <div className="text-5xl font-black text-emerald-500 tabular-nums leading-none mb-2">
                {mkPct(topPct[1]).toFixed(1)}%
              </div>
              <div className="text-xs text-emerald-700">
                เสร็จ {topPct[1].done.toLocaleString()} จาก {topPct[1].total.toLocaleString()} เรื่อง
              </div>
            </div>
          )}
          {mostPending && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="text-xs font-bold text-red-500 uppercase tracking-wider mb-3">ค้างดำเนินการมากสุด</div>
              <div className="text-xl font-extrabold text-red-800 mb-1">{mostPending[0]}</div>
              <div className="text-5xl font-black text-red-400 tabular-nums leading-none mb-2">
                {mostPending[1].pending.toLocaleString()}
              </div>
              <div className="text-xs text-red-600">
                เรื่องค้าง จาก {mostPending[1].total.toLocaleString()} คดีรวม · {mkPct(mostPending[1]).toFixed(1)}% เสร็จ
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
