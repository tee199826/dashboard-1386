import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BKN_COLORS } from '../utils/bknMapping'
import FilterPill from './FilterPill'

// ปีงบจาก period "01 ต.ค. 68-31 พ.ค. 69" → 2569
function fiscalYearOf(period) {
  const m = String(period || '').match(/(\d{2})\s*$/)
  return m ? 2500 + parseInt(m[1], 10) : null
}

// ผลต่างเทียบงวดก่อน (+เพิ่ม = rose, −ลด = emerald)
function DeltaBadge({ d }) {
  if (d == null || d === 0) return null
  const up = d > 0
  return (
    <span className={`text-[10px] font-semibold tabular-nums ${up ? 'text-rose-500' : 'text-emerald-600'}`}>
      {up ? '+' : '−'}{Math.abs(d).toLocaleString()}
    </span>
  )
}

const isSpw = b => b?.includes('สปพ')

/**
 * Section 3 — ตารางแยกตามกลุ่ม (heatmap บก.น. × กลุ่ม 1-5) + highlight cards
 * heatmap: slate sequential (มาก→เข้ม) · highlight: ring + accent bar
 */
export default function BknSummarySection() {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [highlightBkn, setHighlightBkn] = useState(null)
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
      <div className="text-sm font-semibold text-slate-500 mb-1">ยังไม่มีข้อมูล</div>
      <div className="text-xs text-slate-400 mb-5">กรุณาอัปโหลดไฟล์ 115_B ที่หน้า /upload</div>
      <a href="/upload" className="px-5 py-2 bg-slate-900 hover:bg-slate-700 text-white rounded-md text-sm font-semibold transition">ไปยังหน้าอัปโหลด</a>
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

  // slate sequential — 0..1 → rgba(slate-900) 0.03..0.26
  const slateFill = ratio => `rgba(15,23,42,${(0.03 + ratio * 0.23).toFixed(3)})`

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

  const visibleUnits = (bknFilter === 'all'
    ? [...bknNames, ...spwEntries.map(([b]) => b)]
    : [bknFilter])

  return (
    <Card>
      {/* header + filters */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-widest text-slate-500">RPT 115_B</div>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">ตารางแยกตามกลุ่ม</h3>
          <p className="text-sm text-slate-500 mt-1">
            แต่ละช่อง: รวม · <span className="text-emerald-600 font-medium">เสร็จ</span>/<span className="text-slate-500 font-medium">ค้าง</span>
            {prevPeriod && <> · <span className="text-rose-500 font-medium">+N</span> เพิ่มจากงวดก่อน</>} · เข้มขึ้น = จำนวนมากขึ้น
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterPill variant="white" value={bknFilter} onChange={setBknFilter}
            options={[['all', 'ทุก บก.น.'], ...bknNames.map(b => [b, b])]} />
          <FilterPill variant="white" value={String(fy || '')} onChange={pickFy} options={fyOptions}
            disabled={fyOptions.length <= 1}
            title={fyOptions.length <= 1 ? 'ข้อมูล RPT 115_B มีเฉพาะปีงบ 2569' : undefined} />
          <FilterPill variant="white" label="เปรียบเทียบ" value={highlightBkn || 'none'}
            onChange={v => setHighlightBkn(v === 'none' ? null : v)}
            options={[['none', 'บก.น. ▾'], ...bknNames.map(b => [b, b])]} />
        </div>
      </div>

      {/* heatmap */}
      {groups.length > 0 && (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="py-3 px-4 text-left text-white font-semibold bg-slate-800 sticky left-0 z-10 min-w-[110px]">หน่วยงาน</th>
                {groups.map(g => (
                  <th key={g} className="py-3 px-3 text-center font-semibold text-slate-600 bg-slate-100 min-w-[100px] border-l border-white">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 leading-none mb-0.5">กลุ่ม</div>
                    <div className="text-sm font-bold text-slate-700 leading-none">{g}</div>
                  </th>
                ))}
                <th className="py-3 px-4 text-center font-semibold text-white bg-slate-800 min-w-[100px] border-l border-slate-600">รวมทุกกลุ่ม</th>
              </tr>
            </thead>
            <tbody>
              {visibleUnits.map((bkn, ri) => {
                const u = unitMap[bkn] || { total: 0, done: 0, pending: 0 }
                const isSPWRow = isSpw(bkn)
                const isHL = highlightBkn === bkn
                const evenBg = ri % 2 === 0 ? '#ffffff' : '#f8fafc'
                const rowBg = isHL ? '#eef2f7' : evenBg
                return (
                  <tr key={bkn} onClick={() => setHighlightBkn(h => h === bkn ? null : bkn)}
                    className={`cursor-pointer transition-colors hover:brightness-[0.98] ${isSPWRow ? 'border-t-2 border-slate-300' : ''} ${isHL ? 'ring-1 ring-slate-300' : ''}`}
                    style={{ background: rowBg }}>
                    <td className="py-3.5 px-4 font-semibold sticky left-0 z-10"
                      style={{ color: BKN_COLORS[bkn] || (isSPWRow ? '#475569' : '#334155'), background: rowBg }}>
                      <div className="whitespace-nowrap">{bkn}</div>
                      {isSPWRow && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-semibold mt-0.5 inline-block ring-1 ring-slate-200">หน่วยพิเศษ</span>}
                    </td>
                    {groups.map(g => {
                      const cell = pivot[bkn]?.[g] || { total: 0, done: 0, pending: 0 }
                      const ratio = maxByGroup[g] > 0 ? cell.total / maxByGroup[g] : 0
                      return (
                        <td key={g} className="py-3.5 px-4 text-center border-l border-white" style={{ background: slateFill(ratio) }}>
                          <div className="flex items-baseline justify-center gap-1">
                            <span className="font-bold text-slate-800 text-sm tabular-nums">{cell.total.toLocaleString()}</span>
                            <DeltaBadge d={deltaOf(cell.total, prevPivot[bkn]?.[g])} />
                          </div>
                          <div className="flex items-center justify-center gap-2 mt-1">
                            <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-emerald-600 tabular-nums">{cell.done.toLocaleString()}</span></span>
                            <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" /><span className="text-slate-500 tabular-nums">{cell.pending.toLocaleString()}</span></span>
                          </div>
                        </td>
                      )
                    })}
                    <td className="py-3.5 px-4 text-center bg-slate-50 border-l-2 border-slate-200">
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="font-bold text-slate-900 text-sm tabular-nums">{u.total.toLocaleString()}</span>
                        <DeltaBadge d={deltaOf(u.total, prevUnit[bkn])} />
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-emerald-600 tabular-nums">{u.done.toLocaleString()}</span></span>
                        <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" /><span className="text-slate-500 tabular-nums">{u.pending.toLocaleString()}</span></span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* highlight cards — ring + accent bar (no solid fill) */}
      {bknEntries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {topDone && (
            <HighlightCard tone="emerald" eyebrow="ดำเนินการได้สูงสุด" name={topDone[0]}
              pct={donePct(topDone[1]).toFixed(1)}
              detail={`เสร็จ ${topDone[1].done.toLocaleString()} จาก ${topDone[1].total.toLocaleString()} เรื่อง`} />
          )}
          {topPend && (
            <HighlightCard tone="rose" eyebrow="ค้างดำเนินการมากที่สุด" name={topPend[0]}
              pct={pendPct(topPend[1]).toFixed(1)}
              detail={`ค้างสะสมรวม ${topPend[1].pending.toLocaleString()} จาก ${topPend[1].total.toLocaleString()} เรื่อง`} />
          )}
        </div>
      )}
    </Card>
  )
}

function HighlightCard({ tone, eyebrow, name, pct, detail }) {
  const accent = tone === 'emerald' ? 'bg-emerald-500' : 'bg-rose-500'
  const num = tone === 'emerald' ? 'text-emerald-700' : 'text-rose-600'
  return (
    <div className="relative rounded-lg ring-1 ring-slate-200 pl-6 pr-5 py-5 overflow-hidden">
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
      <div className="text-[11px] font-medium uppercase tracking-widest text-slate-500">{eyebrow}</div>
      <div className="mt-1.5 text-lg font-semibold text-slate-900">{name}</div>
      <div className={`mt-2 text-6xl font-semibold tracking-tight tabular-nums leading-none ${num}`}>{pct}%</div>
      <div className="mt-3 text-xs text-slate-500">{detail}</div>
    </div>
  )
}

function Card({ children }) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-slate-200 p-6 md:p-8">{children}</div>
  )
}
