import { useState, useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip as MapTooltip, GeoJSON, useMap, Pane, Marker } from 'react-leaflet'
import { supabase } from '../lib/supabase'
import { MapPin, ArrowLeft, Search, Menu } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { buildOuterMask } from '../utils/worldMask'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

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
  'ยาอี': '#3B82F6',
  'คีตามีน': '#10B981',
  'โคเคน': '#8B5CF6',
  'แฮปปี้วอเตอร์': '#EC4899',
  'ยาบ้า': '#EF4444',
  'ไอซ์': '#06B6D4',
  'กัญชา': '#84CC16',
  'กระท่อม': '#65A30D',
  'สี่คูณร้อย': '#A16207',
  'เฮโรอีน': '#7C2D12',
  'มอร์ฟีน': '#9F1239',
  'ฝิ่น': '#B91C1C',
  'สารระเหย': '#0EA5E9',
  'วัตถุออกฤทธิ์': '#6366F1',
}

const THAI_MONTHS = [
  { v: 1, l: 'มกราคม' }, { v: 2, l: 'กุมภาพันธ์' }, { v: 3, l: 'มีนาคม' },
  { v: 4, l: 'เมษายน' }, { v: 5, l: 'พฤษภาคม' }, { v: 6, l: 'มิถุนายน' },
  { v: 7, l: 'กรกฎาคม' }, { v: 8, l: 'สิงหาคม' }, { v: 9, l: 'กันยายน' },
  { v: 10, l: 'ตุลาคม' }, { v: 11, l: 'พฤศจิกายน' }, { v: 12, l: 'ธันวาคม' },
]

const DISTRICT_GROUPS = {
  'กรุงเทพเหนือ':     { border: '#a16207', fill: '#fde047', emoji: '🟡', count: 7 },
  'กรุงเทพใต้':      { border: '#1e40af', fill: '#93c5fd', emoji: '🔵', count: 10 },
  'กรุงเทพกลาง':     { border: '#166534', fill: '#86efac', emoji: '🟢', count: 9 },
  'กรุงเทพตะวันออก': { border: '#9a3412', fill: '#fdba74', emoji: '🟠', count: 9 },
  'กรุงธนเหนือ':     { border: '#6b21a8', fill: '#d8b4fe', emoji: '🟣', count: 8 },
  'กรุงธนใต้':       { border: '#9f1239', fill: '#fda4af', emoji: '🔴', count: 7 },
}

