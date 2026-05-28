import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Sector, LabelList, AreaChart, Area,
} from 'recharts'
import {
  TrendingUp, RefreshCw, ChevronLeft, MapPin, Users, AlertTriangle,
  Activity, BarChart2, Calendar,
} from 'lucide-react'
import IncidentMap from '../components/IncidentMap'
import { getBkn, getStations, BKN_ORDER, BKN_COLORS } from '../utils/bknMapping'
import { usePresentation } from '../context/PresentationContext'
import PresentationBar, { PresentationEnterButton } from '../components/PresentationBar'
import PresentationSlides from '../components/PresentationSlides'

const BEHAVIOR_COLORS = { 'เสพ': '#3B82F6', 'ค้า': '#EF4444', 'เสพ/ค้า': '#F59E0B', 'ผลิต': '#8B5CF6' }

const DRUG_PALETTE = {
  'ยาบ้า': '#EF4444', 'ไอซ์': '#0EA5E9', 'กัญชา': '#22C55E',
  'ยาอี': '#A855F7', 'คีตามีน': '#10B981', 'โคเคน': '#6366F1',
  'เฮโรอีน': '#7C3AED', 'กระท่อม': '#65A30D', 'สี่คูณร้อย': '#D97706',
  'สารระเหย': '#0891B2', 'มอร์ฟีน': '#9F1239', 'แฮปปี้วอเตอร์': '#EC4899',
}

const MONTH_TH = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function formatThaiDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return `${d.getDate()} ${MONTH_TH[d.getMonth() + 1]} ${d.getFullYear() + 543}`
}

const MONTH_TH_LONG = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

function formatThaiDateLong(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return `${d.getDate()} ${MONTH_TH_LONG[d.getMonth() + 1]} ${d.getFullYear() + 543}`
}

function renderActiveShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector cx={cx} cy={cy}
      innerRadius={innerRadius - 4} outerRadius={outerRadius + 14}
      startAngle={startAngle} endAngle={endAngle} fill={fill}
      style={{ filter: 'brightness(1.1) drop-shadow(0 4px 16px rgba(0,0,0,0.3))' }}
    />
  )
}

