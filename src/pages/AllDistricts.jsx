import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, MapPin, FileText, CheckCircle2, AlertTriangle, ShoppingBag, Info, ChevronRight } from 'lucide-react'
import { useData } from '../context/DataContext'
import { fetchAllPages } from '../utils/supabasePagination'
import { getDistrictMetrics } from '../utils/statistics'
import { DNAME_TO_GROUP } from '../utils/constants'
import { supabase } from '../lib/supabase'
import { formatThaiDate, formatPeriod, minMaxDate, getLastUploadDate } from '../utils/heroMeta'
import { dateToFiscalYear, getFiscalYearRange } from '../utils/fiscalYear'
import { filterByDateColumn } from '../utils/filterRows'
import { useFilter } from '../context/FilterContext'
import IncidentMap from '../components/IncidentMap'
import UnifiedHero from '../components/UnifiedHero'
import DateFilter from '../components/DateFilter'

const DISTRICTS_SOURCE_INFO = {
  title: 'แหล่งข้อมูล · สถิติรายเขต',
  description: 'รวมข้อมูลระดับเขต กทม. 50 เขต จาก 3 แหล่ง',
  sources: ['complaints', 'drug_incidents', 'substance_users.dealer_locations'],
  fields: ['ร้องเรียน', 'เหตุการณ์ยา', 'แหล่งซื้อ (ผู้เสพ)'],
}

// metric ที่เลือกระบายสีแผนที่ / เรียงตาราง — short=pill, map=หัวแผนที่, header=หัวตาราง(มีหน่วย)
const METRICS = [
  { id: 'complaints', short: 'ร้องเรียน',  map: 'เรื่องร้องเรียน',     header: 'ร้องเรียน (เรื่อง)',   color: '#2563eb' },
  { id: 'completed',  short: 'ดำเนินการ', map: 'ดำเนินการสำเร็จ',   header: 'ดำเนินการ (เรื่อง)',  color: '#059669' },
  { id: 'incidents',  short: 'เหตุการณ์', map: 'เหตุการณ์ยาเสพติด', header: 'เหตุการณ์ยา (ครั้ง)', color: '#dc2626' },
  { id: 'dealers',    short: 'แหล่งซื้อ',  map: 'แหล่งซื้อยาเสพติด',   header: 'แหล่งซื้อ (แห่ง)',    color: '#7c3aed' },
]

// % เปลี่ยนแปลง current vs prev (null = ไม่มีฐานเทียบ)
function changePct(current, prev) {
  if (!prev || prev === 0) return null
  return (current - prev) / prev * 100
}

// สีตาม % change (compare mode) — ลด=เขียว(ดี) / ใกล้เคียง=เทา / เพิ่ม=แดง(แย่) / ไม่มีฐาน=เทาอ่อน
function pctColor(pct) {
  if (pct == null) return '#e2e8f0'   // slate-200 — no prev data
  if (pct < -10) return '#10b981'     // emerald-500
  if (pct < -2)  return '#6ee7b7'     // emerald-300
  if (pct <= 2)  return '#cbd5e1'     // slate-300
  if (pct <= 10) return '#fda4af'     // rose-300
  return '#f43f5e'                    // rose-500
}

