import React, { lazy, Suspense, useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, LabelList, Sector,
} from 'recharts'
import {
  TrendingUp, CheckCircle2, Clock, MapPin,
  User, Users, ArrowRightLeft, Ban, ArrowRight, Trophy, ChevronDown, Info, X, Search, RefreshCw, AlertTriangle,
  BarChart2, FileText, ExternalLink,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import * as stats from '../utils/statistics'
import { usePresentation } from '../context/PresentationContext'
import PresentationBar, { PresentationEnterButton } from '../components/PresentationBar'
import PresentationSlides from '../components/PresentationSlides'
import { BEHAVIOR_COLORS, BKK_GROUPS, DNAME_TO_GROUP } from '../utils/constants'
import { fetchAllPages } from '../utils/supabasePagination'
import { thaiDateRange } from '../utils/formatDate'
import PeriodBadge from '../components/PeriodBadge'
import UnifiedHero from '../components/UnifiedHero'
import DateFilter from '../components/DateFilter'
import { formatThaiDate, formatPeriod, minMaxDate, getLastUploadDate } from '../utils/heroMeta'
import { dateToFiscalYear } from '../utils/fiscalYear'
import { filterByDateColumn } from '../utils/filterRows'
import { useFilter } from '../context/FilterContext'

const OVERVIEW_SOURCE_INFO = {
  title: 'แหล่งข้อมูล · ภาพรวม',
  description: 'ดึงข้อมูลจาก 5 ตารางมาแสดง KPI และ chart รวม',
  sources: ['complaints', 'drug_incidents', 'bkn_summary', 'report_114', 'substance_users'],
}

const OverviewMiniMap = lazy(() => import('../components/OverviewMiniMap'))

function renderBehaviorActiveShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector cx={cx} cy={cy}
      innerRadius={innerRadius - 2} outerRadius={outerRadius + 12}
      startAngle={startAngle} endAngle={endAngle} fill={fill}
      style={{ filter: 'brightness(1.12) drop-shadow(0 4px 16px rgba(0,0,0,0.3))' }}
    />
  )
}

function renderChannelActiveShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector cx={cx} cy={cy}
      innerRadius={innerRadius - 2} outerRadius={outerRadius + 10}
      startAngle={startAngle} endAngle={endAngle} fill={fill}
      style={{ filter: 'brightness(1.12) drop-shadow(0 4px 12px rgba(0,0,0,0.25))' }} />
  )
}

