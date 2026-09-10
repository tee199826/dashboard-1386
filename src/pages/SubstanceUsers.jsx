import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import {
  BarChart, Bar, ComposedChart, Area, Line, Legend, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceDot, Label,
} from 'recharts'
import {
  Users, Activity, Clock, Shield, Heart, AlertTriangle, MapPin, Search, LayoutGrid, Maximize2,
} from 'lucide-react'
import { fetchAllPages } from '../utils/supabasePagination'
import { supabase } from '../lib/supabase'
import { filterByDateColumn } from '../utils/filterRows'
import { dateToFiscalYear } from '../utils/fiscalYear'
import { useFilter } from '../context/FilterContext'
import IncidentMap from '../components/IncidentMap'
import HeroActions from '../components/HeroActions'
import DateFilter from '../components/DateFilter'

// rainbow palette — หมุนตาม index ทุก bar chart
const CHART_COLORS = [
  '#dc2626',  // red-600
  '#7c3aed',  // violet-600
  '#2563eb',  // blue-600
  '#16a34a',  // green-600
  '#92400e',  // amber-800
  '#a78bfa',  // violet-400
  '#f59e0b',  // amber-500
  '#06b6d4',  // cyan-500
  '#ec4899',  // pink-500
  '#84cc16',  // lime-500
]
// Top-3 shade palettes — #1 เข้มสุด (shade-700), #2-3 กลาง (shade-500), ที่เหลืออ่อน (shade-300)
const TOP3_PALETTES = {
  blue:    { top1: '#1d4ed8', top23: '#3b82f6', rest: '#93c5fd' },
  indigo:  { top1: '#4338ca', top23: '#6366f1', rest: '#a5b4fc' },
  emerald: { top1: '#047857', top23: '#10b981', rest: '#6ee7b7' },
  amber:   { top1: '#b45309', top23: '#f59e0b', rest: '#fcd34d' },
  violet:  { top1: '#6d28d9', top23: '#8b5cf6', rest: '#c4b5fd' },
  teal:    { top1: '#0f766e', top23: '#14b8a6', rest: '#5eead4' },
  orange:  { top1: '#c2410c', top23: '#f97316', rest: '#fdba74' },
  red:     { top1: '#b91c1c', top23: '#ef4444', rest: '#fca5a5' },
  rose:    { top1: '#be123c', top23: '#f43f5e', rest: '#fda4af' },
  fuchsia: { top1: '#a21caf', top23: '#d946ef', rest: '#f5d0fe' },
}
const FIELDS = 'fiscal_year,surveyed_at,age,occupation,income_range,arrest_count,rehab_count,first_use_age,first_drug,first_reason,arrests,rehabs,regular_drugs,dealer_locations'

// เรียงตามเพดานของช่วง — มีทั้งค่าเดิมที่นำเข้ามา และช่วงใหม่ (ละ 5,000) จากฟอร์มบันทึก
const INCOME_ORDER = [
  'ไม่มีรายได้',
  'ต่ำกว่า 5,000', '5,001-10,000',
  'ต่ำกว่า 10,000', '10,000-15,000', '10,001-15,000',
  '15,001-20,000', '20,001-25,000', '25,001-30,000', 'มากกว่า 30,000',
]
const incomeRank = v => { const i = INCOME_ORDER.findIndex(o => String(v || '').includes(o)); return i === -1 ? 99 : i }

const num = v => (v == null || v === '' ? null : (isNaN(Number(v)) ? null : Number(v)))

// ฐานนิยม (mode) ของ array ตัวเลข — ตัวที่ปรากฏบ่อยที่สุด (ทนทาน outlier กว่า mean)
function modeOf(arr) {
  if (!arr.length) return null
  const freq = {}
  let max = 0, m = null
  for (const v of arr) {
    freq[v] = (freq[v] || 0) + 1
    if (freq[v] > max) { max = freq[v]; m = v }
  }
  return m
}

