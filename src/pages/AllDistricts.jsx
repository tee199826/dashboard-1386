import { cloneElement, useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Search, MapPin, AlertTriangle, Info, ChevronRight, ChevronDown, Trophy, Clock,
  BarChart3, TrendingUp, PieChart as PieIcon, Grid3X3, Layers, CalendarRange, Download, X,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend, LabelList, ReferenceDot,
} from 'recharts'
import { useData } from '../context/DataContext'
import { fetchAllPages } from '../utils/supabasePagination'
import { deriveBehaviors } from '../utils/drugWide'
import { getDistrictMetrics } from '../utils/statistics'
import { DNAME_TO_GROUP } from '../utils/constants'
import { supabase } from '../lib/supabase'
import { formatThaiDate, formatPeriod, minMaxDate, getLastUploadDate } from '../utils/heroMeta'
import { dateToFiscalYear } from '../utils/fiscalYear'
import { filterByDateColumn } from '../utils/filterRows'
import { useFilter } from '../context/FilterContext'
import { exportDrugIncidentReport, DRUG_INCIDENT_EXPORT_COLUMNS } from '../utils/exportReport'
import IncidentMap from '../components/IncidentMap'
import DateFilter from '../components/DateFilter'
import ExportDialog from '../components/ExportDialog'

// ── Palette (จำกัด: violet / emerald / rose / slate / amber) ──
const C = {
  violet: '#7c3aed', violetDark: '#5b21b6', violetSoft: '#a78bfa',
  emerald: '#10b981', rose: '#f43f5e', amber: '#fbbf24', amberDeep: '#d97706',
}

// metric ที่เลือกระบายสีแผนที่ / เรียงตาราง — สี in-palette
const METRICS = [
  { id: 'incidents',  short: 'เหตุการณ์', map: 'เหตุการณ์ยาเสพติด', header: 'เหตุการณ์ยา (ครั้ง)', color: C.rose },
  { id: 'complaints', short: 'ร้องเรียน',  map: 'เรื่องร้องเรียน',     header: 'ร้องเรียน (เรื่อง)',   color: C.violet },
  { id: 'completed',  short: 'ดำเนินการ', map: 'ดำเนินการสำเร็จ',   header: 'ดำเนินการ (เรื่อง)',  color: C.emerald },
  { id: 'dealers',    short: 'แหล่งซื้อ',  map: 'แหล่งซื้อยาเสพติด',   header: 'แหล่งซื้อ (แห่ง)',    color: C.amberDeep },
]

const GROUP_ORDER  = ['กรุงเทพกลาง', 'กรุงเทพเหนือ', 'กรุงเทพใต้', 'กรุงเทพตะวันออก', 'กรุงธนเหนือ', 'กรุงธนใต้']
const GROUP_COLORS = [C.violet, C.violetSoft, C.emerald, '#34d399', C.amber, C.rose]
const BEHAVIOR_CATS = ['เสพ', 'ค้า', 'เสพ/ค้า', 'ผลิต']
const BEHAVIOR_PALETTE = { 'เสพ': C.violet, 'ค้า': C.rose, 'เสพ/ค้า': C.amber, 'ผลิต': C.emerald }
const YEAR_COLORS = [C.violetSoft, C.violet, C.amber, C.rose, C.emerald, C.violetDark]
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const TH_MON_FY = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.']
const MIN_BASE_ROWS = 100
const TODAY_ISO = new Date().toISOString().slice(0, 10)

const nowMs = () => Date.now()
function daysAgo(iso) {
  if (!iso) return null
  const t = new Date(iso); if (isNaN(t)) return null
  return Math.max(0, Math.floor((nowMs() - t.getTime()) / 86400000))
}
const agoLabel = (d) => d == null ? null : d === 0 ? 'วันนี้' : `${d.toLocaleString()} วันที่แล้ว`
const pctChange = (cur, prev) => (!prev || prev === 0) ? null : (cur - prev) / prev * 100
const EMPTY = {}
const fyMonthIndex = (dt) => (dt.getMonth() + 3) % 12   // ต.ค.=0 ... ก.ย.=11

// diverging color ตาม % YoY — 🟢ลด / ⚪ใกล้เคียง / 🔴เพิ่ม
function pctColor(pct) {
  if (pct == null) return '#e2e8f0'
  if (pct > 50) return '#e11d48'
  if (pct > 10) return '#fb7185'
  if (pct >= -10) return '#e2e8f0'
  if (pct >= -50) return '#34d399'
  return '#059669'
}
function shiftYear(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y + delta}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function normBehavior(tok) {
  const t = tok.trim().replace('เสพ-ค้า', 'เสพ/ค้า')
  return BEHAVIOR_PALETTE[t] ? t : null
}
function filterLabel(state) {
  if (!state) return 'ทั้งหมด'
  if (state.mode === 'fiscal') return state.fiscalYear ? `ปีงบ ${state.fiscalYear}` : 'ทุกปีงบ'
  if (state.mode === 'month') {
    if (!state.monthYear) return 'ทุกปีงบ'
    if (!state.month) return `ปีงบ ${state.monthYear}`
    return `${TH_MON[state.month - 1]} ${state.monthYear}`
  }
  if (state.customFrom && state.customTo) return `${state.customFrom} – ${state.customTo}`
  return 'ทั้งหมด'
}

// bucket รายเดือน/รายวันตาม DateFilter (sparkline KPI)
function buildTrend(rows, from, to, mode, forceGran) {
  let gran = forceGran
  if (!gran) {
    if (mode === 'month') gran = 'day'
    else if (from && to) gran = (new Date(to) - new Date(from)) / 86400000 <= 62 ? 'day' : 'month'
    else gran = 'month'
  }
  let start = from ? new Date(from) : null
  let end = to ? new Date(to) : null
  if (!start || !end) {
    const ds = rows.map(r => r.received_date).filter(Boolean).sort()
    if (!ds.length) return []
    start = new Date(ds[0]); end = new Date(ds[ds.length - 1])
  }
  const keyOf = (d) => gran === 'month'
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const order = [], counts = new Map()
  const cur = gran === 'month' ? new Date(start.getFullYear(), start.getMonth(), 1) : new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = gran === 'month' ? new Date(end.getFullYear(), end.getMonth(), 1) : new Date(end.getFullYear(), end.getMonth(), end.getDate())
  let guard = 0
  while (cur <= last && guard++ < 800) {
    const key = keyOf(cur); counts.set(key, 0); order.push({ key, date: new Date(cur) })
    if (gran === 'month') cur.setMonth(cur.getMonth() + 1); else cur.setDate(cur.getDate() + 1)
  }
  for (const r of rows) {
    if (!r.received_date) continue
    const d = new Date(r.received_date); if (isNaN(d)) continue
    const key = keyOf(d); if (counts.has(key)) counts.set(key, counts.get(key) + 1)
  }
  return order.map(({ key, date }) => ({
    key,
    label: gran === 'month' ? TH_MON[date.getMonth()] : String(date.getDate()),
    fullLabel: gran === 'month' ? `${TH_MON[date.getMonth()]} ${date.getFullYear() + 543}` : `${date.getDate()} ${TH_MON[date.getMonth()]} ${date.getFullYear() + 543}`,
    count: counts.get(key),
  }))
}

