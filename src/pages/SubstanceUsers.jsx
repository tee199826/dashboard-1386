import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import {
  Users, Activity, Clock, Shield, Heart, AlertTriangle, MapPin, Search, LayoutGrid,
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

const INCOME_ORDER = ['ไม่มีรายได้', 'ต่ำกว่า 10,000', '10,000-15,000', '15,001-20,000', '20,001-25,000', '25,001-30,000', 'มากกว่า 30,000']
const incomeRank = v => { const i = INCOME_ORDER.findIndex(o => String(v || '').includes(o)); return i === -1 ? 99 : i }

const num = v => (v == null || v === '' ? null : (isNaN(Number(v)) ? null : Number(v)))

function topN(counts, n, otherLabel = 'อื่นๆ') {
  const arr = Object.entries(counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const out = arr.slice(0, n).map(([name, value]) => ({ name, value }))
  const rest = arr.slice(n).reduce((s, [, v]) => s + v, 0)
  if (rest > 0) out.push({ name: otherLabel, value: rest })
  return out
}

// ── tab navigation (executive) ──
const TABS = [
  { id: 'demographics', label: 'ข้อมูลประชากร' },
  { id: 'history', label: 'ประวัติการเสพ' },
  { id: 'drugs', label: 'ยาประจำ + ราคา' },
  { id: 'arrests', label: 'จับและบำบัด' },
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
    [rows, range?.from, range?.to],
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

    // [4] regular_drugs unnest
    const rdCount = {}, rdPriceSum = {}, rdPriceN = {}
    rows.forEach(r => (r.regular_drugs || []).forEach(d => {
      const name = (d?.drug || '').trim(); if (!name) return
      rdCount[name] = (rdCount[name] || 0) + 1
      const p = num(d?.price)
      if (p != null) { rdPriceSum[name] = (rdPriceSum[name] || 0) + p; rdPriceN[name] = (rdPriceN[name] || 0) + 1 }
    }))
    const regularDrugs = Object.entries(rdCount).filter(([, v]) => v >= 1)
      .sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))
    const priceAvg = Object.keys(rdPriceN).filter(k => rdPriceN[k] >= 3)
      .map(k => ({ name: k, value: Math.round(rdPriceSum[k] / rdPriceN[k]) }))
      .sort((a, b) => b.value - a.value)

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

    // [6] dealer_locations[].district → count
    const distMap = {}
    rows.forEach(r => (r.dealer_locations || []).forEach(d => {
      const dn = (d?.district || '').trim(); if (dn) distMap[dn] = (distMap[dn] || 0) + 1
    }))
    const districtMax = Math.max(1, ...Object.values(distMap))
    const districtTable = Object.entries(distMap).map(([name, count]) => ({ name, count }))

    return {
      total,
      avgAge: avg(ages), avgFirstAge: avg(firstAges), arrested, rehabbed,
      ageGroups, occupations, income, firstUseHist, firstDrug, firstReason,
      regularDrugs, priceAvg, arrestBuckets, arrestDrugs, charges,
      distMap, districtMax, districtTable,
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
    layer.bindTooltip(`${dn} — ${c} ราย`, { sticky: true, className: 'su-district-tooltip' })
  }, [agg.distMap])

  const filteredTable = useMemo(() => {
    const q = search.trim()
    let t = agg.districtTable.filter(d => !q || d.name.includes(q))
    t = [...t].sort((a, b) => sortDesc ? b.count - a.count : a.count - b.count)
    return t
  }, [agg.districtTable, search, sortDesc])

  if (loading) return (
    <div className="p-16 text-center">
      <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-violet-600 rounded-full animate-spin mb-4" />
      <p className="text-slate-500">กำลังโหลดข้อมูล...</p>
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
    <div className="bg-white min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-12">

        {/* Hero */}
        <header className="bg-gradient-to-br from-purple-900 via-violet-800 to-purple-900 rounded-xl px-8 py-8 text-white shadow-xl shadow-purple-900/20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-violet-300 mb-2">Substance Users · Drug Survey Data</div>
              <h1 className="text-4xl font-bold tracking-tight">แบบเก็บข้อมูลจากผู้เสพ</h1>
              <p className="text-violet-200 text-base mt-2 leading-relaxed">สรุปผลจาก {agg.total} ราย · ข้อมูลสำรวจผู้เสพยาเสพติด</p>
            </div>
            <HeroActions onRefresh={load} refreshing={loading} sourceInfo={sourceInfo} />
          </div>
        </header>

        <DateFilter availableYears={availableYears} />

        {/* SECTION 1 — KPI */}
        <section>
          <SectionHeader title="ภาพรวม" desc="ตัวชี้วัดหลักของกลุ่มผู้เสพในระบบ" />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard icon={<Users size={64} />} gradient="bg-gradient-to-br from-indigo-600 to-indigo-700"
              label="ผู้เสพรวม" value={agg.total.toLocaleString()} sub="ทั้งหมดในระบบ" />
            <KpiCard icon={<Activity size={64} />} gradient="bg-gradient-to-br from-sky-500 to-cyan-600"
              label="อายุเฉลี่ยของผู้เสพ" value={agg.avgAge.toFixed(1)} sub="ปี" />
            <KpiCard icon={<Clock size={64} />} gradient="bg-gradient-to-br from-violet-500 to-purple-600"
              label="อายุที่เริ่มเสพเฉลี่ย"
              value={agg.avgFirstAge > 0 ? agg.avgFirstAge.toFixed(1) : '—'}
              sub={agg.avgFirstAge > 0 ? 'ปี' : 'ไม่มีข้อมูล'} />
            <KpiCard icon={<Shield size={64} />} gradient="bg-gradient-to-br from-rose-500 to-red-600"
              label="เคยมีประวัติถูกจับกุม"
              value={`${agg.total ? ((agg.arrested / agg.total) * 100).toFixed(0) : 0}%`} sub={`${agg.arrested} ราย`} />
            <KpiCard icon={<Heart size={64} />} gradient="bg-gradient-to-br from-emerald-500 to-green-600"
              label="เคยมีประวัติถูกบำบัด"
              value={`${agg.total ? ((agg.rehabbed / agg.total) * 100).toFixed(0) : 0}%`} sub={`${agg.rehabbed} ราย`} />
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
                  search={search} setSearch={setSearch} sortDesc={sortDesc} setSortDesc={setSortDesc} filteredTable={filteredTable} />
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
                search={search} setSearch={setSearch} sortDesc={sortDesc} setSortDesc={setSortDesc} filteredTable={filteredTable} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── tab navigation ───────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange, viewMode, setViewMode }) {
  const onKeyDown = (e, idx) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); onChange(tabs[(idx + 1) % tabs.length].id) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(tabs[(idx - 1 + tabs.length) % tabs.length].id) }
  }
  const allOn = viewMode === 'all'
  return (
    <div className="tab-bar print:hidden sticky top-0 z-20 -mx-2 px-2 py-2 mb-8 flex items-center justify-between gap-3
      bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-sm">
      <div role="tablist" aria-label="หมวดข้อมูลผู้เสพ" className="flex items-center gap-2 px-2 overflow-x-auto">
        {tabs.map((t, i) => {
          const isActive = t.id === active
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={e => onKeyDown(e, i)}
              className={`min-w-[140px] text-center px-6 py-4 text-sm rounded-lg transition-colors duration-200 whitespace-nowrap
                ${isActive
                  ? 'text-violet-700 font-semibold bg-violet-50/50 border-b-2 border-violet-600 rounded-b-none'
                  : 'text-slate-600 font-medium hover:text-violet-700 hover:bg-violet-50/50'}`}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      <button
        onClick={() => setViewMode(allOn ? 'tabs' : 'all')}
        aria-pressed={allOn}
        className={`shrink-0 inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border transition-colors duration-200
          ${allOn
            ? 'bg-violet-100 border-violet-400 text-violet-700'
            : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300 hover:bg-violet-50'}`}
      >
        <LayoutGrid size={16} />
        แสดงทั้งหมด
      </button>
    </div>
  )
}

// ─── section content (sub-components, same file) ──────────────────────────────

function DemographicsSection({ agg, yearCtl }) {
  return (
    <section>
      <SectionHeader title="ข้อมูลประชากร" desc="อายุ อาชีพ และรายได้ต่อเดือนของผู้เสพ" />
      <div className="space-y-8">
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
      <SectionHeader title="ประวัติการเสพ" desc="อายุที่เริ่มเสพ ชนิดยา และสาเหตุการเสพครั้งแรก" />
      <div className="space-y-8">
        <ChartCard title="อายุที่เริ่มเสพ" desc="ช่วงอายุที่เริ่มใช้ยาเสพติด" {...yearCtl}>
          {agg.firstUseHist.length ? <VBar data={agg.firstUseHist} palette="amber" /> : <Empty />}
        </ChartCard>
        <ChartCard title="ชนิดยาที่ใช้ครั้งแรก" desc="ชนิดยาเสพติดที่ใช้เป็นครั้งแรก" {...yearCtl}><HBar data={agg.firstDrug} unit=" คน" rainbow /></ChartCard>
        <ChartCard title="สาเหตุการเสพครั้งแรก" desc="เหตุผลที่เริ่มใช้ยาเสพติด" {...yearCtl}><HBar data={agg.firstReason} unit=" คน" palette="violet" /></ChartCard>
      </div>
    </section>
  )
}

function DrugsSection({ agg, yearCtl }) {
  return (
    <section>
      <SectionHeader title="ยาที่ใช้ประจำ และ ราคา" desc="ชนิดยาที่ใช้ประจำและราคาเฉลี่ยต่อหน่วย" />
      <div className="space-y-8">
        <ChartCard title="ยาที่ใช้เป็นประจำ" desc="ชนิดยาที่ใช้เป็นประจำ" {...yearCtl}>
          {agg.regularDrugs.length ? <HBar data={agg.regularDrugs} unit=" ราย" palette="teal" /> : <Empty />}
        </ChartCard>
        <ChartCard title="ราคาเฉลี่ยต่อยา" desc="ราคาเฉลี่ยต่อหน่วย (ผู้ระบุราคา ≥ 3 ราย)" {...yearCtl}>
          {agg.priceAvg.length ? <HBar data={agg.priceAvg} unit=" บาท" palette="orange" /> : <Empty />}
        </ChartCard>
      </div>
    </section>
  )
}

function ArrestsSection({ agg, yearCtl }) {
  return (
    <section>
      <SectionHeader title="ประวัติการถูกจับ และ การบำบัด" desc="ประวัติการถูกจับและการเข้ารับการบำบัด" />
      <div className="space-y-8">
        <ChartCard title="จำนวนครั้งที่ถูกจับ" desc="การกระจายตามจำนวนครั้งที่ถูกจับ" {...yearCtl}><VBar data={agg.arrestBuckets} unit=" ครั้ง" palette="red" /></ChartCard>
        <ChartCard title="ชนิดยาตอนถูกจับ" desc="ชนิดยาเสพติดที่พบขณะถูกจับ" {...yearCtl}>
          {agg.arrestDrugs.length ? <HBar data={agg.arrestDrugs} unit=" คน" palette="rose" /> : <Empty />}
        </ChartCard>
        <ChartCard title="ข้อหา" desc="ข้อหาที่ถูกดำเนินคดี" {...yearCtl}>
          {agg.charges.length ? <HBar data={agg.charges} unit=" ราย" palette="fuchsia" /> : <Empty />}
        </ChartCard>
      </div>
    </section>
  )
}

function DealersSection({ agg, yearCtl, mapKey, districtLayerKey, districtLayerStyle, districtLayerOnEachFeature, search, setSearch, sortDesc, setSortDesc, filteredTable }) {
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
                {filteredTable.map((d, i) => (
                  <tr key={d.name} className={`border-b border-slate-100 last:border-0 ${i % 2 ? 'bg-slate-50/50' : 'bg-white'} hover:bg-violet-50 hover:text-violet-900 transition-colors`}>
                    <td className="px-6 py-3 text-sm text-slate-700">{d.name}</td>
                    <td className="px-6 py-3 text-sm text-right font-medium text-slate-900 tabular-nums">{d.count.toLocaleString()}</td>
                  </tr>
                ))}
                {filteredTable.length === 0 && (
                  <tr><td colSpan={2} className="px-6 py-8 text-center text-slate-400 text-sm">ไม่พบเขต</td></tr>
                )}
              </tbody>
            </table>
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

function ChartCard({ title, desc, periodLabel, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition p-6">
      <div>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        {desc && <p className="text-sm text-slate-500 mt-1">{desc}</p>}
      </div>
      <div className="mt-6">{children}</div>
      <FooterPill periodLabel={periodLabel} />
    </div>
  )
}

function Empty() {
  return <div className="h-[320px] flex items-center justify-center text-slate-400 text-sm">ไม่มีข้อมูล</div>
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

// KpiCard — vivid gradient + ตัวเลขขาวใหญ่ + icon โปร่งหลังการ์ด
function KpiCard({ icon, label, value, sub, gradient }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-6 shadow-lg ${gradient}
      hover:shadow-xl hover:scale-[1.02] transition`}>
      <div className="absolute right-4 top-4 text-white/30 pointer-events-none">{icon}</div>
      <div className="text-sm text-white/90 font-medium">{label}</div>
      <div className="text-4xl font-bold text-white tabular-nums mt-3 leading-none">{value}</div>
      <div className="text-xs text-white/70 mt-2">{sub}</div>
    </div>
  )
}