export default function BknPage() {
  const { isPresentation } = usePresentation()
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selectedBkn, setSelectedBkn] = useState(null)
  const [yearFilter, setYearFilter] = useState('all')
  const [activePieIdx, setActivePieIdx] = useState(null)
  const [viewMode, setViewMode] = useState('point')
  const [lastUpload115B, setLastUpload115B] = useState(undefined)
  const [bannerPeriod, setBannerPeriod] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    let all = [], from = 0
    while (true) {
      const { data, error } = await supabase.from('drug_incidents').select('*').range(from, from + 999)
      if (error) { console.error('[BknPage]', error); setLoadError('ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือลองใหม่'); break }
      if (!data || data.length === 0) break
      all = all.concat(data)
      if (data.length < 1000) break
      from += 1000
    }
    setIncidents(all)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('upload_batches')
      .select('created_at')
      .eq('target_table', 'bkn_summary')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setLastUpload115B(data?.[0]?.created_at ?? null))
  }, [])

  const years = useMemo(() => {
    const s = new Set()
    incidents.forEach(r => { if (r.received_date) s.add(parseInt(r.received_date.slice(0, 4)) + 543) })
    return Array.from(s).sort()
  }, [incidents])

  // Year-filtered only (for Level-1 bar comparison)
  const yearFiltered = useMemo(() => {
    if (yearFilter === 'all') return incidents
    const ce = parseInt(yearFilter) - 543
    return incidents.filter(r => r.received_date?.startsWith(String(ce)))
  }, [incidents, yearFilter])

  // Fully filtered: year + selected บก.น.
  const filtered = useMemo(() => {
    if (!selectedBkn) return yearFiltered
    return yearFiltered.filter(r => getBkn(r.police_station) === selectedBkn)
  }, [yearFiltered, selectedBkn])

  // KPI
  const totals = useMemo(() => {
    const b = { 'เสพ': 0, 'ค้า': 0, 'เสพ/ค้า': 0, 'ผลิต': 0 }
    filtered.forEach(r => {
      if (!r.behaviors) return
      String(r.behaviors).split(',').forEach(k => { const t = k.trim(); if (b[t] !== undefined) b[t]++ })
    })
    return { total: filtered.length, ...b }
  }, [filtered])

  const pctOf = n => totals.total > 0 ? ((n / totals.total) * 100).toFixed(1) : '0.0'

  // Bar data (Level 1: by บก.น. from yearFiltered, Level 2: by สน. from filtered)
  const barData = useMemo(() => {
    if (!selectedBkn) {
      const map = {}
      BKN_ORDER.filter(b => b !== 'ไม่ระบุ').forEach(b => { map[b] = 0 })
      yearFiltered.forEach(r => { const b = getBkn(r.police_station); if (map[b] !== undefined) map[b]++ })
      return BKN_ORDER.filter(b => b !== 'ไม่ระบุ').map(b => ({ name: b, count: map[b], color: BKN_COLORS[b] }))
    }
    const stns = getStations(selectedBkn)
    const map = {}; stns.forEach(s => { map[s] = 0 })
    filtered.forEach(r => { const s = r.police_station?.trim(); if (s && map[s] !== undefined) map[s]++ })
    return stns.map(s => ({ name: s, count: map[s], color: BKN_COLORS[selectedBkn] })).sort((a, b) => b.count - a.count)
  }, [yearFiltered, filtered, selectedBkn])

  // Behavior donut
  const behaviorData = useMemo(() => {
    const counts = { 'เสพ': 0, 'ค้า': 0, 'เสพ/ค้า': 0, 'ผลิต': 0 }
    filtered.forEach(r => {
      if (!r.behaviors) return
      String(r.behaviors).split(',').forEach(k => { const t = k.trim(); if (counts[t] !== undefined) counts[t]++ })
    })
    return Object.entries(counts).filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: BEHAVIOR_COLORS[name] }))
  }, [filtered])
  const behaviorTotal = useMemo(() => behaviorData.reduce((s, d) => s + d.value, 0), [behaviorData])

  // Drug type breakdown (top 10)
  const drugData = useMemo(() => {
    const map = {}
    filtered.forEach(r => { if (r.primary_drug) map[r.primary_drug] = (map[r.primary_drug] || 0) + 1 })
    return Object.entries(map).sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([name, count]) => ({ name, count, color: DRUG_PALETTE[name] || '#94a3b8' }))
  }, [filtered])
  const topDrug = drugData[0] || null

  // Monthly trend
  const trendData = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      if (!r.received_date) return
      const key = r.received_date.slice(0, 7)
      map[key] = (map[key] || 0) + 1
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => {
        const [y, m] = key.split('-')
        const ty = (parseInt(y) + 543).toString().slice(-2)
        return { key, label: `${MONTH_TH[parseInt(m)]}${ty}`, count }
      }).slice(-24)
  }, [filtered])

  // Top 5
  const top5 = useMemo(() => [...barData].sort((a, b) => b.count - a.count).slice(0, 5), [barData])

  const mapPoints = useMemo(() => incidents.filter(r => r.lat && r.lng), [incidents])
  const getColor = useCallback(p => BKN_COLORS[getBkn(p.police_station)] || '#9ca3af', [])

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className="w-14 h-14 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4" />
      <p className="text-slate-600 font-semibold">กำลังโหลดข้อมูล...</p>
      <p className="text-xs text-slate-400 mt-1">กำลังดึงข้อมูลจากฐานข้อมูล</p>
    </div>
  )

  if (loadError) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
        <AlertTriangle size={28} className="text-red-500" />
      </div>
      <h2 className="text-lg font-bold text-slate-800 mb-2">ไม่สามารถโหลดข้อมูลได้</h2>
      <p className="text-sm text-slate-500 mb-4 text-center max-w-xs">{loadError}</p>
      <button onClick={load} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">
        ลองอีกครั้ง
      </button>
    </div>
  )

  const isLevel2 = !!selectedBkn

  return (
    <>
    {isPresentation && <PresentationBar title="รายงานความรวดเร็วการดำเนินการ บก.น." />}
    <div className={isPresentation ? '' : 'p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto'}>

      {/* ── OFFICIAL BANNER ── */}
      {!isPresentation && <div className="rounded-2xl overflow-hidden shadow-md" style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#1d4ed8 100%)' }}>
        <div className="px-6 py-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-bold text-blue-300 uppercase tracking-[0.15em] mb-1.5">
              กองบัญชาการตำรวจนครบาล · รายงานทางการ
            </p>
            <h1 className="text-xl font-extrabold text-white leading-snug">
              รายงานความรวดเร็วการดำเนินการ กลุ่ม 1–5 จำแนกตาม บก.น.
            </h1>
            <p className="text-sm text-blue-200 mt-1.5 flex items-center gap-2">
              <span>{bannerPeriod ? `ข้อมูลช่วง ${bannerPeriod}` : 'ยังไม่มีข้อมูล'}</span>
              <span className="opacity-40">·</span>
              <span>รายงาน 115_B</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs font-semibold text-blue-100">
              บก.น. 1–9
            </span>
            <span className="px-3 py-1.5 rounded-lg text-xs font-bold text-white border border-blue-300/40"
              style={{ background: 'rgba(59,130,246,0.25)' }}>
              RPT 115_B
            </span>
          </div>
        </div>
        <div className="h-0.5 opacity-50" style={{ background: 'linear-gradient(90deg,#60a5fa,#22d3ee,#60a5fa)' }} />
      </div>}

      <PresentationSlides isPresentation={isPresentation} normalClassName="max-w-[1600px] mx-auto space-y-7">

      {/* ── HEADER + KPI (slide 1 in presentation) ── */}
      <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          {isLevel2 && (
            <button onClick={() => { setSelectedBkn(null); setActivePieIdx(null) }}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-semibold mb-2 transition">
              <ChevronLeft size={15} /> ภาพรวมทุก บก.น.
            </button>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {isLevel2 && (
              <span className="px-3 py-1 rounded-lg text-sm font-bold text-white shadow"
                style={{ background: BKN_COLORS[selectedBkn] }}>
                {selectedBkn}
              </span>
            )}
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
              {isLevel2 ? `สถิติ ${selectedBkn}` : 'สถิติคดียาเสพติด'}
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isLevel2
              ? `${selectedBkn} · ${getStations(selectedBkn).length} สถานีตำรวจ · กองบัญชาการตำรวจนครบาล`
              : 'กองบัญชาการตำรวจนครบาล · บก.น.1–9 · ระบบ drug_incidents'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {years.length > 0 && (
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
              <Calendar size={14} className="text-slate-400 flex-shrink-0" />
              <span className="text-xs text-slate-400">ปีงบประมาณ</span>
              <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
                className="text-sm font-semibold text-slate-700 bg-transparent outline-none cursor-pointer pr-1">
                <option value="all">ทั้งหมด</option>
                {years.map(y => <option key={y} value={y}>พ.ศ. {y}</option>)}
              </select>
            </div>
          )}
          {!isPresentation && (
            <button onClick={load} disabled={loading} title="รีเฟรชข้อมูล"
              className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-300 shadow-sm transition">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
          {!isPresentation && lastUpload115B === null && (
            <span className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-400 border border-slate-200 whitespace-nowrap">
              115_B: ยังไม่มีข้อมูล
            </span>
          )}
          {!isPresentation && lastUpload115B != null && lastUpload115B !== undefined && (() => {
            const isStale = (Date.now() - new Date(lastUpload115B).getTime()) > 30 * 24 * 3600 * 1000
            return (
              <a href="/upload" title="ไปหน้าอัปโหลด"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                  isStale
                    ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                    : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                }`}>
                {isStale && <span>⚠</span>}
                <span>115_B: {formatThaiDate(lastUpload115B)}</span>
              </a>
            )
          })()}
          {!isPresentation && <PresentationEnterButton />}
        </div>
      </div>

      {/* ── KPI STRIP (5 cards) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard icon={<BarChart2 size={20} />}
          label="คดีทั้งหมด" sub="เรื่อง"
          value={totals.total.toLocaleString()}
          bg="from-blue-700 to-blue-600" foot="#1D4ED8" />
        <KpiCard icon={<Activity size={20} />}
          label="เสพ" sub={`${pctOf(totals['เสพ'])}% ของทั้งหมด`}
          value={totals['เสพ'].toLocaleString()}
          bg="from-sky-500 to-sky-400" foot="#0369A1" />
        <KpiCard icon={<AlertTriangle size={20} />}
          label="ค้า" sub={`${pctOf(totals['ค้า'])}% ของทั้งหมด`}
          value={totals['ค้า'].toLocaleString()}
          bg="from-red-600 to-red-500" foot="#B91C1C" />
        <KpiCard icon={<Users size={20} />}
          label="เสพ/ค้า" sub={`${pctOf(totals['เสพ/ค้า'])}% ของทั้งหมด`}
          value={totals['เสพ/ค้า'].toLocaleString()}
          bg="from-amber-500 to-amber-400" foot="#B45309" />
        <KpiCard icon={<TrendingUp size={20} />}
          label="ยาเสพติดอันดับ 1"
          sub={topDrug ? `${topDrug.count.toLocaleString()} คดี` : 'ไม่มีข้อมูล'}
          value={topDrug?.name || '—'}
          bg="from-violet-600 to-violet-500" foot="#5B21B6" smallValue />
      </div>
      </div>{/* end header+KPI group */}

      {/* ── BAR CHART: Comparison ── */}
      <Panel accent="from-blue-500 to-indigo-600">
        <div className="flex items-start justify-between mb-1 flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              {isLevel2 ? `เปรียบเทียบสถานีตำรวจใน ${selectedBkn}` : 'จำนวนคดีแยกตามกองบังคับการ'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isLevel2
                ? `${getStations(selectedBkn).length} สถานีตำรวจ`
                : 'คลิกแท่งกราฟเพื่อดูรายละเอียดสถานีตำรวจ'}
            </p>
          </div>
          <span className="text-sm font-semibold text-slate-500">
            รวม {(isLevel2 ? totals.total : yearFiltered.length).toLocaleString()} เรื่อง
          </span>
        </div>
        <ResponsiveContainer width="100%" height={barData.length > 12 ? 500 : 360}>
          <BarChart data={barData}
            margin={{ top: 28, right: 20, left: 0, bottom: barData.length > 9 ? 100 : 65 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }}
              angle={barData.length > 9 ? -40 : -20} textAnchor="end"
              height={barData.length > 9 ? 100 : 65} interval={0} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
              formatter={v => [v.toLocaleString(), 'จำนวนคดี']} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}
              cursor={!isLevel2 ? 'pointer' : 'default'}
              onClick={!isLevel2 ? d => d?.name && setSelectedBkn(d.name) : undefined}
              name="จำนวนคดี">
              <LabelList dataKey="count" position="top"
                style={{ fontSize: 11, fontWeight: 700, fill: '#334155' }} />
              {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* ── TREND (3/5) + BEHAVIOR DONUT (2/5) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

        {/* Trend Area */}
        <div className="xl:col-span-3">
          <Panel accent="from-cyan-400 to-blue-500">
            <h3 className="text-base font-semibold text-slate-800 mb-0.5">แนวโน้มรายเดือน</h3>
            <p className="text-xs text-slate-400 mb-4">
              {trendData.length > 0 ? `${trendData.length} เดือน` : 'ไม่มีข้อมูลวันที่'}
              {selectedBkn ? ` · ${selectedBkn}` : ' · ทุก บก.น.'}
              {yearFilter !== 'all' ? ` · พ.ศ. ${yearFilter}` : ''}
            </p>
            {trendData.length > 1 ? (
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 55 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }}
                    angle={-40} textAnchor="end" height={65}
                    interval={Math.max(0, Math.floor(trendData.length / 12) - 1)} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
                    formatter={v => [v.toLocaleString(), 'จำนวนคดี']} />
                  <Area type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={2.5}
                    fill="url(#areaGrad)" dot={false} activeDot={{ r: 5, fill: '#3B82F6' }} name="จำนวนคดี" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
                ไม่มีข้อมูลวันที่ในชุดข้อมูลนี้
              </div>
            )}
          </Panel>
        </div>

        {/* Behavior Donut */}
        <div className="xl:col-span-2">
          <Panel accent="from-blue-500 via-indigo-500 to-violet-500">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-800">สัดส่วนพฤติการณ์</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedBkn || 'ทุก บก.น.'}</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-extrabold text-slate-800 tabular-nums leading-none">
                  {behaviorTotal.toLocaleString()}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">เรื่องรวม</div>
              </div>
            </div>
            {behaviorData.length > 0 ? (
              <>
                <div className="relative" onClick={() => setActivePieIdx(null)}>
                  <ResponsiveContainer width="100%" height={195}>
                    <PieChart>
                      <Pie data={behaviorData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" innerRadius={52} outerRadius={90}
                        paddingAngle={2} strokeWidth={0}
                        activeIndex={activePieIdx} activeShape={renderActiveShape}
                        onClick={(_, i, e) => { e.stopPropagation(); setActivePieIdx(p => p === i ? null : i) }}
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                          if (percent < 0.05 || index === activePieIdx) return null
                          const R = Math.PI / 180
                          const r = innerRadius + (outerRadius - innerRadius) * 0.55
                          return (
                            <text
                              x={cx + r * Math.cos(-midAngle * R)}
                              y={cy + r * Math.sin(-midAngle * R)}
                              fill="white" textAnchor="middle" dominantBaseline="central"
                              style={{ fontSize: 12, fontWeight: 800, pointerEvents: 'none' }}>
                              {(percent * 100).toFixed(0)}%
                            </text>
                          )
                        }}
                      >
                        {behaviorData.map((d, i) => (
                          <Cell key={i} fill={d.color}
                            style={{ opacity: activePieIdx === null || activePieIdx === i ? 1 : 0.25, cursor: 'pointer', transition: 'opacity 0.2s' }} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-xl font-extrabold text-slate-800 tabular-nums">{behaviorTotal.toLocaleString()}</div>
                    <div className="text-xs text-slate-400 mt-1">รวม</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {behaviorData.map(d => (
                    <div key={d.name} className="flex items-center gap-2 p-2.5 rounded-xl"
                      style={{ background: d.color + '10', border: `1px solid ${d.color}20` }}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-slate-500">{d.name}</div>
                        <div className="text-base font-extrabold text-slate-800 tabular-nums leading-snug">
                          {d.value.toLocaleString()}
                        </div>
                      </div>
                      <span className="text-xs font-bold flex-shrink-0" style={{ color: d.color }}>
                        {behaviorTotal > 0 ? ((d.value / behaviorTotal) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-56 text-slate-400 text-sm">ไม่มีข้อมูล</div>
            )}
          </Panel>
        </div>
      </div>

      {/* ── DRUG BREAKDOWN + TOP 5 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Drug type bar */}
        <Panel accent="from-violet-500 to-pink-500">
          <h3 className="text-base font-semibold text-slate-800 mb-0.5">ชนิดยาเสพติด</h3>
          <p className="text-xs text-slate-400 mb-5">
            {drugData.length} อันดับแรก · {selectedBkn || 'ทุก บก.น.'}
          </p>
          {drugData.length > 0 ? (
            <div className="space-y-3.5">
              {drugData.map((d, i) => {
                const maxCount = drugData[0].count
                const barW = maxCount > 0 ? (d.count / maxCount) * 100 : 0
                const pct = filtered.length > 0 ? ((d.count / filtered.length) * 100).toFixed(1) : '0.0'
                return (
                  <div key={d.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: d.color }}>{i + 1}</span>
                        <span className="text-sm font-semibold text-slate-700">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{pct}%</span>
                        <span className="text-sm font-bold tabular-nums w-12 text-right"
                          style={{ color: d.color }}>{d.count.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full"
                        style={{ width: `${barW}%`, background: `linear-gradient(90deg, ${d.color}88, ${d.color})` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">ไม่มีข้อมูล</div>
          )}
        </Panel>

        {/* Top 5 ranking */}
        <Panel accent="from-amber-400 to-orange-500">
          <h3 className="text-base font-semibold text-slate-800 mb-0.5">
            5 อันดับ{isLevel2 ? 'สถานีตำรวจ' : 'กองบังคับการ'}ที่มีคดีสูงสุด
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            {isLevel2 ? `${selectedBkn} · เรียงตามจำนวนคดี` : 'กองบัญชาการตำรวจนครบาล · คลิกเพื่อดูรายละเอียด'}
          </p>
          <div className="space-y-2.5">
            {top5.length > 0 ? top5.map((d, i) => {
              const maxCount = top5[0].count || 1
              const barW = (d.count / maxCount) * 100
              const MEDAL = ['🥇', '🥈', '🥉', '', ''][i]
              return (
                <div key={d.name}
                  onClick={() => !isLevel2 && setSelectedBkn(d.name)}
                  className={`p-3 rounded-xl border transition ${
                    !isLevel2 ? 'hover:border-blue-200 hover:bg-blue-50/60 cursor-pointer' : 'bg-slate-50'
                  } border-slate-100`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      {MEDAL
                        ? <span className="text-lg leading-none">{MEDAL}</span>
                        : <span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">{i + 1}</span>
                      }
                      <span className="font-semibold text-slate-800 text-sm">{d.name}</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums px-2.5 py-0.5 rounded-full text-white"
                      style={{ background: d.color }}>
                      {d.count.toLocaleString()} เรื่อง
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${barW}%`, background: d.color }} />
                  </div>
                </div>
              )
            }) : (
              <div className="flex items-center justify-center h-48 text-slate-400 text-sm">ไม่มีข้อมูล</div>
            )}
          </div>
        </Panel>
      </div>

      {/* ── RPT 115-B ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600" />
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex flex-col items-center justify-center flex-shrink-0 border border-blue-100">
              <span className="text-blue-700 font-extrabold text-[11px] leading-none">115</span>
              <span className="text-blue-500 font-bold text-[9px] leading-none mt-0.5">B</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                ผลการดำเนินการตาม บก.น. จำแนกตามกลุ่ม 1–5
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">รายงาน RPT_115_B · ข้อมูลจากตาราง bkn_summary</p>
            </div>
          </div>
          <span className="px-3 py-1.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-xs font-bold flex-shrink-0">
            RPT 115_B
          </span>
        </div>
        <div className="p-6">
          <BknSummarySection selectedBkn={selectedBkn} onPeriodReady={setBannerPeriod} />
        </div>
      </div>

      {/* ── MAP ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-600" />
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <MapPin size={16} className="text-blue-600" /> แผนที่จุดเกิดเหตุ
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {mapPoints.length.toLocaleString()} จุดทั้งหมด · สีตาม บก.น.
              </p>
            </div>
            <div className="flex gap-2">
              {[['point', '● จุด'], ['heatmap', '🌡 Heatmap']].map(([m, l]) => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    viewMode === m ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setSelectedBkn(null)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                !selectedBkn ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}>ทั้งหมด</button>
            {BKN_ORDER.filter(b => b !== 'ไม่ระบุ').map(b => (
              <button key={b} onClick={() => setSelectedBkn(selectedBkn === b ? null : b)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition"
                style={{
                  background: selectedBkn === b ? BKN_COLORS[b] : BKN_COLORS[b] + '15',
                  borderColor: selectedBkn === b ? BKN_COLORS[b] : BKN_COLORS[b] + '50',
                  color: selectedBkn === b ? '#fff' : BKN_COLORS[b],
                  opacity: selectedBkn && selectedBkn !== b ? 0.45 : 1,
                  outline: selectedBkn === b ? `2px solid ${BKN_COLORS[b]}` : 'none',
                  outlineOffset: 2,
                }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: selectedBkn === b ? '#fff' : BKN_COLORS[b] }} />
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[500px]">
          <IncidentMap
            className="w-full h-full"
            points={mapPoints}
            getColor={getColor}
            renderPopup={p => (
              <div style={{ fontFamily: 'Sarabun, sans-serif', minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: BKN_COLORS[getBkn(p.police_station)] || '#475569', marginBottom: 6 }}>
                  {getBkn(p.police_station)}
                </div>
                {[['สน.', p.police_station], ['เขต', p.district], ['ยา', p.primary_drug], ['พฤติการณ์', p.behaviors]]
                  .filter(([, v]) => v).map(([l, v]) => (
                    <div key={l} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0' }}>
                      <span style={{ color: '#94a3b8', flexShrink: 0 }}>{l}</span>
                      <span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
                    </div>
                  ))}
              </div>
            )}
            tooltipText={p => `${getBkn(p.police_station)} · ${p.police_station || ''}`}
            viewMode={viewMode}
          />
        </div>
      </div>

      </PresentationSlides>

    </div>
    </>
  )
}

/* ─── SUB COMPONENTS ─── */

function Panel({ accent, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1.5 bg-gradient-to-r ${accent}`} />
      <div className="p-6">{children}</div>
    </div>
  )
}

function KpiCard({ icon, label, value, sub, bg, foot, smallValue }) {
  return (
    <div className={`rounded-2xl text-white overflow-hidden shadow-sm bg-gradient-to-br ${bg}`}>
      <div className="relative px-5 pt-5 pb-3 min-h-[118px]">
        <div className="absolute right-3 top-3 opacity-15 pointer-events-none"
          style={{ transform: 'scale(3.2)', transformOrigin: 'top right' }}>
          {icon}
        </div>
        <div className="relative z-10">
          <div className={`font-extrabold leading-tight mb-1.5 tabular-nums ${smallValue ? 'text-xl' : 'text-3xl'}`}>
            {value}
          </div>
          <div className="text-sm font-semibold opacity-95 leading-none">{label}</div>
          <div className="text-xs opacity-65 mt-1">{sub}</div>
        </div>
      </div>
      <div className="px-5 py-1.5 text-xs font-medium opacity-60" style={{ background: foot }}>
        drug_incidents
      </div>
    </div>
  )
}

function BknSummarySection({ selectedBkn, onPeriodReady }) {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [highlightBkn, setHighlightBkn] = useState(null)
  const [selectedPeriod, setSelectedPeriod] = useState(null)

  useEffect(() => {
    const go = async () => {
      setLoading(true)
      let q = supabase.from('bkn_summary').select('*').eq('report_id', '115_B')
      if (selectedBkn) q = q.eq('bkn', selectedBkn)
      const { data } = await q.limit(500)
      setRows(data || [])
      const ps = [...new Set((data || []).map(r => r.period).filter(Boolean))].sort()
      if (ps.length > 0) { setSelectedPeriod(ps[ps.length - 1]); onPeriodReady?.(ps[ps.length - 1]) }
      setLoading(false)
    }
    go()
  }, [selectedBkn])

  if (loading) return (
    <div className="flex items-center justify-center py-10 text-slate-400 text-sm">
      <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin mr-2" />
      กำลังโหลด...
    </div>
  )

  if (!rows || rows.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
      <div className="text-5xl mb-3 opacity-25">📋</div>
      <div className="text-sm font-semibold text-slate-500 mb-1">ยังไม่มีข้อมูล</div>
      <div className="text-xs text-slate-400 mb-5">กรุณาอัปโหลดไฟล์ 115_B ที่หน้า /upload</div>
      <a href="/upload"
        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition">
        ไปยังหน้าอัปโหลด
      </a>
    </div>
  )

  const isSpw = b => b?.includes('สปพ')
  const GROUP_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
  const GROUP_COLORS_RGB = ['59,130,246', '16,185,129', '245,158,11', '239,68,68', '139,92,246']

  // All distinct periods (for dropdown)
  const periods = [...new Set(rows.map(r => r.period).filter(Boolean))].sort()

  // Filter rows to selected period (or all if none selected)
  const filteredRows = selectedPeriod ? rows.filter(r => r.period === selectedPeriod) : rows

  // Latest uploaded_at / created_at across all rows (not filtered, to reflect most recent upload)
  const latestDate = rows.reduce((max, r) => {
    const d = r.uploaded_at || r.created_at || ''
    return d > max ? d : max
  }, '')

  // Aggregate totals per unit
  const unitMap = {}
  filteredRows.forEach(r => {
    if (!r.bkn) return
    if (!unitMap[r.bkn]) unitMap[r.bkn] = { total: 0, done: 0, pending: 0 }
    unitMap[r.bkn].total += r.total || 0
    unitMap[r.bkn].done += r.done || 0
    unitMap[r.bkn].pending += r.pending || 0
  })

  const bknEntries = Object.entries(unitMap)
    .filter(([b]) => !isSpw(b))
    .sort(([a], [b]) => (parseInt(a.replace(/\D+/g, '')) || 999) - (parseInt(b.replace(/\D+/g, '')) || 999))
  const spwEntries = Object.entries(unitMap).filter(([b]) => isSpw(b))

  const mkPct = v => v.total > 0 ? (v.done / v.total) * 100 : 0

  // KPI aggregates
  const bknTotals = bknEntries.reduce((acc, [, v]) => ({
    total: acc.total + v.total, done: acc.done + v.done, pending: acc.pending + v.pending,
  }), { total: 0, done: 0, pending: 0 })
  const bknPct = bknTotals.total > 0 ? ((bknTotals.done / bknTotals.total) * 100).toFixed(1) : '0.0'

  const spwTotals = spwEntries.reduce((acc, [, v]) => ({
    total: acc.total + v.total, done: acc.done + v.done, pending: acc.pending + v.pending,
  }), { total: 0, done: 0, pending: 0 })
  const spwPct = spwTotals.total > 0 ? ((spwTotals.done / spwTotals.total) * 100).toFixed(1) : '0.0'

  // Bar chart data sorted by %done desc, SPW appended at end
  const bknBarData = [...bknEntries]
    .sort(([, a], [, b]) => mkPct(b) - mkPct(a))
    .map(([bkn, v]) => ({
      name: bkn, done: v.done, pending: v.pending,
      pctDone: v.total > 0 ? ((v.done / v.total) * 100).toFixed(0) : '0',
    }))
  const spwBarData = spwEntries.map(([bkn, v]) => ({
    name: bkn, done: v.done, pending: v.pending,
    pctDone: v.total > 0 ? ((v.done / v.total) * 100).toFixed(0) : '0',
    isSPW: true,
  }))
  const chartData = [...bknBarData, ...spwBarData]

  // Pivot: pivot[bkn][group] = { total, done, pending }
  const pivot = {}
  const allGroups = new Set()
  filteredRows.forEach(r => {
    if (!r.bkn || !r.group_no) return
    const g = String(r.group_no)
    if (!pivot[r.bkn]) pivot[r.bkn] = {}
    if (!pivot[r.bkn][g]) pivot[r.bkn][g] = { total: 0, done: 0, pending: 0 }
    pivot[r.bkn][g].total += r.total || 0
    pivot[r.bkn][g].done += r.done || 0
    pivot[r.bkn][g].pending += r.pending || 0
    allGroups.add(g)
  })
  const groups = Array.from(allGroups).sort((a, b) => Number(a) - Number(b))
  const maxByGroup = {}
  groups.forEach(g => {
    maxByGroup[g] = Math.max(...Object.values(pivot).map(u => u[g]?.total || 0), 1)
  })

  // Highlights from บก.น. entries only
  const topPct = [...bknEntries].sort(([, a], [, b]) => mkPct(b) - mkPct(a))[0]
  const mostPending = [...bknEntries].sort(([, a], [, b]) => b.pending - a.pending)[0]
  const allUnits = [...bknEntries.map(([b]) => b), ...spwEntries.map(([b]) => b)]

  return (
    <div style={{ fontFamily: 'Sarabun, sans-serif' }} className="space-y-7">

      {/* Period badge */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 tracking-wide">RPT 115_B</span>
        {selectedPeriod && (
          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600">
            ช่วง {selectedPeriod}
          </span>
        )}
      </div>

      {/* ─── 1. KPI CARDS ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br from-blue-700 to-blue-500 text-white">
          <div className="px-5 pt-5 pb-4">
            <div className="text-3xl font-extrabold tabular-nums mb-1">{bknTotals.total.toLocaleString()}</div>
            <div className="text-sm font-semibold opacity-90">คดีรวม บก.น.1–9</div>
            <div className="text-xs opacity-65 mt-1">เรื่องทั้งหมด</div>
          </div>
          <div className="px-5 py-2 bg-blue-800/30 text-xs font-medium opacity-80">115_B · บก.น.1–9</div>
        </div>
        <div className="rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br from-emerald-600 to-green-500 text-white">
          <div className="px-5 pt-5 pb-4">
            <div className="text-3xl font-extrabold tabular-nums mb-1">{bknTotals.done.toLocaleString()}</div>
            <div className="text-sm font-semibold opacity-90">ดำเนินการแล้ว</div>
            <div className="text-xs opacity-65 mt-1">{bknPct}% ของคดีทั้งหมด</div>
          </div>
          <div className="px-5 py-2 bg-emerald-800/30 text-xs font-medium opacity-80">เสร็จสิ้น</div>
        </div>
        <div className="rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br from-red-600 to-rose-500 text-white">
          <div className="px-5 pt-5 pb-4">
            <div className="text-3xl font-extrabold tabular-nums mb-1">{bknTotals.pending.toLocaleString()}</div>
            <div className="text-sm font-semibold opacity-90">ค้างดำเนินการ</div>
            <div className="text-xs opacity-65 mt-1">{(100 - parseFloat(bknPct)).toFixed(1)}% ของคดีทั้งหมด</div>
          </div>
          <div className="px-5 py-2 bg-red-800/30 text-xs font-medium opacity-80">คดีค้าง</div>
        </div>
        {spwEntries.length > 0 ? (
          <div className="rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br from-violet-700 to-purple-600 text-white">
            <div className="px-5 pt-5 pb-4">
              <div className="text-3xl font-extrabold tabular-nums mb-1">{spwTotals.total.toLocaleString()}</div>
              <div className="text-sm font-semibold opacity-90">{spwEntries[0][0]}</div>
              <div className="text-xs opacity-65 mt-1">เสร็จ {spwTotals.done.toLocaleString()} · ค้าง {spwTotals.pending.toLocaleString()} ({spwPct}%)</div>
            </div>
            <div className="px-5 py-2 bg-violet-900/30 text-xs font-medium opacity-80">บก.สปพ.(191)</div>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br from-slate-400 to-slate-500 text-white">
            <div className="px-5 pt-5 pb-4">
              <div className="text-3xl font-extrabold tabular-nums mb-1">—</div>
              <div className="text-sm font-semibold opacity-90">บก.สปพ.(191)</div>
              <div className="text-xs opacity-65 mt-1">ไม่มีข้อมูล</div>
            </div>
            <div className="px-5 py-2 bg-slate-700/30 text-xs font-medium opacity-80">บก.สปพ.(191)</div>
          </div>
        )}
      </div>

      {/* ─── 2. STACKED BAR CHART ─── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-red-500" />
        <div className="p-5">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">ผลการดำเนินการ — เรียงตาม %เสร็จ (สูง→ต่ำ)</h4>
              <p className="text-xs text-slate-400 mt-0.5">บก.สปพ. แยกท้ายกราฟ · ตัวเลขด้านบนแท่ง = %เสร็จ</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-emerald-500" />เสร็จ</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-red-400" />ค้าง</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-indigo-400" />สปพ.เสร็จ</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-amber-400" />สปพ.ค้าง</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 28, right: 20, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }}
                angle={-35} textAnchor="end" height={65} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
                formatter={(v, name) => [v.toLocaleString(), name === 'done' ? 'เสร็จ' : 'ค้าง']} />
              <Bar dataKey="done" stackId="a" name="done">
                {chartData.map((d, i) => <Cell key={i} fill={d.isSPW ? '#6366f1' : '#10b981'} />)}
              </Bar>
              <Bar dataKey="pending" stackId="a" name="pending" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="pctDone" position="top"
                  style={{ fontSize: 10, fontWeight: 700, fill: '#334155' }}
                  formatter={v => `${v}%`} />
                {chartData.map((d, i) => <Cell key={i} fill={d.isSPW ? '#f59e0b' : '#f87171'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── 3. PIVOT GROUP TABLE ─── */}
      {groups.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-blue-500 to-violet-500" />
          <div className="p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
              <div>
                <h4 className="text-sm font-bold text-slate-800">ตารางแยกตามกลุ่ม</h4>
                {latestDate && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    ข้อมูลอัปเดตล่าสุด: <span className="font-semibold text-slate-600">{formatThaiDateLong(latestDate)}</span>
                  </p>
                )}
              </div>
              {periods.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">ช่วงเวลา:</span>
                  <select
                    value={selectedPeriod || ''}
                    onChange={e => { setSelectedPeriod(e.target.value); onPeriodReady?.(e.target.value) }}
                    className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer shadow-sm hover:border-blue-300 transition-colors"
                  >
                    {periods.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mb-4 flex-wrap">
              <span className="font-semibold text-slate-600">แต่ละช่อง:</span>
              <span className="font-bold text-slate-700">รวม</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block flex-shrink-0" />
                <span className="text-emerald-600 font-medium">เสร็จ</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block flex-shrink-0" />
                <span className="text-red-500 font-medium">ค้าง</span>
              </span>
              <span className="text-slate-200">·</span>
              <span>คลิกแถวเพื่อ highlight</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="py-3 px-3 text-left text-slate-500 font-semibold bg-slate-50 sticky left-0 z-10 min-w-[110px] border-b border-slate-200 text-xs">
                      หน่วยงาน
                    </th>
                    {groups.map((g, gi) => (
                      <th key={g} className="py-3 px-3 text-center font-bold text-white min-w-[100px] border-b"
                        style={{ background: GROUP_COLORS[gi % GROUP_COLORS.length], borderColor: GROUP_COLORS[gi % GROUP_COLORS.length] }}>
                        <div className="text-xs opacity-75 font-medium leading-none mb-0.5">กลุ่ม</div>
                        <div className="text-sm font-extrabold leading-none">{g}</div>
                      </th>
                    ))}
                    <th className="py-3 px-3 text-center font-semibold text-slate-600 bg-slate-100 min-w-[100px] border-b border-slate-200 text-xs">
                      รวมทุกกลุ่ม
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allUnits.map((bkn, ri) => {
                    const u = unitMap[bkn] || { total: 0, done: 0, pending: 0 }
                    const isSPWRow = isSpw(bkn)
                    const isHL = highlightBkn === bkn
                    const evenBg = isSPWRow ? '#f5f3ff' : ri % 2 === 0 ? '#ffffff' : '#f8fafc'
                    const hlBg = isSPWRow ? '#ede9fe' : '#eff6ff'
                    const rowBg = isHL ? hlBg : evenBg
                    return (
                      <tr key={bkn}
                        onClick={() => setHighlightBkn(h => h === bkn ? null : bkn)}
                        className={`cursor-pointer transition-colors hover:brightness-95 ${isSPWRow ? 'border-t-[3px] border-violet-400' : ''}`}
                        style={{ background: rowBg }}>
                        <td className="py-3 px-3 font-bold sticky left-0 z-10"
                          style={{ color: BKN_COLORS[bkn] || (isSPWRow ? '#7c3aed' : '#64748b'), background: rowBg }}>
                          <div className="whitespace-nowrap">{bkn}</div>
                          {isSPWRow && (
                            <span className="text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-bold tracking-wide mt-0.5 inline-block border border-violet-200">
                              หน่วยพิเศษ
                            </span>
                          )}
                        </td>
                        {groups.map((g, gi) => {
                          const cell = pivot[bkn]?.[g] || { total: 0, done: 0, pending: 0 }
                          const opacity = maxByGroup[g] > 0 ? 0.08 + (cell.total / maxByGroup[g]) * 0.27 : 0
                          return (
                            <td key={g} className="py-3 px-3 text-center"
                              style={{ background: `rgba(${GROUP_COLORS_RGB[gi % 5]},${opacity.toFixed(3)})` }}>
                              <div className="font-bold text-slate-800 text-sm tabular-nums">{cell.total.toLocaleString()}</div>
                              <div className="flex items-center justify-center gap-2 mt-1">
                                <span className="flex items-center gap-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                                  <span className="text-emerald-600 text-xs tabular-nums">{cell.done.toLocaleString()}</span>
                                </span>
                                <span className="flex items-center gap-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                                  <span className="text-red-500 text-xs tabular-nums">{cell.pending.toLocaleString()}</span>
                                </span>
                              </div>
                            </td>
                          )
                        })}
                        <td className="py-3 px-3 text-center bg-slate-100 border-l-2 border-slate-300">
                          <div className="font-bold text-slate-800 text-sm tabular-nums">{u.total.toLocaleString()}</div>
                          <div className="flex items-center justify-center gap-2 mt-1">
                            <span className="flex items-center gap-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                              <span className="text-emerald-600 text-xs tabular-nums">{u.done.toLocaleString()}</span>
                            </span>
                            <span className="flex items-center gap-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                              <span className="text-red-500 text-xs tabular-nums">{u.pending.toLocaleString()}</span>
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── 4. HIGHLIGHTS PANEL ─── */}
      {bknEntries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {topPct && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-3">ดำเนินการได้สูงสุด</div>
              <div className="text-xl font-extrabold text-emerald-800 mb-1">{topPct[0]}</div>
              <div className="text-5xl font-black text-emerald-500 tabular-nums leading-none mb-2">
                {mkPct(topPct[1]).toFixed(1)}%
              </div>
              <div className="text-xs text-emerald-700">
                เสร็จ {topPct[1].done.toLocaleString()} จาก {topPct[1].total.toLocaleString()} เรื่อง
              </div>
            </div>
          )}
          {mostPending && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="text-xs font-bold text-red-500 uppercase tracking-wider mb-3">ค้างดำเนินการมากสุด</div>
              <div className="text-xl font-extrabold text-red-800 mb-1">{mostPending[0]}</div>
              <div className="text-5xl font-black text-red-400 tabular-nums leading-none mb-2">
                {mostPending[1].pending.toLocaleString()}
              </div>
              <div className="text-xs text-red-600">
                เรื่องค้าง จาก {mostPending[1].total.toLocaleString()} คดีรวม · {mkPct(mostPending[1]).toFixed(1)}% เสร็จ
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