function topN(counts, n, otherLabel = 'อื่นๆ') {
  const arr = Object.entries(counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const out = arr.slice(0, n).map(([name, value]) => ({ name, value }))
  const rest = arr.slice(n).reduce((s, [, v]) => s + v, 0)
  if (rest > 0) out.push({ name: otherLabel, value: rest })
  return out
}

// ── tab navigation (executive) ──
const TABS = [
  { id: 'demographics', label: 'ข้อมูลผู้เสพ' },
  { id: 'history', label: 'ประวัติการเสพ' },
  { id: 'drugs', label: 'ราคา' },
  { id: 'arrests', label: 'ประวัติการจับกุมและบำบัด' },
  { id: 'dealers', label: 'แหล่งซื้อ' },
]
const TAB_IDS = TABS.map(t => t.id)
const hashTab = () => {
  const h = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : ''
  return TAB_IDS.includes(h) ? h : 'demographics'
}

const TH_MONTH = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const fmtThaiDate = iso => {
  if (!iso) return null
  const d = new Date(iso)
  return `${d.getDate()} ${TH_MONTH[d.getMonth() + 1]} ${d.getFullYear() + 543}`
}
// "YYYY-MM-DD" → "1 ต.ค. 2568" (พ.ศ.)
const fmtPeriod = iso => {
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)} ${TH_MONTH[parseInt(m)]} ${parseInt(y) + 543}`
}

export default function SubstanceUsers() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [search, setSearch] = useState('')
  const [sortDesc, setSortDesc] = useState(true)
  const [pickedDistrict, setPickedDistrict] = useState(null)   // เขตที่คลิกดูชื่อแหล่งซื้อ

  // ── DateFilter (page-level) — กรองตาม surveyed_at ──
  const { getDateRange } = useFilter()
  const range = getDateRange()
  // ปีงบ = distinct dateToFiscalYear(surveyed_at) ของ row ที่มีวันที่ (ไม่ใช่ fiscal_year column)
  const availableYears = useMemo(() => {
    const s = new Set()
    rows.forEach(r => { const fy = dateToFiscalYear(r.surveyed_at); if (fy) s.add(fy) })
    return [...s].sort((a, b) => b - a)
  }, [rows])
  const filteredRows = useMemo(
    () => filterByDateColumn(rows, 'surveyed_at', range),
    [rows, range],
  )

  // ── ช่วงวันที่สำรวจจริง (footer pill) — min/max ของ surveyed_at จาก filtered ──
  const periodLabel = useMemo(() => {
    const dates = filteredRows.map(r => r.surveyed_at).filter(Boolean).sort()
    if (!dates.length) return 'ไม่มีข้อมูลวันที่'
    const min = dates[0]
    const max = dates[dates.length - 1]
    return min === max ? fmtPeriod(min) : `${fmtPeriod(min)} - ${fmtPeriod(max)}`
  }, [filteredRows])

  const yearCtl = { periodLabel }

  // ── tab navigation state ──
  const [activeTab, setActiveTab] = useState(hashTab)
  const [viewMode, setViewMode] = useState('tabs') // 'tabs' | 'all'

  // sync activeTab ↔ URL hash (deep-link + refresh-safe)
  useEffect(() => {
    window.location.hash = activeTab
  }, [activeTab])
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace('#', '')
      if (TAB_IDS.includes(h)) setActiveTab(h)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // print: force all sections into the DOM so PDF exports are complete,
  // then restore the previous view mode afterwards
  const viewModeRef = useRef(viewMode)
  viewModeRef.current = viewMode
  const printPrevMode = useRef('tabs')
  useEffect(() => {
    const before = () => {
      printPrevMode.current = viewModeRef.current
      flushSync(() => setViewMode('all'))
    }
    const after = () => { flushSync(() => setViewMode(printPrevMode.current)) }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetchAllPages('substance_users', FIELDS)
      setRows(data)
    } catch {
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  // วันที่อัปโหลดล่าสุดของชุดข้อมูลผู้เสพ (ใช้ใน modal แหล่งข้อมูล)
  const [lastUpload, setLastUpload] = useState(null)
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('upload_batches')
        .select('uploaded_at').eq('target_table', 'substance_users')
        .order('uploaded_at', { ascending: false }).limit(1)
      if (data?.[0]?.uploaded_at) setLastUpload(fmtThaiDate(data[0].uploaded_at))
    })()
  }, [])

  const agg = useMemo(() => {
    const rows = filteredRows
    const total = rows.length

    const ages = rows.map(r => num(r.age)).filter(v => v != null)
    const firstAges = rows.map(r => num(r.first_use_age)).filter(v => v != null)
    // sanity filter — ตัดค่าเพี้ยน (พิมพ์ผิด 0/99 ฯลฯ) ก่อนหา mean ของ KPI อายุ (#2/#3)
    // หมายเหตุ: ใช้เฉพาะ KPI — histogram กลุ่มอายุ/อายุเริ่มเสพยังใช้ ages/firstAges เต็มชุดตามเดิม
    const avgAges = ages.filter(v => v >= 5 && v <= 100)
    const avgFirstAges = firstAges.filter(v => v >= 5 && v <= 80)
    const ageDropped = ages.length - avgAges.length
    const firstAgeDropped = firstAges.length - avgFirstAges.length
    const avg = arr => arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length) : 0
    const arrested = rows.filter(r => num(r.arrest_count) > 0).length
    const rehabbed = rows.filter(r => num(r.rehab_count) > 0).length

    // [2.1] age groups
    const ageBucket = a => a < 25 ? '15-24' : a < 35 ? '25-34' : a < 45 ? '35-44' : a < 55 ? '45-54' : '55+'
    const ageGroupsMap = { '15-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 }
    ages.forEach(a => { ageGroupsMap[ageBucket(a)]++ })
    const ageGroups = Object.entries(ageGroupsMap).map(([name, value]) => ({ name, value }))

    // [2.2] occupation top 10
    const occMap = {}
    rows.forEach(r => { const o = (r.occupation || '').trim(); if (o) occMap[o] = (occMap[o] || 0) + 1 })
    const occupations = Object.entries(occMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, value]) => ({ name, value }))

    // [2.3] income (ordered)
    const incMap = {}
    rows.forEach(r => { const v = (r.income_range || '').trim(); if (v) incMap[v] = (incMap[v] || 0) + 1 })
    const income = Object.entries(incMap).map(([name, value]) => ({ name, value }))
      .sort((a, b) => incomeRank(a.name) - incomeRank(b.name))

    // [3.1] first_use_age histogram (bucket 5)
    const histMap = {}
    firstAges.forEach(a => { const b = Math.floor(a / 5) * 5; const k = `${b}-${b + 4}`; histMap[k] = (histMap[k] || 0) + 1 })
    const firstUseHist = Object.entries(histMap)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([name, value]) => ({ name, value }))

    // [3.2] first_drug (top 6 + อื่นๆ)
    const fdMap = {}
    rows.forEach(r => { const d = (r.first_drug || '').trim(); if (d) fdMap[d] = (fdMap[d] || 0) + 1 })
    const firstDrug = topN(fdMap, 6)

    // [3.3] first_reason (split comma → count)
    const frMap = {}
    rows.forEach(r => String(r.first_reason || '').split(',').forEach(x => {
      const v = x.trim(); if (v) frMap[v] = (frMap[v] || 0) + 1
    }))
    const firstReason = Object.entries(frMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, value]) => ({ name, value }))

    // [4] regular_drugs unnest — count + ราคา/หน่วย (normalize ต่อ 1 หน่วยจาก parsePrice) ติด month
    const rdCount = {}
    const priceRecords = {}   // drug → [{ amount, unit, date:'YYYY-MM-DD', month:'YYYY-MM' }]
    rows.forEach(r => {
      const date = r.surveyed_at ? String(r.surveyed_at).slice(0, 10) : null
      const month = date ? date.slice(0, 7) : null
      ;(r.regular_drugs || []).forEach(d => {
        const name = (d?.drug || '').trim(); if (!name) return
        rdCount[name] = (rdCount[name] || 0) + 1
        const amount = num(d?.price)               // ราคา normalize (number) จาก parser
        const unit = (d?.unit || '').trim() || null
        if (amount != null && unit && month) (priceRecords[name] ||= []).push({ amount, unit, date, month })
      })
    })
    const regularDrugs = Object.entries(rdCount).filter(([, v]) => v >= 1)
      .sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))

    // [5.1] arrest count buckets
    const arBuckets = { '0': 0, '1': 0, '2': 0, '3+': 0 }
    rows.forEach(r => { const c = num(r.arrest_count) || 0; arBuckets[c >= 3 ? '3+' : String(c)]++ })
    const arrestBuckets = Object.entries(arBuckets).map(([name, value]) => ({ name, value }))

    // [5.2] arrests[].drug   [5.3] arrests[].charge
    const adMap = {}, acMap = {}
    rows.forEach(r => (r.arrests || []).forEach(a => {
      const d = (a?.drug || '').trim(); if (d) adMap[d] = (adMap[d] || 0) + 1
      const c = (a?.charge || '').trim(); if (c) acMap[c] = (acMap[c] || 0) + 1
    }))
    const arrestDrugs = Object.entries(adMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, value]) => ({ name, value }))
    const charges = topN(acMap, 5)

    // [5.4] rehab count buckets  [5.5] rehabs[].drug  [5.6] rehabs[].place
    const rhBuckets = { '0': 0, '1': 0, '2': 0, '3+': 0 }
    rows.forEach(r => { const c = num(r.rehab_count) || 0; rhBuckets[c >= 3 ? '3+' : String(c)]++ })
    const rehabBuckets = Object.entries(rhBuckets).map(([name, value]) => ({ name, value }))
    const rdMap = {}, rpMap = {}
    rows.forEach(r => (r.rehabs || []).forEach(x => {
      const d = (x?.drug || '').trim(); if (d) rdMap[d] = (rdMap[d] || 0) + 1
      const pl = (x?.place || '').trim(); if (pl) rpMap[pl] = (rpMap[pl] || 0) + 1
    }))
    const rehabDrugs = Object.entries(rdMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, value]) => ({ name, value }))
    const rehabPlaces = topN(rpMap, 10)

    // [6] dealer_locations[].district → count
    // กรองเฉพาะเขต กทม. (ขึ้นต้น "เขต") — ตัดอำเภอนอก กทม. ออกจาก choropleth + ตาราง (raw ใน DB คงไว้)
    const isBangkokDistrict = dn => dn.startsWith('เขต')
    const distMap = {}
    const dealerSpots = {}   // เขต → { ชื่อแหล่งซื้อ: จำนวน }
    let dealerDropped = 0
    rows.forEach(r => (r.dealer_locations || []).forEach(d => {
      const dn = (d?.district || '').trim(); if (!dn) return
      if (!isBangkokDistrict(dn)) { dealerDropped++; return }
      distMap[dn] = (distMap[dn] || 0) + 1
      // ชื่อแหล่งซื้อในเขตนั้น — ใช้ ชุมชน > จุดสังเกต(area) > แขวง ตามที่กรอกมา
      const spot = (d?.community || d?.area || d?.subdistrict || '').trim()
      if (spot) {
        const b = (dealerSpots[dn] ||= {})
        b[spot] = (b[spot] || 0) + 1
      }
    }))
    const districtMax = Math.max(1, ...Object.values(distMap))
    const districtTable = Object.entries(distMap).map(([name, count]) => ({ name, count }))

    return {
      total,
      avgAge: avg(avgAges), avgFirstAge: avg(avgFirstAges), ageDropped, firstAgeDropped, arrested, rehabbed,
      ageGroups, occupations, income, firstUseHist, firstDrug, firstReason,
      regularDrugs, priceRecords,
      arrestBuckets, arrestDrugs, charges,
      rehabBuckets, rehabDrugs, rehabPlaces,
      distMap, districtMax, districtTable, dealerDropped,
      dealerSpots: Object.fromEntries(Object.entries(dealerSpots).map(([dn, b]) =>
        [dn, Object.entries(b).map(([name, count]) => ({ name, count })).sort((a, b2) => b2.count - a.count)])),
    }
  }, [filteredRows])

  // ── choropleth layer (section 6) — purple gradient ──
  const districtLayerKey = `su-${filteredRows.length}-${range?.from || 'all'}`
  const districtLayerStyle = useMemo(() => (feature) => {
    const dn = feature.properties?.dname
    const c = agg.distMap[dn] || 0
    if (c === 0) return { color: '#e2e8f0', weight: 1, fillColor: '#6d28d9', fillOpacity: 0.04, opacity: 0.5 }
    const t = c / agg.districtMax
    return { color: '#a78bfa', weight: 1, fillColor: '#6d28d9', fillOpacity: 0.10 + t * 0.75, opacity: 0.95 }
  }, [agg.distMap, agg.districtMax])
  const districtLayerOnEachFeature = useMemo(() => (feature, layer) => {
    const dn = feature.properties?.dname || 'ไม่ระบุ'
    const c = agg.distMap[dn] || 0
    layer.bindTooltip(`${dn} — ${c} ราย${c ? ' · คลิกดูชื่อแหล่งซื้อ' : ''}`, { sticky: true, className: 'su-district-tooltip' })
    layer.on('click', () => setPickedDistrict(prev => prev === dn ? null : dn))
  }, [agg.distMap])

  const pickedSpots = pickedDistrict ? (agg.dealerSpots?.[pickedDistrict] || []) : []

  const filteredTable = useMemo(() => {
    const q = search.trim()
    let t = agg.districtTable.filter(d => !q || d.name.includes(q))
    t = [...t].sort((a, b) => sortDesc ? b.count - a.count : a.count - b.count)
    return t
  }, [agg.districtTable, search, sortDesc])

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="h-40 rounded-2xl bg-gradient-to-r from-violet-200 to-purple-200 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => <ChartSkeleton key={i} />)}
        </div>
      </div>
    </div>
  )
  if (error) return (
    <div className="p-8 max-w-md mx-auto mt-8 bg-red-50 border border-red-200 rounded-2xl text-center">
      <AlertTriangle size={24} className="text-red-500 mx-auto mb-3" />
      <p className="text-sm text-red-600">{error}</p>
    </div>
  )

  const sourceInfo = {
    title: 'แหล่งข้อมูล · ข้อมูลผู้เสพ',
    source: 'substance_users table',
    description:
      'ข้อมูลจากแบบเก็บข้อมูลจากผู้เสพ (แบบ ปปส.กทม. ๑-ฑ)\n' +
      'บันทึกจากการสัมภาษณ์ผู้เสพยาเสพติด\n' +
      'คุ้มครองข้อมูลส่วนบุคคลตาม PDPA',
    fields: [
      'อายุ',
      'อาชีพ',
      'รายได้ต่อเดือน',
      'ประวัติถูกจับ (จำนวนครั้ง + รายละเอียด 2 ครั้งล่าสุด)',
      'ประวัติบำบัด (จำนวนครั้ง + รายละเอียด 2 ครั้งล่าสุด)',
      'การเสพครั้งแรก (อายุ + ชนิดยา + สาเหตุ)',
      'ยาประจำ + ราคา',
      'แหล่งซื้อ (เก็บระดับเขต/ตำบล ไม่มีพิกัด)',
    ],
    notCollected: [
      'ชื่อ-สกุล / เลขประจำตัวประชาชน',
      'เบอร์โทรศัพท์',
      'ที่อยู่บ้าน (เลขที่/ซอย/ถนน)',
      'ข้อมูลผู้ขาย',
      'ข้อมูลผู้สัมภาษณ์',
    ],
    period: '01 ต.ค. 2568 - 30 เม.ย. 2569',
    count: `${rows.length.toLocaleString()} ราย`,
    lastUpload,
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Hero — ม่วง gradient + glassmorphism + count badge */}
        <header className="relative overflow-hidden rounded-2xl px-8 py-7 text-white
          bg-gradient-to-r from-violet-700 via-purple-700 to-violet-800 shadow-2xl shadow-violet-900/30">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-fuchsia-400/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-violet-200 mb-2">Substance Users · Drug Survey Data</div>
              <h1 className="text-4xl font-bold tracking-tight">แบบเก็บข้อมูลจากผู้เสพ</h1>
              <p className="text-violet-200 text-base mt-2 leading-relaxed">ข้อมูลสำรวจผู้เสพยาเสพติด</p>
            </div>
            <div className="flex flex-col items-end gap-3 shrink-0">
              <HeroActions onRefresh={load} refreshing={loading} sourceInfo={sourceInfo} />
              <div className="text-right">
                <div className="text-4xl font-bold text-white tabular-nums leading-none"><AnimatedCounter value={agg.total} /></div>
                <div className="text-xs text-white/70 mt-1">รายในระบบ</div>
              </div>
            </div>
          </div>
        </header>

        {/* Sticky bar — DateFilter + ช่วงข้อมูล + อัปเดตล่าสุด */}
        <div className="sticky top-0 z-30 -mx-6 px-6 py-3 print:hidden bg-white/80 backdrop-blur-md border-b border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <DateFilter availableYears={availableYears} />
              <span className="text-xs text-slate-500">ข้อมูลช่วง {periodLabel} · {agg.total.toLocaleString()} ราย</span>
            </div>
            {lastUpload && <div className="text-xs text-slate-400">อัปเดตล่าสุด {lastUpload}</div>}
          </div>
        </div>

        {/* SECTION 1 — KPI */}
        <section>
          <SectionHeader title="ภาพรวม" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard icon={<Users size={26} />} gradient="from-violet-500 to-purple-600" shadow="shadow-violet-500/30"
              label="ผู้เสพรวม" value={<AnimatedCounter value={agg.total} />} sub="ทั้งหมดในระบบ" />
            <KpiCard icon={<Activity size={26} />} gradient="from-cyan-500 to-blue-600" shadow="shadow-cyan-500/30"
              label="อายุเฉลี่ยของผู้เสพ" value={<AnimatedCounter value={agg.avgAge} decimals={1} />} sub="ปี" />
            <KpiCard icon={<Clock size={26} />} gradient="from-fuchsia-500 to-purple-600" shadow="shadow-fuchsia-500/30"
              label="อายุที่เริ่มเสพเฉลี่ย"
              value={agg.avgFirstAge > 0 ? <AnimatedCounter value={agg.avgFirstAge} decimals={1} /> : '—'}
              sub={agg.avgFirstAge > 0 ? 'ปี' : 'ไม่มีข้อมูล'} />
            <KpiCard icon={<Shield size={26} />} gradient="from-rose-500 to-pink-600" shadow="shadow-rose-500/30"
              label="เคยมีประวัติถูกจับกุม"
              value={<AnimatedCounter value={agg.total ? (agg.arrested / agg.total) * 100 : 0} suffix="%" />} sub={`${agg.arrested} ราย`} />
            <KpiCard icon={<Heart size={26} />} gradient="from-emerald-500 to-teal-600" shadow="shadow-emerald-500/30"
              label="เคยมีประวัติถูกบำบัด"
              value={<AnimatedCounter value={agg.total ? (agg.rehabbed / agg.total) * 100 : 0} suffix="%" />} sub={`${agg.rehabbed} ราย`} />
          </div>
        </section>

        {/* ── TAB NAVIGATION (sections 2–6) ── */}
        <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} viewMode={viewMode} setViewMode={setViewMode} />

        <div key={viewMode === 'tabs' ? activeTab : 'all'} className="transition-opacity duration-200 space-y-12">
          {viewMode === 'tabs' ? (
            <>
              {activeTab === 'demographics' && <DemographicsSection agg={agg} yearCtl={yearCtl} />}
              {activeTab === 'history' && <HistorySection agg={agg} yearCtl={yearCtl} />}
              {activeTab === 'drugs' && <DrugsSection agg={agg} yearCtl={yearCtl} />}
              {activeTab === 'arrests' && <ArrestsSection agg={agg} yearCtl={yearCtl} />}
              {activeTab === 'dealers' && (
                <DealersSection agg={agg} yearCtl={yearCtl} mapKey={`map-${activeTab}`}
                  districtLayerKey={districtLayerKey} districtLayerStyle={districtLayerStyle} districtLayerOnEachFeature={districtLayerOnEachFeature}
                  search={search} setSearch={setSearch} sortDesc={sortDesc} setSortDesc={setSortDesc} filteredTable={filteredTable}
                  pickedDistrict={pickedDistrict} setPickedDistrict={setPickedDistrict} pickedSpots={pickedSpots} />
              )}
            </>
          ) : (
            <>
              <DemographicsSection agg={agg} yearCtl={yearCtl} />
              <HistorySection agg={agg} yearCtl={yearCtl} />
              <DrugsSection agg={agg} yearCtl={yearCtl} />
              <ArrestsSection agg={agg} yearCtl={yearCtl} />
              <DealersSection agg={agg} yearCtl={yearCtl} mapKey="map-all"
                districtLayerKey={districtLayerKey} districtLayerStyle={districtLayerStyle} districtLayerOnEachFeature={districtLayerOnEachFeature}
                search={search} setSearch={setSearch} sortDesc={sortDesc} setSortDesc={setSortDesc} filteredTable={filteredTable}
                  pickedDistrict={pickedDistrict} setPickedDistrict={setPickedDistrict} pickedSpots={pickedSpots} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── tab navigation ───────────────────────────────────────────────────────────

const TAB_ICONS = { demographics: Users, history: Clock, drugs: Activity, arrests: Shield, dealers: MapPin }

function TabBar({ tabs, active, onChange, viewMode, setViewMode }) {
  const onKeyDown = (e, idx) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); onChange(tabs[(idx + 1) % tabs.length].id) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(tabs[(idx - 1 + tabs.length) % tabs.length].id) }
  }
  const allOn = viewMode === 'all'
  return (
    <div className="tab-bar print:hidden border-b border-slate-200">
      <nav role="tablist" aria-label="หมวดข้อมูลผู้เสพ" className="flex gap-1 -mb-px overflow-x-auto">
        {tabs.map((t, i) => {
          const isActive = t.id === active
          const Icon = TAB_ICONS[t.id]
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={e => onKeyDown(e, i)}
              className={`relative px-5 py-4 text-[15px] transition whitespace-nowrap hover:text-violet-700
                ${isActive ? 'text-violet-700 font-bold' : 'text-slate-500 font-medium'}`}
            >
              <span className="flex items-center gap-2">{Icon && <Icon size={18} />}{t.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-purple-600" />
              )}
            </button>
          )
        })}
        <button
          onClick={() => setViewMode(allOn ? 'tabs' : 'all')}
          aria-pressed={allOn}
          className={`ml-auto px-5 py-4 text-[15px] font-medium transition whitespace-nowrap inline-flex items-center gap-1.5
            ${allOn ? 'text-violet-700' : 'text-slate-500 hover:text-violet-700'}`}
        >
          <LayoutGrid size={18} />
          แสดงทั้งหมด
        </button>
      </nav>
    </div>
  )
}

// ─── section content (sub-components, same file) ──────────────────────────────

function DemographicsSection({ agg, yearCtl }) {
  return (
    <section>
      <SectionHeader title="ข้อมูลผู้เสพ" desc="อายุ อาชีพ และรายได้ต่อเดือนของผู้เสพ" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="กลุ่มอายุ" desc="การกระจายตัวตามช่วงอายุ" {...yearCtl}><VBar data={agg.ageGroups} unit=" ราย" palette="blue" /></ChartCard>
        <ChartCard title="อาชีพ (10 อันดับแรก)" desc="อาชีพที่พบมากที่สุด" {...yearCtl}><HBar data={agg.occupations} unit=" คน" palette="indigo" /></ChartCard>
        <ChartCard title="รายได้ต่อเดือน" desc="ช่วงรายได้ของผู้เสพ" {...yearCtl}><HBar data={agg.income} unit=" คน" palette="emerald" /></ChartCard>
      </div>
    </section>
  )
}

function HistorySection({ agg, yearCtl }) {
  return (
    <section>
      <SectionHeader title="ประวัติการเสพ" desc="อายุที่เริ่มเสพ ชนิดยา สาเหตุการเสพครั้งแรก และยาที่ใช้ประจำปัจจุบัน" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="อายุที่เริ่มเสพ" desc="ช่วงอายุที่เริ่มใช้ยาเสพติด" {...yearCtl}>
          {agg.firstUseHist.length ? <VBar data={agg.firstUseHist} palette="amber" /> : <Empty />}
        </ChartCard>
        <ChartCard title="ชนิดยาที่ใช้ครั้งแรก" desc="ชนิดยาเสพติดที่ใช้เป็นครั้งแรก" {...yearCtl}><HBar data={agg.firstDrug} unit=" คน" rainbow /></ChartCard>
        <ChartCard title="สาเหตุการเสพครั้งแรก" desc="เหตุผลที่เริ่มใช้ยาเสพติด" {...yearCtl}><HBar data={agg.firstReason} unit=" คน" palette="violet" /></ChartCard>
        {/* ย้ายมาจากแท็บ "ราคา" — ยาที่ใช้ปัจจุบันเป็นส่วนหนึ่งของประวัติการเสพ */}
        <ChartCard title="ยาเสพติดที่ใช้ปัจจุบัน" desc="ชนิดยาที่ใช้เป็นประจำในปัจจุบัน" {...yearCtl}>
          {agg.regularDrugs.length ? <HBar data={agg.regularDrugs} unit=" ราย" palette="teal" /> : <Empty />}
        </ChartCard>
      </div>
    </section>
  )
}

function DrugsSection({ agg, yearCtl }) {
  return (
    <section>
      <SectionHeader title="ราคา" desc="ราคายาเสพติดเฉลี่ยต่อหน่วย" />
      <div className="space-y-8">
        <PriceTrend records={agg.priceRecords} periodLabel={yearCtl.periodLabel} />
      </div>
    </section>
  )
}

function ArrestsSection({ agg }) {
  return (
    <section>
      <SectionHeader title="ประวัติการจับกุมและบำบัด" desc="ประวัติการถูกจับและการเข้ารับการบำบัด" />

      {/* จับกุม — โทนสีแดง */}
      <div className="mb-3 flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-red-600" />
        <h3 className="text-base font-bold text-slate-800">ข้อมูลการจับกุม</h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <ChartCard title="จำนวนครั้งที่ถูกจับ" desc="การกระจายตามจำนวนครั้งที่ถูกจับ"><VBar data={agg.arrestBuckets} unit=" ครั้ง" palette="red" /></ChartCard>
        <ChartCard title="ชนิดยาตอนถูกจับ" desc="ชนิดยาเสพติดที่พบขณะถูกจับ">
          {agg.arrestDrugs.length ? <HBar data={agg.arrestDrugs} unit=" คน" palette="rose" /> : <Empty />}
        </ChartCard>
        <ChartCard title="ข้อหา" desc="ข้อหาที่ถูกดำเนินคดี">
          {agg.charges.length ? <HBar data={agg.charges} unit=" ราย" palette="red" /> : <Empty />}
        </ChartCard>
      </div>

      {/* บำบัด — โทนสีเขียว */}
      <div className="mb-3 flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-emerald-600" />
        <h3 className="text-base font-bold text-slate-800">ข้อมูลการบำบัด</h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="จำนวนครั้งที่บำบัด" desc="การกระจายตามจำนวนครั้งที่เข้ารับการบำบัด"><VBar data={agg.rehabBuckets} unit=" ครั้ง" palette="emerald" /></ChartCard>
        <ChartCard title="ชนิดยาตอนบำบัด" desc="ชนิดยาเสพติดที่เข้ารับการบำบัด">
          {agg.rehabDrugs.length ? <HBar data={agg.rehabDrugs} unit=" คน" palette="teal" /> : <Empty />}
        </ChartCard>
        <ChartCard title="สถานที่บำบัด" desc="สถานที่ที่เข้ารับการบำบัด">
          {agg.rehabPlaces.length ? <HBar data={agg.rehabPlaces} unit=" ราย" palette="emerald" /> : <Empty />}
        </ChartCard>
      </div>
    </section>
  )
}

function DealersSection({ agg, yearCtl, mapKey, districtLayerKey, districtLayerStyle, districtLayerOnEachFeature, search, setSearch, sortDesc, setSortDesc, filteredTable, pickedDistrict, setPickedDistrict, pickedSpots }) {
  return (
    <section>
      <SectionHeader title="แหล่งซื้อยา รายเขต" desc="การกระจายตัวของแหล่งซื้อยาจำแนกตามเขต" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* map */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden
          hover:shadow-md transition">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin size={16} className="text-violet-700 shrink-0" />
              <h3 className="text-sm font-semibold text-slate-900 truncate">แผนที่กรุงเทพมหานคร · เขตที่เข้มกว่า = มีแหล่งซื้อมากกว่า</h3>
            </div>
          </div>
          <div className="relative h-[700px]">
            <IncidentMap
              key={mapKey}
              className="w-full h-full"
              points={[]}
              viewMode="point"
              getColor={() => '#6d28d9'}
              districtLayerKey={districtLayerKey}
              districtLayerStyle={districtLayerStyle}
              districtLayerOnEachFeature={districtLayerOnEachFeature}
            />
            {/* legend */}
            <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 border border-slate-200 rounded-lg p-3 shadow-sm pointer-events-none">
              <div className="text-xs text-slate-500 mb-1.5">จำนวนแหล่งซื้อต่อเขต</div>
              <div className="h-2.5 w-40 rounded-full" style={{ background: 'linear-gradient(to right, rgba(109,40,217,0.10), rgba(109,40,217,0.85))' }} />
              <div className="flex justify-between text-xs text-slate-400 mt-1 tabular-nums">
                <span>0</span><span>{agg.districtMax}</span>
              </div>
            </div>
          </div>
          <FooterPill periodLabel={yearCtl.periodLabel} />
        </div>

        {/* table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col
          hover:shadow-md transition">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">เขตพื้นที่ต่อจำนวนคน</h3>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเขต..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition" />
            </div>
          </div>
          <div className="overflow-y-auto max-h-[620px]">
            <table className="w-full">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="border-b border-slate-200">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider">เขต</th>
                  <th onClick={() => setSortDesc(s => !s)}
                    className="text-right px-6 py-4 text-xs font-semibold text-slate-700 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-violet-700 transition">
                    จำนวนคน {sortDesc ? '▼' : '▲'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTable.map((d, i) => {
                  const on = d.name === pickedDistrict
                  return (
                    <tr key={d.name}
                      onClick={() => setPickedDistrict?.(on ? null : d.name)}
                      title={`ดูชื่อแหล่งซื้อใน${d.name}`}
                      className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors ${
                        on ? 'bg-violet-100 text-violet-900 font-semibold' : `${i % 2 ? 'bg-slate-50/50' : 'bg-white'} hover:bg-violet-50 hover:text-violet-900`
                      }`}>
                      <td className="px-6 py-3 text-sm">{d.name}</td>
                      <td className="px-6 py-3 text-sm text-right font-medium tabular-nums">{d.count.toLocaleString()}</td>
                    </tr>
                  )
                })}
                {filteredTable.length === 0 && (
                  <tr><td colSpan={2} className="px-6 py-8 text-center text-slate-400 text-sm">ไม่พบเขต</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ชื่อแหล่งซื้อของเขตที่คลิก (จากแผนที่หรือตาราง) */}
          <div className="border-t border-slate-200 p-4">
            {!pickedDistrict ? (
              <p className="text-xs text-slate-400 text-center">คลิกเขตบนแผนที่หรือในตาราง เพื่อดูชื่อแหล่งซื้อ</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="text-sm font-bold text-violet-900 truncate">แหล่งซื้อใน{pickedDistrict}</h4>
                  <button onClick={() => setPickedDistrict?.(null)}
                    className="text-xs text-slate-400 hover:text-slate-700 shrink-0">ล้าง</button>
                </div>
                {pickedSpots.length === 0 ? (
                  <p className="text-xs text-slate-400">ไม่มีชื่อแหล่งซื้อระบุไว้ในเขตนี้</p>
                ) : (
                  <ul className="space-y-1 max-h-56 overflow-auto">
                    {pickedSpots.map((sp) => (
                      <li key={sp.name} className="flex items-center justify-between gap-3 text-sm px-2 py-1.5 rounded-md bg-violet-50">
                        <span className="text-slate-700 truncate" title={sp.name}>{sp.name}</span>
                        <span className="text-violet-800 font-semibold tabular-nums shrink-0">{sp.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── helpers — executive / formal ─────────────────────────────────────────────

function SectionHeader({ title, desc }) {
  return (
    <div className="border-b border-slate-200 pb-4 mb-8">
      <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h2>
      {desc && <p className="text-sm text-slate-500 max-w-2xl mt-1 leading-relaxed">{desc}</p>}
    </div>
  )
}

// pill ช่วงข้อมูล — กึ่งกลางใต้ chart (คำนวณจาก surveyed_at จริง)
function FooterPill({ periodLabel }) {
  return (
    <div className="flex justify-center mt-4">
      <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-white border border-slate-300 rounded-full text-sm text-slate-700 font-medium">
        ข้อมูลช่วง {periodLabel}
      </span>
    </div>
  )
}

// ไม่แสดง pill "ข้อมูลช่วง..." ใต้การ์ดแล้ว — ซ้ำกับที่แสดงบนหัวหน้า
function ChartCard({ title, desc, children }) {
  return (
    <div className="group relative bg-white rounded-2xl p-6 border border-slate-100
      shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_40px_rgba(124,58,237,0.12)]
      hover:border-violet-200 hover:-translate-y-0.5 transition-all duration-300">
      {/* accent line top */}
      <div className="absolute top-0 left-6 right-6 h-0.5 bg-gradient-to-r from-transparent via-violet-300 to-transparent opacity-0 group-hover:opacity-100 transition" />
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          {desc && <p className="text-sm text-slate-500 mt-0.5">{desc}</p>}
        </div>
        <div className="flex items-center gap-1 text-slate-300">
          <button type="button" className="hover:text-violet-600 p-1 transition" aria-label="ขยาย"><Maximize2 size={14} /></button>
          <button type="button" className="hover:text-violet-600 px-1 text-lg leading-none -mt-1 transition" aria-label="เพิ่มเติม">⋯</button>
        </div>
      </div>
      {children}
    </div>
  )
}

// empty state — illustration + ข้อความ
function Empty({ message = 'ไม่มีข้อมูล' }) {
  return (
    <div className="h-[320px] flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <Search className="w-7 h-7 text-slate-400" />
      </div>
      <div className="text-sm text-slate-500">{message}</div>
    </div>
  )
}

// loading skeletons
function ChartSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100">
      <div className="h-5 w-32 bg-slate-100 rounded animate-pulse mb-2" />
      <div className="h-4 w-48 bg-slate-100 rounded animate-pulse mb-6" />
      <div className="h-64 bg-slate-50 rounded-lg animate-pulse" />
    </div>
  )
}
function KpiSkeleton() {
  return <div className="rounded-2xl bg-slate-100 animate-pulse h-32" />
}

const TOOLTIP_STYLE = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
  padding: '10px 14px', boxShadow: '0 10px 30px -10px rgba(76, 29, 149, 0.2)', fontSize: 13, color: '#1e293b',
}
const TOOLTIP_CURSOR = { fill: 'rgba(139, 92, 246, 0.08)' }

// Top-3 pattern: #1 = top1, #2-3 = top23, ที่เหลือ = rest
function getTop3Color(value, allValues, palette) {
  const sorted = [...allValues].sort((a, b) => b - a)
  const rank = sorted.indexOf(value)
  if (rank === 0) return palette.top1
  if (rank <= 2) return palette.top23
  return palette.rest
}

// vertical bar — Top-3 shade ตาม palette, rainbow=true เพื่อหมุน CHART_COLORS ตาม index
function VBar({ data, height = 380, rainbow = false, palette = 'violet' }) {
  const values = data.map(x => x.value)
  const pal = TOP3_PALETTES[palette] || TOP3_PALETTES.violet
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} tickMargin={8}
          interval={0} angle={data.length > 5 ? -20 : 0} textAnchor={data.length > 5 ? 'end' : 'middle'} height={data.length > 5 ? 50 : 30} />
        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} tickMargin={8} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56} name="จำนวน">
          {data.map((d, i) => <Cell key={i} fill={rainbow ? CHART_COLORS[i % CHART_COLORS.length] : getTop3Color(d.value, values, pal)} />)}
          <LabelList dataKey="value" position="top" style={{ fontSize: 13, fontWeight: 700, fill: '#0f172a' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// horizontal bar — Top-3 shade ตาม palette, rainbow=true เพื่อหมุน CHART_COLORS ตาม index
function HBar({ data, height = 380, unit = '', rainbow = false, palette = 'violet' }) {
  const values = data.map(x => x.value)
  const pal = TOP3_PALETTES[palette] || TOP3_PALETTES.violet
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} tickMargin={8} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} tickMargin={8}
          width={160} tickFormatter={v => (v.length > 22 ? v.slice(0, 21) + '…' : v)} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} formatter={v => [`${v.toLocaleString()}${unit}`, 'จำนวน']} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={56} name="จำนวน">
          {data.map((d, i) => <Cell key={i} fill={rainbow ? CHART_COLORS[i % CHART_COLORS.length] : getTop3Color(d.value, values, pal)} />)}
          <LabelList dataKey="value" position="right" style={{ fontSize: 13, fontWeight: 700, fill: '#0f172a' }}
            formatter={v => `${v.toLocaleString()}${unit}`} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── ราคายา — ค่าเฉลี่ยรายเดือน (ปีงบ) · vibrant Active-users style + เทียบปีก่อน ──
const DRUG_PRICE_COLORS = {
  'ยาบ้า': '#f43f5e',   // rose-500
  'ไอซ์': '#a855f7',    // purple-500
  'คีตามีน': '#3b82f6', // blue-500
  'เฮโรอีน': '#f59e0b', // amber-500
  'ยาอี': '#ec4899',    // pink-500
  'กัญชา': '#10b981',   // emerald-500
  'ยาเค': '#06b6d4',    // cyan-500
  'อื่นๆ': '#6b7280',   // gray-500
}
// สีเส้น "ปีก่อน" (จางลง) — ใช้ตอนเทียบปีงบก่อน
const DRUG_PREV_COLORS = {
  'ยาบ้า': '#fda4af', 'ไอซ์': '#d8b4fe', 'คีตามีน': '#93c5fd', 'เฮโรอีน': '#fcd34d',
  'ยาอี': '#f9a8d4', 'กัญชา': '#6ee7b7', 'ยาเค': '#67e8f9', 'อื่นๆ': '#d1d5db',
}
// gradient พื้นหลัง KPI card (literal — ให้ Tailwind scan เจอ)
const DRUG_KPI_GRADIENT = {
  'ยาบ้า': 'from-rose-500 to-pink-600',
  'ไอซ์': 'from-violet-500 to-purple-600',
  'คีตามีน': 'from-blue-500 to-indigo-600',
  'เฮโรอีน': 'from-amber-500 to-orange-600',
  'ยาอี': 'from-pink-500 to-rose-600',
  'กัญชา': 'from-emerald-500 to-green-600',
  'ยาเค': 'from-cyan-500 to-sky-600',
}
// glow shadow สีเดียวกับยา (KPI card)
const DRUG_KPI_SHADOW = {
  'ยาบ้า': 'shadow-rose-500/30 hover:shadow-rose-500/40',
  'ไอซ์': 'shadow-purple-500/30 hover:shadow-purple-500/40',
  'คีตามีน': 'shadow-blue-500/30 hover:shadow-blue-500/40',
  'เฮโรอีน': 'shadow-amber-500/30 hover:shadow-amber-500/40',
  'ยาอี': 'shadow-pink-500/30 hover:shadow-pink-500/40',
  'กัญชา': 'shadow-emerald-500/30 hover:shadow-emerald-500/40',
  'ยาเค': 'shadow-cyan-500/30 hover:shadow-cyan-500/40',
}
// chip ยา active — นูน + ring + scale (literal)
const DRUG_CHIP_ACTIVE = {
  'ยาบ้า': 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 ring-2 ring-rose-200 scale-105',
  'ไอซ์': 'bg-violet-500 text-white shadow-lg shadow-violet-500/40 ring-2 ring-violet-200 scale-105',
  'คีตามีน': 'bg-blue-500 text-white shadow-lg shadow-blue-500/40 ring-2 ring-blue-200 scale-105',
  'เฮโรอีน': 'bg-amber-500 text-white shadow-lg shadow-amber-500/40 ring-2 ring-amber-200 scale-105',
  'ยาอี': 'bg-pink-500 text-white shadow-lg shadow-pink-500/40 ring-2 ring-pink-200 scale-105',
  'กัญชา': 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 ring-2 ring-emerald-200 scale-105',
  'ยาเค': 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/40 ring-2 ring-cyan-200 scale-105',
}
const drugColor = d => DRUG_PRICE_COLORS[d] || '#6b7280'
const drugPrevColor = d => DRUG_PREV_COLORS[d] || '#d1d5db'
// fiscalMonth (1-12) → ชื่อเดือน (ต.ค.=1 … ก.ย.=12)
const FISCAL_MONTH_LABELS = ['', 'ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.']
const getFiscalMonth = date => { const m = date.getMonth() + 1; return m >= 10 ? m - 9 : m + 3 }
const normUnit = u => (u === 'จี' ? 'กรัม' : u)        // normalize: จี → กรัม
const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length

// เตรียม records: normalize unit, หา unit หลักต่อยา (mode), กรองเฉพาะ unit หลัก, ติด fy/fm
function prepPriceData(records) {
  const unitByDrug = {}
  const cleanRecs = {}   // drug → [{ amount, fy, fm }]
  for (const [drug, recs] of Object.entries(records)) {
    const normed = recs.map(r => ({ amount: r.amount, date: r.date, u: normUnit(r.unit) }))
    const mainUnit = modeOf(normed.map(r => r.u)) || '?'
    unitByDrug[drug] = mainUnit
    cleanRecs[drug] = normed
      .filter(r => r.u === mainUnit)
      .map(r => ({ amount: r.amount, fy: dateToFiscalYear(r.date), fm: getFiscalMonth(new Date(r.date)) }))
      .filter(r => r.fy != null && r.fm != null)
  }
  return { unitByDrug, cleanRecs }
}

// mode 'drugs' — x=fiscalMonth, คอลัมน์=ยา, ค่า=mean (n ≥ 1 ต่อ ยา×เดือน), เก็บ __n ไว้คุมขนาด dot
function buildDrugsData(cleanRecs, drugs) {
  const out = []
  for (let fm = 1; fm <= 12; fm++) {
    const point = { fiscalMonth: fm, label: FISCAL_MONTH_LABELS[fm] }
    let has = false
    drugs.forEach(drug => {
      const amts = (cleanRecs[drug] || []).filter(r => r.fm === fm).map(r => r.amount)
      if (amts.length >= 1) { point[drug] = Math.round(mean(amts)); point[`${drug}__n`] = amts.length; has = true }
    })
    if (has) out.push(point)
  }
  return out
}

// เทียบปีก่อน — x=fiscalMonth, ต่อยา 2 คีย์ `${drug}_${curFY}` / `${drug}_${prevFY}` (mean, n ≥ 1)
function buildCompareData(cleanRecs, drugs, curFY, prevFY) {
  const out = []
  for (let fm = 1; fm <= 12; fm++) {
    const point = { fiscalMonth: fm, label: FISCAL_MONTH_LABELS[fm] }
    let has = false
    drugs.forEach(drug => {
      const recs = cleanRecs[drug] || []
      ;[curFY, prevFY].forEach(fy => {
        if (fy == null) return
        const amts = recs.filter(r => r.fm === fm && r.fy === fy).map(r => r.amount)
        if (amts.length >= 1) { point[`${drug}_${fy}`] = Math.round(mean(amts)); point[`${drug}_${fy}__n`] = amts.length; has = true }
      })
    })
    if (has) out.push(point)
  }
  return out
}

// ยาที่ผ่านเกณฑ์ — records (unit หลัก) ≥ 5, เรียงตามจำนวน
function eligiblePriceDrugs(cleanRecs) {
  return Object.keys(cleanRecs)
    .filter(d => cleanRecs[d].length >= 5)
    .sort((a, b) => cleanRecs[b].length - cleanRecs[a].length)
}

// จุดสูงสุดของแต่ละเส้น (สำหรับ ReferenceDot highlight)
function findPeak(data, key) {
  let max = -Infinity, peak = null
  for (const d of data) { if (d[key] != null && d[key] > max) { max = d[key]; peak = d } }
  return peak
}

// custom dot — n ≥ 3 → จุดใหญ่ทึบ ; n = 1-2 → จุดเล็ก จาง (บอกว่า data น้อย)
const renderPriceDot = color => props => {
  const { cx, cy, payload, dataKey, index } = props
  if (cx == null || cy == null || payload?.[dataKey] == null) return <g key={index} />
  const n = payload[`${dataKey}__n`] ?? 0
  const big = n >= 3
  return <circle key={index} cx={cx} cy={cy} r={big ? 5 : 3} fill={color}
    stroke="#fff" strokeWidth={3} opacity={big ? 1 : 0.7} />
}

// KPI card — gradient สด + glow shadow สีเดียวกับยา + นูนเมื่อ hover
function PriceKpiCard({ drug, value, unit, change, gradient, shadow }) {
  const up = change != null && change >= 0
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ${gradient} shadow-lg ${shadow} hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer`}>
      <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 blur-2xl" />
      <div className="relative">
        <div className="text-xs text-white/80">{drug}</div>
        <div className="text-2xl font-bold text-white tabular-nums mt-1">
          {value != null ? <>฿{value.toLocaleString()}<span className="text-sm text-white/70 ml-1">/{unit}</span></> : '—'}
        </div>
        {change != null && (
          <div className="text-xs text-white/90 mt-1 flex items-center gap-1">
            {up ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% vs ปีก่อน
          </div>
        )}
      </div>
    </div>
  )
}

// custom tooltip — popup สวย ; dedupe Area+Line ที่ dataKey เดียวกัน (เก็บ Line)
function PriceTooltip({ active, payload, label, unitFor }) {
  if (!active || !payload?.length) return null
  const byKey = {}
  payload.forEach(p => { if (p.value != null) byKey[p.dataKey] = p })   // Line render หลัง → ทับ Area
  const rows = Object.values(byKey)
  if (!rows.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-[180px]">
      <div className="text-xs text-slate-500 font-medium mb-2 pb-2 border-b border-slate-100">{label}</div>
      <div className="space-y-1.5">
        {rows.map(p => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-slate-700">{p.name}</span>
            </div>
            <span className="font-semibold tabular-nums text-slate-900">
              ฿{p.value.toLocaleString()}{unitFor?.(p.dataKey) ? `/${unitFor(p.dataKey)}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// chart — ComposedChart: Area gradient จัด + Line นูน (glow) + highlight จุดสูงสุด
function PriceComposedChart({ data, lines, unitFor }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 28, right: 24, left: 0, bottom: 0 }}>
        <defs>
          {lines.map((line, idx) => (
            <linearGradient key={line.key} id={`pricegrad-${idx}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={line.color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={line.color} stopOpacity={0.05} />
            </linearGradient>
          ))}
          <filter id="pricedot-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} tickMargin={8} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickMargin={8} width={56} tickFormatter={v => `฿${v}`} />
        <Tooltip content={<PriceTooltip unitFor={unitFor} />} cursor={{ stroke: '#6366f1', strokeDasharray: '3 3' }} />
        {lines.map((line, idx) => (
          <Area key={`area-${line.key}`} type="monotone" dataKey={line.key} stroke="none"
            fill={`url(#pricegrad-${idx})`} legendType="none" connectNulls={false} isAnimationActive={false} />
        ))}
        {lines.map(line => (
          <Line key={line.key} type="monotone" dataKey={line.key} name={line.name}
            stroke={line.color} strokeWidth={line.isPrevYear ? 2.5 : 3}
            strokeDasharray={line.isPrevYear ? '6 4' : undefined}
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
            dot={renderPriceDot(line.color)}
            activeDot={{ r: 8, stroke: '#fff', strokeWidth: 3, fill: line.color, filter: 'url(#pricedot-glow)' }}
            connectNulls={false} />
        ))}
        {/* highlight จุดสูงสุดแต่ละเส้น — ring + label + glow */}
        {lines.filter(l => !l.isPrevYear).map(line => {
          const peak = findPeak(data, line.key)
          if (!peak) return null
          return (
            <ReferenceDot key={`peak-${line.key}`} x={peak.label} y={peak[line.key]}
              r={9} fill="none" stroke={line.color} strokeWidth={3} filter="url(#pricedot-glow)" isFront>
              <Label value={`สูงสุด ฿${peak[line.key].toLocaleString()}`} position="top" offset={12}
                fill={line.color} fontSize={11} fontWeight={700} />
            </ReferenceDot>
          )
        })}
        <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ราคายา — mean รายเดือน (ปีงบ) + toggle เทียบปีก่อน · vibrant
function PriceTrend({ records, periodLabel }) {
  const { unitByDrug, cleanRecs } = useMemo(() => prepPriceData(records), [records])
  const eligible = useMemo(() => eligiblePriceDrugs(cleanRecs), [cleanRecs])

  const [selectedDrugs, setSelectedDrugs] = useState([])     // [] = ทุกยา
  const [compareLastYear, setCompareLastYear] = useState(false)

  const activeDrugs = selectedDrugs.length ? eligible.filter(d => selectedDrugs.includes(d)) : eligible
  const toggleDrug = d => setSelectedDrugs(prev => {
    if (prev.length === 0) return [d]               // จาก "ทุกยา" → เลือกตัวเดียว
    const next = prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    return next.length === eligible.length ? [] : next
  })

  // ปีงบล่าสุด/ก่อน จากยาที่เลือก
  const { curFY, prevFY } = useMemo(() => {
    const fys = [...new Set(activeDrugs.flatMap(d => (cleanRecs[d] || []).map(r => r.fy)))].sort((a, b) => b - a)
    const cur = fys[0] ?? null
    return { curFY: cur, prevFY: cur != null ? cur - 1 : null }
  }, [activeDrugs, cleanRecs])

  // KPI cards (สูงสุด 4) — value=mean รวม, change=ปีงบล่าสุด vs ก่อน
  const kpis = useMemo(() => activeDrugs.slice(0, 4).map(drug => {
    const recs = cleanRecs[drug] || []
    const all = recs.map(r => r.amount)
    const cur = recs.filter(r => r.fy === curFY).map(r => r.amount)
    const prev = recs.filter(r => r.fy === prevFY).map(r => r.amount)
    const mc = cur.length ? mean(cur) : null
    const mp = prev.length ? mean(prev) : null
    const change = (mc != null && mp != null && mp !== 0) ? (mc - mp) / mp * 100 : null
    return { drug, value: all.length ? Math.round(mean(all)) : null, unit: unitByDrug[drug], change,
      gradient: DRUG_KPI_GRADIENT[drug] || 'from-slate-500 to-slate-600',
      shadow: DRUG_KPI_SHADOW[drug] || 'shadow-slate-500/30 hover:shadow-slate-500/40' }
  }), [activeDrugs, cleanRecs, unitByDrug, curFY, prevFY])

  // chartData + lines — OFF: 1 เส้น/ยา ; ON: 2 เส้น/ยา (ปีปัจจุบัน + ปีก่อนเส้นประ)
  const { chartData, lines } = useMemo(() => {
    if (!compareLastYear) {
      const data = buildDrugsData(cleanRecs, activeDrugs)
      const ls = activeDrugs.map(d => ({ key: d, name: d, color: drugColor(d), isPrevYear: false }))
      return { chartData: data, lines: ls }
    }
    const data = buildCompareData(cleanRecs, activeDrugs, curFY, prevFY)
    const ls = activeDrugs.flatMap(d => [
      { key: `${d}_${curFY}`, name: `${d} ${curFY}`, color: drugColor(d), isPrevYear: false },
      { key: `${d}_${prevFY}`, name: `${d} ${prevFY}`, color: drugPrevColor(d), isPrevYear: true },
    ])
    return { chartData: data, lines: ls }
  }, [compareLastYear, cleanRecs, activeDrugs, curFY, prevFY])

  const unitFor = dk => unitByDrug[String(dk).replace(/_\d+$/, '')]

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(99,102,241,0.15)] transition-all duration-300 p-6">
      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">ราคายา</h3>
          <p className="text-sm text-slate-500 mt-0.5">ค่าเฉลี่ยรายเดือน (ปีงบ ต.ค.–ก.ย.)</p>
        </div>
        <div className="flex items-center gap-1 text-slate-300">
          <button type="button" className="p-1.5 rounded-lg hover:bg-slate-50 hover:text-slate-500 transition" aria-label="ขยาย"><Maximize2 size={16} /></button>
          <button type="button" className="px-1.5 rounded-lg hover:bg-slate-50 hover:text-slate-500 transition text-lg leading-none -mt-1" aria-label="เพิ่มเติม">⋯</button>
        </div>
      </div>

      {!eligible.length ? <Empty /> : (
        <>
          {/* KPI cards — gradient สด */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
            {kpis.map(kpi => <PriceKpiCard key={kpi.drug} {...kpi} />)}
          </div>

          {/* drug selector — chip สีของยา */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs text-slate-500 mr-1">เลือกยา:</span>
            {eligible.map(drug => {
              const on = selectedDrugs.length === 0 || selectedDrugs.includes(drug)
              return (
                <button key={drug} type="button" onClick={() => toggleDrug(drug)}
                  className={`h-8 px-3 text-xs font-medium rounded-full transition-all duration-200 ${
                    on ? (DRUG_CHIP_ACTIVE[drug] || 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/40 ring-2 ring-indigo-200 scale-105')
                       : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:shadow-md'}`}>
                  ● {drug}
                </button>
              )
            })}
          </div>

          {/* toggle เทียบปีก่อน */}
          <label className="flex items-center gap-2 cursor-pointer mb-4 w-fit">
            <div className={`relative w-10 h-6 rounded-full transition-all ${compareLastYear ? 'bg-gradient-to-r from-indigo-500 to-purple-500 shadow-md shadow-indigo-500/30' : 'bg-slate-300'}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all shadow ${compareLastYear ? 'left-[18px]' : 'left-0.5'}`} />
            </div>
            <input type="checkbox" className="sr-only" checked={compareLastYear} onChange={e => setCompareLastYear(e.target.checked)} />
            <span className="text-sm text-slate-700">เทียบกับปีงบก่อน</span>
            {compareLastYear && curFY != null && (
              <span className="text-xs text-slate-500">({prevFY} vs {curFY})</span>
            )}
          </label>

          {/* chart */}
          {chartData.length ? (
            <PriceComposedChart data={chartData} lines={lines} unitFor={unitFor} />
          ) : (
            <div className="text-slate-400 text-sm text-center py-16">ไม่มีข้อมูลราคาในช่วงที่เลือก</div>
          )}
        </>
      )}
      <FooterPill periodLabel={periodLabel} />
    </div>
  )
}

// counter เด้งเลขขึ้นแบบ ease-out cubic (~0.8s) — รับ value เป็นตัวเลข
function AnimatedCounter({ value, decimals = 0, suffix = '', prefix = '' }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (typeof value !== 'number' || isNaN(value)) return
    let raf
    const start = performance.now()
    const duration = 800
    const tick = now => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(value * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  const text = decimals ? display.toFixed(decimals) : Math.round(display).toLocaleString()
  return <>{prefix}{text}{suffix}</>
}

// KpiCard — premium gradient + glow shadow + นูน + decoration
function KpiCard({ icon, label, value, sub, gradient, shadow = 'shadow-violet-500/30' }) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ${gradient} shadow-xl ${shadow}
      hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-pointer`}>
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition" />
      <div className="relative z-10 text-white/90 mb-2">{icon}</div>
      <div className="relative z-10 text-3xl font-bold text-white tabular-nums leading-none">{value}</div>
      <div className="relative z-10 text-sm text-white/85 mt-1.5">{label}</div>
      {sub && <div className="relative z-10 text-xs text-white/65 mt-0.5">{sub}</div>}
    </div>
  )
}