const DNAME_TO_GROUP = {
  // กรุงเทพเหนือ (7)
  'เขตดอนเมือง':'กรุงเทพเหนือ','เขตหลักสี่':'กรุงเทพเหนือ','เขตบางเขน':'กรุงเทพเหนือ',
  'เขตสายไหม':'กรุงเทพเหนือ','เขตลาดพร้าว':'กรุงเทพเหนือ','เขตบึงกุ่ม':'กรุงเทพเหนือ',
  'เขตคันนายาว':'กรุงเทพเหนือ',
  // กรุงเทพกลาง (9)
  'เขตพระนคร':'กรุงเทพกลาง','เขตดุสิต':'กรุงเทพกลาง','เขตบางรัก':'กรุงเทพกลาง',
  'เขตป้อมปราบศัตรูพ่าย':'กรุงเทพกลาง','เขตสัมพันธวงศ์':'กรุงเทพกลาง','เขตบางซื่อ':'กรุงเทพกลาง',
  'เขตจตุจักร':'กรุงเทพกลาง','เขตห้วยขวาง':'กรุงเทพกลาง','เขตวังทองหลาง':'กรุงเทพกลาง',
  // กรุงเทพตะวันออก (9)
  'เขตมีนบุรี':'กรุงเทพตะวันออก','เขตลาดกระบัง':'กรุงเทพตะวันออก','เขตหนองจอก':'กรุงเทพตะวันออก',
  'เขตคลองสามวา':'กรุงเทพตะวันออก','เขตสะพานสูง':'กรุงเทพตะวันออก','เขตบางกะปิ':'กรุงเทพตะวันออก',
  'เขตสวนหลวง':'กรุงเทพตะวันออก','เขตประเวศ':'กรุงเทพตะวันออก','เขตพระโขนง':'กรุงเทพตะวันออก',
  // กรุงเทพใต้ (10)
  'เขตปทุมวัน':'กรุงเทพใต้','เขตพญาไท':'กรุงเทพใต้','เขตราชเทวี':'กรุงเทพใต้',
  'เขตวัฒนา':'กรุงเทพใต้','เขตคลองเตย':'กรุงเทพใต้','เขตยานนาวา':'กรุงเทพใต้',
  'เขตสาทร':'กรุงเทพใต้','เขตบางคอแหลม':'กรุงเทพใต้','เขตดินแดง':'กรุงเทพใต้',
  'เขตบางนา':'กรุงเทพใต้',
  // กรุงธนเหนือ (8)
  'เขตคลองสาน':'กรุงธนเหนือ','เขตธนบุรี':'กรุงธนเหนือ','เขตบางกอกใหญ่':'กรุงธนเหนือ',
  'เขตบางกอกน้อย':'กรุงธนเหนือ','เขตบางพลัด':'กรุงธนเหนือ','เขตตลิ่งชัน':'กรุงธนเหนือ',
  'เขตทวีวัฒนา':'กรุงธนเหนือ','เขตภาษีเจริญ':'กรุงธนเหนือ',
  // กรุงธนใต้ (7)
  'เขตบางแค':'กรุงธนใต้','เขตหนองแขม':'กรุงธนใต้','เขตบางขุนเทียน':'กรุงธนใต้',
  'เขตราษฏร์บูรณะ':'กรุงธนใต้','เขตทุ่งครุ':'กรุงธนใต้','เขตจอมทอง':'กรุงธนใต้',
  'เขตบางบอน':'กรุงธนใต้',
}

function HeatmapLayer({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points || points.length === 0) return
    const heatData = points
      .filter(p => p.lat && p.lng)
      .map(p => [p.lat, p.lng, 1.0])
    const heat = L.heatLayer(heatData, {
      radius: 35,
      blur: 18,
      maxZoom: 18,
      max: 0.6,
      minOpacity: 0.45,
      gradient: {
        0.0: '#fbbf24',
        0.3: '#f97316',
        0.5: '#ef4444',
        0.7: '#dc2626',
        0.85: '#b91c1c',
        1.0: '#7f1d1d',
      },
    })
    heat.addTo(map)
    return () => { map.removeLayer(heat) }
  }, [points, map])
  return null
}

function FlyController({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 16, { duration: 1.5 })
  }, [target, map])
  return null
}