export default function AllDistricts() {
  const { records } = useData()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('complaints')
  const [metric, setMetric] = useState('complaints')   // ระบายสีแผนที่ตาม metric นี้
  const [selectedDistrict, setSelectedDistrict] = useState(null)   // เขตที่คลิกในตาราง → highlight บนแผนที่
  const [compareMode, setCompareMode] = useState(false)            // เทียบกับปีงบก่อน
  const [incidents, setIncidents] = useState([])
  const [dealerRows, setDealerRows] = useState([])
  const [lastUpload, setLastUpload] = useState(null)

  // ดึง drug_incidents + substance dealer_locations (complaints มาจาก useData)
  useEffect(() => {
    fetchAllPages('drug_incidents', 'district, received_date').then(setIncidents).catch(() => {})
    fetchAllPages('substance_users', 'dealer_locations, surveyed_at').then(setDealerRows).catch(() => {})
    getLastUploadDate(supabase, ['complaints', 'drug_incidents', 'substance_users']).then(setLastUpload).catch(() => {})
  }, [])

  // ช่วงข้อมูล = min-max ของ complaints + drug_incidents (received_date) — ใช้ raw
  const heroPeriod = useMemo(() => {
    const c = minMaxDate(records, 'date')
    const i = minMaxDate(incidents, 'received_date')
    const mins = [c.min, i.min].filter(Boolean).sort()
    const maxs = [c.max, i.max].filter(Boolean).sort()
    return formatPeriod(mins[0], maxs[maxs.length - 1])
  }, [records, incidents])

  // ── DateFilter (page-level) ──
  const { getDateRange, state } = useFilter()
  const range = getDateRange()
  // ปีงบปัจจุบัน (เฉพาะ mode 'fiscal' ที่เลือกปี) → ปีงบก่อน = -1 ; ไม่ครบ → ปิดฟีเจอร์เทียบ
  const currentFY = state.mode === 'fiscal' ? state.fiscalYear : null
  const prevFY = currentFY ? currentFY - 1 : null
  // ปีงบที่มี data จริง — รวมทุก source ที่หน้านี้ใช้ (complaints.date + drug_incidents.received_date + substance_users.surveyed_at)
  const availableYears = useMemo(() => {
    const s = new Set()
    records.forEach(r => { const fy = dateToFiscalYear(r.date); if (fy) s.add(fy) })
    incidents.forEach(r => { const fy = dateToFiscalYear(r.received_date); if (fy) s.add(fy) })
    dealerRows.forEach(r => { const fy = dateToFiscalYear(r.surveyed_at); if (fy) s.add(fy) })
    return [...s].sort((a, b) => b - a)
  }, [records, incidents, dealerRows])

  // กรองตามช่วงก่อน aggregate (complaints.date / incidents.received_date / dealer.surveyed_at)
  const fRecords = useMemo(() => filterByDateColumn(records, 'date', range), [records, range?.from, range?.to])
  const fIncidents = useMemo(() => filterByDateColumn(incidents, 'received_date', range), [incidents, range?.from, range?.to])
  const fDealers = useMemo(() => filterByDateColumn(dealerRows, 'surveyed_at', range), [dealerRows, range?.from, range?.to])

  // รวม metric รายเขต (กรองเฉพาะเขต กทม. ตอน aggregate — raw ไม่ถูกตัด)
  const metrics = useMemo(
    () => getDistrictMetrics(fRecords, fIncidents, fDealers),
    [fRecords, fIncidents, fDealers],
  )
  const byName = useMemo(() => Object.fromEntries(metrics.map(m => [m.district, m])), [metrics])

  const totals = useMemo(() => ({
    districts:  metrics.length,
    complaints: metrics.reduce((s, m) => s + m.complaints, 0),
    completed:  metrics.reduce((s, m) => s + m.completed, 0),
    incidents:  metrics.reduce((s, m) => s + m.incidents, 0),
    dealers:    metrics.reduce((s, m) => s + m.dealers, 0),
  }), [metrics])

  // ── ปีงบก่อน — กรอง raw ตาม prevFY range แล้วเรียก getDistrictMetrics ซ้ำ (ไม่แตะ logic เดิม) ──
  const prevRange = prevFY ? getFiscalYearRange(prevFY) : null
  const pRecords = useMemo(() => prevRange ? filterByDateColumn(records, 'date', prevRange) : [], [records, prevRange?.from, prevRange?.to])
  const pIncidents = useMemo(() => prevRange ? filterByDateColumn(incidents, 'received_date', prevRange) : [], [incidents, prevRange?.from, prevRange?.to])
  const pDealers = useMemo(() => prevRange ? filterByDateColumn(dealerRows, 'surveyed_at', prevRange) : [], [dealerRows, prevRange?.from, prevRange?.to])
  const metricsPrev = useMemo(() => getDistrictMetrics(pRecords, pIncidents, pDealers), [pRecords, pIncidents, pDealers])
  const byNamePrev = useMemo(() => Object.fromEntries(metricsPrev.map(m => [m.district, m])), [metricsPrev])
  const totalsPrev = useMemo(() => ({
    complaints: metricsPrev.reduce((s, m) => s + m.complaints, 0),
    completed:  metricsPrev.reduce((s, m) => s + m.completed, 0),
    incidents:  metricsPrev.reduce((s, m) => s + m.incidents, 0),
    dealers:    metricsPrev.reduce((s, m) => s + m.dealers, 0),
  }), [metricsPrev])
  const compareAvailable = !!prevFY && metricsPrev.length > 0
  const showCompare = compareMode && compareAvailable
  const kpiChange = (cur, prev) => compareAvailable ? changePct(cur, prev) : null

  const metricMax = useMemo(
    () => Math.max(1, ...metrics.map(m => m[metric] || 0)),
    [metrics, metric],
  )

  const table = useMemo(() => {
    const q = search.trim()
    const t = metrics.filter(m => !q || m.district.includes(q))
    return [...t].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
  }, [metrics, search, sortKey])

  // ── choropleth layer (สีตาม metric / mode เทียบปี) ──
  const activeMetric = METRICS.find(m => m.id === metric) || METRICS[0]
  const activeColor = activeMetric.color
  const layerKey = `ad-${metric}-${metrics.length}`
  const layerStyle = useMemo(() => (feature) => {
    const dn = feature.properties?.dname
    const isSel = dn && dn === selectedDistrict
    if (showCompare) {
      const cur = byName[dn]?.[metric] || 0
      const prv = byNamePrev[dn]?.[metric]
      const pct = changePct(cur, prv)
      const hasData = !!(byName[dn] || byNamePrev[dn])
      return { color: isSel ? '#0f172a' : '#cbd5e1', weight: isSel ? 3 : 1, fillColor: pctColor(pct), fillOpacity: hasData ? 0.7 : 0.12, opacity: 0.95 }
    }
    const v = byName[dn]?.[metric] || 0
    if (v === 0) return { color: isSel ? '#0f172a' : '#e2e8f0', weight: isSel ? 3 : 1, fillColor: activeColor, fillOpacity: 0.04, opacity: isSel ? 1 : 0.5 }
    const t = v / metricMax
    return { color: isSel ? '#0f172a' : '#cbd5e1', weight: isSel ? 3 : 1, fillColor: activeColor, fillOpacity: 0.12 + t * 0.75, opacity: 0.95 }
  }, [byName, byNamePrev, metric, metricMax, activeColor, selectedDistrict, showCompare])
  const layerOnEach = useMemo(() => (feature, layer) => {
    const dn = feature.properties?.dname || 'ไม่ระบุ'
    const m = byName[dn]
    const group = DNAME_TO_GROUP[dn] || '—'
    if (showCompare) {
      const p = byNamePrev[dn]
      const cmpRow = (lbl, curV, prevV) => {
        const ch = changePct(curV, prevV)
        const col = ch == null ? '#94a3b8' : (ch >= 0 ? '#e11d48' : '#059669')
        const txt = ch == null ? '—' : `${ch >= 0 ? '+' : ''}${ch.toFixed(1)}%`
        return `<tr>
          <td style="text-align:left;color:#334155;padding:1px 0">${lbl}</td>
          <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;padding:1px 8px">${curV.toLocaleString()}</td>
          <td style="text-align:right;color:#94a3b8;font-variant-numeric:tabular-nums;padding:1px 8px">${(prevV || 0).toLocaleString()}</td>
          <td style="text-align:right;color:${col};font-variant-numeric:tabular-nums;padding:1px 0">${txt}</td>
        </tr>`
      }
      layer.bindTooltip(
        `<div style="min-width:260px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid #f1f5f9">
            <span style="font-weight:700;color:#0f172a">${dn}</span><span style="font-size:11px;color:#64748b">${group}</span>
          </div>
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            <thead><tr style="color:#94a3b8;font-size:11px">
              <th style="text-align:left;font-weight:400">รายการ</th>
              <th style="text-align:right;font-weight:400;padding:0 8px">${currentFY}</th>
              <th style="text-align:right;font-weight:400;padding:0 8px">${prevFY}</th>
              <th style="text-align:right;font-weight:400">Δ</th>
            </tr></thead>
            <tbody>
              ${cmpRow('ร้องเรียน', m?.complaints || 0, p?.complaints)}
              ${cmpRow('ดำเนินการ', m?.completed || 0, p?.completed)}
              ${cmpRow('เหตุการณ์', m?.incidents || 0, p?.incidents)}
              ${cmpRow('แหล่งซื้อ', m?.dealers || 0, p?.dealers)}
            </tbody>
          </table>
        </div>`,
        { sticky: true, className: 'su-district-tooltip' },
      )
      return
    }
    const complaints = m?.complaints || 0
    const done = m?.completed || 0
    const pct = complaints ? Math.round(done / complaints * 100) : 0
    const incidents = m?.incidents || 0
    const dealers = m?.dealers || 0
    const r = (lbl, val, color) =>
      `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#64748b">${lbl}</span><span style="font-weight:600;font-variant-numeric:tabular-nums;color:${color || '#0f172a'}">${val}</span></div>`
    layer.bindTooltip(
      `<div style="min-width:210px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid #f1f5f9">
          <span style="font-weight:700;color:#0f172a">${dn}</span><span style="font-size:11px;color:#64748b">${group}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;font-size:12px">
          ${r('เรื่องร้องเรียน', `${complaints.toLocaleString()} เรื่อง`)}
          ${r('ดำเนินการสำเร็จ', `${done.toLocaleString()} เรื่อง (${pct}%)`, '#047857')}
          ${r('เหตุการณ์ยา', `${incidents.toLocaleString()} ครั้ง`)}
          ${r('แหล่งซื้อ', `${dealers.toLocaleString()} แห่ง`)}
        </div>
      </div>`,
      { sticky: true, className: 'su-district-tooltip' },
    )
  }, [byName, byNamePrev, showCompare, currentFY, prevFY])

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.05),_transparent_50%)]" />
      <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        <button onClick={() => navigate('/')}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium">
          <ArrowLeft size={16} /> กลับหน้าหลัก
        </button>

        <UnifiedHero
          gradient="indigo"
          eyebrow="DISTRICT OVERVIEW · กรุงเทพมหานคร"
          title="สถิติรายเขต"
          description="เปรียบเทียบ 50 เขต กทม. · รวมข้อมูลร้องเรียน · เหตุการณ์ยา · แหล่งซื้อ"
          period={heroPeriod}
          lastUpload={formatThaiDate(lastUpload)}
          sourceInfo={DISTRICTS_SOURCE_INFO}
        />

        <DateFilter availableYears={availableYears} />

        {/* KPI strip — vibrant premium */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard icon={<MapPin className="w-7 h-7" />} gradient="from-blue-500 to-indigo-600" shadow="shadow-blue-500/30"
            value={totals.districts} label="เขต กทม." sublabel="6 กลุ่ม บก.น." tooltip="พื้นที่ กทม. 50 เขต แบ่งเป็น 6 กลุ่ม บก.น." />
          <KpiCard icon={<FileText className="w-7 h-7" />} gradient="from-violet-500 to-purple-600" shadow="shadow-violet-500/30"
            value={totals.complaints} label="เรื่องร้องเรียนยาเสพติด" sublabel="ผ่านสายด่วน 1386" tooltip="จำนวนเรื่องร้องเรียนยาเสพติดผ่านสายด่วน 1386"
            change={kpiChange(totals.complaints, totalsPrev.complaints)} comparePrevFY={prevFY} />
          <KpiCard icon={<CheckCircle2 className="w-7 h-7" />} gradient="from-emerald-500 to-teal-600" shadow="shadow-emerald-500/30"
            value={totals.completed} label="ดำเนินการสำเร็จ"
            sublabel={`${totals.complaints ? (totals.completed / totals.complaints * 100).toFixed(1) : 0}% ของเรื่องร้องเรียน`}
            tooltip="เรื่องร้องเรียนที่ดำเนินการเสร็จสิ้นแล้ว"
            change={kpiChange(totals.completed, totalsPrev.completed)} comparePrevFY={prevFY} />
          <KpiCard icon={<AlertTriangle className="w-7 h-7" />} gradient="from-rose-500 to-pink-600" shadow="shadow-rose-500/30"
            value={totals.incidents} label="เหตุการณ์ยาเสพติด" sublabel="จับกุม/ตรวจค้น/ตรวจปัสสาวะ" tooltip="เหตุการณ์ยาเสพติดจากการปฏิบัติงาน (จับกุม/ตรวจค้น/ตรวจปัสสาวะ)"
            change={kpiChange(totals.incidents, totalsPrev.incidents)} comparePrevFY={prevFY} />
          <KpiCard icon={<ShoppingBag className="w-7 h-7" />} gradient="from-amber-500 to-orange-600" shadow="shadow-amber-500/30"
            value={totals.dealers} label="แหล่งซื้อยาเสพติด" sublabel={`ผู้เสพระบุ จาก ${fDealers.length.toLocaleString()} ราย`} tooltip="แหล่งซื้อยาเสพติดที่ผู้เสพระบุในแบบสำรวจ"
            change={kpiChange(totals.dealers, totalsPrev.dealers)} comparePrevFY={prevFY} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map card — premium + dynamic title */}
          <div className="group relative lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100
            shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_40px_rgba(59,130,246,0.12)] hover:border-blue-200 transition-all duration-300">
            <div className="absolute top-0 left-6 right-6 h-0.5 bg-gradient-to-r from-transparent via-blue-300 to-transparent opacity-0 group-hover:opacity-100 transition" />
            <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-600" /> แผนที่ความหนาแน่น: {activeMetric.map} รายเขต
                </h3>
                <p className="text-sm text-slate-500 mt-1">เขตสีเข้ม = ตัวเลขสูง · คลิกเขตเพื่อดูรายละเอียด</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {compareAvailable && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className={`relative w-9 h-5 rounded-full transition-all ${compareMode ? 'bg-gradient-to-r from-blue-500 to-indigo-500 shadow-md shadow-blue-500/30' : 'bg-slate-300'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow ${compareMode ? 'left-[18px]' : 'left-0.5'}`} />
                    </div>
                    <input type="checkbox" className="sr-only" checked={compareMode} onChange={e => setCompareMode(e.target.checked)} />
                    <span className="text-xs font-medium text-slate-700">เทียบ {prevFY}</span>
                  </label>
                )}
                <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
                  {METRICS.map(m => (
                    <button key={m.id} onClick={() => setMetric(m.id)}
                      className={`h-7 px-3 text-xs font-medium rounded-md transition ${
                        metric === m.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
                      {m.short}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* color scale legend — เปลี่ยนตาม mode */}
            {showCompare ? (
              <div className="flex items-center gap-2 mb-3 text-xs flex-wrap">
                <span className="text-emerald-600 font-medium">ดีขึ้น</span>
                <div className="flex-1 h-2 max-w-[220px] rounded-full" style={{ background: 'linear-gradient(to right, #10b981, #6ee7b7, #cbd5e1, #fda4af, #f43f5e)' }} />
                <span className="text-rose-600 font-medium">แย่ลง</span>
                <span className="text-slate-400 ml-1">% เทียบ {prevFY}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-slate-500">น้อย</span>
                <div className="flex-1 h-2 max-w-[200px] rounded-full" style={{ background: `linear-gradient(to right, ${activeColor}22, ${activeColor})` }} />
                <span className="text-xs text-slate-500">มาก</span>
                <span className="text-xs text-slate-400 ml-2 tabular-nums">0 - {metricMax.toLocaleString()}</span>
              </div>
            )}
            <div className="relative h-[600px] rounded-xl overflow-hidden">
              <IncidentMap
                key={layerKey}
                className="w-full h-full"
                points={[]}
                viewMode="point"
                getColor={() => activeColor}
                districtLayerKey={`${layerKey}-${selectedDistrict || 'none'}-${showCompare ? 'cmp' : 'norm'}`}
                districtLayerStyle={layerStyle}
                districtLayerOnEachFeature={layerOnEach}
              />
            </div>
          </div>

          {/* Table card — premium */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_40px_rgba(59,130,246,0.12)] transition-all duration-300 overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-3">ตารางรายเขต</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเขต..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition" />
              </div>
            </div>
            <div className="overflow-auto max-h-[560px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr className="border-b border-slate-200 text-xs text-slate-600">
                    <th className="text-left px-4 py-3 font-semibold uppercase tracking-wider">เขต</th>
                    {METRICS.map(m => (
                      <th key={m.id} onClick={() => setSortKey(m.id)}
                        className={`text-right px-3 py-3 font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:bg-slate-100 transition ${sortKey === m.id ? 'text-blue-700' : ''}`}>
                        {m.header} <span className="text-[10px]">{sortKey === m.id ? '▼' : '▾'}</span>
                      </th>
                    ))}
                    {showCompare && (
                      <th className="text-right px-3 py-3 font-semibold uppercase tracking-wider whitespace-nowrap text-slate-600">Δ {activeMetric.short} ปีก่อน</th>
                    )}
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {table.map((m) => {
                    const isSel = m.district === selectedDistrict
                    const pct = m.complaints ? Math.min(100, m.completed / m.complaints * 100) : 0
                    return (
                      <tr key={m.district} onClick={() => setSelectedDistrict(isSel ? null : m.district)}
                        className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors ${isSel ? 'bg-blue-50' : 'hover:bg-blue-50/40'}`}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{m.district}</div>
                          <div className="text-xs text-slate-500">{DNAME_TO_GROUP[m.district] || '—'}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-700">{m.complaints.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="tabular-nums font-medium text-emerald-700">{m.completed.toLocaleString()}</div>
                          <div className="mt-1 ml-auto h-1 w-full max-w-[56px] rounded-full bg-emerald-100 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-rose-700">{m.incidents.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-violet-700">{m.dealers.toLocaleString()}</td>
                        {showCompare && (() => {
                          const cur = m[metric] || 0
                          const prv = byNamePrev[m.district]?.[metric]
                          const ch = changePct(cur, prv)
                          return (
                            <td className="px-3 py-2.5 text-xs">
                              {ch != null ? (
                                <div className={`flex flex-col items-end ${ch >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  <span className="font-semibold">{ch >= 0 ? '▲' : '▼'} {Math.abs(ch).toFixed(1)}%</span>
                                  <span className="text-[10px] text-slate-400 tabular-nums">{(prv ?? 0).toLocaleString()} → {cur.toLocaleString()}</span>
                                </div>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                          )
                        })()}
                        <td className="px-2 py-2.5 text-right"><ChevronRight className="w-4 h-4 text-blue-500 inline" /></td>
                      </tr>
                    )
                  })}
                  {table.length === 0 && (
                    <tr><td colSpan={showCompare ? 7 : 6} className="px-6 py-8 text-center text-slate-400 text-sm">ไม่พบเขต</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// counter เด้งเลขขึ้น (ease-out cubic ~0.8s)
function AnimatedCounter({ value, duration = 800 }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (typeof value !== 'number' || isNaN(value)) return
    let raf
    const start = performance.now()
    const animate = now => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.floor(value * eased))
      if (progress < 1) raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return display.toLocaleString()
}

// KPI card — vibrant gradient + glow + นูน + animated counter + info tooltip + %change vs ปีก่อน
function KpiCard({ icon, value, label, sublabel, gradient, shadow = 'shadow-blue-500/30', tooltip, change, comparePrevFY }) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ${gradient} shadow-xl ${shadow}
      hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-help`}>
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
      <div className="relative z-10 flex justify-between items-start mb-3">
        <span className="text-white/90">{icon}</span>
        {tooltip && <span title={tooltip} className="text-white/60 cursor-help"><Info className="w-4 h-4" /></span>}
      </div>
      <div className="relative z-10">
        <div className="text-3xl font-bold text-white tabular-nums leading-none"><AnimatedCounter value={value || 0} /></div>
        <div className="text-sm text-white/85 mt-1 font-medium">{label}</div>
        {sublabel && <div className="text-xs text-white/60 mt-0.5">{sublabel}</div>}
        {change != null && (
          <div className="flex items-center gap-1 mt-2 text-xs text-white/90">
            <span>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%</span>
            <span className="text-white/60">vs {comparePrevFY}</span>
          </div>
        )}
      </div>
    </div>
  )
}
