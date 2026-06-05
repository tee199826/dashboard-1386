import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LabelList,
} from 'recharts'
import {
  TrendingUp, RefreshCw, ChevronLeft, MapPin, Users, AlertTriangle,
  Activity, BarChart2, Calendar,
} from 'lucide-react'
import IncidentMap from '../components/IncidentMap'
import { getBkn, getStations, BKN_ORDER, BKN_COLORS } from '../utils/bknMapping'
import { BEHAVIOR_COLORS, MONTH_TH_SHORT } from '../utils/constants'
import { fetchAllPages } from '../utils/supabasePagination'
import { formatThaiDateShort as formatThaiDate } from '../utils/formatDate'
import { usePresentation } from '../context/PresentationContext'
import PresentationBar, { PresentationEnterButton } from '../components/PresentationBar'
import PresentationSlides from '../components/PresentationSlides'
import BknSummarySection from '../components/BknSummarySection'
import BknDrugStats from '../components/BknDrugStats'

const DRUG_PALETTE = {
  'ยาบ้า': '#EF4444', 'ไอซ์': '#0EA5E9', 'กัญชา': '#22C55E',
  'ยาอี': '#A855F7', 'คีตามีน': '#10B981', 'โคเคน': '#6366F1',
  'เฮโรอีน': '#7C3AED', 'กระท่อม': '#65A30D', 'สี่คูณร้อย': '#D97706',
  'สารระเหย': '#0891B2', 'มอร์ฟีน': '#9F1239', 'แฮปปี้วอเตอร์': '#EC4899',
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
    try {
      const all = await fetchAllPages('drug_incidents', '*')
      setIncidents(all)
    } catch {
      setLoadError('ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือลองใหม่')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('upload_batches')
      .select('uploaded_at')
      .eq('target_table', 'bkn_summary')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setLastUpload115B(data?.[0]?.uploaded_at ?? null))
  }, [])

  // ── bkn_summary aggregate สำหรับ KPI cards หลักและกราฟ Level-1 ────────────
  const [bknStats, setBknStats] = useState(null)
  const [bknStatsLoading, setBknStatsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('bkn_summary')
        .select('bkn,total,done,pending,period')
        .eq('report_id', '115_B')
        .limit(500)
      if (!data || data.length === 0) { setBknStatsLoading(false); return }
      const periods = [...new Set(data.map(r => r.period).filter(Boolean))].sort()
      const latestPeriod = periods[periods.length - 1]
      const rows = latestPeriod ? data.filter(r => r.period === latestPeriod) : data
      const isSpwBkn = b => b?.includes('สปพ')
      const map = {}
      rows.forEach(r => {
        if (!r.bkn) return
        if (!map[r.bkn]) map[r.bkn] = { total: 0, done: 0, pending: 0 }
        map[r.bkn].total += r.total || 0
        map[r.bkn].done  += r.done  || 0
        map[r.bkn].pending += r.pending || 0
      })
      const bknList = Object.entries(map).filter(([b]) => !isSpwBkn(b))
      const spwList = Object.entries(map).filter(([b]) =>  isSpwBkn(b))
      const sumBkn = bknList.reduce((a, [, v]) => ({ total: a.total+v.total, done: a.done+v.done, pending: a.pending+v.pending }), { total:0, done:0, pending:0 })
      const sumSpw = spwList.reduce((a, [, v]) => ({ total: a.total+v.total, done: a.done+v.done, pending: a.pending+v.pending }), { total:0, done:0, pending:0 })
      setBknStats({
        ...sumBkn,
        pctDone: sumBkn.total > 0 ? ((sumBkn.done / sumBkn.total) * 100).toFixed(1) : '0.0',
        spwName: spwList[0]?.[0] || null,
        spw: sumSpw,
        period: latestPeriod,
        byBkn: bknList.map(([name, v]) => ({
          name, done: v.done, pending: v.pending, total: v.total,
          color: BKN_COLORS[name] || '#94a3b8',
          pctDone: v.total > 0 ? ((v.done / v.total) * 100).toFixed(0) : '0',
        })).sort((a, b) => (parseInt(a.name.replace(/\D+/g,'')) || 999) - (parseInt(b.name.replace(/\D+/g,'')) || 999)),
      })
      setBknStatsLoading(false)
    }
    load()
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
        return { key, label: `${MONTH_TH_SHORT[parseInt(m)]}${ty}`, count }
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
    <div className={isPresentation ? '' : 'p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto'} style={{ fontFamily: 'Sarabun, sans-serif' }}>

      {/* ── OFFICIAL BANNER ── */}
      {!isPresentation && <div className="rounded-2xl overflow-hidden shadow-md" style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#1d4ed8 100%)' }}>
        <div className="px-6 py-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold text-blue-300 uppercase tracking-widest mb-3">
              กองบัญชาการตำรวจนครบาล · รายงานทางการ
            </p>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white leading-snug">
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

      <PresentationSlides isPresentation={isPresentation} normalClassName="max-w-[1600px] mx-auto space-y-8">

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
              : 'กองบัญชาการตำรวจนครบาล · บก.น.1–9 · RPT_115_B'}
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
          {/* 115_B badge — ใช้ bannerPeriod (จาก bkn_summary จริง) เป็นตัวชี้ว่ามีข้อมูล */}
          {!isPresentation && !bannerPeriod && lastUpload115B === null && (
            <span className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-400 border border-slate-200 whitespace-nowrap">
              115_B: ยังไม่มีข้อมูล
            </span>
          )}
          {!isPresentation && bannerPeriod && lastUpload115B === null && (
            <span className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">
              115_B · {bannerPeriod}
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

      {/* ── KPI STRIP: จาก bkn_summary (RPT_115_B) ── */}
      {bknStatsLoading ? (
        <div className="h-24 flex items-center justify-center text-slate-400 text-sm">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mr-2" />
          กำลังโหลดข้อมูล 115_B...
        </div>
      ) : bknStats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={<BarChart2 size={20} />}
            label="เรื่องร้องเรียนรวม" sub="บก.น.1–9 · ไม่รวม สปพ."
            value={bknStats.total.toLocaleString()}
            bg="from-blue-700 to-blue-600" foot="#1D4ED8" source="RPT_115_B" />
          <KpiCard icon={<Activity size={20} />}
            label="ดำเนินการแล้ว" sub={`${bknStats.pctDone}% ของทั้งหมด`}
            value={bknStats.done.toLocaleString()}
            bg="from-emerald-600 to-green-500" foot="#047857" source="RPT_115_B" />
          <KpiCard icon={<AlertTriangle size={20} />}
            label="ยังไม่ได้รับผล" sub={`${bknStats.total > 0 ? ((bknStats.pending / bknStats.total) * 100).toFixed(1) : '0.0'}% ของทั้งหมด`}
            value={bknStats.pending.toLocaleString()}
            bg="from-red-600 to-rose-500" foot="#B91C1C" source="RPT_115_B" />
          {bknStats.spwName ? (
            <KpiCard icon={<Users size={20} />}
              label={bknStats.spwName} sub={`เสร็จ ${bknStats.spw.done.toLocaleString()} · ค้าง ${bknStats.spw.pending.toLocaleString()}`}
              value={bknStats.spw.total.toLocaleString()}
              bg="from-violet-700 to-purple-600" foot="#5B21B6" source="RPT_115_B" />
          ) : (
            <KpiCard icon={<Users size={20} />}
              label="บก.สปพ.(191)" sub="ไม่มีข้อมูลในชุดนี้"
              value="—"
              bg="from-slate-400 to-slate-500" foot="#475569" source="RPT_115_B" />
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-800">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
          ยังไม่มีข้อมูล RPT_115_B — กรุณาอัปโหลดไฟล์ที่หน้า /upload
        </div>
      )}
      </div>{/* end header+KPI group */}

      {/* ── BAR CHART: Level-1 จาก bkn_summary / Level-2 จาก drug_incidents ── */}
      <Panel accent="from-blue-500 to-indigo-600">
        <div className="flex items-start justify-between mb-1 flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {isLevel2 ? `เปรียบเทียบสถานีตำรวจใน ${selectedBkn}` : 'ผลการดำเนินการแยกตาม บก.น.'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isLevel2
                ? `${getStations(selectedBkn).length} สถานีตำรวจ · จาก drug_incidents`
                : `จาก RPT_115_B${bknStats?.period ? ` · ${bknStats.period}` : ''} · คลิกแท่งเพื่อดูรายละเอียด`}
            </p>
          </div>
          <span className="text-sm font-semibold text-slate-500">
            รวม {isLevel2 ? totals.total.toLocaleString() : (bknStats?.total || 0).toLocaleString()} เรื่อง
          </span>
        </div>
        {isLevel2 ? (
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
              <Bar dataKey="count" radius={[6, 6, 0, 0]} name="จำนวนคดี">
                <LabelList dataKey="count" position="top"
                  style={{ fontSize: 11, fontWeight: 700, fill: '#334155' }} />
                {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={bknStats?.byBkn || []}
              margin={{ top: 28, right: 20, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }}
                angle={-20} textAnchor="end" height={60} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
                formatter={(v, name) => [v.toLocaleString(), name === 'done' ? 'เสร็จ' : 'ค้าง']} />
              <Bar dataKey="done" stackId="a" name="เสร็จ" cursor="pointer"
                onClick={d => d?.name && setSelectedBkn(d.name)}>
                {(bknStats?.byBkn || []).map((d, i) => <Cell key={i} fill={BKN_COLORS[d.name] || '#10b981'} />)}
              </Bar>
              <Bar dataKey="pending" stackId="a" name="ค้าง" radius={[4, 4, 0, 0]} cursor="pointer"
                onClick={d => d?.name && setSelectedBkn(d.name)}>
                <LabelList dataKey="pctDone" position="top"
                  style={{ fontSize: 10, fontWeight: 700, fill: '#334155' }}
                  formatter={v => `${v}%`} />
                {(bknStats?.byBkn || []).map((d, i) => <Cell key={i} fill="#f87171" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <BknDrugStats
        incidentCount={incidents.length}
        yearFilter={yearFilter}
        selectedBkn={selectedBkn}
        setSelectedBkn={setSelectedBkn}
        isLevel2={isLevel2}
        trendData={trendData}
        behaviorData={behaviorData}
        behaviorTotal={behaviorTotal}
        drugData={drugData}
        filteredCount={filtered.length}
        top5={top5}
        activePieIdx={activePieIdx}
        setActivePieIdx={setActivePieIdx}
      />



      {/* ── RPT 115-B ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
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
      <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
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
    <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
      <div className={`h-1.5 bg-gradient-to-r ${accent}`} />
      <div className="p-8">{children}</div>
    </div>
  )
}

function KpiCard({ icon, label, value, sub, bg, foot, smallValue, source = 'drug_incidents' }) {
  return (
    <div className={`rounded-2xl text-white overflow-hidden shadow-sm bg-gradient-to-br ${bg}`}>
      <div className="relative px-5 pt-5 pb-3 min-h-[118px]">
        <div className="absolute right-3 top-3 opacity-15 pointer-events-none"
          style={{ transform: 'scale(3.2)', transformOrigin: 'top right' }}>
          {icon}
        </div>
        <div className="relative z-10">
          <div className={`font-extrabold leading-tight mb-1.5 tabular-nums ${smallValue ? 'text-xl' : 'text-4xl'}`}>
            {value}
          </div>
          <div className="text-sm font-semibold opacity-95 leading-none">{label}</div>
          <div className="text-xs opacity-65 mt-1">{sub}</div>
        </div>
      </div>
      <div className="px-5 py-1.5 text-xs font-medium opacity-60" style={{ background: foot }}>
        {source}
      </div>
    </div>
  )
}
