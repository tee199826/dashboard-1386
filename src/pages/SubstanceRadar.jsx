import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, ArrowLeft, Search, Menu, AlertTriangle } from 'lucide-react'
import { THAI_MONTHS, DNAME_TO_GROUP } from '../utils/constants'
import { fetchAllPages } from '../utils/supabasePagination'
import IncidentMap from '../components/IncidentMap'
import { usePresentation } from '../context/PresentationContext'
import PresentationBar, { PresentationEnterButton } from '../components/PresentationBar'
import PresentationSlides from '../components/PresentationSlides'

const DRUG_CATEGORIES = {
  'Club Drugs': {
    drugs: ['ยาอี', 'คีตามีน', 'โคเคน', 'แฮปปี้วอเตอร์'],
    title: 'การกระจายตัวกลุ่ม Club Drugs',
    subtitle: 'แสดงตำแหน่งการตรวจพบ (Point Map)',
  },
  'ยาบ้า/ไอซ์': {
    drugs: ['ยาบ้า', 'ไอซ์'],
    title: 'การกระจายตัวกลุ่มยาบ้า/ไอซ์',
    subtitle: 'Heat Map ความเข้มข้นรายเขต',
  },
  'พืชเสพติด': {
    drugs: ['กัญชา', 'กระท่อม', 'สี่คูณร้อย'],
    title: 'การกระจายตัวกลุ่มพืชเสพติด',
    subtitle: 'แสดงตำแหน่งการตรวจพบ',
  },
  'อื่นๆ': {
    drugs: ['เฮโรอีน', 'มอร์ฟีน', 'ฝิ่น', 'สารระเหย', 'วัตถุออกฤทธิ์'],
    title: 'ยาเสพติดประเภทอื่นๆ',
    subtitle: 'แสดงตำแหน่งการตรวจพบ',
  },
}

const DRUG_COLORS = {
  'ยาอี': '#3B82F6', 'คีตามีน': '#10B981', 'โคเคน': '#8B5CF6', 'แฮปปี้วอเตอร์': '#EC4899',
  'ยาบ้า': '#EF4444', 'ไอซ์': '#06B6D4', 'กัญชา': '#84CC16', 'กระท่อม': '#65A30D',
  'สี่คูณร้อย': '#A16207', 'เฮโรอีน': '#7C2D12', 'มอร์ฟีน': '#9F1239',
  'ฝิ่น': '#B91C1C', 'สารระเหย': '#0EA5E9', 'วัตถุออกฤทธิ์': '#6366F1',
}

const DISTRICT_GROUPS = {
  'กรุงเทพเหนือ':     { border: '#a16207', fill: '#fde047', emoji: '🟡', count: 7 },
  'กรุงเทพใต้':      { border: '#1e40af', fill: '#93c5fd', emoji: '🔵', count: 10 },
  'กรุงเทพกลาง':     { border: '#166534', fill: '#86efac', emoji: '🟢', count: 9 },
  'กรุงเทพตะวันออก': { border: '#9a3412', fill: '#fdba74', emoji: '🟠', count: 9 },
  'กรุงธนเหนือ':     { border: '#6b21a8', fill: '#d8b4fe', emoji: '🟣', count: 8 },
  'กรุงธนใต้':       { border: '#9f1239', fill: '#fda4af', emoji: '🔴', count: 7 },
}