function lerpColor(a, b, t) {
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16)
  const ar = ah >> 16, ag = (ah >> 8) & 255, ab = ah & 255
  const br = bh >> 16, bg = (bh >> 8) & 255, bb = bh & 255
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t)
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`
}

const districtCountsOf = (rows) => {
  const m = {}
  for (const r of rows) { const d = r.district; if (d && d.startsWith('เขต')) m[d] = (m[d] || 0) + 1 }
  return Object.entries(m).map(([district, count]) => ({ district, count })).sort((a, b) => b.count - a.count)
}

export default function AllDistricts() {
  const { records } = useData()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('incidents')
  const [metric, setMetric] = useState('incidents')
  const [selectedDistrict, setSelectedDistrict] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)        // cross-filter จาก donut
  const [compareYoY, setCompareYoY] = useState(false)
  const [autoOff, setAutoOff] = useState(false)                   // notice "ปิดเทียบปีอัตโนมัติ" เมื่อเปลี่ยน pill ออกจากเหตุการณ์
  const [yearA, setYearA] = useState(null)                        // hero chart: ปีเทียบ A (null = default current FY)
  const [yearB, setYearB] = useState(null)                        // hero chart: ปีเทียบ B (null = default nearest prev)
  const [mapCompareMode, setMapCompareMode] = useState('absolute')
  const [tableOpen, setTableOpen] = useState(false)               // ตาราง drill-down default closed
  const [incidents, setIncidents] = useState([])
  const [incReady, setIncReady] = useState(false)
  const [dealerRows, setDealerRows] = useState([])
  const [lastUpload, setLastUpload] = useState(null)

  const heroChartRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    fetchAllPages('drug_incidents', 'district, received_date, created_at, beh_use, beh_sell, beh_use_sell, beh_produce')
      .then(rows => { setIncidents(rows.map(r => ({ ...r, behaviors: deriveBehaviors(r) }))); setIncReady(true) })
      .catch(err => { console.error('[/districts] fetch drug_incidents failed:', err); setIncReady(true); return [] })
    fetchAllPages('substance_users', 'dealer_locations, surveyed_at')
      .then(setDealerRows)
      .catch(err => { console.error('[/districts] fetch substance_users failed:', err); return [] })
    getLastUploadDate(supabase, ['complaints', 'drug_incidents', 'substance_users'])
      .then(setLastUpload)
      .catch(err => { console.error('[/districts] fetch lastUpload failed:', err); return null })
  }, [])

  // deep link จากหน้าอื่น (เช่น /pixel-map bubble tooltip): ?district=เขตประเวศ → เลือก + เลื่อนไปแผนที่ให้ทันที
  useEffect(() => {
    const d = searchParams.get('district')
    if (d) { setSelectedDistrict(d); mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const heroPeriod = useMemo(() => {
    const c = minMaxDate(records, 'date'), i = minMaxDate(incidents, 'received_date')
    const mins = [c.min, i.min].filter(Boolean).sort()
    const maxs = [c.max, i.max].filter(Boolean).sort()
    return formatPeriod(mins[0], maxs[maxs.length - 1])
  }, [records, incidents])

  const { getDateRange, state } = useFilter()
  const range = getDateRange()
  const rFrom = range?.from
  const rTo = range?.to
  const availableYears = useMemo(() => {
    const s = new Set()
    records.forEach(r => { const fy = dateToFiscalYear(r.date); if (fy) s.add(fy) })
    incidents.forEach(r => { const fy = dateToFiscalYear(r.received_date); if (fy) s.add(fy) })
    dealerRows.forEach(r => { const fy = dateToFiscalYear(r.surveyed_at); if (fy) s.add(fy) })
    return [...s].sort((a, b) => b - a)
  }, [records, incidents, dealerRows])

  const fRecords = useMemo(() => filterByDateColumn(records, 'date', range), [records, rFrom, rTo])
  const fIncidents = useMemo(() => filterByDateColumn(incidents, 'received_date', range), [incidents, rFrom, rTo])
  const fDealers = useMemo(() => filterByDateColumn(dealerRows, 'surveyed_at', range), [dealerRows, rFrom, rTo])

  // ── YTD comparison (จาก incidents raw) ──
  const comparison = useMemo(() => {
    if (!rFrom || !rTo) return null
    let maxInRange = null
    for (const r of incidents) {
      const d = (r.received_date || '').slice(0, 10)
      if (d && d >= rFrom && d <= rTo && (!maxInRange || d > maxInRange)) maxInRange = d
    }
    if (!maxInRange) return null
    const cutoff = maxInRange > TODAY_ISO ? TODAY_ISO : maxInRange
    const ytd = cutoff < rTo
    const prevFrom = shiftYear(rFrom, -1), prevTo = shiftYear(cutoff, -1)
    let cur = 0, prev = 0
    const curByD = {}, prevByD = {}
    for (const r of incidents) {
      const d = (r.received_date || '').slice(0, 10); if (!d) continue
      const dist = r.district
      if (d >= rFrom && d <= cutoff) { cur++; if (dist && dist.startsWith('เขต')) curByD[dist] = (curByD[dist] || 0) + 1 }
      else if (d >= prevFrom && d <= prevTo) { prev++; if (dist && dist.startsWith('เขต')) prevByD[dist] = (prevByD[dist] || 0) + 1 }
    }
    return { cutoff, ytd, curFrom: rFrom, prevFrom, prevTo, cur, prev, curByD, prevByD }
  }, [incidents, rFrom, rTo])

  const curByD = comparison?.curByD || EMPTY
  const prevByD = comparison?.prevByD || EMPTY
  const cmpEnough = !!comparison && comparison.prev >= MIN_BASE_ROWS
  const incChange = cmpEnough ? pctChange(comparison.cur, comparison.prev) : null
  const cmpNote = comparison && !cmpEnough ? 'ข้อมูลปีก่อนไม่เพียงพอ' : null
  const comparing = compareYoY && !!comparison && metric === 'incidents'
  const mapDiverge = comparing && mapCompareMode !== 'absolute'
  const cmpTooltip = comparison
    ? `เทียบ ${formatThaiDate(comparison.curFrom)} – ${formatThaiDate(comparison.cutoff)} กับ ${formatThaiDate(comparison.prevFrom)} – ${formatThaiDate(comparison.prevTo)}${comparison.ytd ? ' (YTD)' : ''}`
      + (comparison.prev > 0 && comparison.prev < 1000 ? `\nℹ️ ปีก่อนมีเพียง ${comparison.prev.toLocaleString()} เหตุ — % สูงเพราะปีก่อนบันทึกน้อย` : '')
    : undefined

  const districtCounts = useMemo(() => districtCountsOf(fIncidents), [fIncidents])
  const kpiIncidents = fIncidents.length
  const kpiTopDistrict = districtCounts[0] || null
  const kpiUpdated = useMemo(() => {
    let max = null
    for (const r of fIncidents) if (r.created_at && (!max || r.created_at > max)) max = r.created_at
    return max
  }, [fIncidents])
  const updatedDaysAgo = useMemo(() => daysAgo(kpiUpdated), [kpiUpdated])
  const updatedLabel = formatThaiDate(kpiUpdated) || '—'
  const topChange = useMemo(() => {
    if (!cmpEnough || !kpiTopDistrict) return null
    const p = comparison.prevByD[kpiTopDistrict.district] || 0
    if (p < 5) return null
    return pctChange(comparison.curByD[kpiTopDistrict.district] || 0, p)
  }, [cmpEnough, comparison, kpiTopDistrict])

  // cross-filter ตามกลุ่ม บก.น. (มีผลกับ top10 / stacked / hero trend)
  const gIncidents = useMemo(
    () => selectedGroup ? fIncidents.filter(r => DNAME_TO_GROUP[r.district] === selectedGroup) : fIncidents,
    [fIncidents, selectedGroup],
  )
  const gDistrictCounts = useMemo(() => districtCountsOf(gIncidents), [gIncidents])

  // sparkline KPI (period ปัจจุบัน adaptive)
  const sparkTrend = useMemo(() => buildTrend(fIncidents, rFrom, rTo, state.mode).map(t => t.count), [fIncidents, rFrom, rTo, state.mode])

  // chart #Top10 (group-filtered) + YoY mini
  const top10 = useMemo(() => gDistrictCounts.slice(0, 10).map((d) => {
    const prev = prevByD[d.district] || 0, cur = curByD[d.district] || 0
    return { name: d.district.replace(/^เขต/, ''), full: d.district, value: d.count, yoy: (prev >= 20) ? pctChange(cur, prev) : null }
  }), [gDistrictCounts, curByD, prevByD])

  // donut 6 กลุ่ม (จาก fIncidents — ตัวเลือก cross-filter)
  const groupDonut = useMemo(() => {
    const m = {}
    for (const r of fIncidents) { const g = DNAME_TO_GROUP[r.district]; if (g) m[g] = (m[g] || 0) + 1 }
    return GROUP_ORDER.map((g, i) => ({ name: g, value: m[g] || 0, color: GROUP_COLORS[i] })).filter(d => d.value > 0)
  }, [fIncidents])
  const groupTotal = groupDonut.reduce((s, d) => s + d.value, 0)

  // stacked พฤติการณ์ (group-filtered, top 15)
  const behaviorStack = useMemo(() => {
    const top = gDistrictCounts.slice(0, 15).map(d => d.district)
    const set = new Set(top), m = {}
    for (const r of gIncidents) {
      const d = r.district
      if (!set.has(d) || !r.behaviors) continue
      for (const tok of String(r.behaviors).split(',')) { const cat = normBehavior(tok); if (!cat) continue; (m[d] ||= {})[cat] = (m[d][cat] || 0) + 1 }
    }
    return top.map(d => { const row = { district: d.replace(/^เขต/, ''), full: d }; for (const c of BEHAVIOR_CATS) row[c] = m[d]?.[c] || 0; return row })
  }, [gIncidents, gDistrictCounts])

  const heatmap = useMemo(() => {
    const months = buildTrend(fIncidents, rFrom, rTo, state.mode, 'month')
    const dists = districtCounts.map(d => d.district)
    const cell = {}; let max = 0
    for (const r of fIncidents) {
      const d = r.district; if (!d || !d.startsWith('เขต')) continue
      const dt = new Date(r.received_date); if (isNaN(dt)) continue
      const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      const key = `${d}|${mk}`; cell[key] = (cell[key] || 0) + 1; if (cell[key] > max) max = cell[key]
    }
    return { months, dists, cell, max }
  }, [fIncidents, districtCounts, rFrom, rTo, state.mode])

  const yearCompare = useMemo(() => {
    const m = {}
    for (const r of incidents) { const fy = dateToFiscalYear(r.received_date); if (fy) m[fy] = (m[fy] || 0) + 1 }
    return Object.entries(m).map(([fy, count]) => ({ fy: Number(fy), count })).filter(d => d.count >= MIN_BASE_ROWS).sort((a, b) => a.fy - b.fy)
  }, [incidents])

  // ── HERO chart: เทียบ 2 ปีงบ (เลือกเอง) อิงเดือนปีงบ ต.ค.→ก.ย. ──
  const currentFY = dateToFiscalYear(TODAY_ISO)
  const yearsAvail = useMemo(() => yearCompare.map(d => d.fy).sort((a, b) => b - a), [yearCompare])   // ปีที่มี data >100, ใหม่→เก่า
  // default A = ปีงบปัจจุบัน (ถ้ามี data) ไม่งั้นปีล่าสุด ; default B = ปีที่ใกล้ A ที่สุด
  const effA = (yearA != null && yearsAvail.includes(yearA)) ? yearA
    : (yearsAvail.includes(currentFY) ? currentFY : yearsAvail[0])
  const effB = (yearB != null && yearsAvail.includes(yearB) && yearB !== effA) ? yearB
    : yearsAvail.filter(y => y !== effA).sort((a, b) => Math.abs(a - effA) - Math.abs(b - effA))[0]

  const heroCompare = useMemo(() => {
    const inGroup = (r) => !selectedGroup || DNAME_TO_GROUP[r.district] === selectedGroup
    const aArr = Array(12).fill(0), bArr = Array(12).fill(0)
    for (const r of incidents) {
      if (!inGroup(r)) continue
      const fy = dateToFiscalYear(r.received_date); if (!fy) continue
      const dt = new Date(r.received_date); if (isNaN(dt)) continue
      const idx = fyMonthIndex(dt)
      if (fy === effA) aArr[idx]++
      else if (fy === effB) bArr[idx]++
    }
    // YTD-align: ตัดถึงเดือนสุดท้ายที่มี data (ปีที่ยังไม่จบ → ทั้ง A,B ตัดเท่ากัน)
    let lastIdx = 0
    for (let i = 0; i < 12; i++) if (aArr[i] || bArr[i]) lastIdx = i
    const points = TH_MON_FY.slice(0, lastIdx + 1).map((label, i) => ({ label, fullLabel: label, cur: aArr[i], prev: bArr[i] }))
    return { points, labelA: `ปีงบ ${effA} (YTD)`, labelB: effB ? `ปีงบ ${effB} (YTD)` : null }
  }, [incidents, effA, effB, selectedGroup])

  // ── map/table (complaints+incidents+dealers aggregate) ──
  const metrics = useMemo(() => getDistrictMetrics(fRecords, fIncidents, fDealers), [fRecords, fIncidents, fDealers])
  const byName = useMemo(() => Object.fromEntries(metrics.map(m => [m.district, m])), [metrics])
  const metricMax = useMemo(() => Math.max(1, ...metrics.map(m => m[metric] || 0)), [metrics, metric])
  const maxDelta = useMemo(() => {
    if (!comparing) return 0
    let mx = 0
    const ks = new Set([...Object.keys(curByD), ...Object.keys(prevByD)])
    for (const k of ks) { const d = Math.abs((curByD[k] || 0) - (prevByD[k] || 0)); if (d > mx) mx = d }
    return mx
  }, [comparing, curByD, prevByD])

  // เขตที่ valid = อยู่ใน DNAME_TO_GROUP (50 เขต กทม.) — กัน typo/null/อำเภอนอกเขตหลุดเข้าตาราง
  const validMetrics = useMemo(() => metrics.filter(m => DNAME_TO_GROUP[m.district]), [metrics])
  const excludedCount = metrics.length - validMetrics.length

  const table = useMemo(() => {
    const q = search.trim()
    const t = validMetrics.filter(m => !q || m.district.includes(q))
    const yoyKey = sortKey === 'curYTD' || sortKey === 'prevYTD' || sortKey === 'deltaAbs' || sortKey === 'pctYoY'
    if (comparing && yoyKey) {
      const valOf = (m) => {
        const prev = prevByD[m.district] || 0, cur = curByD[m.district] || 0
        if (sortKey === 'curYTD') return cur
        if (sortKey === 'prevYTD') return prev
        if (prev < 10) return -Infinity   // ข้อมูลปีก่อนไม่พอ → ไปท้าย
        if (sortKey === 'deltaAbs') return cur - prev
        return (cur - prev) / prev        // pctYoY
      }
      return [...t].sort((a, b) => valOf(b) - valOf(a))
    }
    const key = yoyKey ? 'incidents' : sortKey
    return [...t].sort((a, b) => (b[key] || 0) - (a[key] || 0))
  }, [validMetrics, search, sortKey, comparing, curByD, prevByD])

  const activeMetric = METRICS.find(m => m.id === metric) || METRICS[0]
  const activeColor = activeMetric.color
  const layerKey = `ad-${metric}-${metrics.length}`
  const layerStyle = useMemo(() => (feature) => {
    const dn = feature.properties?.dname
    const isSel = dn && dn === selectedDistrict
    if (mapDiverge) {
      const cur = curByD[dn] || 0, prev = prevByD[dn] || 0
      if (prev < 20) return { color: isSel ? '#0f172a' : '#e2e8f0', weight: isSel ? 3 : 1, fillColor: '#cbd5e1', fillOpacity: 0.22, opacity: 0.8 }
      if (mapCompareMode === 'pct') return { color: isSel ? '#0f172a' : '#cbd5e1', weight: isSel ? 3 : 1, fillColor: pctColor((cur - prev) / prev * 100), fillOpacity: 0.78, opacity: 0.95 }
      const diff = cur - prev, t = maxDelta ? Math.min(1, Math.abs(diff) / maxDelta) : 0
      return { color: isSel ? '#0f172a' : '#cbd5e1', weight: isSel ? 3 : 1, fillColor: diff >= 0 ? C.violet : C.emerald, fillOpacity: 0.12 + t * 0.78, opacity: 0.95 }
    }
    const v = byName[dn]?.[metric] || 0
    if (v === 0) return { color: isSel ? '#0f172a' : '#e2e8f0', weight: isSel ? 3 : 1, fillColor: activeColor, fillOpacity: 0.04, opacity: isSel ? 1 : 0.5 }
    const t = v / metricMax
    return { color: isSel ? '#0f172a' : '#cbd5e1', weight: isSel ? 3 : 1, fillColor: activeColor, fillOpacity: 0.12 + t * 0.75, opacity: 0.95 }
  }, [byName, metric, metricMax, activeColor, selectedDistrict, mapDiverge, mapCompareMode, curByD, prevByD, maxDelta])

  const layerOnEach = useMemo(() => (feature, layer) => {
    const dn = feature.properties?.dname || 'ไม่ระบุ'
    const m = byName[dn]
    const group = DNAME_TO_GROUP[dn] || '—'
    if (comparing) {
      const cur = curByD[dn] || 0, prev = prevByD[dn] || 0, diff = cur - prev
      const pct = prev > 0 ? diff / prev * 100 : null
      const changeTxt = prev < 20 ? '<span style="color:#94a3b8">ข้อมูลปีก่อนไม่เพียงพอ</span>'
        : mapCompareMode === 'delta' ? `<span style="color:${diff >= 0 ? C.violetDark : '#059669'};font-weight:700">Δ ${diff >= 0 ? '+' : ''}${diff.toLocaleString()}</span>`
          : (pct == null ? '—' : `<span style="color:${pct >= 0 ? '#e11d48' : '#059669'};font-weight:700">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</span>`)
      const r = (lbl, val) => `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#64748b">${lbl}</span><span style="font-weight:600;font-variant-numeric:tabular-nums;color:#0f172a">${val}</span></div>`
      layer.bindTooltip(`<div style="min-width:210px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid #f1f5f9"><span style="font-weight:700;color:#0f172a">${dn}</span><span style="font-size:11px;color:#64748b">${group}</span></div><div style="display:flex;flex-direction:column;gap:4px;font-size:12px">${r('ปีนี้ (YTD)', `${cur.toLocaleString()} เหตุ`)}${r('ปีก่อน (YTD)', `${prev.toLocaleString()} เหตุ`)}<div style="display:flex;justify-content:space-between;gap:16px;padding-top:2px;border-top:1px solid #f1f5f9;margin-top:2px"><span style="color:#64748b">เปลี่ยนแปลง</span>${changeTxt}</div></div></div>`, { sticky: true, className: 'su-district-tooltip' })
      return
    }
    const complaints = m?.complaints || 0, done = m?.completed || 0
    const pct = complaints ? Math.round(done / complaints * 100) : 0
    const incidents = m?.incidents || 0, dealers = m?.dealers || 0
    const r = (lbl, val, color) => `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#64748b">${lbl}</span><span style="font-weight:600;font-variant-numeric:tabular-nums;color:${color || '#0f172a'}">${val}</span></div>`
    layer.bindTooltip(`<div style="min-width:210px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid #f1f5f9"><span style="font-weight:700;color:#0f172a">${dn}</span><span style="font-size:11px;color:#64748b">${group}</span></div><div style="display:flex;flex-direction:column;gap:4px;font-size:12px">${r('เรื่องร้องเรียน', `${complaints.toLocaleString()} เรื่อง`)}${r('ดำเนินการสำเร็จ', `${done.toLocaleString()} เรื่อง (${pct}%)`, '#047857')}${r('เหตุการณ์ยา', `${incidents.toLocaleString()} ครั้ง`)}${r('แหล่งซื้อ', `${dealers.toLocaleString()} แห่ง`)}</div></div>`, { sticky: true, className: 'su-district-tooltip' })
  }, [byName, comparing, mapCompareMode, curByD, prevByD])

  const chartsEmpty = incReady && fIncidents.length === 0
  const fmtD = formatThaiDate

  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // เปลี่ยน metric pill — ถ้าออกจาก "เหตุการณ์" ขณะเทียบปี ON → ปิด YoY อัตโนมัติ + แจ้งเตือนสั้นๆ
  const changeMetric = (id) => {
    setMetric(id)
    if (id !== 'incidents' && compareYoY) {
      setCompareYoY(false)
      setSortKey('incidents')
      setAutoOff(true)
      setTimeout(() => setAutoOff(false), 3000)
    }
  }

  // export ต้อง fetch column เต็ม (drug_*/action_*/subdistrict/community) แยกจาก `incidents` หลักของหน้านี้ซึ่ง
  // ตั้งใจ select แบบแคบไว้เพื่อ perf (ดู useEffect ด้านบน) — fetch เฉพาะตอนกดปุ่ม + กรองตาม range/scope ที่ query ได้เลย
  // dateRange (จาก ExportDialog โหมด "กำหนดเอง") ใช้แทน range ปกติของหน้าตอน query — กำหนดเองแล้วต้อง query กว้างกว่าที่ fetch ปกติได้ ไม่ใช่แค่ filter ซ้ำในเครื่อง
  const [exporting, setExporting] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const handleExportConfirm = async ({ mode, dateRange }) => {
    setExporting(true)
    try {
      const qFrom = dateRange?.from ?? range?.from
      const qTo = dateRange?.to ?? range?.to
      const rows = await fetchAllPages('drug_incidents', DRUG_INCIDENT_EXPORT_COLUMNS, {
        filter: (q) => {
          let qq = q
          if (qFrom) qq = qq.gte('received_date', qFrom)
          if (qTo) qq = qq.lte('received_date', qTo)
          if (selectedDistrict) qq = qq.eq('district', selectedDistrict)
          return qq
        },
      })
      const scoped = selectedGroup ? rows.filter((r) => DNAME_TO_GROUP[r.district] === selectedGroup) : rows
      const base = filterLabel(state)
      const periodLabel = dateRange
        ? `กำหนดเอง (${formatThaiDate(dateRange.from)} - ${formatThaiDate(dateRange.to)})`
        : (range?.from && range?.to) ? `${base} (${formatThaiDate(range.from)} - ${formatThaiDate(range.to)})` : base
      const scopeLabel = selectedDistrict || selectedGroup || 'ทุกเขต'
      await exportDrugIncidentReport({
        incidentRows: scoped,
        dealerRows: fDealers,
        mode,
        periodLabel,
        filterLabel: `${scopeLabel} · ทุกชนิดยา`,
        filenamePrefix: 'districts-report',
      })
      setExportDialogOpen(false)
    } catch (err) {
      console.error('[/districts] export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-violet-600 hover:text-violet-700 text-sm font-medium">
          <ArrowLeft size={16} /> กลับหน้าหลัก
        </button>

        <DistrictHero
          period={heroPeriod}
          lastUpload={formatThaiDate(lastUpload)}
          subtitle={`เหตุการณ์ยาเสพติดรายเขต · ${filterLabel(state)}`}
          onExport={() => setExportDialogOpen(true)}
          exporting={exporting}
        />
        <ExportDialog
          open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} onConfirm={handleExportConfirm}
          busy={exporting}
          currentPeriodLabel={(range?.from && range?.to) ? `${filterLabel(state)} (${formatThaiDate(range.from)} - ${formatThaiDate(range.to)})` : filterLabel(state)}
          defaultFrom={range?.from ?? ''} defaultTo={range?.to ?? ''}
        />

        {/* control bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <DateFilter availableYears={availableYears} />
          <CompareToggle on={compareYoY} disabled={!comparison || metric !== 'incidents'}
            reason={metric !== 'incidents'
              ? "เปิดเทียบปีได้เฉพาะ pill 'เหตุการณ์' (ข้อมูลอื่นมีเฉพาะปีงบ 2569)"
              : 'เลือกปีงบ/ช่วงวันที่ก่อนจึงจะเทียบได้'}
            onToggle={() => {
              const next = !compareYoY
              setCompareYoY(next)
              setSortKey(next ? 'pctYoY' : 'incidents')   // ON → default เรียง %YoY ; OFF → กลับ metric เดิม
            }} />
          {comparing && (
            <span className="hidden lg:inline-flex items-center gap-1 text-xs text-violet-600">
              <CalendarRange size={12} /> {fmtD(comparison.curFrom)}–{fmtD(comparison.cutoff)} vs {fmtD(comparison.prevFrom)}–{fmtD(comparison.prevTo)}
            </span>
          )}
          {autoOff && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-full px-2.5 py-1 animate-rise">
              <AlertTriangle size={12} /> ปิดเทียบปีอัตโนมัติ
            </span>
          )}
        </div>

        {/* ── SECTION 1: BENTO KPI ── */}
        <div className="grid grid-cols-1 md:grid-cols-4 md:auto-rows-fr gap-4">
          <HeroKpi value={kpiIncidents} spark={sparkTrend}
            badge={{ change: incChange, note: cmpNote, tooltip: cmpTooltip }}
            onClick={() => scrollTo(heroChartRef)} />
          <TopDistrictKpi district={kpiTopDistrict?.district} count={kpiTopDistrict?.count}
            badge={{ change: topChange, note: cmpNote, tooltip: cmpTooltip }}
            onClick={() => scrollTo(mapRef)} />
          <FreshnessKpi label={updatedLabel} daysAgo={updatedDaysAgo} />
          <CountKpi />
        </div>

        {/* footer meta + warning */}
        <div className="-mt-4 space-y-2">
          <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
            <span>ข้อมูล <span className="font-medium text-slate-600">{filterLabel(state)}</span> จาก <span className="font-mono text-slate-500">drug_incidents</span></span>
            <span className="text-slate-300">|</span>
            <span>อัปเดต: {updatedLabel}{updatedDaysAgo != null ? ` • ${agoLabel(updatedDaysAgo)}` : ''}</span>
          </div>
          {cmpEnough && comparison.prev < 1000 && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              <span>ปีก่อนในช่วงเทียบมีเพียง <strong>{comparison.prev.toLocaleString()}</strong> เหตุ อาจบันทึกไม่ครบ — % YoY จึงสูงผิดปกติ · ปีที่ข้อมูลครบจริงคือ 2563 และ 2569 (ดู “เปรียบเทียบรายปี”)</span>
            </div>
          )}
        </div>

        {/* ── SECTION 2: HERO chart — เทียบปี (เลือกเอง) ── */}
        <Card innerRef={heroChartRef} scrollMt title="แนวโน้มเหตุการณ์ — เทียบปี"
          sub={selectedGroup ? `กรอง: ${selectedGroup} · รายเดือน (ปีงบ ต.ค.→ก.ย.)` : 'รายเดือน (ปีงบ ต.ค.→ก.ย.)'}
          icon={<TrendingUp />} loading={!incReady} empty={incReady && yearsAvail.length === 0}
          right={
            <div className="flex items-center gap-2 text-sm">
              <YearSelect value={effA} options={yearsAvail} exclude={effB} onChange={setYearA} color="text-violet-700" />
              <span className="text-slate-400 text-xs">vs</span>
              <YearSelect value={effB} options={yearsAvail} exclude={effA} onChange={setYearB} color="text-amber-600" />
            </div>
          }>
          <HeroTrendChart data={heroCompare} />
        </Card>

        {/* cross-filter chip */}
        {selectedGroup && (
          <div className="-mt-4">
            <button onClick={() => setSelectedGroup(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-700 rounded-full text-xs font-semibold hover:bg-violet-200 transition">
              กรองกลุ่ม: {selectedGroup} <X size={12} />
            </button>
          </div>
        )}

        {/* ── SECTION 3: Map + Top10 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Map */}
          <Card innerRef={mapRef} scrollMt className="lg:col-span-3" title={`แผนที่: ${activeMetric.map}`}
            sub="เขตสีเข้ม = ตัวเลขสูง · คลิกเขตเพื่อดู" icon={<MapPin />}
            right={
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {comparing && (
                  <div className="flex gap-1 p-1 bg-violet-50 rounded-lg">
                    {[['absolute', 'Abs'], ['pct', '% YoY'], ['delta', 'Δ']].map(([v, l]) => (
                      <button key={v} onClick={() => setMapCompareMode(v)}
                        className={`h-7 px-2.5 text-xs font-medium rounded-md transition ${mapCompareMode === v ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>{l}</button>
                    ))}
                  </div>
                )}
                <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
                  {METRICS.map(m => (
                    <button key={m.id} onClick={() => changeMetric(m.id)}
                      className={`h-7 px-2.5 text-xs font-medium rounded-md transition ${metric === m.id ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>{m.short}</button>
                  ))}
                </div>
              </div>
            }>
            {/* legend */}
            {mapDiverge && mapCompareMode === 'pct' ? (
              <div className="flex items-center gap-2 mb-3 text-xs flex-wrap">
                <span className="text-emerald-600 font-medium">ลดลง</span>
                <div className="flex-1 h-2 max-w-[220px] rounded-full" style={{ background: 'linear-gradient(to right, #059669, #34d399, #e2e8f0, #fb7185, #e11d48)' }} />
                <span className="text-rose-600 font-medium">เพิ่มขึ้น</span>
                <span className="text-slate-400 ml-1">% YoY · เทา = ปีก่อน&lt;20</span>
              </div>
            ) : mapDiverge && mapCompareMode === 'delta' ? (
              <div className="flex items-center gap-2 mb-3 text-xs flex-wrap">
                <span className="text-emerald-600 font-medium">ลด</span>
                <div className="flex-1 h-2 max-w-[220px] rounded-full" style={{ background: `linear-gradient(to right, ${C.emerald}, #e2e8f0, ${C.violet})` }} />
                <span className="text-violet-600 font-medium">เพิ่ม</span>
                <span className="text-slate-400 ml-1">Δ · เทา = ปีก่อน&lt;20</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-slate-500">น้อย</span>
                <div className="flex-1 h-2 max-w-[200px] rounded-full" style={{ background: `linear-gradient(to right, ${activeColor}22, ${activeColor})` }} />
                <span className="text-xs text-slate-500">มาก</span>
                <span className="text-xs text-slate-400 ml-2 tabular-nums">0 - {metricMax.toLocaleString()}</span>
              </div>
            )}
            <div className="relative h-[480px] rounded-xl overflow-hidden ring-1 ring-slate-100">
              <IncidentMap key={layerKey} className="w-full h-full" points={[]} viewMode="point" getColor={() => activeColor}
                districtLayerKey={`${layerKey}-${selectedDistrict || 'none'}-${mapDiverge ? mapCompareMode : 'abs'}`}
                districtLayerStyle={layerStyle} districtLayerOnEachFeature={layerOnEach} />
            </div>
          </Card>

          {/* Top 10 */}
          <Card className="lg:col-span-2" title="Top 10 เขตวิกฤต" sub="คลิกแท่งเพื่อ highlight บนแผนที่" accent="rose" icon={<Trophy />}
            loading={!incReady} empty={chartsEmpty}>
            <ResponsiveContainer width="100%" height={480}>
              <BarChart data={top10} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip cursor={{ fill: '#fff1f2' }} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v) => [v.toLocaleString() + ' เหตุ', 'เหตุการณ์']} labelFormatter={(_, p) => p?.[0]?.payload?.full || ''} />
                <Bar dataKey="value" radius={[0, 5, 5, 0]} cursor="pointer" isAnimationActive
                  onClick={(d) => d?.full && setSelectedDistrict(prev => prev === d.full ? null : d.full)}>
                  {top10.map((d, i) => <Cell key={i} fill={d.full === selectedDistrict ? C.violetDark : lerpColor(C.rose, C.amber, top10.length > 1 ? i / (top10.length - 1) : 0)} />)}
                  <LabelList dataKey="yoy" position="right" content={<YoyLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── SECTION 4: Donut + Stacked ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card title="สัดส่วน 6 กลุ่ม บก.น." sub="คลิกกลุ่มเพื่อกรองกราฟทั้งหน้า" icon={<PieIcon />} loading={!incReady} empty={chartsEmpty}>
            <div className="relative">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={groupDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={64} outerRadius={98} paddingAngle={2}
                    cursor="pointer" onClick={(d) => setSelectedGroup(prev => prev === d?.name ? null : d?.name)}>
                    {groupDonut.map((d, i) => <Cell key={i} fill={d.color} opacity={selectedGroup && selectedGroup !== d.name ? 0.3 : 1} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v, n) => [v.toLocaleString() + ' เหตุ', n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-x-0 top-[110px] flex flex-col items-center justify-center pointer-events-none">
                <div className="text-2xl font-extrabold text-slate-800 tabular-nums leading-none">{groupTotal.toLocaleString()}</div>
                <div className="text-xs text-slate-500 mt-0.5">เหตุรวม</div>
              </div>
            </div>
          </Card>

          <Card title="พฤติการณ์รายเขต (Top 15)" sub="เสพ / ค้า / เสพ-ค้า / ผลิต" icon={<Layers />} loading={!incReady} empty={chartsEmpty}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={behaviorStack} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="district" width={70} tick={{ fontSize: 10, fill: '#475569' }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v, n) => [v.toLocaleString(), n]} labelFormatter={(_, p) => p?.[0]?.payload?.full || ''} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {BEHAVIOR_CATS.map(c => <Bar key={c} dataKey={c} stackId="beh" fill={BEHAVIOR_PALETTE[c]} radius={c === 'ผลิต' ? [0, 4, 4, 0] : 0} />)}
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── SECTION 5: Multi-year ── */}
        <Card title="เปรียบเทียบรายปี" sub="ตัวเลขจริง — เลี่ยง % บิดเบือนจากปีที่ข้อมูลบาง · ซ่อนปี < 100" icon={<BarChart3 />}
          loading={!incReady} empty={incReady && yearCompare.length === 0}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={yearCompare} margin={{ top: 24, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="fy" tickFormatter={(fy) => `ปีงบ ${fy}`} tick={{ fontSize: 12, fill: '#475569' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip cursor={{ fill: '#f5f3ff' }} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(v) => [v.toLocaleString() + ' เหตุ', 'เหตุการณ์']} labelFormatter={(fy) => `ปีงบ ${fy}`} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} isAnimationActive>
                {yearCompare.map((d, i) => <Cell key={i} fill={YEAR_COLORS[i % YEAR_COLORS.length]} />)}
                <LabelList dataKey="count" position="top" formatter={(v) => v.toLocaleString()} style={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* ── SECTION 6: Heatmap ── */}
        <Card title="Heatmap เขต × เดือน" sub="ความเข้มของสี = จำนวนเหตุในเดือนนั้น" icon={<Grid3X3 />} loading={!incReady} empty={chartsEmpty}>
          <Heatmap data={heatmap} />
        </Card>

        {/* ── SECTION 7: Table (drill-down, collapsible) ── */}
        <div className="bg-white rounded-2xl ring-1 ring-slate-200 border-l-4 border-l-slate-300 shadow-sm overflow-hidden animate-rise">
          <button onClick={() => setTableOpen(o => !o)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition">
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 bg-slate-400 rounded-full" />
              <h3 className="text-xl font-semibold text-slate-800 tracking-tight">ตารางรายเขต (drill-down)</h3>
              <span className="text-xs text-slate-400">{table.length} จาก 50 เขต</span>
            </div>
            <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${tableOpen ? 'rotate-180' : ''}`} />
          </button>
          {tableOpen && (
            <div className="border-t border-slate-100">
              <div className="px-6 py-3">
                <div className="relative max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเขต..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition" />
                </div>
              </div>
              <div className="overflow-auto max-h-[560px]">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr className="border-b border-slate-200 text-xs text-slate-600">
                      <th className="text-left px-4 py-3 font-semibold uppercase tracking-wider">เขต</th>
                      {METRICS.map(m => (
                        <th key={m.id} onClick={() => setSortKey(m.id)}
                          className={`text-right px-3 py-3 font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:bg-slate-100 transition ${sortKey === m.id ? 'text-violet-700' : ''}`}>
                          {m.header} <span className="text-[10px]">{sortKey === m.id ? '▼' : '▾'}</span>
                        </th>
                      ))}
                      {comparing && [
                        ['curYTD', 'ปีนี้ YTD'], ['prevYTD', 'ปีก่อน YTD'], ['deltaAbs', 'Δ'], ['pctYoY', '%YoY'],
                      ].map(([k, lbl]) => (
                        <th key={k} onClick={() => setSortKey(k)}
                          className={`text-right px-3 py-3 font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:bg-slate-100 transition ${sortKey === k ? 'text-violet-700' : ''}`}>
                          {lbl} <span className="text-[10px]">{sortKey === k ? '▼' : '▾'}</span>
                        </th>
                      ))}
                      <th className="px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {table.map((m) => {
                      const isSel = m.district === selectedDistrict
                      const pct = m.complaints ? Math.min(100, m.completed / m.complaints * 100) : 0
                      const prevC = prevByD[m.district] || 0, curC = curByD[m.district] || 0
                      const yoyPct = (comparing && prevC >= 10) ? (curC - prevC) / prevC * 100 : null
                      const warnRow = yoyPct != null && yoyPct > 1000
                      return (
                        <tr key={m.district} onClick={() => setSelectedDistrict(isSel ? null : m.district)}
                          className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors ${isSel ? 'bg-violet-50' : warnRow ? 'bg-rose-50/30 hover:bg-rose-50/50' : 'hover:bg-violet-50/40'}`}>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-slate-900">{m.district}</div>
                            <div className="text-xs text-slate-500">{DNAME_TO_GROUP[m.district] || '—'}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium text-rose-700">{m.incidents.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-700">{m.complaints.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="tabular-nums font-medium text-emerald-700">{m.completed.toLocaleString()}</div>
                            <div className="mt-1 ml-auto h-1 w-full max-w-[56px] rounded-full bg-emerald-100 overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium text-amber-700">{m.dealers.toLocaleString()}</td>
                          {comparing && (() => {
                            const insufficient = prevC < 10
                            const delta = curC - prevC
                            return (
                              <>
                                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-rose-700">{curC.toLocaleString()}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                                  {insufficient ? <span title="ข้อมูลปีก่อนไม่พอ (< 10)">—</span> : prevC.toLocaleString()}
                                </td>
                                <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${insufficient ? 'text-slate-300' : (delta >= 0 ? 'text-rose-600' : 'text-emerald-600')}`}>
                                  {insufficient ? '—' : `${delta >= 0 ? '+' : ''}${delta.toLocaleString()}`}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  {yoyPct == null
                                    ? <span title="ข้อมูลปีก่อนไม่พอ" className="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-400">—</span>
                                    : <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${yoyPct >= 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{yoyPct >= 0 ? '▲' : '▼'} {Math.abs(yoyPct).toFixed(0)}%</span>}
                                </td>
                              </>
                            )
                          })()}
                          <td className="px-2 py-2.5 text-right"><ChevronRight className="w-4 h-4 text-violet-500 inline" /></td>
                        </tr>
                      )
                    })}
                    {table.length === 0 && (<tr><td colSpan={comparing ? 10 : 6} className="px-6 py-8 text-center text-slate-400 text-sm">ไม่พบเขต</td></tr>)}
                  </tbody>
                </table>
              </div>
              {excludedCount > 0 && (
                <div className="px-6 py-2.5 text-xs text-slate-400 border-t border-slate-100">
                  ซ่อน {excludedCount.toLocaleString()} row ที่ district ไม่ตรงกับ 50 เขต กทม. (typo / นอกพื้นที่)
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── count-up ──
function AnimatedCounter({ value, duration = 800 }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (typeof value !== 'number' || isNaN(value)) return
    let raf
    const start = performance.now()
    const animate = now => {
      const progress = Math.min((now - start) / duration, 1)
      setDisplay(Math.floor(value * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return display.toLocaleString()
}

// ── premium hero — mesh orbs + noise + glass chips ──
function HeroChip({ icon, children }) {
  return <span className="inline-flex items-center gap-1.5 text-xs text-white/90 bg-white/10 backdrop-blur-md ring-1 ring-white/20 rounded-full px-3 py-1.5">{icon}{children}</span>
}
function DistrictHero({ period, lastUpload, subtitle, onExport, exporting }) {
  return (
    <div className="animate-rise relative overflow-hidden rounded-3xl px-8 py-10 text-white bg-gradient-to-br from-violet-600 via-purple-700 to-fuchsia-900 shadow-xl shadow-violet-900/20">
      <div className="orb absolute -top-16 -left-10 w-72 h-72 rounded-full bg-fuchsia-500/30 blur-3xl pointer-events-none" />
      <div className="orb absolute top-8 right-1/3 w-64 h-64 rounded-full bg-violet-400/30 blur-3xl pointer-events-none" style={{ animationDelay: '2s' }} />
      <div className="orb absolute -bottom-24 right-0 w-80 h-80 rounded-full bg-purple-500/30 blur-3xl pointer-events-none" style={{ animationDelay: '4s' }} />
      <div className="noise-overlay absolute inset-0 opacity-[0.12] mix-blend-overlay pointer-events-none" />
      <div className="dot-pattern absolute inset-0 text-white/10 opacity-40 pointer-events-none" />
      <div className="relative z-10 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/70 mb-2">DISTRICT OVERVIEW · กรุงเทพมหานคร</div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">ภาพรวมเขต กทม.</h1>
          <p className="text-base text-white/80 mt-2">{subtitle}</p>
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {period && <HeroChip icon={<CalendarRange size={13} />}>{period}</HeroChip>}
            {lastUpload && <HeroChip icon={<Clock size={13} />}>อัปเดต {lastUpload}</HeroChip>}
          </div>
        </div>
        <button onClick={onExport} disabled={exporting}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/10 backdrop-blur-md ring-1 ring-white/20 text-sm font-medium text-white hover:bg-white/20 transition disabled:opacity-50 disabled:cursor-wait">
          <Download size={15} /> {exporting ? 'กำลังสร้างไฟล์...' : 'Export Excel'}
        </button>
      </div>
    </div>
  )
}

// ── district silhouette (จาก geojson) ──
let _geo = null, _geoPromise = null
function loadGeo() {
  if (_geo) return Promise.resolve(_geo)
  if (!_geoPromise) _geoPromise = fetch('/bangkok-districts.geojson').then(r => r.json()).then(g => { _geo = g; return g })
  return _geoPromise
}
function featureToPath(feature, W, H, pad = 8) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const scan = (c) => { if (typeof c[0] === 'number') { const [x, y] = c; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y } else c.forEach(scan) }
  scan(feature.geometry.coordinates)
  const bw = (maxX - minX) || 1, bh = (maxY - minY) || 1
  const s = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh)
  const ox = (W - bw * s) / 2, oy = (H - bh * s) / 2
  const px = (x) => ox + (x - minX) * s, py = (y) => H - (oy + (y - minY) * s)
  const rings = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates : feature.geometry.coordinates.flat()
  let d = ''
  for (const ring of rings) { ring.forEach((pt, i) => { d += (i ? 'L' : 'M') + px(pt[0]).toFixed(1) + ' ' + py(pt[1]).toFixed(1) }); d += 'Z' }
  return d
}
function DistrictSilhouette({ district, className }) {
  const [resolved, setResolved] = useState({ d: null, path: null })
  useEffect(() => {
    let alive = true
    if (!district) return undefined
    loadGeo().then(g => {
      if (!alive) return
      const f = g.features.find(ft => ft.properties?.dname === district)
      setResolved({ d: district, path: f ? featureToPath(f, 100, 100) : null })
    }).catch(() => {})
    return () => { alive = false }
  }, [district])
  const path = resolved.d === district ? resolved.path : null   // กัน stale ตอน district เปลี่ยน (ไม่ setState sync)
  if (!path) return null
  return <svg viewBox="0 0 100 100" className={className} aria-hidden="true"><path d={path} fill="currentColor" /></svg>
}
function DotGrid({ className }) {
  return (
    <svg viewBox="0 0 100 50" className={className} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, r) => Array.from({ length: 10 }).map((_, c) => (
        <circle key={`${r}-${c}`} cx={5 + c * 10} cy={5 + r * 10} r={2.2} fill="currentColor" />
      )))}
    </svg>
  )
}
function ProgressRing({ pct, color, size = 44 }) {
  const r = (size - 6) / 2, circ = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} />
    </svg>
  )
}
function MiniArea({ data, height = 130 }) {
  const d = (data || []).map((v, i) => ({ i, v }))
  if (d.length < 2) return null
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={d} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="heroKpiFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke="rgba(255,255,255,0.9)" strokeWidth={2} fill="url(#heroKpiFill)" dot={false} isAnimationActive />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Bento KPI ──
function HeroKpi({ value, spark, badge, onClick }) {
  return (
    <div onClick={onClick}
      className="animate-rise group relative overflow-hidden rounded-3xl md:col-span-2 md:row-span-2 p-7 cursor-pointer text-white bg-gradient-to-br from-violet-600 to-fuchsia-700 shadow-xl shadow-violet-900/20 hover:shadow-2xl hover:scale-[1.01] transition-all duration-300">
      <div className="orb absolute -top-10 -right-6 w-56 h-56 rounded-full bg-fuchsia-400/30 blur-3xl pointer-events-none" />
      <div className="orb absolute bottom-10 -left-8 w-48 h-48 rounded-full bg-violet-300/30 blur-3xl pointer-events-none" style={{ animationDelay: '3s' }} />
      <div className="dot-pattern absolute inset-0 text-white/10 opacity-40 pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 z-0 opacity-90 pointer-events-none"><MiniArea data={spark} height={130} /></div>
      <div className="relative z-10 flex items-start justify-between">
        <div className="w-11 h-11 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center ring-1 ring-white/20 group-hover:scale-110 transition-transform"><AlertTriangle className="w-5 h-5" /></div>
        {badge?.tooltip && <span title={badge.tooltip} className="text-white/50 cursor-help"><Info className="w-4 h-4" /></span>}
      </div>
      <div className="relative z-10 mt-5">
        <div className="text-sm text-white/70 uppercase tracking-[0.15em] font-medium">เหตุการณ์ยาเสพติด</div>
        <div className="text-6xl sm:text-7xl font-black tracking-tighter tabular-nums leading-none mt-2 drop-shadow-[0_2px_24px_rgba(255,255,255,0.25)]">
          <AnimatedCounter value={value || 0} duration={1200} />
        </div>
        <div className="text-xs text-white/55 mt-2">จับกุม / ตรวจค้น / ตรวจปัสสาวะ</div>
        {badge && (badge.change != null ? (
          <div title={badge.tooltip} className="inline-flex items-center gap-2 mt-4 pl-2 pr-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/20 cursor-help">
            <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] ${badge.change >= 0 ? 'bg-rose-400/40' : 'bg-emerald-400/40'}`}>{badge.change >= 0 ? '▲' : '▼'}</span>
            <span className="text-base font-bold">{Math.abs(badge.change).toFixed(1)}%</span><span className="text-xs text-white/60">YoY</span>
          </div>
        ) : badge.note ? <div className="mt-4 text-xs text-white/60">{badge.note}</div> : null)}
      </div>
    </div>
  )
}

const SMALL_ACCENT = { violet: 'bg-violet-500', rose: 'bg-rose-500', emerald: 'bg-emerald-500', amber: 'bg-amber-400' }
const SMALL_ICO = { violet: 'bg-violet-50 text-violet-600', rose: 'bg-rose-50 text-rose-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600' }
function SmallKpi({ icon, label, accent = 'violet', children, badge, tooltip, right, decoration, onClick, className = '' }) {
  return (
    <div onClick={onClick}
      className={`animate-rise group relative overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-6 ${onClick ? 'cursor-pointer' : ''} ${className}`}>
      <div className={`absolute top-0 inset-x-0 h-[3px] ${SMALL_ACCENT[accent]}`} />
      {decoration}
      <div className="relative z-10 flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${SMALL_ICO[accent]} group-hover:scale-110 transition-transform`}>{cloneElement(icon, { className: 'w-5 h-5' })}</div>
        {right || (tooltip && <span title={tooltip} className="text-slate-300 cursor-help"><Info className="w-4 h-4" /></span>)}
      </div>
      <div className="relative z-10 mt-4">
        <div className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1.5">{label}</div>
        {children}
        {badge && (badge.change != null ? (
          <div title={badge.tooltip} className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-xs font-bold cursor-help ${badge.change >= 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {badge.change >= 0 ? '▲' : '▼'} {Math.abs(badge.change).toFixed(1)}% <span className="text-slate-400">YoY</span>
          </div>
        ) : badge.note ? <div className="mt-2 text-xs text-slate-400">{badge.note}</div> : null)}
      </div>
    </div>
  )
}
function TopDistrictKpi({ district, count, badge, onClick }) {
  return (
    <SmallKpi onClick={onClick} accent="rose" icon={<Trophy />} label="เขตที่มีเหตุสูงสุด" tooltip={badge?.tooltip}
      decoration={district && <DistrictSilhouette district={district} className="absolute right-1 bottom-1 w-28 h-28 text-rose-500/[0.08] pointer-events-none" />}
      badge={badge}>
      <div className="text-2xl font-bold text-slate-900 truncate">{district ?? '—'}</div>
      <div className="text-xs text-slate-400 mt-1">{count != null ? `${count.toLocaleString()} เหตุ` : 'ยังไม่มีข้อมูล'}</div>
    </SmallKpi>
  )
}
function FreshnessKpi({ label, daysAgo }) {
  const pct = daysAgo == null ? 0 : Math.max(0.08, 1 - Math.min(daysAgo, 14) / 14)
  const color = daysAgo == null ? '#94a3b8' : daysAgo <= 1 ? '#10b981' : daysAgo <= 7 ? '#fbbf24' : '#f43f5e'
  return (
    <SmallKpi accent="emerald" icon={<Clock />} label="อัปเดตล่าสุด"
      right={<div className="relative flex items-center justify-center"><ProgressRing pct={pct} color={color} /><span className="absolute text-[10px] font-bold" style={{ color }}>{daysAgo == null ? '—' : daysAgo}</span></div>}>
      <div className="text-2xl font-bold text-slate-900">{label}</div>
      <div className="text-xs text-slate-400 mt-1">{agoLabel(daysAgo) ?? 'drug_incidents'}</div>
    </SmallKpi>
  )
}
function CountKpi() {
  return (
    <SmallKpi className="md:col-span-2" accent="violet" icon={<MapPin />} label="พื้นที่ กทม."
      decoration={<DotGrid className="absolute right-4 bottom-4 w-28 h-14 text-violet-500/10 pointer-events-none" />}>
      <div className="flex items-baseline gap-3">
        <div className="text-5xl font-bold text-slate-900 tabular-nums"><AnimatedCounter value={50} /></div>
        <div className="text-sm text-slate-500">เขต · 6 กลุ่ม บก.น.</div>
      </div>
    </SmallKpi>
  )
}

// ── card wrapper (charts/sections) ──
const CARD_ACCENT = { violet: 'border-l-violet-500', rose: 'border-l-rose-500', emerald: 'border-l-emerald-500', amber: 'border-l-amber-400', slate: 'border-l-slate-300' }
function Card({ title, sub, icon, accent = 'violet', right, loading, empty, children, innerRef, scrollMt, className = '' }) {
  return (
    <div ref={innerRef} className={`animate-rise relative bg-white rounded-2xl ring-1 ring-slate-200 border-l-4 ${CARD_ACCENT[accent]} shadow-sm hover:shadow-xl transition-shadow duration-200 p-6 ${scrollMt ? 'scroll-mt-24' : ''} ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1 h-6 bg-violet-500 rounded-full flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-slate-800 tracking-tight flex items-center gap-2">
              {icon && <span className="text-violet-600">{cloneElement(icon, { className: 'w-5 h-5' })}</span>}{title}
            </h3>
            {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
          </div>
        </div>
        {right}
      </div>
      {loading ? <div className="h-[300px] bg-slate-50 rounded-xl animate-pulse" />
        : empty ? <EmptyState />
          : children}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="h-[300px] flex flex-col items-center justify-center text-slate-400 gap-2">
      <BarChart3 className="w-10 h-10 text-slate-200" />
      <span className="text-sm">ไม่มีข้อมูลในช่วงที่เลือก</span>
    </div>
  )
}

function CompareToggle({ on, disabled, reason, onToggle }) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      title={disabled ? (reason || 'เลือกปีงบ/ช่วงวันที่ก่อนจึงจะเทียบได้') : 'เทียบช่วงเดียวกันปีก่อน (YTD)'}>
      <span className="text-xs font-medium text-slate-700">เทียบปี (YTD)</span>
      <div className={`relative w-9 h-5 rounded-full transition-all ${on && !disabled ? 'bg-gradient-to-r from-violet-500 to-violet-600 shadow-md shadow-violet-500/30' : 'bg-slate-300'}`}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow ${on && !disabled ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
      <input type="checkbox" className="sr-only" disabled={disabled} checked={on} onChange={onToggle} />
    </label>
  )
}

// label ▲%YoY ท้ายแท่ง Top10
function YoyLabel({ x, y, width, height, value }) {
  if (value == null) return null
  const up = value >= 0
  return (
    <text x={x + width + 6} y={y + height / 2} dy={4} fontSize={10} fontWeight={700} fill={up ? '#e11d48' : '#059669'}>
      {up ? '▲' : '▼'}{Math.abs(value).toFixed(0)}%
    </text>
  )
}

// dropdown เลือกปีงบเทียบ (กันเลือกซ้ำกับอีกฝั่ง)
function YearSelect({ value, options, exclude, onChange, color }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(Number(e.target.value))}
      className={`border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white font-semibold ${color} focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none`}>
      {options.map(y => <option key={y} value={y} disabled={y === exclude}>ปีงบ {y}</option>)}
    </select>
  )
}

// hero dual-area tooltip — มี diff % (label จาก series name)
function HeroTooltip({ active, payload, label, labelA, labelB }) {
  if (!active || !payload?.length) return null
  const cur = payload.find(p => p.dataKey === 'cur')?.value ?? 0
  const prev = payload.find(p => p.dataKey === 'prev')?.value
  const diff = (prev != null && prev > 0) ? (cur - prev) / prev * 100 : null
  return (
    <div className="bg-white rounded-lg ring-1 ring-slate-200 shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-slate-800 mb-1">{label}</div>
      <div className="flex items-center justify-between gap-4"><span className="text-violet-600">{labelA}</span><span className="font-bold tabular-nums">{cur.toLocaleString()}</span></div>
      {prev != null && labelB && <div className="flex items-center justify-between gap-4"><span className="text-amber-600">{labelB}</span><span className="font-bold tabular-nums text-slate-500">{prev.toLocaleString()}</span></div>}
      {diff != null && <div className={`mt-1 pt-1 border-t border-slate-100 text-right font-bold ${diff >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{diff >= 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}%</div>}
    </div>
  )
}

function HeroTrendChart({ data }) {
  const { points, labelA, labelB } = data
  if (!points.length) return <EmptyState />
  const peak = points.reduce((mx, p, i) => p.cur > points[mx].cur ? i : mx, 0)
  return (
    <ResponsiveContainer width="100%" height={360}>
      <AreaChart data={points} margin={{ top: 16, right: 20, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.violet} stopOpacity={0.35} />
            <stop offset="100%" stopColor={C.violet} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} interval="preserveStartEnd" minTickGap={10} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
        <Tooltip content={<HeroTooltip labelA={labelA} labelB={labelB} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {labelB && <Area type="monotone" dataKey="prev" name={labelB} stroke={C.amber} strokeWidth={2.5} strokeDasharray="6 3" fill="none" dot={false} isAnimationActive />}
        <Area type="monotone" dataKey="cur" name={labelA} stroke={C.violet} strokeWidth={3} fill="url(#heroFill)" dot={false} activeDot={{ r: 5 }} isAnimationActive />
        {points[peak]?.cur > 0 && <ReferenceDot x={points[peak].label} y={points[peak].cur} r={5} fill={C.violet} stroke="#fff" strokeWidth={2} />}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function Heatmap({ data }) {
  const { months, dists, cell, max } = data
  if (!dists.length || !months.length) return <EmptyState />
  return (
    <div className="overflow-auto max-h-[420px]">
      <table className="border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white text-left px-2 py-1 text-slate-400 font-medium">เขต \ เดือน</th>
            {months.map(m => <th key={m.key} className="px-1.5 py-1 text-slate-500 font-medium text-center whitespace-nowrap">{m.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {dists.map(d => (
            <tr key={d}>
              <td className="sticky left-0 z-10 bg-white px-2 py-1 text-slate-700 whitespace-nowrap">{d}</td>
              {months.map(m => {
                const v = cell[`${d}|${m.key}`] || 0
                const op = v ? 0.12 + 0.88 * (v / max) : 0
                return (
                  <td key={m.key} title={`${d} · ${m.fullLabel}: ${v} เหตุ`} className="text-center tabular-nums rounded"
                    style={{ background: v ? `rgba(124,58,237,${op})` : '#f8fafc', color: op > 0.55 ? '#fff' : '#475569', minWidth: 30 }}>{v || ''}</td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
