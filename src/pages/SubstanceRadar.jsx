import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, ArrowLeft, Search, Menu, AlertTriangle, Plus, X, SlidersHorizontal, Lightbulb, Info, BarChart3, Printer } from 'lucide-react'
import { ComposedChart, Area, ReferenceDot, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend } from 'recharts'
import { THAI_MONTHS, DNAME_TO_GROUP } from '../utils/constants'
import { fetchAllPages } from '../utils/supabasePagination'
import { enrichDrugRow } from '../utils/drugWide'
import { thaiDateRange } from '../utils/formatDate'
import PeriodBadge from '../components/PeriodBadge'
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

// รายชื่อยาทุกชนิด (รวมทุกหมวด) — ใช้กับมุมมอง "ดูทั้งหมด"
const ALL_DRUGS = Object.values(DRUG_CATEGORIES).flatMap(c => c.drugs)

// แยกยาที่ count > 0 (เรียงมาก→น้อย) ออกจากยา count = 0 (รวมเป็น "ชนิดอื่น")
function splitDrugLegend(universe, counts) {
  const shown = [], zero = []
  for (const d of universe) {
    const c = counts[d] || 0
    if (c > 0) shown.push([d, c]); else zero.push(d)
  }
  shown.sort((a, b) => b[1] - a[1])
  return { shown, zero }
}
const ALL_VIEW_CFG = {
  drugs: ALL_DRUGS,
  title: 'การกระจายตัวยาเสพติดทุกชนิด',
  subtitle: 'แสดงตำแหน่งการตรวจพบ (ทุกชนิดยา)',
}

const DRUG_COLORS = {
  'ยาอี': '#3B82F6', 'คีตามีน': '#10B981', 'โคเคน': '#8B5CF6', 'แฮปปี้วอเตอร์': '#EC4899',
  'ยาบ้า': '#EF4444', 'ไอซ์': '#06B6D4', 'กัญชา': '#84CC16', 'กระท่อม': '#65A30D',
  'สี่คูณร้อย': '#A16207', 'เฮโรอีน': '#7C2D12', 'มอร์ฟีน': '#9F1239',
  'ฝิ่น': '#B91C1C', 'สารระเหย': '#0EA5E9', 'วัตถุออกฤทธิ์': '#6366F1',
}