function PointPopupContent({ p }) {
  const rows = [
    { label: 'พฤติการณ์', value: p.behaviors },
    { label: 'ชุมชน', value: p.community },
    { label: 'แขวง', value: p.subdistrict },
    { label: 'เขต', value: p.district },
    { label: 'สน.', value: p.police_station },
    { label: 'วันที่', value: p.received_date },
    { label: 'ผลดำเนินการ', value: p.primary_action },
  ]
  return (
    <div style={{ fontFamily: 'Sarabun, sans-serif', minWidth: '210px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingBottom: '6px', marginBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
        <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: DRUG_COLORS[p.primary_drug] || '#94A3B8', display: 'inline-block', flexShrink: 0 }}></span>
        <span style={{ fontWeight: 700, fontSize: '14px', color: DRUG_COLORS[p.primary_drug] || '#334155' }}>
          {p.primary_drug || 'ไม่ระบุ'}
        </span>
      </div>
      <table style={{ fontSize: '12px', width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.filter(r => r.value).map(r => (
            <tr key={r.label}>
              <td style={{ color: '#64748b', paddingRight: '10px', verticalAlign: 'top', whiteSpace: 'nowrap', paddingBottom: '3px' }}>
                {r.label}
              </td>
              <td style={{ fontWeight: 600, paddingBottom: '3px' }}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SearchPopupContent({ popup }) {
  return (
    <div style={{ fontFamily: 'Sarabun, sans-serif', minWidth: '210px' }}>
      <div style={{ fontWeight: 700, fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '8px' }}>
        📍 {popup.label}
      </div>
      <div style={{ fontSize: '12px', marginBottom: '8px' }}>
        {popup.subdistrict && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#64748b' }}>แขวง</span>
            <span style={{ fontWeight: 600 }}>{popup.subdistrict}</span>
          </div>
        )}
        {popup.district && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ color: '#64748b' }}>เขต</span>
            <span style={{ fontWeight: 600 }}>{popup.district}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
          <span style={{ color: '#64748b' }}>พบทั้งหมด</span>
          <span style={{ fontWeight: 700, color: '#dc2626' }}>{popup.count} เรื่อง</span>
        </div>
      </div>
      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          จำแนกตามชนิดยา
        </div>
        {popup.drugs && Object.entries(popup.drugs)
          .sort((a, b) => b[1] - a[1])
          .map(([drug, count]) => (
            <div key={drug} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: DRUG_COLORS[drug] || '#94A3B8', display: 'inline-block', flexShrink: 0 }}></span>
                <span style={{ color: '#334155', fontSize: '12px' }}>{drug}</span>
              </div>
              <span style={{ fontWeight: 700, fontSize: '12px' }}>{count}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

export default function SubstanceRadar() {
  const { isPresentation } = usePresentation()
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('Club Drugs')
  const [year, setYear] = useState('all')
  const [month, setMonth] = useState('all')
  const [viewMode, setViewMode] = useState('point')
  const [groupFilter, setGroupFilter] = useState('all')
  const [groupOverlay, setGroupOverlay] = useState('point')
  const [groupDisplayMode, setGroupDisplayMode] = useState('all')
  const [zoom, setZoom] = useState(11)
  const [searchQuery, setSearchQuery] = useState('')
  const [flyTarget, setFlyTarget] = useState(null)
  const [searchPopup, setSearchPopup] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (groupFilter === 'all') setGroupDisplayMode('all')
  }, [groupFilter])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const all = await fetchAllPages('drug_incidents', '*')
        setIncidents(all)
      } catch {
        setLoadError('ไม่สามารถโหลดข้อมูลแผนที่ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือลองใหม่')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [retryCount])

  const cfg = DRUG_CATEGORIES[category]
  const targetDrugs = cfg.drugs

  const years = useMemo(() => {
    const s = new Set()
    incidents.forEach(r => {
      if (r.received_date) s.add(parseInt(r.received_date.slice(0, 4)) + 543)
    })
    return Array.from(s).sort()
  }, [incidents])

  const points = useMemo(() => {
    return incidents.filter(r => {
      if (!r.lat || !r.lng) return false
      if (!r.primary_drug) return false
      if (!targetDrugs.includes(r.primary_drug)) return false
      if (year !== 'all' && r.received_date) {
        const y = parseInt(r.received_date.slice(0, 4)) + 543
        if (y !== parseInt(year)) return false
      }
      if (month !== 'all' && r.received_date) {
        const m = parseInt(r.received_date.slice(5, 7))
        if (m !== parseInt(month)) return false
      }
      return true
    })
  }, [incidents, targetDrugs, year, month])

  const drugCounts = useMemo(() => {
    const m = {}
    targetDrugs.forEach(d => { m[d] = 0 })
    points.forEach(p => {
      if (m[p.primary_drug] !== undefined) m[p.primary_drug]++
    })
    return m
  }, [points, targetDrugs])

  const districtStats = useMemo(() => {
    const stats = {}
    incidents.forEach(r => {
      if (!r.district || !r.primary_drug) return
      const key = r.district
      if (!stats[key]) stats[key] = { total: 0, drugs: {} }
      stats[key].total++
      stats[key].drugs[r.primary_drug] = (stats[key].drugs[r.primary_drug] || 0) + 1
    })
    return stats
  }, [incidents])

  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.trim().length < 2) return []
    const q = searchQuery.trim().toLowerCase()
    const groups = {}
    for (const r of incidents) {
      if (!r.lat || !r.lng) continue
      const community = r.community || ''
      const subdistrict = r.subdistrict || ''
      const matchC = community.toLowerCase().includes(q)
      const matchS = subdistrict.toLowerCase().includes(q)
      if (!matchC && !matchS) continue
      const label = community || subdistrict
      if (!groups[label]) {
        groups[label] = { label, sub: r.district || subdistrict || '', district: r.district || '', subdistrict, lat: r.lat, lng: r.lng, count: 0, drugs: {} }
      }
      const g = groups[label]
      g.count++
      if (r.primary_drug) g.drugs[r.primary_drug] = (g.drugs[r.primary_drug] || 0) + 1
    }
    return Object.values(groups).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [searchQuery, incidents])

  // District group layer props for IncidentMap
  const districtLayerKey = `dg-${viewMode}-${groupFilter}-${groupDisplayMode}`

  const districtLayerStyle = useMemo(() => {
    if (viewMode !== 'district') return null
    return (feature) => {
      const dname = feature.properties?.dname
      const group = DNAME_TO_GROUP[dname]
      const g = DISTRICT_GROUPS[group]
      const isOtherGroup = groupFilter !== 'all' && group !== groupFilter
      if (isOtherGroup && groupDisplayMode === 'selected') return { fillOpacity: 0, opacity: 0, weight: 0 }
      if (isOtherGroup) return { color: '#94a3b8', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.15, opacity: 0.4 }
      return g
        ? { color: g.border, weight: 2, fillColor: g.fill, fillOpacity: 0.55, opacity: 1 }
        : { color: '#94a3b8', weight: 1.5, fillColor: '#e2e8f0', fillOpacity: 0.35, opacity: 0.7 }
    }
  }, [viewMode, groupFilter, groupDisplayMode])

  const districtLayerOnEachFeature = useMemo(() => {
    if (viewMode !== 'district') return null
    return (feature, layer) => {
      const dname = feature.properties?.dname || 'ไม่ระบุ'
      const group = DNAME_TO_GROUP[dname] || ''
      const g = DISTRICT_GROUPS[group]
      const isOtherGroup = groupFilter !== 'all' && group !== groupFilter
      const isHidden = isOtherGroup && groupDisplayMode === 'selected'
      if (isHidden) return
      const baseStyle = isOtherGroup
        ? { color: '#94a3b8', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.15, opacity: 0.4 }
        : g
        ? { color: g.border, weight: 2, fillColor: g.fill, fillOpacity: 0.55, opacity: 1 }
        : { color: '#94a3b8', weight: 1.5, fillColor: '#e2e8f0', fillOpacity: 0.35, opacity: 0.7 }
      layer.bindTooltip(dname, { sticky: true, className: 'district-tooltip' })
      if (!isOtherGroup) {
        layer.on({
          mouseover: () => layer.setStyle({ fillOpacity: 0.82, weight: 3 }),
          mouseout: () => layer.setStyle(baseStyle),
          click: () => {
            const stat = districtStats[dname] || { total: 0, drugs: {} }
            const drugList = Object.entries(stat.drugs).sort((a, b) => b[1] - a[1]).slice(0, 6)
            const drugRows = drugList.length > 0
              ? drugList.map(([drug, count]) => {
                  const color = DRUG_COLORS[drug] || '#94A3B8'
                  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0">
                    <div style="display:flex;align-items:center;gap:6px">
                      <span style="width:9px;height:9px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>
                      <span style="color:#334155">${drug}</span>
                    </div>
                    <span style="font-weight:700;color:#1e293b">${count}</span>
                  </div>`
                }).join('')
              : '<div style="color:#94a3b8;font-size:12px;padding:6px 0">ไม่พบข้อมูลยาเสพติดในเขตนี้</div>'
            layer.bindPopup(`
              <div style="font-family:Sarabun,sans-serif;min-width:210px">
                <div style="font-weight:700;font-size:14px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:8px;display:flex;align-items:center;gap:6px">
                  <span style="width:10px;height:10px;border-radius:50%;background:${g?.border || '#dc2626'};display:inline-block;flex-shrink:0"></span>
                  ${dname}
                </div>
                <div style="font-size:12px;margin-bottom:8px">
                  <div style="display:flex;justify-content:space-between;padding:2px 0">
                    <span style="color:#64748b">กลุ่มพื้นที่</span><span style="font-weight:600">${group || '-'}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;padding:2px 0">
                    <span style="color:#64748b">เรื่องยาเสพติด</span>
                    <span style="font-weight:700;color:#dc2626">${stat.total} เรื่อง</span>
                  </div>
                </div>
                <div style="border-top:1px solid #e2e8f0;padding-top:6px">
                  <div style="font-size:11px;color:#64748b;font-weight:600;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em">จำแนกตามชนิดยา</div>
                  ${drugRows}
                </div>
              </div>
            `).openPopup()
          },
        })
      }
    }
  }, [viewMode, groupFilter, groupDisplayMode, districtStats])

  const showPoints = viewMode === 'point' || (viewMode === 'district' && groupOverlay === 'point')

  if (loadError) return (
    <div className="flex items-center justify-center" style={{ height: 'calc(100dvh - 68px)' }}>
      <div className="text-center px-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">ไม่สามารถโหลดข้อมูลได้</h2>
        <p className="text-sm text-slate-500 mb-4">ไม่สามารถโหลดข้อมูลแผนที่ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือลองใหม่</p>
        <button onClick={() => setRetryCount(c => c + 1)} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">
          ลองอีกครั้ง
        </button>
      </div>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center" style={{ height: 'calc(100dvh - 68px)' }}>
      <div className="text-center">
        <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500">กำลังโหลดข้อมูลแผนที่...</p>
      </div>
    </div>
  )

  const showHeatmap = viewMode === 'heatmap' || (viewMode === 'district' && groupOverlay === 'heatmap')

  return (
    <>
    {isPresentation && <PresentationBar title="แผนที่ยาเสพติด กรุงเทพมหานคร" />}

    {/* Portals — เฉพาะ normal mode (mobile sidebar controls) */}
    {!isPresentation && sidebarOpen && createPortal(
      <div onClick={() => setSidebarOpen(false)} className="lg:hidden"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9990 }} />,
      document.body
    )}
    {!isPresentation && createPortal(
      <button type="button" onClick={() => setSidebarOpen(v => !v)} aria-label="เปิดเมนู"
        className="lg:hidden flex items-center justify-center bg-blue-600 text-white rounded-full shadow-xl"
        style={{
          position: 'fixed', left: '16px',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
          width: '52px', height: '52px', zIndex: 9999,
          pointerEvents: 'auto', touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent', border: 'none', cursor: 'pointer',
        }}>
        <Menu size={24} />
      </button>,
      document.body
    )}

    <PresentationSlides isPresentation={isPresentation} normalClassName="">
    <div className="flex" style={{ height: isPresentation ? 'calc(100dvh - 56px)' : 'calc(100dvh - 68px)', fontFamily: 'Sarabun, sans-serif' }}>

      {/* Sidebar — ซ่อนในโหมดนำเสนอ */}
      {!isPresentation && <div className={`fixed lg:static inset-y-0 left-0 z-[9995] w-80 bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0 flex flex-col transform transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border-b-2 border-blue-500 px-5 py-5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center text-white">
              <MapPin size={20} />
            </div>
            <div>
              <h1 className="font-bold text-lg text-white leading-tight">ระบบแผนที่ยาเสพติด</h1>
              <p className="text-xs text-blue-300">BKK Substance Radar · กรุงเทพมหานคร</p>
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อชุมชน / แขวง..."
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none" />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
              {searchResults.map((res, i) => (
                <button key={i} onClick={() => {
                  setFlyTarget({ lat: res.lat, lng: res.lng })
                  setSearchPopup(res)
                  setSearchQuery('')
                }} className="w-full text-left px-3 py-2 hover:bg-blue-50 transition border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{res.label}</div>
                      {res.sub && <div className="text-xs text-slate-500">{res.sub}</div>}
                    </div>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{res.count} เรื่อง</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="mt-2 text-xs text-slate-400 px-2">ไม่พบชุมชนที่ค้นหา</div>
          )}
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          {viewMode !== 'district' && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center"><MapPin size={16} /></div>
                <h3 className="font-bold text-slate-800 text-base">เลือกมุมมองข้อมูล</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {Object.keys(DRUG_CATEGORIES).map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                      category === cat ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mb-4">
            <div className="text-xs text-slate-500 uppercase font-bold mb-2">รูปแบบแผนที่</div>
            <div className="flex border border-slate-200 rounded-lg overflow-hidden">
              {[
                { mode: 'point',    label: '📍 แบบจุด',   active: 'bg-blue-600 text-white' },
                { mode: 'heatmap',  label: '🔥 ความร้อน', active: 'bg-rose-600 text-white' },
                { mode: 'district', label: '🗂️ กลุ่มเขต', active: 'bg-emerald-700 text-white' },
              ].map(({ mode, label, active }) => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  className={`flex-1 py-2 text-xs font-medium transition border-r border-slate-200 last:border-r-0 ${
                    viewMode === mode ? active : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {viewMode !== 'district' && (
            <>
              <div className="grid grid-cols-2 gap-2 mb-5">
                <select value={year} onChange={e => setYear(e.target.value)}
                  className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <option value="all">ทุกปี</option>
                  {years.map(y => <option key={y} value={y}>พ.ศ. {y}</option>)}
                </select>
                <select value={month} onChange={e => setMonth(e.target.value)}
                  className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <option value="all">ทุกเดือน</option>
                  {THAI_MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
              {viewMode === 'point' && (
                <div className="mb-5">
                  <div className="text-xs text-slate-500 uppercase font-bold mb-2">สัญลักษณ์ (LEGEND)</div>
                  <div className="space-y-2">
                    {targetDrugs.map(d => (
                      <div key={d} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ background: DRUG_COLORS[d] || '#94A3B8' }}></div>
                          <span className="text-sm text-slate-700">{d}</span>
                        </div>
                        <span className="text-xs font-bold text-slate-600">{drugCounts[d] || 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {viewMode === 'heatmap' && (
                <div className="mb-5">
                  <div className="text-xs text-slate-500 uppercase font-bold mb-2">ระดับความเข้มข้น</div>
                  <div className="rounded-lg overflow-hidden" style={{ height: '16px', background: 'linear-gradient(to right, #fef9c3, #fde047, #fb923c, #ef4444, #b91c1c)' }}></div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>น้อย</span><span>ปานกลาง</span><span>สูงมาก</span>
                  </div>
                </div>
              )}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">📊</span>
                  <h3 className="font-bold text-slate-800 text-base">สถิติพื้นที่</h3>
                </div>
                <div className="text-sm text-slate-600">
                  พบ <strong className="text-blue-600">{points.length.toLocaleString()}</strong> รายการ ในกลุ่ม <strong>{category}</strong>
                </div>
                {targetDrugs.map(drug => {
                  const count = drugCounts[drug] || 0
                  const color = DRUG_COLORS[drug]
                  if (count === 0) return null
                  return (
                    <div key={drug} className="mt-3 rounded-lg p-3" style={{ background: color + '15', borderLeft: `3px solid ${color}` }}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full" style={{ background: color }}></div>
                        <span className="font-bold text-sm" style={{ color }}>{drug}</span>
                      </div>
                      <p className="text-xs text-slate-700">
                        <strong>{count}</strong> รายการ ({((count / points.length) * 100).toFixed(1)}%)
                      </p>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {viewMode === 'district' && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center"><MapPin size={16} /></div>
                <h3 className="font-bold text-slate-800 text-base">กลุ่มยาเสพติด</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {Object.keys(DRUG_CATEGORIES).map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                      category === cat ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-5">
                <select value={year} onChange={e => setYear(e.target.value)}
                  className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <option value="all">ทุกปี</option>
                  {years.map(y => <option key={y} value={y}>พ.ศ. {y}</option>)}
                </select>
                <select value={month} onChange={e => setMonth(e.target.value)}
                  className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <option value="all">ทุกเดือน</option>
                  {THAI_MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
              <div className="text-xs text-slate-500 uppercase font-bold mb-2">กรองกลุ่มเขต</div>
              <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs mb-4">
                <option value="all">ทุกกลุ่ม (50 เขต)</option>
                {Object.entries(DISTRICT_GROUPS).map(([name, g]) => (
                  <option key={name} value={name}>{g.emoji} {name} ({g.count} เขต)</option>
                ))}
              </select>
              <div className="text-xs text-slate-500 uppercase font-bold mb-2">ข้อมูลทับแผนที่</div>
              <div className="flex border border-slate-200 rounded-lg overflow-hidden mb-4">
                <button onClick={() => setGroupOverlay('point')}
                  className={`flex-1 py-2 text-xs font-medium transition border-r border-slate-200 ${groupOverlay === 'point' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  📍 จุดเหตุการณ์
                </button>
                <button onClick={() => setGroupOverlay('heatmap')}
                  className={`flex-1 py-2 text-xs font-medium transition ${groupOverlay === 'heatmap' ? 'bg-rose-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  🔥 ความร้อน
                </button>
              </div>
              {groupFilter !== 'all' && (
                <>
                  <div className="text-xs text-slate-500 uppercase font-bold mb-2">แสดงเขต</div>
                  <div className="flex border border-slate-200 rounded-lg overflow-hidden mb-4">
                    <button onClick={() => setGroupDisplayMode('all')}
                      className={`flex-1 py-2 text-xs font-medium transition border-r border-slate-200 ${groupDisplayMode === 'all' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                      ทุกกลุ่ม
                    </button>
                    <button onClick={() => setGroupDisplayMode('selected')}
                      className={`flex-1 py-2 text-xs font-medium transition ${groupDisplayMode === 'selected' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                      เฉพาะกลุ่มนี้
                    </button>
                  </div>
                </>
              )}
              <div className="text-xs text-slate-500 uppercase font-bold mb-2">กลุ่มเขต</div>
              <div className="space-y-1.5">
                {Object.entries(DISTRICT_GROUPS).map(([name, g]) => (
                  <div key={name} onClick={() => setGroupFilter(groupFilter === name ? 'all' : name)}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition ${
                      groupFilter === name ? 'ring-2 ring-offset-1' : ''
                    } ${groupFilter !== 'all' && groupFilter !== name ? 'opacity-40' : 'opacity-100'}`}
                    style={{ background: g.fill + '50', borderLeft: `3px solid ${g.border}`, ['--tw-ring-color']: g.border }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{g.emoji}</span>
                      <span className="text-xs font-semibold text-slate-800">{name}</span>
                    </div>
                    <span className="text-xs font-bold" style={{ color: g.border }}>{g.count} เขต</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-3 text-center">คลิกที่เขตบนแผนที่<br/>เพื่อดูข้อมูลประชากร</p>
            </div>
          )}
        </div>
      </div>}

      {/* Map area */}
      <div className="flex-1 relative">
        {!isPresentation && (
          <div className="absolute top-4 right-4 z-[1000] flex items-center gap-2">
            <PresentationEnterButton />
            <a href="/"
              className="bg-white hover:bg-slate-50 rounded-lg shadow-lg px-4 py-2 border border-slate-200 flex items-center gap-2 text-sm font-medium text-slate-700 transition">
              <ArrowLeft size={16} /> กลับหน้าหลัก
            </a>
          </div>
        )}
        <div className="absolute top-4 left-4 z-[1000] bg-slate-900/95 backdrop-blur rounded-2xl shadow-xl px-5 py-4 border border-slate-700 max-w-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600/20 text-blue-400 rounded-lg flex items-center justify-center">
              <MapPin size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {viewMode === 'district' ? 'แผนที่กลุ่มเขต กรุงเทพมหานคร' : cfg.title}
              </h2>
              <p className="text-xs text-slate-400">
                {viewMode === 'district'
                  ? (groupFilter === 'all' ? 'แสดงทั้ง 6 กลุ่ม · 50 เขต' : `${DISTRICT_GROUPS[groupFilter]?.emoji} ${groupFilter} · ${DISTRICT_GROUPS[groupFilter]?.count} เขต`)
                  : viewMode === 'point' ? `Point Map · ${points.length.toLocaleString()} เรื่อง`
                  : `Heat Map · ${points.length.toLocaleString()} เรื่อง`
                }
              </p>
            </div>
          </div>
        </div>

        <IncidentMap
          className="w-full h-full"
          points={showPoints || showHeatmap ? points : []}
          getColor={p => DRUG_COLORS[p.primary_drug] || '#94A3B8'}
          renderPopup={p => <PointPopupContent p={p} />}
          tooltipText={p => `${p.primary_drug} · ${p.subdistrict || ''}`}
          viewMode={showHeatmap ? 'heatmap' : 'point'}
          flyTarget={flyTarget}
          searchPopup={searchPopup}
          onSearchPopupClose={() => setSearchPopup(null)}
          renderSearchPopup={popup => <SearchPopupContent popup={popup} />}
          districtLayerKey={districtLayerKey}
          districtLayerStyle={districtLayerStyle}
          districtLayerOnEachFeature={districtLayerOnEachFeature}
          onZoomChange={setZoom}
        />

        {showHeatmap && zoom < 14 && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/90 text-white text-xs px-4 py-2 rounded-full shadow-lg backdrop-blur flex items-center gap-2">
            🔍 ซูมเข้าเพื่อดูรายละเอียดแต่ละจุด
          </div>
        )}
        <div className="absolute bottom-6 right-6 z-[1000] bg-white/95 backdrop-blur rounded-lg shadow-lg px-3 py-2 border border-blue-200">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-5" style={{ borderTop: '2px dashed #2563eb' }}></div>
            <span className="font-medium text-slate-700">ขอบเขต 50 เขต กรุงเทพมหานคร</span>
          </div>
        </div>
      </div>
    </div>
    </PresentationSlides>
    </>
  )
}