export default function Overview() {
  const { records, isLoading, reload, error: dataError } = useData()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const { isPresentation } = usePresentation()

  // ── existing state ─────────────────────────────────────────────────────────
  const [trendYear, setTrendYear] = useState('all')
  const [channelYear, setChannelYear] = useState('all')
  const [channelMonth, setChannelMonth] = useState('all')
  const [selectedDistricts, setSelectedDistricts] = useState([])
  const [showSourceInfo, setShowSourceInfo] = useState(false)
  const [lastUpload, setLastUpload] = useState(null)
  const [activeBehaviorIndex, setActiveBehaviorIndex] = useState(null)

  useEffect(() => { getLastUploadDate(supabase).then(setLastUpload).catch(() => {}) }, [])
  const [activeChannelIndex, setActiveChannelIndex] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const [incidentsRaw, setIncidentsRaw] = useState([])
  const [bGroup, setBGroup] = useState('all')
  const [bDistrict, setBDistrict] = useState('all')
  const [bSubdistrict, setBSubdistrict] = useState('all')
  const [bCommunity, setBCommunity] = useState('all')
  const [bSearch, setBSearch] = useState('')
  const [incidentError, setIncidentError] = useState(null)
  const [incidentRetry, setIncidentRetry] = useState(0)

  // ── new state (multi-source data) ──────────────────────────────────────────
  const [rpt114, setRpt114] = useState(null)
  const [rpt114Loading, setRpt114Loading] = useState(true)
  const [bknSummary, setBknSummary] = useState(null)
  const [bknSummaryLoading, setBknSummaryLoading] = useState(true)
  const [mapPoints, setMapPoints] = useState([])
  const [mapLoading, setMapLoading] = useState(true)

  // ── existing useEffect: drug_incidents (behaviors) ────────────────────────
  useEffect(() => {
    const load = async () => {
      setIncidentError(null)
      try {
        const all = await fetchAllPages('drug_incidents', 'district, subdistrict, community, behaviors, received_date')
        setIncidentsRaw(all)
      } catch {
        setIncidentError('ไม่สามารถโหลดข้อมูลพฤติการณ์ได้ กรุณาลองใหม่')
      }
    }
    load()
  }, [incidentRetry])

  // ── new useEffect: report_114 ─────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from('report_114')
          .select('complaints,processed,arrested,rehab,framed,closed,action_other,fiscal_year')
          .is('group_no', null)
        if (data && data.length > 0) {
          const fys = [...new Set(data.map(r => r.fiscal_year))].filter(Boolean).sort((a, b) => a - b)
          const sum = key => data.reduce((s, r) => s + Number(r[key] ?? 0), 0)
          const fyMin = fys[0], fyMax = fys[fys.length - 1]
          const fyRange = fys.length > 1 ? `ปีงบ ${fyMin}–${fyMax}` : fys.length === 1 ? `ปีงบ ${fyMin}` : null
          setRpt114({
            total: sum('complaints'),
            fyRange,
            arrested: sum('arrested'),
            rehab: sum('rehab'),
            framed: sum('framed'),
            other: sum('closed') + sum('action_other'),
            totalRows: data.length,
          })
        } else {
          setRpt114(null)
        }
      } catch {
        setRpt114(null)
      } finally {
        setRpt114Loading(false)
      }
    }
    load()
  }, [])

  // ── new useEffect: bkn_summary ────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from('bkn_summary')
          .select('bkn,total,done,pending,period')
          .eq('report_id', '115_B')
          .limit(500)
        if (data && data.length > 0) {
          const periods = [...new Set(data.map(r => r.period).filter(Boolean))].sort()
          // ใช้เฉพาะงวดล่าสุด (latestPeriod) ให้ตรงกับหน้า /bkn — pattern เดียวกับ BknPage
          const latestPeriod = periods[periods.length - 1]
          const rows = latestPeriod ? data.filter(r => r.period === latestPeriod) : data
          const map = {}
          rows.forEach(r => {
            if (!r.bkn || r.bkn.includes('สปพ')) return
            if (!map[r.bkn]) map[r.bkn] = { total: 0, done: 0, pending: 0 }
            map[r.bkn].total   += r.total   || 0
            map[r.bkn].done    += r.done    || 0
            map[r.bkn].pending += r.pending || 0
          })
          const entries = Object.entries(map).sort(([a], [b]) =>
            (parseInt(a.replace(/\D+/g, '')) || 999) - (parseInt(b.replace(/\D+/g, '')) || 999)
          )
          const grandTotal = entries.reduce((s, [, v]) => s + v.total, 0)
          setBknSummary({ entries, period: latestPeriod, periodCount: periods.length, grandTotal, totalRows: rows.length })
        } else {
          setBknSummary(null)
        }
      } catch {
        setBknSummary(null)
      } finally {
        setBknSummaryLoading(false)
      }
    }
    load()
  }, [])

  // ── new useEffect: map points (lat/lng for mini map) ─────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from('drug_incidents')
          .select('lat, lng, behaviors, district, received_date')
          .limit(500)
        setMapPoints((data || []).filter(p => p.lat && p.lng))
      } catch {
        setMapPoints([])
      } finally {
        setMapLoading(false)
      }
    }
    load()
  }, [])

  // ── DateFilter (page-level) — กรอง complaints + drug_incidents ที่ source ──
  const rawData = records ?? []
  const { getDateRange } = useFilter()
  const range = getDateRange()
  const data = useMemo(() => filterByDateColumn(rawData, 'date', range), [records, range?.from, range?.to])
  const incidents = useMemo(() => filterByDateColumn(incidentsRaw, 'received_date', range), [incidentsRaw, range?.from, range?.to])
  const fyYears = useMemo(() => {
    const s = new Set()
    rawData.forEach(r => { const fy = dateToFiscalYear(r.date); if (fy) s.add(fy) })
    return [...s].sort((a, b) => b - a)
  }, [records])

  // ── existing computed values ───────────────────────────────────────────────
  const heroPeriod = useMemo(() => { const { min, max } = minMaxDate(rawData, 'date'); return formatPeriod(min, max) }, [records])
  const years = useMemo(() => stats.getYears(rawData), [records])

  const filteredRecords = data

  const totals = useMemo(() => {
    const total     = filteredRecords.length
    const completed = filteredRecords.filter(r => r.status === 'ดำเนินการแล้ว').length
    const pending   = total - completed
    const pct       = total > 0 ? ((completed / total) * 100).toFixed(2) : '0.00'
    return { total, completed, pending, pct }
  }, [filteredRecords])

  const actions = useMemo(() => stats.getActions(data), [data])

  const trendData = useMemo(() => stats.getMonthlyTrend(stats.filterByYear(data, trendYear)), [data, trendYear])
  const channelsData = useMemo(() => {
    let d = stats.filterByYear(data, channelYear)
    d = stats.filterByMonth(d, channelMonth)
    return stats.getChannels(d)
  }, [data, channelYear, channelMonth])

  const topDistricts = useMemo(() => {
    if (selectedDistricts.length === 0) return stats.getTopDistricts(data, 10)
    const filtered = data.filter(r => selectedDistricts.includes(r.district))
    return stats.getTopDistricts(filtered, selectedDistricts.length)
  }, [data, selectedDistricts])

  const top5Districts = useMemo(() => stats.getTopDistricts(data, 5), [data])

  const allDistricts = useMemo(() => {
    const s = new Set()
    data.forEach(r => { if (r.district) s.add(r.district) })
    return Array.from(s).sort()
  }, [data])

  const bDistrictOptions = useMemo(() => {
    const s = new Set()
    incidents.forEach(r => {
      if (!r.district) return
      if (bGroup !== 'all' && DNAME_TO_GROUP[r.district] !== bGroup) return
      s.add(r.district)
    })
    return Array.from(s).sort()
  }, [incidents, bGroup])

  const bSubdistrictOptions = useMemo(() => {
    const s = new Set()
    incidents.forEach(r => {
      if (!r.subdistrict) return
      if (bGroup !== 'all' && DNAME_TO_GROUP[r.district] !== bGroup) return
      if (bDistrict !== 'all' && r.district !== bDistrict) return
      s.add(r.subdistrict)
    })
    return Array.from(s).sort()
  }, [incidents, bGroup, bDistrict])

  const bCommunityOptions = useMemo(() => {
    const s = new Set()
    incidents.forEach(r => {
      if (!r.community) return
      if (bGroup !== 'all' && DNAME_TO_GROUP[r.district] !== bGroup) return
      if (bDistrict !== 'all' && r.district !== bDistrict) return
      if (bSubdistrict !== 'all' && r.subdistrict !== bSubdistrict) return
      s.add(r.community)
    })
    return Array.from(s).sort()
  }, [incidents, bGroup, bDistrict, bSubdistrict])

  const behaviorData = useMemo(() => {
    const counts = { 'เสพ': 0, 'ค้า': 0, 'เสพ/ค้า': 0, 'ผลิต': 0 }
    const q = bSearch.trim().toLowerCase()
    incidents.forEach(r => {
      if (bGroup !== 'all' && DNAME_TO_GROUP[r.district] !== bGroup) return
      if (bDistrict !== 'all' && r.district !== bDistrict) return
      if (bSubdistrict !== 'all' && r.subdistrict !== bSubdistrict) return
      if (bCommunity !== 'all' && r.community !== bCommunity) return
      if (q) {
        const hit = (r.community || '').toLowerCase().includes(q) ||
                    (r.subdistrict || '').toLowerCase().includes(q) ||
                    (r.district || '').toLowerCase().includes(q)
        if (!hit) return
      }
      if (!r.behaviors) return
      String(r.behaviors).split(',').forEach(b => {
        const key = b.trim()
        if (counts[key] !== undefined) counts[key]++
      })
    })
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: BEHAVIOR_COLORS[name] }))
  }, [incidents, bGroup, bDistrict, bSubdistrict, bCommunity, bSearch])

  const behaviorTotal = useMemo(() =>
    behaviorData.reduce((s, d) => s + d.value, 0), [behaviorData])

  const bHasFilter = bGroup !== 'all' || bDistrict !== 'all' || bSubdistrict !== 'all' || bCommunity !== 'all' || bSearch

  // ── period labels per card (ตาม filter ของแต่ละการ์ด) ────────────────────
  const complaintsRangeAll = useMemo(() => thaiDateRange(data, 'date', { unfiltered: true }), [data])
  const incidentsRangeAll = useMemo(() => thaiDateRange(incidents, 'received_date', { unfiltered: true }), [incidents])
  const mapPointsRange = useMemo(() => thaiDateRange(mapPoints, 'received_date', { unfiltered: true }), [mapPoints])
  const trendPeriod = useMemo(
    () => thaiDateRange(stats.filterByYear(data, trendYear), 'date', { unfiltered: trendYear === 'all' }),
    [data, trendYear])
  const channelPeriod = useMemo(
    () => thaiDateRange(stats.filterByMonth(stats.filterByYear(data, channelYear), channelMonth), 'date',
      { unfiltered: channelYear === 'all' && channelMonth === 'all' }),
    [data, channelYear, channelMonth])
  const districtPeriod = useMemo(() => {
    const rows = selectedDistricts.length === 0 ? data : data.filter(r => selectedDistricts.includes(r.district))
    return thaiDateRange(rows, 'date', { unfiltered: selectedDistricts.length === 0 })
  }, [data, selectedDistricts])
  const behaviorPeriod = useMemo(() => {
    const q = bSearch.trim().toLowerCase()
    const rows = incidents.filter(r => {
      if (bGroup !== 'all' && DNAME_TO_GROUP[r.district] !== bGroup) return false
      if (bDistrict !== 'all' && r.district !== bDistrict) return false
      if (bSubdistrict !== 'all' && r.subdistrict !== bSubdistrict) return false
      if (bCommunity !== 'all' && r.community !== bCommunity) return false
      if (q) {
        const hit = (r.community || '').toLowerCase().includes(q) ||
                    (r.subdistrict || '').toLowerCase().includes(q) ||
                    (r.district || '').toLowerCase().includes(q)
        if (!hit) return false
      }
      return true
    })
    return thaiDateRange(rows, 'received_date', { unfiltered: !bHasFilter })
  }, [incidents, bGroup, bDistrict, bSubdistrict, bCommunity, bSearch, bHasFilter])
  const rpt114Period = rpt114?.fyRange ? `${rpt114.fyRange}${rpt114.fyRange.includes('–') ? ' (รวมทุกปี)' : ''}` : null

  const bSearchSuggestions = useMemo(() => {
    if (!bSearch || bSearch.length < 1) return []
    const q = bSearch.toLowerCase()
    const results = []
    const seen = new Set()
    for (const r of incidents) {
      if (results.length >= 8) break
      if (r.district && r.district.toLowerCase().includes(q) && !seen.has(`d:${r.district}`)) {
        seen.add(`d:${r.district}`)
        results.push({ type: 'เขต', label: r.district, district: r.district })
      }
      if (r.subdistrict && r.subdistrict.toLowerCase().includes(q) && !seen.has(`s:${r.subdistrict}`)) {
        seen.add(`s:${r.subdistrict}`)
        results.push({ type: 'แขวง', label: r.subdistrict, district: r.district, subdistrict: r.subdistrict })
      }
      if (r.community && r.community.toLowerCase().includes(q) && !seen.has(`c:${r.community}`)) {
        seen.add(`c:${r.community}`)
        results.push({ type: 'ชุมชน', label: r.community, district: r.district, subdistrict: r.subdistrict, community: r.community })
      }
    }
    return results.slice(0, 8)
  }, [bSearch, incidents])

  // ── loading / error returns ────────────────────────────────────────────────
  if (isLoading) return (
    <div className="p-16 text-center">
      <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-blue-700 rounded-full animate-spin mb-4" />
      <p className="text-slate-500">กำลังโหลดข้อมูล...</p>
    </div>
  )

  if (!isLoading && dataError && records.length === 0) return (
    <div className="p-8">
      <div className="max-w-md mx-auto mt-8 bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={24} className="text-red-500" />
        </div>
        <h2 className="text-base font-bold text-red-800 mb-2">ไม่สามารถโหลดข้อมูลได้</h2>
        <p className="text-sm text-red-600 mb-4">ไม่สามารถเชื่อมต่อกับฐานข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือลองใหม่</p>
        <button onClick={reload} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition">
          ลองอีกครั้ง
        </button>
      </div>
    </div>
  )

  const DONUT_COLORS = ['#1E40AF', '#3B82F6', '#10B981', '#FACC15']
  const ACTION_ICONS = [
    { icon: <User size={36} />, color: 'amber' },
    { icon: <Users size={36} />, color: 'rose' },
    { icon: <ArrowRightLeft size={36} />, color: 'sky' },
    { icon: <Ban size={36} />, color: 'emerald' },
  ]

  // ── derived data for new sections ─────────────────────────────────────────
  const bknChartData = bknSummary?.entries.map(([bkn, v]) => ({
    name: bkn, done: v.done, pending: v.pending, total: v.total,
  })) || []

  const rptPieData = rpt114 ? [
    { name: 'จับกุม', value: rpt114.arrested, color: '#EF4444' },
    { name: 'บำบัด', value: rpt114.rehab, color: '#F59E0B' },
    { name: 'กลั่นแกล้ง', value: rpt114.framed, color: '#991B1B' },
    { name: 'อื่นๆ', value: rpt114.other, color: '#94A3B8' },
  ].filter(d => d.value > 0) : []
  const rptPieTotal = rptPieData.reduce((s, d) => s + d.value, 0)

  return (
    <>
    {isPresentation && <PresentationBar title="ภาพรวม" />}
    <div className={isPresentation ? '' : 'p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto'}>
      <style>{`@keyframes pie-tip-in{from{opacity:0;transform:translateY(8px) scale(0.95)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      {!isPresentation && (
        <UnifiedHero
          gradient="blue"
          eyebrow="OVERVIEW · DASHBOARD"
          title="ภาพรวมของข้อมูลเรื่องร้องเรียนยาเสพติด"
          description="สรุปข้อมูลจากทุกแหล่ง"
          period={heroPeriod}
          lastUpload={formatThaiDate(lastUpload)}
          sourceInfo={OVERVIEW_SOURCE_INFO}
          onRefresh={reload}
          refreshing={isLoading}
        />
      )}

      {!isPresentation && (
        <div className="mb-6">
          <DateFilter availableYears={fyYears} />
        </div>
      )}

      <PresentationSlides isPresentation={isPresentation} normalClassName="max-w-[1600px] mx-auto space-y-8">

      {/* ── KPI Row 1: complaints ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-blue-600 rounded-full"></div>
            <h3 className="text-base font-semibold text-slate-800">ข้อมูลรายเรื่อง</h3>
            <span className="text-xs text-slate-400">complaints</span>
          </div>
          <PeriodBadge period={complaintsRangeAll} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<TrendingUp />}
            label="เรื่องร้องเรียนทั้งหมด"
            value={totals.total.toLocaleString()}
            color="blue"
            onClick={isAdmin ? () => navigate('/admin/data') : null}
          />
          <StatCard
            icon={<CheckCircle2 />}
            label="ดำเนินการแล้ว"
            value={totals.completed.toLocaleString()}
            unit={`${totals.pct}%`}
            color="emerald"
            onClick={isAdmin ? () => navigate('/admin/data?status=ดำเนินการแล้ว') : null}
          />
          <StatCard
            icon={<Clock />}
            label="รอดำเนินการ"
            value={totals.pending.toLocaleString()}
            unit={`${(100 - parseFloat(totals.pct)).toFixed(2)}%`}
            color="amber"
            onClick={isAdmin ? () => navigate('/admin/data?status=ยังไม่ได้รับผล') : null}
          />
        </div>

        {/* ── KPI Row 2: multi-source (period ต่างกันต่อการ์ด → คงไว้บนการ์ด) ── */}
        <div className="flex items-center gap-2 pt-1">
          <div className="w-1 h-5 bg-indigo-600 rounded-full"></div>
          <h3 className="text-base font-semibold text-slate-800">รายงานสรุปจากแหล่งอื่น</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            icon={<FileText size={18} />}
            label="เรื่องร้องเรียน (RPT_114)"
            value={rpt114 ? rpt114.total.toLocaleString() : '—'}
            sub={rpt114?.fyRange ? `รวมทุกปีงบ · ${rpt114.fyRange}` : 'รวมทุกปีงบ'}
            sourceLabel={rpt114?.fyRange ? `RPT_114 · ${rpt114.fyRange}` : 'จาก RPT_114'}
            color="indigo"
            loading={rpt114Loading}
            period={rpt114Period}
          />
          <KpiCard
            icon={<MapPin size={18} />}
            label="จำนวนจุดยาเสพติด"
            value={incidentsRaw.length > 0 ? incidents.length.toLocaleString() : (incidentError ? 'ข้อผิดพลาด' : '—')}
            sub="จำนวนจุดในฐานข้อมูล"
            sourceLabel="จาก drug_incidents"
            color="rose"
            loading={incidentsRaw.length === 0 && !incidentError}
            period={incidentsRangeAll}
          />
          <KpiCard
            icon={<BarChart2 size={18} />}
            label="ยอดราย บก.น. รวม"
            value={bknSummary ? bknSummary.grandTotal.toLocaleString() : '—'}
            sub={bknSummary?.period ? `งวดล่าสุด · ${bknSummary.period}` : 'งวดล่าสุด'}
            sourceLabel="จาก 115_B"
            color="teal"
            loading={bknSummaryLoading}
            period={bknSummary?.period}
          />
        </div>
      </div>

      {/* ── Monthly Trend (complaints) ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-8">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 flex-wrap">
              <TrendingUp size={20} className="text-blue-600" /> แนวโน้มรายเดือน
              <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">📁 จาก records {records.length} เรื่อง</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">จำนวนเรื่องรับเข้าและการดำเนินการในแต่ละเดือน · แหล่งข้อมูล: complaints</p>
            <PeriodBadge period={trendPeriod} className="mt-1" />
          </div>
          <CardFilter label="ปี" value={trendYear} onChange={setTrendYear}
            options={[{ v: 'all', l: 'ทุกปี' }, ...years.map(y => ({ v: String(y), l: 'พ.ศ. ' + y }))]} />
        </div>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#475569' }} />
            <YAxis tick={{ fontSize: 12, fill: '#475569' }} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
              labelFormatter={(label, payload) => payload?.[0]?.payload?.monthFull || label}
            />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 10 }} />
            <Line type="monotone" dataKey="received" stroke="#3B82F6" strokeWidth={3} dot={{ r: 5 }} name="รับเรื่อง" />
            <Line type="monotone" dataKey="completed" stroke="#10B981" strokeWidth={3} dot={{ r: 5 }} name="ดำเนินการแล้ว" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── NEW: BKN mini bar + RPT_114 pie ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* BKN summary mini bar */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 flex-wrap">
              <BarChart2 size={18} className="text-blue-600" />
              สรุปราย บก.น.
              <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">จาก bkn_summary (115_B)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {bknSummary
                ? `ยอดดำเนินการรายกองบัญชาการ · งวด ${bknSummary.period} · ${bknSummary.totalRows} records`
                : 'ยอดดำเนินการรายกองบัญชาการ · แหล่งข้อมูล: bkn_summary'}
            </p>
            <PeriodBadge period={bknSummary?.period} className="mt-1" />
          </div>
          {bknSummaryLoading ? (
            <LoadingSpinner color="blue" />
          ) : bknChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={bknChartData} layout="vertical" margin={{ top: 0, right: 50, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} width={58} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v, name) => [v.toLocaleString() + ' เรื่อง', name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="done" fill="#10B981" radius={[0, 4, 4, 0]} name="ดำเนินการแล้ว">
                  <LabelList dataKey="done" position="right" style={{ fontSize: 10, fill: '#047857' }} />
                </Bar>
                <Bar dataKey="pending" fill="#F59E0B" radius={[0, 4, 4, 0]} name="รอดำเนินการ" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptySection message="ยังไม่มีข้อมูล 115_B" sub="กรุณาอัปโหลดที่หน้า /upload" />
          )}
        </div>

        {/* RPT_114 mini pie */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 flex flex-col">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 flex-wrap">
              <FileText size={18} className="text-indigo-600" />
              ผลการดำเนินการ (RPT_114)
              <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium">จาก report_114</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {rpt114
                ? `สัดส่วนผลตรวจสอบ · ${rpt114.totalRows} records`
                : 'สัดส่วนผลตรวจสอบ · แหล่งข้อมูล: report_114'}
            </p>
            <PeriodBadge period={rpt114Period} className="mt-1" />
          </div>
          {rpt114Loading ? (
            <LoadingSpinner color="indigo" />
          ) : rptPieData.length > 0 ? (
            <div className="flex flex-col flex-1">
              <div className="relative flex-1">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={rptPieData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={3}
                    >
                      {rptPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                      formatter={v => [v.toLocaleString() + ' เรื่อง']}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-2xl font-extrabold text-slate-800 tabular-nums leading-none">{rptPieTotal.toLocaleString()}</div>
                  <div className="text-xs text-slate-500 mt-1">เรื่อง</div>
                </div>
              </div>
              <button
                onClick={() => navigate('/operations')}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-sm font-semibold transition"
              >
                ดูรายละเอียด <ExternalLink size={14} />
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <EmptySection message="ยังไม่มีข้อมูล RPT_114" sub="กรุณาอัปโหลดที่หน้า /upload" />
              <button
                onClick={() => navigate('/operations')}
                className="mt-auto w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-sm font-semibold transition"
              >
                ดูรายละเอียด <ExternalLink size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── NEW: Mini map (drug_incidents) ───────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 flex-wrap">
              <MapPin size={18} className="text-rose-500" />
              จุดยาเสพติดในพื้นที่
              <span className="text-xs px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full font-medium">จาก drug_incidents</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {mapLoading
                ? 'กำลังโหลดข้อมูลแผนที่...'
                : mapPoints.length > 0
                  ? `แสดง ${mapPoints.length.toLocaleString()} จุดที่มีพิกัด · รวมทั้งหมด ${incidents.length.toLocaleString()} จุด`
                  : 'ข้อมูลพิกัดจาก drug_incidents'}
            </p>
            <PeriodBadge period={mapPointsRange} className="mt-1" />
          </div>
          <button
            onClick={() => navigate('/radar')}
            className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-sm font-semibold transition flex-shrink-0"
          >
            ดูแผนที่เต็ม <ExternalLink size={13} />
          </button>
        </div>

        {mapLoading ? (
          <LoadingSpinner color="rose" />
        ) : mapPoints.length > 0 ? (
          <>
            <div className="rounded-xl overflow-hidden border border-slate-100">
              <Suspense fallback={
                <div className="h-[280px] flex items-center justify-center text-slate-400 text-sm bg-slate-50">
                  <div className="w-6 h-6 border-2 border-slate-200 border-t-rose-400 rounded-full animate-spin mr-2" />
                  กำลังโหลดแผนที่...
                </div>
              }>
                <OverviewMiniMap points={mapPoints} />
              </Suspense>
            </div>
            <div className="flex flex-wrap gap-4 mt-3 items-center">
              {Object.entries(BEHAVIOR_COLORS).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: v }} />
                  {k}
                </div>
              ))}
              <span className="text-xs text-slate-400 ml-auto">แสดง {mapPoints.length.toLocaleString()} จุด</span>
            </div>
          </>
        ) : (
          <EmptySection
            message="ไม่มีข้อมูลพิกัดสำหรับแสดงบนแผนที่"
            sub="ข้อมูลจาก drug_incidents ยังไม่มีพิกัด lat/lng หรือยังไม่มีข้อมูล"
          />
        )}
      </div>

      {/* ── Top 10 เขต ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-8">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 flex-wrap">
              <MapPin size={20} className="text-blue-600" />
              {selectedDistricts.length === 0 ? '10 เขตที่มีเรื่องร้องเรียนมากที่สุด' : `เปรียบเทียบ ${selectedDistricts.length} เขต`}
              <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">📁 จาก records {records.length} เรื่อง</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">จัดอันดับตามจำนวนเรื่องที่ได้รับ · แหล่งข้อมูล: complaints</p>
            <PeriodBadge period={districtPeriod} className="mt-1" />
          </div>
          <div className="flex gap-2 items-end">
            <DistrictMultiSelect
              districts={allDistricts}
              selected={selectedDistricts}
              onChange={setSelectedDistricts}
            />
            <button
              onClick={() => navigate('/districts')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              ดูทั้งหมด <ArrowRight size={14} />
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={560}>
          <BarChart data={topDistricts} margin={{ top: 40, right: 30, left: 0, bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} angle={-25} textAnchor="end" height={80} interval={0} />
            <YAxis tick={{ fontSize: 12, fill: '#475569' }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey="total" fill="#3B82F6" radius={[8, 8, 0, 0]} name="ทั้งหมด">
              <LabelList dataKey="total" position="top" style={{ fontSize: 12, fontWeight: 700, fill: '#1E40AF' }} />
            </Bar>
            <Bar dataKey="completed" fill="#10B981" radius={[8, 8, 0, 0]} name="ดำเนินการแล้ว">
              <LabelList dataKey="completed" position="top" style={{ fontSize: 11, fontWeight: 600, fill: '#047857' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── ช่องทาง + Top 5 ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut ช่องทาง */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-8">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                ช่องทางการรับเรื่อง
                <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">📁 จาก records {records.length} เรื่อง</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">สัดส่วนช่องทางที่ประชาชนใช้ร้องเรียน · แหล่งข้อมูล: complaints</p>
              <PeriodBadge period={channelPeriod} className="mt-1" />
            </div>
            <div className="flex flex-wrap gap-2">
              <CardFilter label="ปี" value={channelYear} onChange={v => { setChannelYear(v); setChannelMonth('all') }}
                options={[{ v: 'all', l: 'ทุกปี' }, ...years.map(y => ({ v: String(y), l: 'พ.ศ. ' + y }))]} />
              <CardFilter label="เดือน" value={channelMonth} onChange={setChannelMonth}
                options={[
                  { v: 'all', l: 'ทุกเดือน' },
                  { v: '01', l: 'ม.ค.' }, { v: '02', l: 'ก.พ.' }, { v: '03', l: 'มี.ค.' },
                  { v: '04', l: 'เม.ย.' }, { v: '05', l: 'พ.ค.' }, { v: '06', l: 'มิ.ย.' },
                  { v: '07', l: 'ก.ค.' }, { v: '08', l: 'ส.ค.' }, { v: '09', l: 'ก.ย.' },
                  { v: '10', l: 'ต.ค.' }, { v: '11', l: 'พ.ย.' }, { v: '12', l: 'ธ.ค.' },
                ]} />
            </div>
          </div>
          <div
            className="relative"
            onClick={() => setActiveChannelIndex(null)}
          >
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={channelsData} dataKey="count" nameKey="name" cx="50%" cy="50%"
                  innerRadius={70} outerRadius={110} paddingAngle={2}
                  activeIndex={activeChannelIndex}
                  activeShape={renderChannelActiveShape}
                  onClick={(_, index, e) => { e.stopPropagation(); setActiveChannelIndex(prev => prev === index ? null : index); if (e) setMousePos({ x: e.clientX, y: e.clientY }) }}
                >
                  {channelsData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={DONUT_COLORS[i]}
                      style={{
                        opacity: activeChannelIndex === null || activeChannelIndex === i ? 1 : 0.3,
                        transition: 'opacity 0.2s ease-out',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-3xl font-bold text-slate-800">
                {channelsData.reduce((s, c) => s + c.count, 0).toLocaleString()}
              </div>
              <div className="text-xs text-slate-500">เรื่องรวม</div>
            </div>
            {activeChannelIndex !== null && channelsData[activeChannelIndex] && (() => {
              const total = channelsData.reduce((s, c) => s + c.count, 0)
              const sorted = [...channelsData].sort((a, b) => b.count - a.count)
              const rank = sorted.findIndex(c => c.name === channelsData[activeChannelIndex].name) + 1
              const d = channelsData[activeChannelIndex]
              return (
                <PieTooltipCard
                  label={d.name}
                  value={d.count}
                  pct={total > 0 ? d.count / total * 100 : 0}
                  color={DONUT_COLORS[activeChannelIndex]}
                  total={total}
                  rank={rank}
                  rankOfTotal={channelsData.length}
                  mouseX={mousePos.x}
                  mouseY={mousePos.y}
                />
              )
            })()}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {channelsData.map((c, i) => (
              <div key={c.name} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: DONUT_COLORS[i] }} />
                <span className="text-slate-700 font-medium">{c.name}</span>
                <span className="text-slate-500 ml-auto">{c.count.toLocaleString()} ({c.pct}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 เขต */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-8">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-1">
            <Trophy size={20} className="text-amber-500" /> 5 อันดับเขตที่ร้องเรียนสูงสุด
          </h3>
          <p className="text-xs text-slate-500 mb-1">แหล่งข้อมูล: complaints</p>
          <PeriodBadge period={complaintsRangeAll} className="mb-5" />
          <div className="space-y-3">
            {top5Districts.map((d, i) => {
              const rankStyle = [
                'bg-gradient-to-r from-amber-400 to-amber-500 text-white',
                'bg-gradient-to-r from-slate-300 to-slate-400 text-white',
                'bg-gradient-to-r from-orange-400 to-orange-500 text-white',
                'bg-slate-100 text-slate-600',
                'bg-slate-100 text-slate-600',
              ][i]
              return (
                <div key={d.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-blue-50 transition">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${rankStyle}`}>
                      #{i + 1}
                    </div>
                    <span className="font-medium text-slate-800">{d.name}</span>
                  </div>
                  <div className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                    {d.total.toLocaleString()} เรื่อง
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── สัดส่วนพฤติการณ์ (drug_incidents) ───────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />

        <div className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                สัดส่วนพฤติการณ์ยาเสพติด
                <span className="text-xs px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full font-medium">จาก drug_incidents</span>
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">จำแนกตามพฤติการณ์ · กรองตามพื้นที่ · {incidents.length.toLocaleString()} records</p>
              <PeriodBadge period={behaviorPeriod} className="mt-1" />
            </div>
            <div className="text-right shrink-0 pl-4">
              <div className="text-3xl font-extrabold text-slate-800 tabular-nums leading-none">{behaviorTotal.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">เรื่องรวม</div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left: Filter panel */}
            <div className="lg:w-64 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">กรองพื้นที่</span>
                {bHasFilter && (
                  <button
                    onClick={() => { setBGroup('all'); setBDistrict('all'); setBSubdistrict('all'); setBCommunity('all'); setBSearch('') }}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-semibold transition">
                    <X size={11} /> ล้างทั้งหมด
                  </button>
                )}
              </div>

              {incidentError && (
                <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-red-700 font-medium">โหลดข้อมูลพฤติการณ์ไม่สำเร็จ</p>
                    <button onClick={() => setIncidentRetry(c => c + 1)} className="text-xs text-red-600 hover:text-red-800 font-semibold mt-1">ลองอีกครั้ง</button>
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" />
                  <input
                    type="text"
                    value={bSearch}
                    onChange={e => setBSearch(e.target.value)}
                    placeholder="ค้นหาชุมชน / แขวง / เขต..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                  />
                  {bSearchSuggestions.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setBSearch('')} />
                      <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-20 overflow-hidden">
                        <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                          <span className="text-xs text-slate-500 font-medium">ผลการค้นหา {bSearchSuggestions.length} รายการ</span>
                        </div>
                        {bSearchSuggestions.map((s, i) => {
                          const badge = s.type === 'เขต'
                            ? 'bg-blue-600 text-white'
                            : s.type === 'แขวง' ? 'bg-indigo-600 text-white' : 'bg-violet-600 text-white'
                          return (
                            <button key={i}
                              onMouseDown={e => {
                                e.preventDefault()
                                if (s.type === 'เขต') { setBGroup('all'); setBDistrict(s.district); setBSubdistrict('all'); setBCommunity('all') }
                                else if (s.type === 'แขวง') { setBDistrict(s.district); setBSubdistrict(s.subdistrict); setBCommunity('all') }
                                else { setBDistrict(s.district); setBSubdistrict(s.subdistrict); setBCommunity(s.community) }
                                setBSearch('')
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-blue-50 border-b border-slate-100 last:border-0 text-left transition">
                              <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold flex-shrink-0 ${badge}`}>{s.type}</span>
                              <span className="text-sm text-slate-800 font-medium truncate">{s.label}</span>
                              {s.district && s.type !== 'เขต' && (
                                <span className="text-xs text-slate-400 ml-auto flex-shrink-0 truncate max-w-[80px]">{s.district}</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                  {bSearch.length >= 1 && bSearchSuggestions.length === 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-20 px-3 py-3 text-xs text-slate-400 text-center">
                      ไม่พบผลการค้นหา
                    </div>
                  )}
                </div>

                {[
                  { label: 'กลุ่มพื้นที่', dot: '#3B82F6', active: bGroup !== 'all', value: bGroup, onChange: e => { setBGroup(e.target.value); setBDistrict('all'); setBSubdistrict('all'); setBCommunity('all') }, opts: [{ v: 'all', l: 'ทั้งหมด' }, ...Object.entries(BKK_GROUPS).map(([g, emoji]) => ({ v: g, l: `${emoji} ${g}` }))] },
                  { label: 'เขต', dot: '#6366F1', active: bDistrict !== 'all', value: bDistrict, onChange: e => { setBDistrict(e.target.value); setBSubdistrict('all'); setBCommunity('all') }, opts: [{ v: 'all', l: 'ทุกเขต' }, ...bDistrictOptions.map(d => ({ v: d, l: d }))] },
                  { label: 'แขวง', dot: '#8B5CF6', active: bSubdistrict !== 'all', value: bSubdistrict, onChange: e => { setBSubdistrict(e.target.value); setBCommunity('all') }, opts: [{ v: 'all', l: 'ทุกแขวง' }, ...bSubdistrictOptions.map(d => ({ v: d, l: d }))] },
                  { label: 'ชุมชน', dot: '#A855F7', active: bCommunity !== 'all', value: bCommunity, onChange: e => setBCommunity(e.target.value), opts: [{ v: 'all', l: 'ทุกชุมชน' }, ...bCommunityOptions.map(d => ({ v: d, l: d }))] },
                ].map(({ label, dot, active, value, onChange, opts }) => (
                  <div key={label}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
                      <span className="text-xs font-medium text-slate-600">{label}</span>
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-auto flex-shrink-0 animate-pulse" />}
                    </div>
                    <select value={value} onChange={onChange}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition">
                      {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {bHasFilter && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1">
                  {bGroup !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs font-semibold">{BKK_GROUPS[bGroup]} {bGroup}<button onMouseDown={() => { setBGroup('all'); setBDistrict('all'); setBSubdistrict('all'); setBCommunity('all') }} className="w-5 h-5 flex items-center justify-center opacity-75 hover:opacity-100 hover:bg-white/20 rounded-full ml-0.5 flex-shrink-0">×</button></span>}
                  {bDistrict !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-600 text-white rounded-full text-xs font-semibold">{bDistrict}<button onMouseDown={() => { setBDistrict('all'); setBSubdistrict('all'); setBCommunity('all') }} className="w-5 h-5 flex items-center justify-center opacity-75 hover:opacity-100 hover:bg-white/20 rounded-full ml-0.5 flex-shrink-0">×</button></span>}
                  {bSubdistrict !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-600 text-white rounded-full text-xs font-semibold">{bSubdistrict}<button onMouseDown={() => { setBSubdistrict('all'); setBCommunity('all') }} className="w-5 h-5 flex items-center justify-center opacity-75 hover:opacity-100 hover:bg-white/20 rounded-full ml-0.5 flex-shrink-0">×</button></span>}
                  {bCommunity !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-600 text-white rounded-full text-xs font-semibold">{bCommunity}<button onMouseDown={() => setBCommunity('all')} className="w-5 h-5 flex items-center justify-center opacity-75 hover:opacity-100 hover:bg-white/20 rounded-full ml-0.5 flex-shrink-0">×</button></span>}
                  {bSearch && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700 text-white rounded-full text-xs font-semibold">🔍 {bSearch}<button onMouseDown={() => setBSearch('')} className="w-5 h-5 flex items-center justify-center opacity-75 hover:opacity-100 hover:bg-white/20 rounded-full ml-0.5 flex-shrink-0">×</button></span>}
                </div>
              )}
            </div>

            {/* Right: Chart + stat cards */}
            <div className="flex-1 min-w-0 flex flex-col">
              {behaviorData.length > 0 ? (
                <>
                  <div
                    className="relative"
                    onClick={() => setActiveBehaviorIndex(null)}
                  >
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={behaviorData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%" cy="50%"
                          innerRadius={84}
                          outerRadius={148}
                          paddingAngle={2}
                          strokeWidth={0}
                          labelLine={false}
                          activeIndex={activeBehaviorIndex}
                          activeShape={renderBehaviorActiveShape}
                          onClick={(_, index, e) => { e.stopPropagation(); setActiveBehaviorIndex(prev => prev === index ? null : index); if (e) setMousePos({ x: e.clientX, y: e.clientY }) }}
                          label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                            if (percent < 0.04 || index === activeBehaviorIndex) return null
                            const RADIAN = Math.PI / 180
                            const r = innerRadius + (outerRadius - innerRadius) * 0.54
                            const x = cx + r * Math.cos(-midAngle * RADIAN)
                            const y = cy + r * Math.sin(-midAngle * RADIAN)
                            return (
                              <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
                                style={{ fontSize: 14, fontWeight: 800, pointerEvents: 'none' }}>
                                {(percent * 100).toFixed(1)}%
                              </text>
                            )
                          }}
                        >
                          {behaviorData.map((d, i) => (
                            <Cell
                              key={i}
                              fill={d.color}
                              style={{
                                opacity: activeBehaviorIndex === null || activeBehaviorIndex === i ? 1 : 0.3,
                                transition: 'opacity 0.22s ease-out',
                                cursor: 'pointer',
                              }}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <div className="text-2xl font-extrabold text-slate-800 tabular-nums leading-none">{behaviorTotal.toLocaleString()}</div>
                      <div className="text-xs text-slate-500 mt-1 font-medium">เรื่องรวม</div>
                    </div>
                    {activeBehaviorIndex !== null && behaviorData[activeBehaviorIndex] && (() => {
                      const d = behaviorData[activeBehaviorIndex]
                      const sorted = [...behaviorData].sort((a, b) => b.value - a.value)
                      const rank = sorted.findIndex(x => x.name === d.name) + 1
                      return (
                        <PieTooltipCard
                          label={d.name}
                          value={d.value}
                          pct={behaviorTotal > 0 ? d.value / behaviorTotal * 100 : 0}
                          color={d.color}
                          total={behaviorTotal}
                          rank={rank}
                          rankOfTotal={behaviorData.length}
                          mouseX={mousePos.x}
                          mouseY={mousePos.y}
                        />
                      )
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {behaviorData.map(d => (
                      <div key={d.name} className="relative rounded-xl p-4 overflow-hidden"
                        style={{ background: d.color + '12', border: `1px solid ${d.color}28` }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                          <span className="text-sm font-extrabold tabular-nums" style={{ color: d.color }}>
                            {((d.value / behaviorTotal) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-2xl font-extrabold text-slate-800 tabular-nums leading-none">
                          {d.value.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 mt-1.5 font-medium">{d.name}</div>
                        <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: d.color }} />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <div className="text-5xl mb-3 opacity-30">📊</div>
                  <div className="text-sm font-medium">ไม่มีข้อมูลพฤติการณ์{bHasFilter ? 'ในพื้นที่ที่เลือก' : ''}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      </PresentationSlides>

      {!isPresentation && (
      <div className="max-w-[1600px] mx-auto">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-8">
          <div className="flex flex-col items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800 text-center flex items-center gap-2">
              หน่วยดำเนินการ
              <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">จาก complaints</span>
            </h3>
            <PeriodBadge period={complaintsRangeAll} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {actions.map((a, i) => (
              <ActionIcon key={a.name} icon={ACTION_ICONS[i]?.icon} label={a.name}
                pct={a.pct} count={a.count} color={ACTION_ICONS[i]?.color ?? 'blue'} />
            ))}
          </div>
        </div>
      </div>
      )}

      {/* ── Source Info Modal ─────────────────────────────────────────────── */}
      {showSourceInfo && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSourceInfo(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-blue-700 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">📊</div>
                <div>
                  <h2 className="font-bold text-lg">ที่มาของข้อมูล</h2>
                  <p className="text-xs text-blue-200">Data Sources Explanation</p>
                </div>
              </div>
              <button onClick={() => setShowSourceInfo(false)} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
                <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                  <span>📊</span> 1. รายงานทางการ (RPT_114)
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  <strong>รายงานการดำเนินการตามข้อร้องเรียน (Report ID: 114)</strong>
                  จากระบบ ป.ป.ส. — เป็นสถิติสรุปที่เป็นตัวเลขทางการสำหรับการรายงาน
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2 rounded">
                    <span className="text-slate-500">ปีงบล่าสุด</span>
                    <div className="font-bold text-blue-700">{rpt114?.fyRange ?? '—'}</div>
                  </div>
                  <div className="bg-white p-2 rounded">
                    <span className="text-slate-500">เรื่องรวมทุกปีงบ</span>
                    <div className="font-bold text-blue-700">{rpt114 ? rpt114.total.toLocaleString() : '—'} เรื่อง</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-blue-700">✓ ใช้สำหรับ: KPI card RPT_114, pie ผลการดำเนินการ</div>
              </div>

              <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg">
                <h3 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
                  <span>📁</span> 2. ข้อมูล Export Records (complaints)
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  <strong>ไฟล์รายเรื่องที่ export จากระบบ ป.ป.ส.</strong> — มีรายละเอียดทุก case
                  (วันที่, เขต, แขวง, ช่องทาง, สถานะ ฯลฯ) ใช้สำหรับการวิเคราะห์เชิงลึก
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2 rounded">
                    <span className="text-slate-500">รวม</span>
                    <div className="font-bold text-amber-700">{records.length.toLocaleString()} records</div>
                  </div>
                  <div className="bg-white p-2 rounded">
                    <span className="text-slate-500">ดำเนินการแล้ว</span>
                    <div className="font-bold text-amber-700">{totals.completed.toLocaleString()} ({totals.pct}%)</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-amber-700">✓ ใช้สำหรับ: 3 KPI cards บน, กราฟรายเดือน, Top เขต, ช่องทาง</div>
              </div>

              <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-lg">
                <h3 className="font-bold text-rose-900 mb-2 flex items-center gap-2">
                  <span>📍</span> 3. จุดยาเสพติด (drug_incidents)
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  <strong>ฐานข้อมูลจุดยาเสพติดในชุมชน</strong> — มีพิกัด lat/lng, พฤติการณ์, สน., บก.น.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2 rounded">
                    <span className="text-slate-500">รวม</span>
                    <div className="font-bold text-rose-700">{incidents.length.toLocaleString()} จุด</div>
                  </div>
                  <div className="bg-white p-2 rounded">
                    <span className="text-slate-500">มีพิกัด</span>
                    <div className="font-bold text-rose-700">{mapPoints.length.toLocaleString()} จุด</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-rose-700">✓ ใช้สำหรับ: KPI card, mini map, กราฟพฤติการณ์</div>
              </div>

              <div className="bg-teal-50 border-l-4 border-teal-500 p-4 rounded-r-lg">
                <h3 className="font-bold text-teal-900 mb-2 flex items-center gap-2">
                  <span>🏢</span> 4. สรุปราย บก.น. (bkn_summary / 115_B)
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  <strong>รายงาน RPT_115_B</strong> — สรุปยอดดำเนินการรายกองบัญชาการตำรวจนครบาล (บก.น.1-9)
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2 rounded">
                    <span className="text-slate-500">รวมยอด</span>
                    <div className="font-bold text-teal-700">{bknSummary ? bknSummary.grandTotal.toLocaleString() : '—'} เรื่อง</div>
                  </div>
                  <div className="bg-white p-2 rounded">
                    <span className="text-slate-500">จำนวนงวด</span>
                    <div className="font-bold text-teal-700">{bknSummary ? `${bknSummary.periodCount} งวด` : '—'}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-teal-700">✓ ใช้สำหรับ: KPI card 115_B, กราฟสรุป บก.น.</div>
              </div>

              <div className="bg-slate-100 border border-slate-200 p-4 rounded-lg">
                <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <span>💡</span> ทำไมตัวเลขต่างกัน?
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  แต่ละแหล่งข้อมูลมีวัตถุประสงค์ต่างกัน — <strong>RPT_114</strong> เป็นตัวเลขทางการ,
                  <strong> Records</strong> เป็น export รายเรื่อง, <strong>drug_incidents</strong> เป็นฐานข้อมูลจุดชุมชน,
                  <strong> 115_B</strong> เป็นรายงานสรุปรายหน่วย ตัวเลขแต่ละแหล่งจึงไม่เท่ากัน
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}

// ── Helper components ──────────────────────────────────────────────────────────

function LoadingSpinner({ color = 'blue' }) {
  const borderColor = {
    blue: 'border-t-blue-500',
    indigo: 'border-t-indigo-500',
    rose: 'border-t-rose-400',
    teal: 'border-t-teal-500',
  }[color] || 'border-t-blue-500'
  return (
    <div className="h-60 flex items-center justify-center text-slate-400 text-sm">
      <div className={`w-6 h-6 border-2 border-slate-200 ${borderColor} rounded-full animate-spin mr-2`} />
      กำลังโหลด...
    </div>
  )
}

function EmptySection({ message, sub }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
      <div className="text-4xl mb-3 opacity-25">📊</div>
      <div className="text-sm font-semibold text-slate-500">{message}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

function KpiCard({ icon, label, value, sub, sourceLabel, color, loading, period }) {
  const C = {
    indigo: { accent: '#6366F1', bg: '#EEF2FF', text: '#4338CA' },
    rose:   { accent: '#F43F5E', bg: '#FFF1F2', text: '#BE123C' },
    teal:   { accent: '#14B8A6', bg: '#F0FDFA', text: '#0F766E' },
  }
  const c = C[color] || C.indigo
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="h-1" style={{ background: c.accent }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: c.bg }}>
            <div style={{ color: c.accent }}>{icon}</div>
          </div>
          <span className="text-xs px-2 py-1 rounded-full font-medium text-center leading-tight" style={{ background: c.bg, color: c.text }}>
            {sourceLabel}
          </span>
        </div>
        {loading ? (
          <div className="h-8 bg-slate-100 rounded-lg animate-pulse mt-1" />
        ) : (
          <div className="text-4xl font-bold text-slate-800 tabular-nums leading-none mt-1">{value}</div>
        )}
        <div className="text-sm text-slate-600 mt-2 font-medium">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
        {period && <div className="mt-1.5"><PeriodBadge period={period} /></div>}
      </div>
    </div>
  )
}

function DistrictMultiSelect({ districts, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = districts.filter(d => d.includes(search))
  const toggle = d => onChange(selected.includes(d) ? selected.filter(x => x !== d) : [...selected, d])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 hover:border-blue-400 flex items-center gap-2 min-w-[200px] transition"
      >
        <span className="text-slate-500 text-xs">เปรียบเทียบเขต:</span>
        <span className="font-semibold text-slate-700">
          {selected.length === 0 ? 'Top 10' : `เลือกแล้ว ${selected.length} เขต`}
        </span>
        <ChevronDown size={14} className="ml-auto text-slate-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-20 max-h-[420px] flex flex-col">
            <div className="p-3 border-b border-slate-100">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาเขต..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 text-xs">
              <span className="text-slate-600">เลือกแล้ว {selected.length} / {districts.length}</span>
              {selected.length > 0 && (
                <button onClick={() => onChange([])} className="text-blue-600 hover:underline font-medium">
                  ล้างทั้งหมด
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filtered.map(d => (
                <label key={d} className="flex items-center gap-2 px-2 py-2 hover:bg-slate-50 rounded-lg cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(d)}
                    onChange={() => toggle(d)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-slate-700">{d}</span>
                </label>
              ))}
              {filtered.length === 0 && (
                <div className="text-center text-slate-400 py-4 text-sm">ไม่พบเขต</div>
              )}
            </div>
            <div className="p-2 border-t border-slate-100">
              <button
                onClick={() => setOpen(false)}
                className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
              >
                ตกลง
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function CardFilter({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
      >
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )
}

function StatCard({ icon, label, value, unit, color, onClick }) {
  const colors = {
    blue:    '#3B82F6',
    emerald: '#10B981',
    amber:   '#F59E0B',
    rose:    '#F43F5E',
  }
  const bg = colors[color] || colors.blue
  const clickable = !!onClick

  return (
    <div
      onClick={onClick}
      className={`rounded-xl shadow-sm text-white overflow-hidden relative p-5 transition-all duration-200 ${
        clickable ? 'cursor-pointer hover:opacity-90 hover:shadow-md' : ''
      }`}
      style={{ backgroundColor: bg }}>
      <div className="absolute right-3 top-3 opacity-20 pointer-events-none">
        <div className="text-white" style={{ transform: 'scale(2.6)', transformOrigin: 'top right' }}>
          {icon}
        </div>
      </div>
      <div className="relative z-10">
        <div className="text-4xl font-bold leading-none mb-1 tracking-tight">{value}</div>
        <div className="text-sm font-medium opacity-95">{label}</div>
        {unit && <div className="text-xs opacity-80 mt-0.5">{unit}</div>}
      </div>
    </div>
  )
}

function PieTooltipCard({ label, value, pct, color, total, rank, rankOfTotal, mouseX, mouseY }) {
  const W = 232
  const vw = window.innerWidth, vh = window.innerHeight
  const OFF = 22

  let left = mouseX + OFF
  let top = mouseY - 108
  if (left + W > vw - 12) left = mouseX - W - OFF
  if (top < 12) top = 12
  if (top + 220 > vh - 12) top = vh - 232

  const pctNum = typeof pct === 'number' ? pct : parseFloat(pct)
  const avgPct = rankOfTotal > 0 ? 100 / rankOfTotal : 0
  const diff = pctNum - avgPct
  const rankLabel = ['', '🥇', '🥈', '🥉'][rank] || `#${rank}`

  return (
    <div style={{
      position: 'fixed', left, top, width: W, zIndex: 9999, pointerEvents: 'none',
      background: 'rgba(12,14,22,0.82)',
      border: '1px solid rgba(255,255,255,0.13)',
      borderRadius: 14,
      padding: '14px 16px 15px',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      boxShadow: `0 12px 40px rgba(0,0,0,0.6), 0 2px 10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px rgba(0,0,0,0.3)`,
      animation: 'pie-tip-in .15s cubic-bezier(0.2,0,0,1)',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '14px 14px 0 0', background: color, opacity: 0.9 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11, marginTop: 4 }}>
        <div style={{
          width: 10, height: 28, borderRadius: 3, flexShrink: 0,
          background: color, boxShadow: `0 0 12px ${color}70`,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 800, lineHeight: 1.3, letterSpacing: '-0.01em' }}>{label}</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 }}>
            {rankLabel} อันดับ {rank} จาก {rankOfTotal}
          </div>
        </div>
        <div style={{
          background: `${color}22`, border: `1px solid ${color}44`,
          borderRadius: 8, padding: '4px 8px', flexShrink: 0,
        }}>
          <div style={{ color, fontSize: 17, fontWeight: 900, lineHeight: 1 }}>{pctNum.toFixed(1)}%</div>
        </div>
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 11 }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>จำนวน</span>
        <span style={{ color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.65, marginLeft: 5 }}>เรื่อง</span>
        </span>
      </div>

      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          width: `${Math.min(pctNum, 100)}%`, height: '100%',
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          borderRadius: 99,
          boxShadow: `0 0 10px ${color}70`,
          transition: 'width 0.35s cubic-bezier(0.2,0,0,1)',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>เทียบค่าเฉลี่ย ({avgPct.toFixed(1)}%)</span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: diff >= 0 ? '#4ade80' : '#f87171',
          background: diff >= 0 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          padding: '2px 6px', borderRadius: 5,
        }}>
          {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

function ActionIcon({ icon, label, pct, count, color }) {
  const palette = {
    amber:   'border-amber-300 text-amber-600',
    rose:    'border-rose-300 text-rose-600',
    sky:     'border-sky-300 text-sky-600',
    emerald: 'border-emerald-300 text-emerald-600',
    blue:    'border-blue-300 text-blue-600',
  }
  return (
    <div className="text-center">
      <div className={`w-24 h-24 mx-auto rounded-full border-4 ${palette[color]} flex items-center justify-center bg-white mb-3`}>
        {icon}
      </div>
      <div className="text-sm font-medium text-slate-700 mb-1">{label}</div>
      <div className="text-2xl font-bold text-red-600">{pct ?? 0}%</div>
      <div className="text-xs text-slate-500">({(count ?? 0).toLocaleString()} เรื่อง)</div>
    </div>
  )
}