// เดือนเรียงตามปีงบ ต.ค.→ก.ย. (สำหรับ trend chart เปรียบเทียบเขต)
const FY_MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.']
const fyMonthIdx = (monthNum) => (monthNum + 2) % 12   // ต.ค.(10)→0 ... ก.ย.(9)→11

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
    <div style={{ minWidth: '210px' }}>
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
    <div style={{ minWidth: '210px' }}>
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
  const [category, setCategory] = useState('all')
  const [drugExpanded, setDrugExpanded] = useState(false)
  const [year, setYear] = useState('all')
  const [month, setMonth] = useState('all')
  const [selectedDistrict, setSelectedDistrict] = useState('all')   // Feature 1
  const [selectedKhwaeng, setSelectedKhwaeng] = useState('all')     // Feature 2 (cascade)
  const [districtPanel, setDistrictPanel] = useState(null)          // Bug 2: floating detail panel (dname)
  const [compareOpen, setCompareOpen] = useState(false)             // Phase 3: compare modal
  const [compareA, setCompareA] = useState(null)
  const [compareB, setCompareB] = useState(null)
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
  // ── floating panels (fullscreen/presentation only) — default เปิดบน desktop, ปิดบน mobile ──
  const [controlOpen, setControlOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true)
  const [insightOpen, setInsightOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true)
  const [fsDrugDetail, setFsDrugDetail] = useState(false)

  // เลือกกลุ่มเขต → ถ้า 'all' reset displayMode (แทน effect เพื่อเลี่ยง set-state-in-effect)
  const pickGroup = (v) => { setGroupFilter(v); if (v === 'all') setGroupDisplayMode('all') }
  // เลือกเขต → reset แขวง (cascade) + ปิด floating panel
  const pickDistrict = (d) => { setSelectedDistrict(d); setSelectedKhwaeng('all'); setDistrictPanel(null) }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const all = await fetchAllPages('drug_incidents', '*')
        setIncidents(all.map(enrichDrugRow))  // wide one-hot → primary_drug/behaviors/primary_action
      } catch {
        setLoadError('ไม่สามารถโหลดข้อมูลแผนที่ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือลองใหม่')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [retryCount])

  const cfg = category === 'all' ? ALL_VIEW_CFG : DRUG_CATEGORIES[category]
  const targetDrugs = cfg.drugs
  // แผงแยกชนิดยาเปิดเมื่อกดเปิดเอง หรือมีการเลือกชนิดยาอยู่ (เพื่อให้เห็นตัวเลือกที่ active เสมอ)
  const drugPanelOpen = drugExpanded || category !== 'all'

  const years = useMemo(() => {
    const s = new Set()
    incidents.forEach(r => {
      if (r.received_date) s.add(parseInt(r.received_date.slice(0, 4)) + 543)
    })
    return Array.from(s).sort()
  }, [incidents])

  // Phase 2: รายการเขต (50 เขต) + แขวง (cascade ตามเขตที่เลือก, จาก subdistrict)
  const districtOptions = useMemo(() => Object.keys(DNAME_TO_GROUP).sort((a, b) => a.localeCompare(b, 'th')), [])
  const khwaengOptions = useMemo(() => {
    if (selectedDistrict === 'all') return []
    const s = new Set()
    for (const r of incidents) {
      if (r.district === selectedDistrict && r.subdistrict && r.subdistrict.trim()) s.add(r.subdistrict.trim())
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'th'))
  }, [incidents, selectedDistrict])

  // เปิด compare modal — pre-fill A (จาก floating panel หรือเขตที่เลือก), B = เขตอื่น
  const openCompare = (presetA) => {
    const a = (presetA && presetA !== 'all') ? presetA : (selectedDistrict !== 'all' ? selectedDistrict : districtOptions[0])
    const b = districtOptions.find(d => d !== a) || districtOptions[1]
    setCompareA(a); setCompareB(b); setCompareOpen(true); setDistrictPanel(null)
  }

  // ── ชั้น filter เดียว (Bug 1 fix) — ทุก count/legend/popup derive จากตรงนี้ ──
  // ymFiltered = year+month (base) ; filteredIncidents = + district + khwaeng
  const ymFiltered = useMemo(() => incidents.filter(r => {
    if (year !== 'all' && r.received_date) {
      if (parseInt(r.received_date.slice(0, 4)) + 543 !== parseInt(year)) return false
    }
    if (month !== 'all' && r.received_date) {
      if (parseInt(r.received_date.slice(5, 7)) !== parseInt(month)) return false
    }
    return true
  }), [incidents, year, month])

  const filteredIncidents = useMemo(() => ymFiltered.filter(r => {
    if (selectedDistrict !== 'all' && r.district !== selectedDistrict) return false
    if (selectedKhwaeng !== 'all' && r.subdistrict !== selectedKhwaeng) return false
    return true
  }), [ymFiltered, selectedDistrict, selectedKhwaeng])

  const points = useMemo(() => filteredIncidents.filter(r => {
    if (!r.lat || !r.lng) return false
    if (!r.primary_drug) return false
    return targetDrugs.includes(r.primary_drug)
  }), [filteredIncidents, targetDrugs])

  const drugCounts = useMemo(() => {
    const m = {}
    targetDrugs.forEach(d => { m[d] = 0 })
    points.forEach(p => {
      if (m[p.primary_drug] !== undefined) m[p.primary_drug]++
    })
    return m
  }, [points, targetDrugs])

  // ── floating insights (fullscreen) — สรุปจาก points ที่กรองแล้ว (เขตนับเฉพาะ "เขต*") ──
  const insights = useMemo(() => {
    const total = points.length
    if (!total) return null
    const dCounts = {}
    for (const r of points) { const d = r.primary_drug || 'ไม่ระบุ'; dCounts[d] = (dCounts[d] || 0) + 1 }
    const td = Object.entries(dCounts).sort((a, b) => b[1] - a[1])[0]
    const distCounts = {}
    for (const r of points) { if (!r.district?.startsWith('เขต')) continue; distCounts[r.district] = (distCounts[r.district] || 0) + 1 }
    const tdist = Object.entries(distCounts).sort((a, b) => b[1] - a[1])[0]
    return {
      total,
      topDrug: td ? { name: td[0], count: td[1], pct: td[1] / total * 100 } : null,
      topDistrict: tdist ? { name: tdist[0], count: tdist[1], pct: tdist[1] / total * 100 } : null,
      districtsCount: Object.keys(distCounts).length,
      drugTypesCount: Object.keys(dCounts).length,
    }
  }, [points])

  // ตามปี/เดือน (ไม่กรอง district) — ใช้กับ popup คลิกเขต (Bug 1: เดิมใช้ raw → ไม่ react)
  const districtStats = useMemo(() => {
    const stats = {}
    ymFiltered.forEach(r => {
      if (!r.district || !r.primary_drug) return
      const key = r.district
      if (!stats[key]) stats[key] = { total: 0, drugs: {} }
      stats[key].total++
      stats[key].drugs[r.primary_drug] = (stats[key].drugs[r.primary_drug] || 0) + 1
    })
    return stats
  }, [ymFiltered])

  const pointsPeriod = useMemo(
    () => thaiDateRange(points, 'received_date', { unfiltered: year === 'all' && month === 'all' }),
    [points, year, month])

  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.trim().length < 2) return []
    const q = searchQuery.trim().toLowerCase()
    const groups = {}
    for (const r of filteredIncidents) {   // Bug 1: scope ตาม filter (รวม district/khwaeng/ปี/เดือน)
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
  }, [searchQuery, filteredIncidents])

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
    <div className="flex" style={{ height: isPresentation ? 'calc(100dvh - 56px)' : 'calc(100dvh - 68px)' }}>

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
          {/* Phase 3: trigger compare modal */}
          <button onClick={() => openCompare(null)}
            className="w-full mb-3 inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-lg text-sm font-semibold shadow-sm shadow-violet-500/30 transition">
            <BarChart3 size={16} /> เปรียบเทียบเขต
          </button>
          {/* Phase 2: dropdown เขต + แขวง (cascade) */}
          <div className="space-y-3 mb-3">
            <div>
              <label className="text-xs text-slate-500 font-semibold flex items-center gap-1 mb-1">📍 เลือกเขต</label>
              <select value={selectedDistrict} onChange={e => pickDistrict(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none">
                <option value="all">ทุกเขต (50 เขต)</option>
                {districtOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-semibold flex items-center gap-1 mb-1">🏘️ เลือกแขวง</label>
              <select value={selectedKhwaeng} onChange={e => setSelectedKhwaeng(e.target.value)}
                disabled={selectedDistrict === 'all'}
                title={selectedDistrict === 'all' ? 'เลือกเขตก่อน' : undefined}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                {selectedDistrict === 'all'
                  ? <option value="all">เลือกเขตก่อน</option>
                  : <>
                      <option value="all">ทุกแขวง ({khwaengOptions.length})</option>
                      {khwaengOptions.map(k => <option key={k} value={k}>{k}</option>)}
                    </>}
              </select>
            </div>
          </div>
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
              <div className="mb-4">
                {/* ดูทั้งหมด — default (รวมทุกชนิดยา) */}
                <button onClick={() => setCategory('all')}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    category === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}>
                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${category === 'all' ? 'border-white' : 'border-slate-400'}`}>
                    {category === 'all' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  ดูทั้งหมด
                  <span className={`ml-auto text-xs font-normal ${category === 'all' ? 'text-blue-100' : 'text-slate-400'}`}>รวมทุกชนิดยา</span>
                </button>

                {/* ปุ่ม [+ แยกชนิดยา] — แสดงเฉพาะตอนยุบ */}
                {!drugPanelOpen && (
                  <button onClick={() => setDrugExpanded(true)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-blue-600 bg-white border border-dashed border-blue-300 hover:bg-blue-50 transition">
                    <Plus size={14} /> แยกชนิดยา
                  </button>
                )}

                {/* แผงเลือกชนิดยา — expand แบบ smooth (grid-rows 0fr → 1fr) */}
                <div className={`grid transition-all duration-300 ease-out ${
                  drugPanelOpen ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'
                }`}>
                  <div className="overflow-hidden">
                    <div className="flex items-center justify-between mb-2 px-0.5">
                      <span className="text-xs text-slate-500 uppercase font-bold">เลือกชนิดยา</span>
                      <button onClick={() => { setDrugExpanded(false); setCategory('all') }}
                        className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 transition">
                        <X size={12} /> ปิด
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.keys(DRUG_CATEGORIES).map(cat => (
                        <button key={cat} onClick={() => setCategory(cat)}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                            category === cat ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
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
                  {(() => {
                    const { shown, zero } = splitDrugLegend(targetDrugs, drugCounts)
                    if (shown.length === 0) return <div className="text-sm text-slate-400 py-2">ไม่มีข้อมูลในช่วงที่เลือก</div>
                    return (
                      <div className="space-y-2">
                        {shown.map(([d, c]) => (
                          <div key={d} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ background: DRUG_COLORS[d] || '#94A3B8' }}></div>
                              <span className="text-sm text-slate-700">{d}</span>
                            </div>
                            <span className="text-xs font-bold text-slate-600">{c}</span>
                          </div>
                        ))}
                        {zero.length > 0 && (
                          <div className="flex items-center justify-between" title={`ไม่พบในช่วงนี้: ${zero.join(', ')}`}>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-slate-300" />
                              <span className="text-sm text-slate-400">ชนิดอื่น</span>
                            </div>
                            <span className="text-xs font-bold text-slate-400">0</span>
                          </div>
                        )}
                      </div>
                    )
                  })()}
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
                <PeriodBadge period={pointsPeriod} className="mt-1.5" />
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
              <select value={groupFilter} onChange={e => pickGroup(e.target.value)}
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
                  <div key={name} onClick={() => pickGroup(groupFilter === name ? 'all' : name)}
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
              {viewMode !== 'district' && <PeriodBadge period={pointsPeriod} tone="dark" className="mt-1" />}
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
          onDistrictClick={setDistrictPanel}
          highlightDistrict={selectedDistrict === 'all' ? null : selectedDistrict}
          onZoomChange={setZoom}
        />

        {/* Bug 2: floating detail panel — คลิกเขตบนแผนที่ */}
        {districtPanel && (() => {
          const stat = districtStats[districtPanel] || { total: 0, drugs: {} }
          const group = DNAME_TO_GROUP[districtPanel] || '—'
          const drugList = Object.entries(stat.drugs).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
          const zeroDrugs = ALL_DRUGS.filter(d => !(stat.drugs[d] > 0))
          return (
            <div className="absolute top-4 right-4 z-[1200] w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden animate-rise">
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-white font-bold text-base flex items-center gap-1.5"><MapPin size={15} /> {districtPanel}</div>
                  <div className="text-xs text-blue-300">{group}</div>
                </div>
                <button onClick={() => setDistrictPanel(null)} className="text-white/60 hover:text-white p-0.5"><X size={16} /></button>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-slate-500">จำนวนรวม</span>
                  <span className="font-bold text-rose-600 tabular-nums">{stat.total.toLocaleString()} เหตุ</span>
                </div>
                {drugList.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">จำแนกตามชนิดยา</div>
                    {drugList.map(([drug, count]) => (
                      <div key={drug} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: DRUG_COLORS[drug] || '#94A3B8' }} />
                          <span className="text-sm text-slate-700">{drug}</span>
                        </div>
                        <span className="font-bold text-sm tabular-nums">{count}</span>
                      </div>
                    ))}
                    {zeroDrugs.length > 0 && (
                      <div className="flex items-center justify-between" title={`ไม่พบในเขตนี้: ${zeroDrugs.join(', ')}`}>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-slate-300" />
                          <span className="text-sm text-slate-400">ชนิดอื่น</span>
                        </div>
                        <span className="font-bold text-sm tabular-nums text-slate-400">0</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 text-center py-3">ไม่มีข้อมูลในช่วงที่เลือก</div>
                )}
                <div className="mt-4 grid grid-cols-1 gap-2">
                  <button onClick={() => { pickDistrict(districtPanel); setDistrictPanel(null) }}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">
                    <Search size={14} /> filter เฉพาะเขตนี้
                  </button>
                  <button onClick={() => openCompare(districtPanel)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-xl text-sm font-semibold transition">
                    <BarChart3 size={14} /> เปรียบเทียบกับเขตอื่น
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

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

        {/* ── Floating panels — fullscreen (presentation) เท่านั้น ── */}
        {isPresentation && (
          <>
            {/* [1] Control panel — มุมซ้ายบน */}
            <div className="absolute top-2 left-2 md:top-4 md:left-4 z-[1100] max-w-[calc(100vw-1rem)] md:max-w-xs">
              {!controlOpen ? (
                <button onClick={() => setControlOpen(true)} aria-label="เปิดตัวกรอง"
                  className="bg-white/95 backdrop-blur shadow-lg rounded-full p-2.5 hover:scale-105 transition">
                  <SlidersHorizontal className="w-5 h-5 text-slate-700" />
                </button>
              ) : (
                <div className="bg-white/95 backdrop-blur-md shadow-xl border border-slate-200 rounded-xl p-4 w-72 max-w-full">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-cyan-600" />
                      <span className="font-semibold text-sm text-slate-900">ตัวกรอง</span>
                    </div>
                    <button onClick={() => setControlOpen(false)} aria-label="ปิด" className="text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4" /></button>
                  </div>
                  {/* ช่วงเวลา (year/month เดิม) */}
                  <div className="mb-3">
                    <label className="text-xs text-slate-500 block mb-1.5">ช่วงเวลา</label>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={year} onChange={e => setYear(e.target.value)} className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                        <option value="all">ทุกปี</option>
                        {years.map(y => <option key={y} value={y}>พ.ศ. {y}</option>)}
                      </select>
                      <select value={month} onChange={e => setMonth(e.target.value)} className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                        <option value="all">ทุกเดือน</option>
                        {THAI_MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* ชนิดยา (reuse category — ดูทั้งหมด / แยกชนิด) */}
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">ชนิดยา</label>
                    {!fsDrugDetail ? (
                      <div className="flex items-center justify-between bg-slate-50 rounded-lg p-2">
                        <span className="text-sm text-slate-700">{category === 'all' ? 'ดูทั้งหมด' : category}</span>
                        <button onClick={() => setFsDrugDetail(true)} className="text-xs text-cyan-600 hover:underline">+ แยกชนิด</button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.keys(DRUG_CATEGORIES).map(k => {
                            const active = category === k
                            return (
                              <button key={k} onClick={() => setCategory(active ? 'all' : k)}
                                className={`h-7 px-2.5 text-xs rounded-full transition ${active ? 'bg-cyan-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                {k}
                              </button>
                            )
                          })}
                        </div>
                        <button onClick={() => { setFsDrugDetail(false); setCategory('all') }} className="text-xs text-slate-400 hover:text-slate-600 mt-2">× ปิด</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* [2] Insight box — มุมขวาล่าง */}
            <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 z-[1100] max-w-[calc(100vw-1rem)] md:max-w-sm">
              {!insightOpen ? (
                <button onClick={() => setInsightOpen(true)}
                  className="bg-cyan-600 text-white shadow-lg rounded-full p-2.5 pr-4 hover:scale-105 transition flex items-center gap-2">
                  <Lightbulb className="w-5 h-5" /><span className="text-sm font-medium">สรุปข้อมูล</span>
                </button>
              ) : (
                <div className="bg-white/95 backdrop-blur-md shadow-xl border border-slate-200 rounded-xl p-4 w-80 max-w-full">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/30">
                        <Lightbulb className="w-4 h-4 text-white" />
                      </div>
                      <span className="font-semibold text-sm text-slate-900">สรุปข้อมูลแผนที่</span>
                    </div>
                    <button onClick={() => setInsightOpen(false)} aria-label="ปิด" className="text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4" /></button>
                  </div>
                  {!insights ? (
                    <div className="text-sm text-slate-400 text-center py-6">ไม่มีข้อมูลในช่วงที่เลือก</div>
                  ) : (
                    <div className="space-y-3">
                      {insights.topDrug && (
                        <div className="bg-rose-50 border border-rose-100 rounded-lg p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-rose-600">ยาที่พบมากสุด</span>
                          <div className="font-bold text-slate-900">{insights.topDrug.name}</div>
                          <div className="text-xs text-slate-600 mt-0.5">{insights.topDrug.count.toLocaleString()} ครั้ง
                            <span className="font-semibold text-rose-700 ml-1">({insights.topDrug.pct.toFixed(1)}% ของทั้งหมด)</span>
                          </div>
                        </div>
                      )}
                      {insights.topDistrict && (
                        <div className="bg-violet-50 border border-violet-100 rounded-lg p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-violet-600">เขตที่พบมากสุด</span>
                          <div className="font-bold text-slate-900">{insights.topDistrict.name}</div>
                          <div className="text-xs text-slate-600 mt-0.5">{insights.topDistrict.count.toLocaleString()} ครั้ง
                            <span className="font-semibold text-violet-700 ml-1">({insights.topDistrict.pct.toFixed(1)}% ของ กทม.)</span>
                          </div>
                        </div>
                      )}
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">รวมทั้งหมด</span>
                          <span className="font-bold text-slate-900 tabular-nums">{insights.total.toLocaleString()} ครั้ง</span>
                        </div>
                        <div className="flex items-center justify-between text-xs mt-1.5">
                          <span className="text-slate-500">เขตที่มีข้อมูล</span>
                          <span className="font-semibold tabular-nums">{insights.districtsCount} / 50 เขต</span>
                        </div>
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-slate-500">ชนิดยาที่พบ</span>
                          <span className="font-semibold tabular-nums">{insights.drugTypesCount} ชนิด</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 px-1 pt-1">
                        <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <p className="text-[11px] text-slate-500 leading-relaxed">คลิกที่จุดบนแผนที่เพื่อดูรายละเอียดเหตุการณ์</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </PresentationSlides>

    {compareOpen && compareA && compareB && (
      <CompareModal
        a={compareA} b={compareB} setA={setCompareA} setB={setCompareB}
        options={districtOptions} incidents={incidents} years={years}
        initialYear={year} initialMonth={month}
        onClose={() => setCompareOpen(false)}
      />
    )}
    </>
  )
}

// ── Phase 3 + premium: Compare modal (side-by-side 2 เขต) ──

// คำนวณ stats + trend ของเขตเดียว ตาม year/month
function computeDistrict(incidents, dname, year, month) {
  const drugs = {}, khwaengs = new Set()
  let total = 0
  const trend = Array(12).fill(0)
  for (const r of incidents) {
    if (r.district !== dname || !r.received_date) continue
    const y = parseInt(r.received_date.slice(0, 4)) + 543
    const m = parseInt(r.received_date.slice(5, 7))
    if (year !== 'all' && y !== parseInt(year)) continue
    if (r.primary_drug) trend[fyMonthIdx(m)]++   // trend = year-only (ไม่กรองเดือน)
    if (month !== 'all' && m !== parseInt(month)) continue
    if (!r.primary_drug) continue
    total++
    drugs[r.primary_drug] = (drugs[r.primary_drug] || 0) + 1
    if (r.subdistrict?.trim()) khwaengs.add(r.subdistrict.trim())
  }
  return { total, drugs, khwaengCount: khwaengs.size, perKhwaeng: khwaengs.size ? total / khwaengs.size : 0, trend }
}

const drugTop = (drugs) => { let d = null, n = 0; for (const k in drugs) if (drugs[k] > n) { d = k; n = drugs[k] }; return d ? { drug: d, count: n } : null }
const peakMonth = (trend, key) => { let i = 0, n = -1; trend.forEach((p, idx) => { if (p[key] > n) { n = p[key]; i = idx } }); return n > 0 ? { label: trend[i].label, value: n } : null }

// สรุปอัตโนมัติเป็นภาษาธรรมชาติ (งาน6)
function buildInsights(A, B, aName, bName, drugKeys, trend, yearLabel) {
  const out = []
  const dt = A.total - B.total
  if (dt !== 0 && Math.min(A.total, B.total) > 0) {
    const more = dt > 0 ? aName : bName, less = dt > 0 ? bName : aName
    out.push(`${more} มีจำนวนรวมมากกว่า ${less} ${Math.abs(dt).toLocaleString()} จุด (+${(Math.abs(dt) / Math.min(A.total, B.total) * 100).toFixed(1)}%)`)
  }
  const tA = drugTop(A.drugs), tB = drugTop(B.drugs)
  if (tA && (!tB || tA.count >= tB.count)) out.push(`${aName} เด่นเรื่อง ${tA.drug} (${tA.count.toLocaleString()} จุด) — สูงสุดในทั้ง 2 เขต`)
  else if (tB) out.push(`${bName} เด่นเรื่อง ${tB.drug} (${tB.count.toLocaleString()} จุด) — สูงสุดในทั้ง 2 เขต`)
  let big = null
  for (const d of drugKeys) {
    const av = A.drugs[d] || 0, bv = B.drugs[d] || 0, mn = Math.min(av, bv), mx = Math.max(av, bv)
    if (mx < 5) continue
    const ratio = mn > 0 ? (mx - mn) / mn : 999
    if (!big || ratio > big.ratio) big = { drug: d, av, bv, ratio, mx, mn }
  }
  if (big) {
    const more = big.av > big.bv ? aName : bName
    const pct = big.mn > 0 ? `+${((big.mx - big.mn) / big.mn * 100).toFixed(0)}%` : 'อีกเขตแทบไม่มี'
    out.push(`${more} มี ${big.drug} สูงกว่ามาก (${big.av} vs ${big.bv} จุด, ${pct})`)
  }
  const pA = peakMonth(trend, 'A'), pB = peakMonth(trend, 'B')
  if (pA || pB) out.push(`เดือนที่มีเหตุสูงสุด — ${aName}: ${pA ? pA.label + ' ' + yearLabel : '—'} · ${bName}: ${pB ? pB.label + ' ' + yearLabel : '—'}`)
  return out
}

function CompareModal({ a, b, setA, setB, options, incidents, years, initialYear, initialMonth, onClose }) {
  const [mYear, setMYear] = useState(initialYear)
  const [mMonth, setMMonth] = useState(initialMonth)
  const aName = a.replace(/^เขต/, ''), bName = b.replace(/^เขต/, '')
  const yearLabel = mYear === 'all' ? 'ทุกปี' : 'พ.ศ. ' + mYear
  const monthLabel = mMonth === 'all' ? 'ทุกเดือน' : THAI_MONTHS.find(m => m.v === mMonth)?.l || mMonth
  const usingMain = mYear === initialYear && mMonth === initialMonth

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [onClose])

  const data = useMemo(() => {
    const A = computeDistrict(incidents, a, mYear, mMonth)
    const B = computeDistrict(incidents, b, mYear, mMonth)
    const drugKeys = [...new Set([...Object.keys(A.drugs), ...Object.keys(B.drugs)])]
      .sort((x, y) => (B.drugs[y] || 0) + (A.drugs[y] || 0) - (B.drugs[x] || 0) - (A.drugs[x] || 0))
    const trend = FY_MONTHS.map((label, i) => ({ label, A: A.trend[i], B: B.trend[i] }))
    const ptsA = incidents.filter(r => r.district === a && r.lat && r.lng && (mYear === 'all' || parseInt(r.received_date?.slice(0, 4)) + 543 === parseInt(mYear)) && (mMonth === 'all' || parseInt(r.received_date?.slice(5, 7)) === parseInt(mMonth)))
    const ptsB = incidents.filter(r => r.district === b && r.lat && r.lng && (mYear === 'all' || parseInt(r.received_date?.slice(0, 4)) + 543 === parseInt(mYear)) && (mMonth === 'all' || parseInt(r.received_date?.slice(5, 7)) === parseInt(mMonth)))
    const insights = buildInsights(A, B, aName, bName, drugKeys, trend, yearLabel)
    // avg |Δ| ของชนิดยา → ใช้ highlight row ที่ Δ สูง
    const diffs = drugKeys.map(d => Math.abs((A.drugs[d] || 0) - (B.drugs[d] || 0)))
    const avgDiff = diffs.length ? diffs.reduce((s, v) => s + v, 0) / diffs.length : 0
    const zeroBoth = ALL_DRUGS.filter(d => !drugKeys.includes(d))   // 0 ทั้ง A และ B → รวมเป็น "ชนิดอื่น"
    return { A, B, drugKeys, trend, ptsA, ptsB, insights, hiDiff: avgDiff * 1.5, zeroBoth }
  }, [incidents, a, b, mYear, mMonth, aName, bName, yearLabel])

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-0 sm:p-6 bg-slate-900/70 backdrop-blur-sm" onClick={onClose}>
      <div className="print-area bg-slate-50 sm:rounded-3xl shadow-2xl w-full max-w-7xl h-full sm:h-auto sm:max-h-[94vh] flex flex-col overflow-hidden animate-rise" onClick={e => e.stopPropagation()}>

        {/* งาน4: Hero header gradient + orbs + glass */}
        <div className="relative overflow-hidden px-6 sm:px-8 py-5 text-white bg-gradient-to-br from-violet-700 via-purple-800 to-fuchsia-900 flex-shrink-0">
          <div className="orb absolute -top-10 -left-6 w-44 h-44 rounded-full bg-fuchsia-500/30 blur-3xl pointer-events-none" />
          <div className="orb absolute -bottom-16 right-1/4 w-52 h-52 rounded-full bg-violet-400/30 blur-3xl pointer-events-none" style={{ animationDelay: '2s' }} />
          <div className="noise-overlay absolute inset-0 opacity-[0.12] mix-blend-overlay pointer-events-none" />
          <div className="dot-pattern absolute inset-0 text-white/10 opacity-40 pointer-events-none" />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold tracking-tight">📊 เปรียบเทียบเขต กทม.</h2>
              <p className="text-sm text-white/70 mt-0.5">Side-by-side analysis · {aName} vs {bName}</p>
              <span className="inline-flex items-center gap-1.5 text-xs text-white/90 bg-white/10 backdrop-blur-md ring-1 ring-white/20 rounded-full px-3 py-1.5 mt-3">
                ⏱ ช่วง: {yearLabel} · {monthLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 print-hide flex-shrink-0">
              <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md ring-1 ring-white/20 text-white rounded-xl text-sm font-medium transition"><Printer size={15} /> <span className="hidden sm:inline">Export PDF</span></button>
              <button onClick={onClose} className="w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-md ring-1 ring-white/20 text-white rounded-xl transition"><X size={18} /></button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto p-6 sm:p-8 space-y-6">
          {/* dropdown เขต + งาน1: filter ปี/เดือน */}
          <div className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <select value={a} onChange={e => setA(e.target.value)} className="flex-1 min-w-[120px] px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg text-sm font-bold text-violet-700 outline-none">
                {options.map(d => <option key={d} value={d} disabled={d === b}>{d}</option>)}
              </select>
              <span className="text-slate-400 text-sm font-semibold">vs</span>
              <select value={b} onChange={e => setB(e.target.value)} className="flex-1 min-w-[120px] px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm font-bold text-amber-700 outline-none">
                {options.map(d => <option key={d} value={d} disabled={d === a}>{d}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3">
              <select value={mYear} onChange={e => setMYear(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none">
                <option value="all">ทุกปี</option>
                {years.map(y => <option key={y} value={y}>พ.ศ. {y}</option>)}
              </select>
              <select value={mMonth} onChange={e => setMMonth(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none">
                <option value="all">ทุกเดือน</option>
                {THAI_MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              {!usingMain && (
                <button onClick={() => { setMYear(initialYear); setMMonth(initialMonth) }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-violet-600 hover:bg-violet-50 rounded-lg transition">
                  ⟲ ใช้ filter หน้าหลัก
                </button>
              )}
            </div>
          </div>

          {/* งาน3: mini-map premium ribbon */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RibbonMap side="A" full={a} pts={data.ptsA} stat={data.A} />
            <RibbonMap side="B" full={b} pts={data.ptsB} stat={data.B} />
          </div>

          {/* งาน5: stats table premium */}
          <div className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-slate-50">ตัวชี้วัด</th>
                  <th className="text-right px-4 py-3 font-bold text-violet-700">A: {aName}</th>
                  <th className="text-right px-4 py-3 font-bold text-amber-700">B: {bName}</th>
                  <th className="text-right px-4 py-3 font-semibold">Δ</th>
                </tr>
              </thead>
              <tbody>
                <Row label="จำนวนรวม" a={data.A.total} b={data.B.total} bold />
                <SectionRow icon="💊" label="ชนิดยา" />
                {data.drugKeys.map(d => (
                  <Row key={d} label={d} dot={DRUG_COLORS[d]} a={data.A.drugs[d] || 0} b={data.B.drugs[d] || 0} hi={Math.abs((data.A.drugs[d] || 0) - (data.B.drugs[d] || 0)) > data.hiDiff} />
                ))}
                {data.zeroBoth.length > 0 && (
                  <Row label="ชนิดอื่น" dot="#cbd5e1" muted a={0} b={0} title={`ไม่พบทั้ง 2 เขต: ${data.zeroBoth.join(', ')}`} />
                )}
                <SectionRow icon="📍" label="พื้นที่" />
                <Row label="จำนวนแขวง" a={data.A.khwaengCount} b={data.B.khwaengCount} />
                <Row label="จุดต่อแขวง" a={data.A.perKhwaeng} b={data.B.perKhwaeng} decimal />
              </tbody>
            </table>
          </div>

          {/* งาน2: trend chart premium */}
          <div className="bg-white rounded-2xl ring-1 ring-slate-200 p-6">
            <div className="text-base font-semibold text-slate-800">📉 แนวโน้มรายเดือน (12 เดือน)</div>
            <div className="text-xs text-slate-400 mb-3">ปีงบ {yearLabel} · ต.ค. → ก.ย.</div>
            <PremiumTrendChart data={data.trend} aName={aName} bName={bName} />
          </div>

          {/* งาน6: insights */}
          <InsightsCard insights={data.insights} />
        </div>

        <div className="flex justify-end gap-2 px-6 sm:px-8 py-3 border-t border-slate-200 bg-white flex-shrink-0 print-hide">
          <button onClick={onClose} className="px-5 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition">ปิด</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// งาน3: mini-map พร้อม ribbon header + border สี + overlay stat
function RibbonMap({ side, full, pts, stat }) {
  const isA = side === 'A'
  const ribbon = isA ? 'from-violet-500 to-violet-700' : 'from-amber-500 to-amber-700'
  const ring = isA ? 'ring-violet-300' : 'ring-amber-300'
  const getColor = p => DRUG_COLORS[p.primary_drug] || '#94A3B8'
  return (
    <div className={`rounded-3xl overflow-hidden ring-2 ${ring} shadow-2xl bg-white`}>
      <div className={`bg-gradient-to-r ${ribbon} px-4 py-2.5 text-white`}>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center text-xs font-bold">{side}</span>
          <span className="font-bold">{full}</span>
        </div>
        <div className="text-xs text-white/85 mt-0.5">{pts.length.toLocaleString()} จุด · {stat.khwaengCount} แขวง</div>
      </div>
      <div className="relative h-[240px]">
        <IncidentMap mini points={pts} getColor={getColor} highlightDistrict={full} viewMode="point" className="w-full h-full" />
        <div className="absolute top-2 right-2 z-[500] bg-white/90 backdrop-blur rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-700 shadow print-hide">
          เฉลี่ย/แขวง: {stat.perKhwaeng.toFixed(0)}
        </div>
      </div>
    </div>
  )
}

// งาน2: premium trend chart (gradient fill + peak markers + custom tooltip)
function PremiumTrendChart({ data, aName, bName }) {
  const peakA = data.reduce((mx, p, i) => p.A > data[mx].A ? i : mx, 0)
  const peakB = data.reduce((mx, p, i) => p.B > data[mx].B ? i : mx, 0)
  const maxY = Math.max(1, ...data.map(p => Math.max(p.A, p.B)))
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 24, right: 20, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="cmpA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c3aed" stopOpacity={0.22} /><stop offset="100%" stopColor="#7c3aed" stopOpacity={0.02} /></linearGradient>
          <linearGradient id="cmpB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.18} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, Math.ceil(maxY * 1.15)]} ticks={[0, maxY]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} />
        <RTooltip content={<TrendTooltip aName={aName} bName={bName} />} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
        <Area type="monotone" dataKey="A" name={aName} stroke="#7c3aed" strokeWidth={3} fill="url(#cmpA)" dot={false} activeDot={{ r: 5 }} isAnimationActive animationDuration={1000} />
        <Area type="monotone" dataKey="B" name={bName} stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="6 3" fill="url(#cmpB)" dot={false} activeDot={{ r: 5 }} isAnimationActive animationDuration={1000} />
        {data[peakA].A > 0 && <ReferenceDot x={data[peakA].label} y={data[peakA].A} r={5} fill="#7c3aed" stroke="#fff" strokeWidth={2} label={{ value: data[peakA].A, position: 'top', fontSize: 11, fontWeight: 700, fill: '#7c3aed' }} />}
        {data[peakB].B > 0 && <ReferenceDot x={data[peakB].label} y={data[peakB].B} r={5} fill="#f59e0b" stroke="#fff" strokeWidth={2} label={{ value: data[peakB].B, position: 'bottom', fontSize: 11, fontWeight: 700, fill: '#d97706' }} />}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
function TrendTooltip({ active, payload, label, aName, bName }) {
  if (!active || !payload?.length) return null
  const A = payload.find(p => p.dataKey === 'A')?.value ?? 0
  const B = payload.find(p => p.dataKey === 'B')?.value ?? 0
  const d = A - B
  const pct = Math.min(A, B) > 0 ? (Math.abs(d) / Math.min(A, B) * 100).toFixed(0) : null
  return (
    <div className="bg-white rounded-lg ring-1 ring-slate-200 shadow-xl px-3 py-2 text-xs">
      <div className="font-bold text-slate-800 mb-1">{label}</div>
      <div className="flex items-center justify-between gap-4"><span className="text-violet-600">● {aName}</span><span className="font-bold tabular-nums">{A.toLocaleString()}</span></div>
      <div className="flex items-center justify-between gap-4"><span className="text-amber-600">● {bName}</span><span className="font-bold tabular-nums">{B.toLocaleString()}</span></div>
      {d !== 0 && <div className={`mt-1 pt-1 border-t border-slate-100 text-right font-bold ${d > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>Δ {d > 0 ? '+' : ''}{d}{pct ? ` (${d > 0 ? '▲' : '▼'} ${pct}%)` : ''}</div>}
    </div>
  )
}

// งาน5: premium row + Δ badge
function Delta({ a, b, decimal }) {
  const d = a - b
  const eq = Math.abs(d) < (decimal ? 0.05 : 0.5)
  const v = decimal ? Math.abs(d).toFixed(1) : Math.abs(d).toLocaleString()
  const cls = eq ? 'bg-slate-100 text-slate-500' : d > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${cls}`}>{eq ? '= 0' : `${d > 0 ? '▲ +' : '▼ -'}${v}`}</span>
}
function Row({ label, a, b, dot, bold, decimal, hi, muted, title }) {
  const fmt = (v) => decimal ? v.toFixed(1) : v.toLocaleString()
  return (
    <tr title={title} className={`border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50 ${bold ? 'bg-slate-50/60' : hi ? 'bg-violet-50/40' : ''}`}>
      <td className={`px-4 py-2.5 sticky left-0 bg-inherit ${muted ? 'text-slate-400' : 'text-slate-700'}`}>
        <span className="inline-flex items-center gap-2">
          {dot && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dot }} />}
          <span className={bold ? 'font-bold' : ''}>{label}</span>
        </span>
      </td>
      <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${muted ? 'text-slate-400' : 'text-violet-600'} ${bold ? 'text-base' : ''}`}>{fmt(a)}</td>
      <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${muted ? 'text-slate-400' : 'text-amber-600'} ${bold ? 'text-base' : ''}`}>{fmt(b)}</td>
      <td className="px-4 py-2.5 text-right"><Delta a={a} b={b} decimal={decimal} /></td>
    </tr>
  )
}
function SectionRow({ icon, label }) {
  return <tr className="bg-slate-100/60"><td colSpan={4} className="px-4 py-1.5 text-xs font-semibold text-slate-500 tracking-wide">{icon} {label}</td></tr>
}

// งาน6: auto insights card
function InsightsCard({ insights }) {
  if (!insights?.length) return null
  return (
    <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 rounded-2xl ring-1 ring-violet-100 p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">💡</span>
        <h3 className="text-base font-semibold text-slate-800">ข้อสังเกต</h3>
      </div>
      <ul className="space-y-2">
        {insights.map((t, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
            <span className="text-violet-400 mt-0.5 flex-shrink-0">•</span><span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
