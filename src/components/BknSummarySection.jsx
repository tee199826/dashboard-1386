import { useState, useEffect } from 'react'
import { Check, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { BKN_COLORS } from '../utils/bknMapping'
import FilterPill from './FilterPill'

// ปีงบจาก period "01 ต.ค. 68-31 พ.ค. 69" → 2569
function fiscalYearOf(period) {
  const m = String(period || '').match(/(\d{2})\s*$/)
  return m ? 2500 + parseInt(m[1], 10) : null
}

// ผลต่างเทียบงวดก่อน (+เพิ่ม = แดง, −ลด = เขียว)
function DeltaBadge({ d }) {
  if (d == null || d === 0) return null
  const up = d > 0
  return (
    <span className={`text-[10px] font-bold tabular-nums ${up ? 'text-rose-500' : 'text-emerald-600'}`}>
      {up ? '+' : '−'}{Math.abs(d).toLocaleString()}
    </span>
  )
}

const isSpw = b => b?.includes('สปพ')
const GROUP_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
const GROUP_COLORS_RGB = ['59,130,246', '16,185,129', '245,158,11', '239,68,68', '139,92,246']

/**
 * Section 3 — ตารางแยกตามกลุ่ม (heatmap บก.น. × กลุ่ม 1-5) + highlight cards
 * single card เดียว (accent bar + header + pills + table + 2 cards)
 */
export default function BknSummarySection() {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [highlightBkn, setHighlightBkn] = useState(null)   // คลิกแถว/เปรียบเทียบ บก.น.
  const [bknFilter, setBknFilter] = useState('all')
  const [selectedPeriod, setSelectedPeriod] = useState(null)

  useEffect(() => {
    const go = async () => {
      setLoading(true)
      const { data } = await supabase.from('bkn_summary').select('*').eq('report_id', '115_B').limit(500)
      setRows(data || [])
      const ps = [...new Set((data || []).map(r => r.period).filter(Boolean))].sort()
      if (ps.length > 0) setSelectedPeriod(ps[ps.length - 1])
      setLoading(false)
    }
    go()
  }, [])

  if (loading) return (
    <Card><div className="flex items-center justify-center py-12 text-slate-400 text-sm">
      <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin mr-2" />กำลังโหลด...
    </div></Card>
  )

  if (!rows || rows.length === 0) return (
    <Card><div className="flex flex-col items-center justify-center py-12 text-slate-400">
      <div className="text-5xl mb-3 opacity-25">📋</div>
      <div className="text-sm font-semibold text-slate-500 mb-1">ยังไม่มีข้อมูล</div>
      <div className="text-xs text-slate-400 mb-5">กรุณาอัปโหลดไฟล์ 115_B ที่หน้า /upload</div>
      <a href="/upload" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition">ไปยังหน้าอัปโหลด</a>
    </div></Card>
  )

  const periods = [...new Set(rows.map(r => r.period).filter(Boolean))].sort()
  const fyOptions = [...new Set(periods.map(fiscalYearOf).filter(Boolean))].sort((a, b) => b - a).map(y => [String(y), `ปี ${y}`])
  const fy = fiscalYearOf(selectedPeriod)
  const pickFy = y => {
    const ps = periods.filter(p => String(fiscalYearOf(p)) === String(y)).sort()
    if (ps.length) setSelectedPeriod(ps[ps.length - 1])
  }
  const filteredRows = selectedPeriod ? rows.filter(r => r.period === selectedPeriod) : rows

  // unit aggregate
  const unitMap = {}
  filteredRows.forEach(r => {
    if (!r.bkn) return
    if (!unitMap[r.bkn]) unitMap[r.bkn] = { total: 0, done: 0, pending: 0 }
    unitMap[r.bkn].total += r.total || 0
    unitMap[r.bkn].done += r.done || 0
    unitMap[r.bkn].pending += r.pending || 0
  })

  const bknEntries = Object.entries(unitMap).filter(([b]) => !isSpw(b))
    .sort(([a], [b]) => (parseInt(a.replace(/\D+/g, '')) || 999) - (parseInt(b.replace(/\D+/g, '')) || 999))
  const spwEntries = Object.entries(unitMap).filter(([b]) => isSpw(b))
  const bknNames = bknEntries.map(([b]) => b)

  const donePct = v => v.total > 0 ? (v.done / v.total) * 100 : 0
  const pendPct = v => v.total > 0 ? (v.pending / v.total) * 100 : 0

  // pivot บก.น. × กลุ่ม
  const pivot = {}
  const allGroups = new Set()
  filteredRows.forEach(r => {
    if (!r.bkn || !r.group_no) return
    const g = String(r.group_no)
    if (!pivot[r.bkn]) pivot[r.bkn] = {}
    if (!pivot[r.bkn][g]) pivot[r.bkn][g] = { total: 0, done: 0, pending: 0 }
    pivot[r.bkn][g].total += r.total || 0
    pivot[r.bkn][g].done += r.done || 0
    pivot[r.bkn][g].pending += r.pending || 0
    allGroups.add(g)
  })
  const groups = Array.from(allGroups).sort((a, b) => Number(a) - Number(b))
  const maxByGroup = {}
  groups.forEach(g => { maxByGroup[g] = Math.max(...Object.values(pivot).map(u => u[g]?.total || 0), 1) })

  // เทียบงวดก่อน (delta)
  const prevPeriod = (() => { const i = periods.indexOf(selectedPeriod); return i > 0 ? periods[i - 1] : null })()
  const prevPivot = {}, prevUnit = {}
  if (prevPeriod) {
    rows.filter(r => r.period === prevPeriod).forEach(r => {
      if (!r.bkn) return
      prevUnit[r.bkn] = (prevUnit[r.bkn] || 0) + (r.total || 0)
      if (r.group_no) {
        const g = String(r.group_no)
        if (!prevPivot[r.bkn]) prevPivot[r.bkn] = {}
        prevPivot[r.bkn][g] = (prevPivot[r.bkn][g] || 0) + (r.total || 0)
      }
    })
  }
  const deltaOf = (cur, prev) => prevPeriod ? cur - (prev || 0) : null

  // highlight cards
  const topDone = [...bknEntries].sort(([, a], [, b]) => donePct(b) - donePct(a))[0]
  const topPend = [...bknEntries].sort(([, a], [, b]) => pendPct(b) - pendPct(a))[0]

  // rows ที่จะแสดง (filter ตาม "ทุก บก.น.")
  const visibleUnits = (bknFilter === 'all'
    ? [...bknNames, ...spwEntries.map(([b]) => b)]
    : [bknFilter])

  return (
    <Card>
      {/* header + filters */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">ตารางแยกตามกลุ่ม</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            แต่ละช่อง: รวม <span className="text-emerald-600 font-medium">เสร็จ</span>/<span className="text-red-500 font-medium">ค้าง</span>
            {prevPeriod && <> · <span className="text-rose-500 font-bold">+N</span> เพิ่มจากงวดก่อน</>} · คลิกแถวเพื่อ highlight
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterPill variant="blue" value={bknFilter} onChange={setBknFilter}
            options={[['all', 'ทุก บก.น.'], ...bknNames.map(b => [b, b])]} />
          <FilterPill variant="blue" value={String(fy || '')} onChange={pickFy} options={fyOptions}
            disabled={fyOptions.length <= 1}
            title={fyOptions.length <= 1 ? 'ข้อมูล RPT 115_B มีเฉพาะปีงบ 2569' : undefined} />
          <FilterPill variant="blue" label="เปรียบเทียบ" value={highlightBkn || 'none'}
            onChange={v => setHighlightBkn(v === 'none' ? null : v)}
            options={[['none', 'บก.น. ▾'], ...bknNames.map(b => [b, b])]} />
          <span className="px-2.5 py-1.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-xs font-bold">RPT 115_B</span>
        </div>
      </div>

      {/* heatmap */}
      {groups.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="py-4 px-4 text-left text-white font-bold bg-slate-800 sticky left-0 z-10 min-w-[110px] border-b border-slate-700">หน่วยงาน</th>
                {groups.map((g, gi) => (
                  <th key={g} className="py-3 px-3 text-center font-bold text-white min-w-[100px] border-b"
                    style={{ background: GROUP_COLORS[gi % 5], borderColor: GROUP_COLORS[gi % 5] }}>
                    <div className="text-xs opacity-75 font-medium leading-none mb-0.5">กลุ่ม</div>
                    <div className="text-sm font-extrabold leading-none">{g}</div>
                  </th>
                ))}
                <th className="py-4 px-4 text-center font-bold text-white bg-slate-800 min-w-[100px] border-b border-slate-700">รวมทุกกลุ่ม</th>
              </tr>
            </thead>
            <tbody>
              {visibleUnits.map((bkn, ri) => {
                const u = unitMap[bkn] || { total: 0, done: 0, pending: 0 }
                const isSPWRow = isSpw(bkn)
                const isHL = highlightBkn === bkn
                const evenBg = isSPWRow ? '#f5f3ff' : ri % 2 === 0 ? '#ffffff' : '#f8fafc'
                const rowBg = isHL ? (isSPWRow ? '#ede9fe' : '#eff6ff') : evenBg
                return (
                  <tr key={bkn} onClick={() => setHighlightBkn(h => h === bkn ? null : bkn)}
                    className={`cursor-pointer transition-colors hover:brightness-95 ${isSPWRow ? 'border-t-[3px] border-violet-400' : ''}`}
                    style={{ background: rowBg }}>
                    <td className="py-4 px-4 font-bold sticky left-0 z-10"
                      style={{ color: BKN_COLORS[bkn] || (isSPWRow ? '#7c3aed' : '#64748b'), background: rowBg }}>
                      <div className="whitespace-nowrap">{bkn}</div>
                      {isSPWRow && <span className="text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-bold mt-0.5 inline-block border border-violet-200">หน่วยพิเศษ</span>}
                    </td>
                    {groups.map((g, gi) => {
                      const cell = pivot[bkn]?.[g] || { total: 0, done: 0, pending: 0 }
                      const opacity = maxByGroup[g] > 0 ? 0.08 + (cell.total / maxByGroup[g]) * 0.27 : 0
                      return (
                        <td key={g} className="py-4 px-4 text-center" style={{ background: `rgba(${GROUP_COLORS_RGB[gi % 5]},${opacity.toFixed(3)})` }}>
                          <div className="flex items-baseline justify-center gap-1">
                            <span className="font-bold text-slate-800 text-sm tabular-nums">{cell.total.toLocaleString()}</span>
                            <DeltaBadge d={deltaOf(cell.total, prevPivot[bkn]?.[g])} />
                          </div>
                          <div className="flex items-center justify-center gap-2 mt-1">
                            <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-emerald-600 tabular-nums">{cell.done.toLocaleString()}</span></span>
                            <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /><span className="text-red-500 tabular-nums">{cell.pending.toLocaleString()}</span></span>
                          </div>
                        </td>
                      )
                    })}
                    <td className="py-4 px-4 text-center bg-slate-100 border-l-2 border-slate-300">
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="font-bold text-slate-800 text-sm tabular-nums">{u.total.toLocaleString()}</span>
                        <DeltaBadge d={deltaOf(u.total, prevUnit[bkn])} />
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-emerald-600 tabular-nums">{u.done.toLocaleString()}</span></span>
                        <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /><span className="text-red-500 tabular-nums">{u.pending.toLocaleString()}</span></span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* highlight cards */}
      {bknEntries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {topDone && (
            <div className="relative rounded-2xl bg-gradient-to-br from-emerald-500 to-green-500 text-white p-6 shadow-lg overflow-hidden">
              <Check size={120} strokeWidth={3.5} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/80" />
              <div className="relative z-10">
                <div className="text-xs font-bold tracking-wide opacity-90 mb-2">ดำเนินการได้สูงสุด</div>
                <div className="text-lg font-extrabold mb-1">{topDone[0]}</div>
                <div className="text-6xl font-black tabular-nums leading-none mb-3">{donePct(topDone[1]).toFixed(1)}%</div>
                <span className="inline-block px-3 py-1.5 rounded-full bg-white/25 text-xs font-semibold backdrop-blur-sm">
                  เสร็จ {topDone[1].done.toLocaleString()} จาก {topDone[1].total.toLocaleString()} เรื่อง
                </span>
              </div>
            </div>
          )}
          {topPend && (
            <div className="relative rounded-2xl bg-gradient-to-br from-red-500 to-rose-500 text-white p-6 shadow-lg overflow-hidden">
              <AlertTriangle size={108} strokeWidth={2.5} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80" />
              <div className="relative z-10">
                <div className="text-xs font-bold tracking-wide opacity-90 mb-2">ค้างดำเนินการมากที่สุด</div>
                <div className="text-lg font-extrabold mb-1">{topPend[0]}</div>
                <div className="text-6xl font-black tabular-nums leading-none mb-3">{pendPct(topPend[1]).toFixed(1)}%</div>
                <span className="inline-block px-3 py-1.5 rounded-full bg-white/25 text-xs font-semibold backdrop-blur-sm">
                  ค้างสะสมรวม {topPend[1].pending.toLocaleString()} จาก {topPend[1].total.toLocaleString()} เรื่อง
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function Card({ children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-violet-500 to-pink-500" />
      <div className="p-6">{children}</div>
    </div>
  )
}