function ZoomTracker({ onZoom }) {
  const map = useMap()
  useEffect(() => {
    const handler = () => onZoom(map.getZoom())
    map.on('zoomend', handler)
    return () => map.off('zoomend', handler)
  }, [map, onZoom])
  return null
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

export default function SubstanceRadar() {
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('Club Drugs')
  const [year, setYear] = useState('all')
  const [month, setMonth] = useState('all')
  const [districts, setDistricts] = useState(null)
  const [outerMask, setOuterMask] = useState(null)
  const [viewMode, setViewMode] = useState('point')
  const [groupFilter, setGroupFilter] = useState('all')
  const [groupOverlay, setGroupOverlay] = useState('point')
  const [groupDisplayMode, setGroupDisplayMode] = useState('all')
  const [zoom, setZoom] = useState(11)
  const [searchQuery, setSearchQuery] = useState('')
  const [flyTarget, setFlyTarget] = useState(null)
  const [searchPopup, setSearchPopup] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (groupFilter === 'all') setGroupDisplayMode('all')
  }, [groupFilter])

  useEffect(() => {
    fetch('/bangkok-districts.geojson')
      .then(res => res.json())
      .then(data => {
        setDistricts(data)
        setOuterMask(buildOuterMask(data))
      })
      .catch(err => console.error('โหลดขอบเขตเขตไม่ได้:', err))
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const BATCH = 1000
      let all = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('drug_incidents')
          .select('*')
          .range(from, from + BATCH - 1)
        if (error || !data || data.length === 0) break
        all = all.concat(data)
        if (data.length < BATCH) break
        from += BATCH
      }
      setIncidents(all)
      setLoading(false)
    }
    load()
  }, [])

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
        groups[label] = {
          label,
          sub: r.district || subdistrict || '',
          district: r.district || '',
          subdistrict: subdistrict,
          lat: r.lat, lng: r.lng,
          count: 0,
          drugs: {},
        }
      }
      const g = groups[label]
      g.count++
      if (r.primary_drug) {
        g.drugs[r.primary_drug] = (g.drugs[r.primary_drug] || 0) + 1
      }
    }
    return Object.values(groups)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [searchQuery, incidents])

  const showPoints = viewMode === 'point' || (viewMode === 'district' && groupOverlay === 'point')

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500">กำลังโหลดข้อมูลแผนที่...</p>
      </div>
    </div>
  )
  const showHeatmap = viewMode === 'heatmap' || (viewMode === 'district' && groupOverlay === 'heatmap')

  return (
    <div className="flex h-screen" style={{ fontFamily: 'Sarabun, sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden fixed inset-0 bg-black/40 z-30" />
      )}

      {/* Sidebar */}
      <div className={`fixed lg:static inset-y-0 left-0 z-40 w-80 bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0 flex flex-col transform transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="bg-slate-800 border-b-2 border-blue-600 px-5 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center text-white">
              <MapPin size={20} />
            </div>
            <div>
              <h1 className="font-bold text-base text-white leading-tight">ระบบแผนที่ยาเสพติด</h1>
              <p className="text-xs text-blue-300">BKK Substance Radar · กรุงเทพมหานคร</p>
            </div>
          </div>
        </div>
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อชุมชน / แขวง..."
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
              {searchResults.map((res, i) => (
                <button key={i}
                  onClick={() => {
                    setFlyTarget({ lat: res.lat, lng: res.lng })
                    setSearchPopup(res)
                    setSearchQuery('')
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 transition border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{res.label}</div>
                      {res.sub && <div className="text-xs text-slate-500">{res.sub}</div>}
                    </div>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      {res.count} จุด
                    </span>
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
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                  <MapPin size={16} />
                </div>
                <h3 className="font-bold text-slate-800">เลือกมุมมองข้อมูล</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {Object.keys(DRUG_CATEGORIES).map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                      category === cat
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
                  <div className="rounded-lg overflow-hidden" style={{
                    height: '16px',
                    background: 'linear-gradient(to right, #fef9c3, #fde047, #fb923c, #ef4444, #b91c1c)'
                  }}></div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>น้อย</span><span>ปานกลาง</span><span>สูงมาก</span>
                  </div>
                </div>
              )}

              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">📊</span>
                  <h3 className="font-bold text-slate-800">สถิติพื้นที่</h3>
                </div>
                <div className="text-sm text-slate-600">
                  พบ <strong className="text-blue-600">{points.length.toLocaleString()}</strong> รายการ
                  ในกลุ่ม <strong>{category}</strong>
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
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                  <MapPin size={16} />
                </div>
                <h3 className="font-bold text-slate-800">กลุ่มยาเสพติด</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {Object.keys(DRUG_CATEGORIES).map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                      category === cat
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
                  className={`flex-1 py-2 text-xs font-medium transition border-r border-slate-200 ${
                    groupOverlay === 'point' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}>
                  📍 จุดเหตุการณ์
                </button>
                <button onClick={() => setGroupOverlay('heatmap')}
                  className={`flex-1 py-2 text-xs font-medium transition ${
                    groupOverlay === 'heatmap' ? 'bg-rose-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}>
                  🔥 ความร้อน
                </button>
              </div>

              {groupFilter !== 'all' && (
                <>
                  <div className="text-xs text-slate-500 uppercase font-bold mb-2">แสดงเขต</div>
                  <div className="flex border border-slate-200 rounded-lg overflow-hidden mb-4">
                    <button onClick={() => setGroupDisplayMode('all')}
                      className={`flex-1 py-2 text-xs font-medium transition border-r border-slate-200 ${
                        groupDisplayMode === 'all' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}>
                      ทุกกลุ่ม
                    </button>
                    <button onClick={() => setGroupDisplayMode('selected')}
                      className={`flex-1 py-2 text-xs font-medium transition ${
                        groupDisplayMode === 'selected' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}>
                      เฉพาะกลุ่มนี้
                    </button>
                  </div>
                </>
              )}

              <div className="text-xs text-slate-500 uppercase font-bold mb-2">กลุ่มเขต</div>
              <div className="space-y-1.5">
                {Object.entries(DISTRICT_GROUPS).map(([name, g]) => (
                  <div key={name}
                    onClick={() => setGroupFilter(groupFilter === name ? 'all' : name)}
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
      </div>

      {/* Map area */}
      <div className="flex-1 relative">
        {/* Hamburger button — mobile only */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden fixed bottom-8 left-4 z-[1001] w-12 h-12 bg-blue-600 text-white rounded-full shadow-xl flex items-center justify-center">
          <Menu size={22} />
        </button>

        <a href="/"
           className="absolute top-4 right-4 z-[1000] bg-white hover:bg-slate-50 rounded-lg shadow-lg px-4 py-2 border border-slate-200 flex items-center gap-2 text-sm font-medium text-slate-700 transition">
          <ArrowLeft size={16} /> กลับหน้าหลัก
        </a>
        <div className="absolute top-4 left-4 z-[1000] bg-slate-800/95 backdrop-blur rounded-xl shadow-lg px-5 py-3 border border-slate-700 max-w-md">
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
                  : viewMode === 'point' ? `Point Map · ${points.length.toLocaleString()} จุด`
                  : `Heat Map · ${points.length.toLocaleString()} จุด`
                }
              </p>
            </div>
          </div>
        </div>

        <MapContainer
          center={[13.7563, 100.5018]}
          zoom={11}
          minZoom={10}
          maxZoom={18}
          maxBounds={[[13.49, 100.32], [13.96, 100.94]]}
          maxBoundsViscosity={1.0}
          scrollWheelZoom={true}
          className="w-full h-full"
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors &copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          <ZoomTracker onZoom={setZoom} />
          <FlyController target={flyTarget} />
          <Pane name="districts-pane" style={{ zIndex: 350 }} />
          <Pane name="markers-pane" style={{ zIndex: 600 }} />

          {/* Mask นอก กทม */}
          {outerMask && (
            <GeoJSON
              key="outer-mask"
              data={outerMask}
              pane="districts-pane"
              style={{ fillColor: '#0f172a', fillOpacity: 0.65, weight: 0, interactive: false }}
            />
          )}
          {/* เส้นกรอบ 50 เขต */}
          {districts && (
            <GeoJSON
              key="district-borders"
              data={districts}
              pane="districts-pane"
              style={{ color: '#1e3a8a', weight: 1.8, fillColor: '#3b82f6', fillOpacity: 0.05, opacity: 1 }}
              onEachFeature={(feature, layer) => {
                const name = feature.properties?.dname || 'เขต'
                layer.bindTooltip(name, { sticky: true, className: 'district-tooltip' })
                layer.on({
                  mouseover: (e) => e.target.setStyle({ fillOpacity: 0.20, weight: 3, color: '#1d4ed8' }),
                  mouseout: (e) => e.target.setStyle({ fillOpacity: 0.05, weight: 1.8, color: '#1e3a8a' }),
                })
              }}
            />
          )}
          {/* สีกลุ่มเขต */}
          {viewMode === 'district' && districts && (
            <GeoJSON
              key={`district-groups-${groupFilter}-${groupDisplayMode}`}
              data={districts}
              pane="districts-pane"
              style={(feature) => {
                const dname = feature.properties?.dname
                const group = DNAME_TO_GROUP[dname]
                const g = DISTRICT_GROUPS[group]
                const isOtherGroup = groupFilter !== 'all' && group !== groupFilter
                if (isOtherGroup && groupDisplayMode === 'selected') {
                  return { fillOpacity: 0, opacity: 0, weight: 0 }
                }
                if (isOtherGroup) {
                  return { color: '#94a3b8', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.15, opacity: 0.4 }
                }
                return g
                  ? { color: g.border, weight: 2, fillColor: g.fill, fillOpacity: 0.55, opacity: 1 }
                  : { color: '#94a3b8', weight: 1.5, fillColor: '#e2e8f0', fillOpacity: 0.35, opacity: 0.7 }
              }}
              onEachFeature={(feature, layer) => {
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
                      const drugList = Object.entries(stat.drugs)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 6)
                      const drugRows = drugList.length > 0
                        ? drugList.map(([drug, count]) => {
                            const color = DRUG_COLORS[drug] || '#94A3B8'
                            return `
                              <div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0">
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
                              <span style="color:#64748b">กลุ่มพื้นที่</span>
                              <span style="font-weight:600">${group || '-'}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;padding:2px 0">
                              <span style="color:#64748b">เรื่องยาเสพติด</span>
                              <span style="font-weight:700;color:#dc2626">${stat.total} จุด</span>
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
              }}
            />
          )}

          {/* Search popup marker */}
          {searchPopup && (
            <Marker
              position={[searchPopup.lat, searchPopup.lng]}
              eventHandlers={{ add: (e) => e.target.openPopup() }}
            >
              <Popup eventHandlers={{ remove: () => setSearchPopup(null) }}>
                <div style={{ fontFamily: 'Sarabun, sans-serif', minWidth: '210px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '8px' }}>
                    📍 {searchPopup.label}
                  </div>
                  <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                    {searchPopup.subdistrict && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ color: '#64748b' }}>แขวง</span>
                        <span style={{ fontWeight: 600 }}>{searchPopup.subdistrict}</span>
                      </div>
                    )}
                    {searchPopup.district && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ color: '#64748b' }}>เขต</span>
                        <span style={{ fontWeight: 600 }}>{searchPopup.district}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ color: '#64748b' }}>พบทั้งหมด</span>
                      <span style={{ fontWeight: 700, color: '#dc2626' }}>{searchPopup.count} จุด</span>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      จำแนกตามชนิดยา
                    </div>
                    {Object.entries(searchPopup.drugs)
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
              </Popup>
            </Marker>
          )}

          {/* จุดเหตุการณ์ (point mode + district/point overlay) */}
          {showPoints && points.map((p) => (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              pane="markers-pane"
              radius={zoom >= 15 ? 10 : zoom >= 13 ? 7 : 5}
              pathOptions={{
                fillColor: DRUG_COLORS[p.primary_drug] || '#94A3B8',
                fillOpacity: 0.85,
                color: '#fff',
                weight: 2,
              }}
            >
              <Popup><PointPopupContent p={p} /></Popup>
              <MapTooltip>{p.primary_drug} · {p.subdistrict || ''}</MapTooltip>
            </CircleMarker>
          ))}

          {/* Heatmap (heatmap mode + district/heatmap overlay) */}
          {showHeatmap && (
            <>
              <HeatmapLayer points={points} />
              {zoom >= 14 && points.map((p) => (
                <CircleMarker
                  key={'hm-' + p.id}
                  center={[p.lat, p.lng]}
                  pane="markers-pane"
                  radius={zoom >= 16 ? 9 : 6}
                  pathOptions={{
                    fillColor: '#fff',
                    fillOpacity: 0.25,
                    color: '#fff',
                    weight: 1.5,
                    opacity: 0.7,
                  }}
                >
                  <Popup><PointPopupContent p={p} /></Popup>
                </CircleMarker>
              ))}
            </>
          )}
        </MapContainer>

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
  )
}
