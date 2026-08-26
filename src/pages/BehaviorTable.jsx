import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Layers, Search } from 'lucide-react'
import { fetchAllPages } from '../utils/supabasePagination'
import { deriveBehaviors } from '../utils/drugWide'
import { filterByDateColumn } from '../utils/filterRows'
import { dateToFiscalYear } from '../utils/fiscalYear'
import { useFilter } from '../context/FilterContext'
import { formatThaiDate } from '../utils/heroMeta'
import { DNAME_TO_GROUP } from '../utils/constants'
import { exportBehaviorTable } from '../utils/exportReport'
import DateFilter from '../components/DateFilter'

const BEHAVIOR_COLS = [
  { key: 'เสพ', header: 'เสพ' },
  { key: 'ค้า', header: 'ค้า' },
  { key: 'เสพ/ค้า', header: 'เสพ-ค้า' },
  { key: 'ผลิต', header: 'ผลิต' },
]

function normBehavior(tok) {
  const t = tok.trim().replace('เสพ-ค้า', 'เสพ/ค้า')
  return BEHAVIOR_COLS.some((c) => c.key === t) ? t : null
}

function filterLabel(state) {
  if (!state) return 'ทั้งหมด'
  if (state.mode === 'fiscal') return state.fiscalYear ? `ปีงบ ${state.fiscalYear}` : 'ทุกปีงบ'
  if (state.mode === 'month') {
    if (!state.monthYear) return 'ทุกปีงบ'
    if (!state.month) return `ปีงบ ${state.monthYear}`
    return `เดือน ${state.month}/${state.monthYear}`
  }
  if (state.customFrom && state.customTo) return `${state.customFrom} – ${state.customTo}`
  return 'ทั้งหมด'
}

export default function BehaviorTable() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('total')
  const [sortDir, setSortDir] = useState('desc')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetchAllPages('drug_incidents', 'district, received_date, beh_use, beh_sell, beh_use_sell, beh_produce')
      .then((rs) => { setRows(rs.map((r) => ({ ...r, behaviors: deriveBehaviors(r) }))); setReady(true) })
      .catch((err) => { console.error('[/districts/behavior-table] fetch failed:', err); setReady(true) })
  }, [])

  const { getDateRange, state } = useFilter()
  const range = getDateRange()
  const rFrom = range?.from
  const rTo = range?.to

  const availableYears = useMemo(() => {
    const s = new Set()
    rows.forEach((r) => { const fy = dateToFiscalYear(r.received_date); if (fy) s.add(fy) })
    return [...s].sort((a, b) => b - a)
  }, [rows])

  const fRows = useMemo(() => filterByDateColumn(rows, 'received_date', range), [rows, rFrom, rTo])

  // aggregate ทุก 50 เขต กทม. (pre-seed แล้ว filter startsWith('เขต') กันอำเภอนอกเขต/typo หลุดเข้าตาราง)
  const table = useMemo(() => {
    const m = {}
    for (const d of Object.keys(DNAME_TO_GROUP)) m[d] = { district: d, 'เสพ': 0, 'ค้า': 0, 'เสพ/ค้า': 0, 'ผลิต': 0 }
    for (const r of fRows) {
      const d = r.district
      if (!d || !d.startsWith('เขต') || !m[d]) continue
      if (!r.behaviors) continue
      for (const tok of String(r.behaviors).split(',')) {
        const cat = normBehavior(tok)
        if (cat) m[d][cat]++
      }
    }
    return Object.values(m).map((row) => ({
      ...row,
      total: row['เสพ'] + row['ค้า'] + row['เสพ/ค้า'] + row['ผลิต'],
    }))
  }, [fRows])

  const filteredTable = useMemo(() => {
    const q = search.trim()
    return q ? table.filter((r) => r.district.includes(q)) : table
  }, [table, search])

  const sortedTable = useMemo(() => {
    const arr = [...filteredTable]
    arr.sort((a, b) => (sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]))
    return arr
  }, [filteredTable, sortKey, sortDir])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const periodLabel = (range?.from && range?.to)
    ? `${filterLabel(state)} (${formatThaiDate(range.from)} - ${formatThaiDate(range.to)})`
    : filterLabel(state)

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportBehaviorTable({ rows: table, periodLabel, filenamePrefix: 'behavior-table' })
    } catch (err) {
      console.error('[/districts/behavior-table] export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
        <button onClick={() => navigate('/districts')} className="flex items-center gap-2 text-violet-600 hover:text-violet-700 text-sm font-medium">
          <ArrowLeft size={16} /> กลับหน้าภาพรวมเขต
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center"><Layers size={20} /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">ตารางพฤติการณ์รายเขต</h1>
              <p className="text-sm text-slate-500 mt-0.5">ทุกเขต กทม. · {periodLabel}</p>
            </div>
          </div>
          <button onClick={handleExport} disabled={exporting}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition disabled:opacity-50 disabled:cursor-wait">
            <Download size={15} /> {exporting ? 'กำลังสร้างไฟล์...' : 'Export Excel'}
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <DateFilter availableYears={availableYears} />
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาเขต..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition bg-white" />
          </div>
        </div>

        <div className="bg-white rounded-2xl ring-1 ring-slate-200 border-l-4 border-l-violet-500 shadow-sm overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="border-b border-slate-200 text-xs text-slate-600">
                  <th onClick={() => toggleSort('district')}
                    className={`text-left px-4 py-3 font-semibold uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 transition ${sortKey === 'district' ? 'text-violet-700' : ''}`}>
                    เขต <span className="text-[10px]">{sortKey === 'district' ? (sortDir === 'desc' ? '▼' : '▲') : '▾'}</span>
                  </th>
                  {BEHAVIOR_COLS.map((c) => (
                    <th key={c.key} onClick={() => toggleSort(c.key)}
                      className={`text-right px-3 py-3 font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:bg-slate-100 transition ${sortKey === c.key ? 'text-violet-700' : ''}`}>
                      {c.header} <span className="text-[10px]">{sortKey === c.key ? (sortDir === 'desc' ? '▼' : '▲') : '▾'}</span>
                    </th>
                  ))}
                  <th onClick={() => toggleSort('total')}
                    className={`text-right px-3 py-3 font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:bg-slate-100 transition ${sortKey === 'total' ? 'text-violet-700' : ''}`}>
                    รวม <span className="text-[10px]">{sortKey === 'total' ? (sortDir === 'desc' ? '▼' : '▲') : '▾'}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTable.map((r) => (
                  <tr key={r.district} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{r.district}</div>
                      <div className="text-xs text-slate-500">{DNAME_TO_GROUP[r.district] || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r['เสพ'].toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r['ค้า'].toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r['เสพ/ค้า'].toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r['ผลิต'].toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-violet-700">{r.total.toLocaleString()}</td>
                  </tr>
                ))}
                {ready && sortedTable.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-sm">ไม่พบเขต</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
