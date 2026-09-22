import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Crosshair, Download, Search, X } from 'lucide-react'
import { aggregateAreas, areaName, AREA_LEVELS, BEHAVIOR_LABELS, isBkkDistrict } from "../../shared/geo/areaStats.js"

const PAGE = 60

// สีแท่งพฤติการณ์ — palette slate/rose/emerald/amber
const BEH_COLOR = { 'เสพ': '#f59e0b', 'ค้า': '#e11d48', 'เสพ/ค้า': '#be123c', 'ผลิต': '#0f172a' }

/**
 * แผงสถิติรายพื้นที่ (เขต/แขวง/ชุมชน) ข้างแผนที่ /radar
 * - นับ "ครั้ง" จาก rows ที่กรองตาม view ปัจจุบัน (ตัวเลขเดียวกับจุดบนแผนที่ + Excel)
 * - คลิกแถว → onFocus(area) ให้แผนที่บินไป + เปิด popup
 */
export default function AreaStatsPanel({ rows, level, onLevelChange, onFocus, onExport, exporting = false, onClose, activeKey = null }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'total', dir: 'desc' })
  const [limit, setLimit] = useState(PAGE)

  const areas = useMemo(() => aggregateAreas(rows, level), [rows, level])
  const outsideBkk = useMemo(() => rows.reduce((n, r) => n + (isBkkDistrict(r.district) ? 0 : 1), 0), [rows])
  const totals = useMemo(() => {
    const t = { total: 0 }
    for (const b of BEHAVIOR_LABELS) t[b] = 0
    for (const a of areas) { t.total += a.total; for (const b of BEHAVIOR_LABELS) t[b] += a.beh[b] || 0 }
    return t
  }, [areas])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    let list = s ? areas.filter((a) => `${a.district} ${a.subdistrict} ${a.community}`.toLowerCase().includes(s)) : areas
    const val = (a) => (sort.key === 'total' ? a.total : sort.key === 'name' ? areaName(a) : a.beh[sort.key] || 0)
    list = [...list].sort((x, y) => {
      const a = val(x), b = val(y)
      const c = typeof a === 'string' ? a.localeCompare(b, 'th') : a - b
      return sort.dir === 'asc' ? c : -c
    })
    return list
  }, [areas, q, sort])

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }))
  const SortIcon = ({ k }) => sort.key === k ? (sort.dir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />) : null
  const th = (k, text, cls = '') => (
    <th key={k} onClick={() => toggleSort(k)} className={`px-2 py-2 font-semibold text-[11px] uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-slate-900 ${sort.key === k ? 'text-rose-700' : 'text-slate-500'} ${cls}`}>
      <span className="inline-flex items-center gap-0.5">{text}<SortIcon k={k} /></span>
    </th>
  )
  const maxTotal = areas[0]?.total || 1

  return (
    <div className="flex flex-col h-full bg-white">
      {/* header */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-200 bg-slate-900 text-white">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">สถิติรายพื้นที่ · นับครั้ง</div>
            <div className="text-lg font-bold leading-tight tabular-nums">{totals.total.toLocaleString()} <span className="text-sm font-medium text-slate-300">ครั้ง · {areas.length.toLocaleString()} {AREA_LEVELS.find((l) => l.id === level)?.label}</span></div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onExport} disabled={exporting || !rows.length} title="Export Excel สถิติรายพื้นที่ (เขต/แขวง/ชุมชน)"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition">
              <Download size={13} /> {exporting ? 'กำลังสร้าง...' : 'Excel'}
            </button>
            <button onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/10"><X size={16} /></button>
          </div>
        </div>
        {/* สรุปพฤติการณ์ */}
        <div className="mt-2 grid grid-cols-4 gap-1">
          {BEHAVIOR_LABELS.map((b) => (
            <div key={b} className="rounded-md bg-white/5 px-2 py-1">
              <div className="text-[10px] text-slate-400 leading-none">{b}</div>
              <div className="text-sm font-bold tabular-nums leading-tight">{totals[b].toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* level tabs + search */}
      <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
        <div className="flex border border-slate-200 rounded-md overflow-hidden text-xs">
          {AREA_LEVELS.map((l) => (
            <button key={l.id} onClick={() => { onLevelChange(l.id); setLimit(PAGE) }}
              className={`px-2.5 py-1.5 font-medium transition border-r border-slate-200 last:border-r-0 ${level === l.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} placeholder={`ค้นหา${AREA_LEVELS.find((l) => l.id === level)?.label}...`}
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md outline-none focus:bg-white focus:border-slate-400" />
        </div>
      </div>

      {/* table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
            <tr>
              {th('name', 'พื้นที่', 'text-left')}
              {th('total', 'ครั้ง', 'text-right')}
              {BEHAVIOR_LABELS.map((b) => th(b, b, 'text-right'))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={2 + BEHAVIOR_LABELS.length} className="px-3 py-8 text-center text-slate-400">ไม่มีข้อมูลในช่วง/ตัวกรองที่เลือก</td></tr>
            )}
            {shown.slice(0, limit).map((a, i) => {
              const active = a.key === activeKey
              const parent = level === 'district' ? a.zone : level === 'subdistrict' ? a.district : [a.district, a.subdistrict].filter(Boolean).join(' · ')
              const topDrug = Object.entries(a.drugs).sort((x, y) => y[1] - x[1])[0]
              return (
                <tr key={a.key} onClick={() => onFocus?.(a)} title={a.lat ? 'คลิกเพื่อไปยังพื้นที่บนแผนที่' : 'ไม่มีพิกัดในพื้นที่นี้'}
                  className={`border-b border-slate-100 cursor-pointer transition ${active ? 'bg-rose-50' : 'hover:bg-slate-50'}`}>
                  <td className="px-2 py-1.5 align-top">
                    <div className="flex items-start gap-1.5">
                      <span className="text-[10px] text-slate-400 tabular-nums w-5 shrink-0 pt-0.5">{i + 1}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 truncate max-w-[170px] flex items-center gap-1">
                          {areaName(a)}
                          {a.lat && <Crosshair size={10} className="text-slate-300 shrink-0" />}
                        </div>
                        {parent && <div className="text-[10px] text-slate-500 truncate max-w-[170px]">{parent}</div>}
                        {/* แท่งสัดส่วนเทียบพื้นที่สูงสุด + ยาเด่น */}
                        <div className="mt-1 flex items-center gap-1.5">
                          <div className="h-1 w-20 bg-slate-100 rounded overflow-hidden">
                            <div className="h-full bg-rose-500" style={{ width: `${Math.max(3, (a.total / maxTotal) * 100)}%` }} />
                          </div>
                          {topDrug && <span className="text-[10px] text-slate-500">{topDrug[0]} {topDrug[1]}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right align-top font-bold text-rose-700 tabular-nums">{a.total.toLocaleString()}</td>
                  {BEHAVIOR_LABELS.map((b) => {
                    const v = a.beh[b] || 0
                    return (
                      <td key={b} className={`px-2 py-1.5 text-right align-top tabular-nums ${v ? 'text-slate-800' : 'text-slate-300'}`}>
                        <span className="inline-flex items-center gap-1">
                          {v > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: BEH_COLOR[b] }} />}
                          {v.toLocaleString()}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length > limit && (
          <button onClick={() => setLimit((n) => n + PAGE)} className="w-full py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 border-t border-slate-100">
            แสดงเพิ่ม ({shown.length - limit} รายการที่เหลือ)
          </button>
        )}
      </div>
      <div className="px-3 py-1.5 border-t border-slate-200 text-[10px] text-slate-400 bg-slate-50">
        1 ครั้ง = 1 เรื่องร้องเรียน · พฤติการณ์นับตามที่บันทึก · ตัวเลขตรงกับตัวกรองปัจจุบัน{outsideBkk > 0 && ` · ไม่รวมนอก กทม. ${outsideBkk.toLocaleString()} ครั้ง`}
      </div>
    </div>
  )
}
