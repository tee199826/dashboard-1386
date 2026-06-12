import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, MapPin, FileText, CheckCircle2, AlertTriangle, ShoppingBag } from 'lucide-react'
import { useData } from '../context/DataContext'
import { fetchAllPages } from '../utils/supabasePagination'
import { getDistrictMetrics } from '../utils/statistics'
import { DNAME_TO_GROUP } from '../utils/constants'
import { supabase } from '../lib/supabase'
import { formatThaiDate, formatPeriod, minMaxDate, getLastUploadDate } from '../utils/heroMeta'
import { dateToFiscalYear } from '../utils/fiscalYear'
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

// metric ที่เลือกระบายสีแผนที่ / เรียงตาราง
const METRICS = [
  { id: 'complaints', label: 'เรื่องร้องเรียน', color: '#2563eb' },
  { id: 'completed',  label: 'ดำเนินการแล้ว',  color: '#059669' },
  { id: 'incidents',  label: 'เหตุการณ์ยา',     color: '#dc2626' },
  { id: 'dealers',    label: 'แหล่งซื้อ',        color: '#7c3aed' },
]

export default function AllDistricts() {
  const { records } = useData()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('complaints')
  const [metric, setMetric] = useState('complaints')   // ระบายสีแผนที่ตาม metric นี้
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
  const { getDateRange } = useFilter()
  const range = getDateRange()
  const availableYears = useMemo(() => {
    const s = new Set()
    records.forEach(r => { const fy = dateToFiscalYear(r.date); if (fy) s.add(fy) })
    incidents.forEach(r => { const fy = dateToFiscalYear(r.received_date); if (fy) s.add(fy) })
    return [...s].sort((a, b) => b - a)
  }, [records, incidents])

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

  const metricMax = useMemo(
    () => Math.max(1, ...metrics.map(m => m[metric] || 0)),
    [metrics, metric],
  )

  const table = useMemo(() => {
    const q = search.trim()
    const t = metrics.filter(m => !q || m.district.includes(q))
    return [...t].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
  }, [metrics, search, sortKey])

  // ── choropleth layer (สีน้ำเงิน BKK) ──
  const activeColor = METRICS.find(m => m.id === metric)?.color || '#2563eb'
  const layerKey = `ad-${metric}-${metrics.length}`
  const layerStyle = useMemo(() => (feature) => {
    const dn = feature.properties?.dname
    const v = byName[dn]?.[metric] || 0
    if (v === 0) return { color: '#e2e8f0', weight: 1, fillColor: activeColor, fillOpacity: 0.04, opacity: 0.5 }
    const t = v / metricMax
    return { color: '#cbd5e1', weight: 1, fillColor: activeColor, fillOpacity: 0.12 + t * 0.75, opacity: 0.95 }
  }, [byName, metric, metricMax, activeColor])
  const layerOnEach = useMemo(() => (feature, layer) => {
    const dn = feature.properties?.dname || 'ไม่ระบุ'
    const m = byName[dn]
    layer.bindTooltip(
      `<b>${dn}</b><br/>ร้องเรียน ${m?.complaints || 0} · เหตุการณ์ ${m?.incidents || 0} · แหล่งซื้อ ${m?.dealers || 0}`,
      { sticky: true, className: 'su-district-tooltip' },
    )
  }, [byName])

  return (
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

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi icon={<MapPin size={18} />}      label="เขต กทม."        value={totals.districts}  tone="slate"   />
        <Kpi icon={<FileText size={18} />}    label="เรื่องร้องเรียน"  value={totals.complaints} tone="blue"    />
        <Kpi icon={<CheckCircle2 size={18} />} label="ดำเนินการแล้ว"   value={totals.completed}  tone="emerald" />
        <Kpi icon={<AlertTriangle size={18} />} label="เหตุการณ์ยา"   value={totals.incidents}  tone="rose"    />
        <Kpi icon={<ShoppingBag size={18} />} label="แหล่งซื้อ (ผู้เสพ)" value={totals.dealers}  tone="violet"  />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Heatmap */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <MapPin size={16} className="text-blue-600" /> แผนที่ความหนาแน่นรายเขต
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {METRICS.map(m => (
                <button key={m.id} onClick={() => setMetric(m.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                    metric === m.id
                      ? 'text-white border-transparent'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                  style={metric === m.id ? { background: m.color } : undefined}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative h-[640px]">
            <IncidentMap
              key={layerKey}
              className="w-full h-full"
              points={[]}
              viewMode="point"
              getColor={() => activeColor}
              districtLayerKey={layerKey}
              districtLayerStyle={layerStyle}
              districtLayerOnEachFeature={layerOnEach}
            />
            <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 border border-slate-200 rounded-lg p-3 shadow-sm pointer-events-none">
              <div className="text-xs text-slate-500 mb-1.5">{METRICS.find(m => m.id === metric)?.label} ต่อเขต</div>
              <div className="h-2.5 w-40 rounded-full" style={{ background: `linear-gradient(to right, ${activeColor}22, ${activeColor})` }} />
              <div className="flex justify-between text-xs text-slate-400 mt-1 tabular-nums"><span>0</span><span>{metricMax}</span></div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">ตารางรายเขต</h3>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเขต..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition" />
            </div>
          </div>
          <div className="overflow-auto max-h-[560px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="border-b border-slate-200 text-xs text-slate-600">
                  <th className="text-left px-4 py-3 font-semibold">เขต</th>
                  {METRICS.map(m => (
                    <th key={m.id} onClick={() => setSortKey(m.id)}
                      className={`text-right px-3 py-3 font-semibold cursor-pointer select-none whitespace-nowrap hover:text-blue-700 transition ${sortKey === m.id ? 'text-blue-700' : ''}`}>
                      {m.label} {sortKey === m.id ? '▼' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map((m, i) => (
                  <tr key={m.district} className={`border-b border-slate-100 last:border-0 ${i % 2 ? 'bg-slate-50/50' : 'bg-white'} hover:bg-blue-50 transition-colors`}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-800">{m.district}</div>
                      <div className="text-xs text-slate-400">{DNAME_TO_GROUP[m.district] || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{m.complaints.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{m.completed.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">{m.incidents.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-violet-700">{m.dealers.toLocaleString()}</td>
                  </tr>
                ))}
                {table.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-sm">ไม่พบเขต</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

const TONES = {
  slate:   'border-t-slate-500   text-slate-700   bg-slate-100',
  blue:    'border-t-blue-600    text-blue-700    bg-blue-100',
  emerald: 'border-t-emerald-600 text-emerald-700 bg-emerald-100',
  rose:    'border-t-rose-600    text-rose-700    bg-rose-100',
  violet:  'border-t-violet-600  text-violet-700  bg-violet-100',
}

function Kpi({ icon, label, value, tone }) {
  const [border, text, chip] = (TONES[tone] || TONES.blue).split(/\s+/)
  return (
    <div className={`relative bg-white border border-slate-200 border-t-2 ${border} rounded-xl p-5 shadow-sm`}>
      <div className={`absolute right-4 top-4 w-8 h-8 rounded-full ${chip} ${text} flex items-center justify-center`}>{icon}</div>
      <div className="text-xs text-slate-500 uppercase tracking-wide font-medium pr-9">{label}</div>
      <div className="text-3xl font-bold text-slate-900 tabular-nums mt-2 leading-none">{(value || 0).toLocaleString()}</div>
    </div>
  )
}
