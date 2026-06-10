import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { supabase } from '../lib/supabase'
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { AlertCircle, CheckCircle2, Search as SearchIcon, XCircle, FileQuestion, X, Upload, AlertTriangle } from 'lucide-react'
import Toast from '../components/Toast'
import Rpt114Dashboard from '../components/Rpt114Dashboard'
import { usePresentation } from '../context/PresentationContext'
import PresentationBar, { PresentationEnterButton } from '../components/PresentationBar'
import PresentationSlides from '../components/PresentationSlides'
import { thaiDateRange } from '../utils/formatDate'
import PeriodBadge from '../components/PeriodBadge'
import UploadRptModal from '../components/UploadRptModal'
import { BigCard, SourceCard, KpiToggleCard } from '../components/OperationsCards'
import OperationsSourceModal from '../components/OperationsSourceModal'
import { THAI_MONTHS } from '../utils/constants'

// ─── constants ───────────────────────────────────────────────────────────────

const CHANNELS = ['อินเตอร์เน็ต', 'สายด่วน 1386', 'ทางรัฐ', 'อื่นๆ']
const CHANNEL_DISPLAY = {
  'อินเตอร์เน็ต':  'อินเตอร์เน็ต',
  'สายด่วน 1386':  'สายด่วน 1386',
  'ทางรัฐ':        'ทางรัฐ',
  'อื่นๆ':         'ช่องทางอื่นๆ',
}
const CATEGORIES = ['จับกุม', 'บำบัด', 'กลั่นแกล้ง', 'อื่นๆ']
const CATEGORY_COLORS = {
  'จับกุม':    '#EF4444',
  'บำบัด':     '#F59E0B',
  'กลั่นแกล้ง': '#991B1B',
  'อื่นๆ':     '#94A3B8',
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function percent(num, total) {
  if (!total) return '0%'
  return ((num / total) * 100).toFixed(1) + '%'
}

function recordToCategory(r) {
  if (r.actionUnit) {
    const a = String(r.actionUnit).trim()
    if (a === 'ดำเนินการเอง') return 'จับกุม'
  }
  if (r.drug) {
    const d = String(r.drug).toLowerCase()
    if (d.includes('จับกุม') || d.includes('ผู้ค้า')) return 'จับกุม'
    if (d.includes('บำบัด') || d.includes('ผู้เสพ')) return 'บำบัด'
    if (d.includes('กลั่นแกล้ง')) return 'กลั่นแกล้ง'
  }
  return 'อื่นๆ'
}

// ─── component ───────────────────────────────────────────────────────────────

export default function Operations() {
  const { isAdmin } = useAuth()
  const { records, isLoading } = useData()
  const { isPresentation } = usePresentation()

  const [rptData, setRptData] = useState(null)
  const [rptLoading, setRptLoading] = useState(true)
  const [rptError, setRptError] = useState(null)
  const [rptYear, setRptYear] = useState('all')   // ฝั่งขวา (RPT_114) – 'all' = ทุกปีสะสม
  const [rptAllYears, setRptAllYears] = useState([])

  const [filterYear, setFilterYear] = useState('all')
  const [filterMonth, setFilterMonth] = useState('all')
  const [showUpload, setShowUpload] = useState(false)
  const [showSourceInfo, setShowSourceInfo] = useState(false)
  const [kpiExpanded, setKpiExpanded] = useState(false)   // KPI strip: 5 ใบหลัก + expand อีก 2
  const [toast, setToast] = useState(null)
  const showToast = (message, type = 'success') => setToast({ message, type })
  const [activeDonutIndex, setActiveDonutIndex] = useState(null)

  // ── data loading ────────────────────────────────────────────────────────────

  const loadRpt = async (silent = false, year = rptYear) => {
    if (!silent) { setRptLoading(true); setRptError(null) }
    try {
      if (year === 'no_date') {
        setRptData(null)
        return
      }
      let query = supabase
        .from('report_114')
        .select('complaints,processed,found,not_found,not_in_area,investigating,deceased,arrested,more_invest,rehab,framed,closed,action_other,fiscal_year')
        .is('group_no', null)

      if (year !== 'all') query = query.eq('fiscal_year', parseInt(year))

      const { data } = await query

      if (data && data.length > 0) {
        const sum = key => data.reduce((s, r) => s + Number(r[key] ?? 0), 0)
        const fys = [...new Set(data.map(r => r.fiscal_year))].filter(Boolean).sort((a, b) => a - b)
        const period = fys.length <= 1
          ? `ปีงบ ${fys[0] ?? ''}`
          : `ปีงบ ${fys[0]}–${fys[fys.length - 1]} (สะสม)`

        setRptData({
          'รวมทั้งหมด':        sum('complaints'),
          'ดำเนินการแล้ว':     sum('processed'),
          'พบพฤติการณ์':       sum('found'),
          'ไม่พบพฤติการณ์':    sum('not_found'),
          'ไม่พบตัวในพื้นที่':  sum('not_in_area'),
          'อยู่ระหว่างสืบสวน': sum('investigating'),
          'เสียชีวิต':          sum('deceased'),
          'จับกุม':            sum('arrested'),
          'สืบสวนเพิ่มเติม':   sum('more_invest'),
          'บำบัด':             sum('rehab'),
          'กลั่นแกล้ง':        sum('framed'),
          'ยุติเรื่อง':        sum('closed'),
          'อื่นๆ':             sum('action_other'),
          period,
        })
      } else {
        setRptData(null)
      }
    } catch (err) {
      setRptError(err?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      if (!silent) setRptLoading(false)
    }
  }

  // โหลดรายการปีงบที่มีในตาราง (ครั้งเดียว) สำหรับ dropdown ฝั่งขวา
  const loadRptYears = async () => {
    try {
      const { data } = await supabase
        .from('report_114')
        .select('fiscal_year')
        .is('group_no', null)
      if (data) {
        const ys = [...new Set(data.map(r => r.fiscal_year))].filter(Boolean).sort((a, b) => b - a)
        setRptAllYears(ys)
      }
    } catch { /* non-fatal */ }
  }

  useEffect(() => { loadRptYears() }, [])
  // โหลด/รีโหลดข้อมูลฝั่งขวาเมื่อปีเปลี่ยน (รวมครั้งแรกตอน mount ด้วย)
  useEffect(() => { loadRpt(false, rptYear) }, [rptYear])

  // ── derived data ────────────────────────────────────────────────────────────

  const availableYears = useMemo(() => {
    const s = new Set()
    records.forEach(r => { if (r.date) s.add(parseInt(r.date.slice(0, 4)) + 543) })
    return Array.from(s).sort()
  }, [records])

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (rptYear === 'no_date') {
        if (r.date) return false   // เลือกเฉพาะที่ไม่มีวันที่
      } else if (rptYear !== 'all') {
        if (!r.date) return false
        const y = parseInt(r.date.slice(0, 4)) + 543
        if (y !== parseInt(rptYear)) return false
      }
      if (!r.date) return filterYear === 'all' || rptYear === 'no_date'
      const y = parseInt(r.date.slice(0, 4)) + 543
      const m = parseInt(r.date.slice(5, 7))
      if (filterYear !== 'all' && y !== parseInt(filterYear)) return false
      if (filterMonth !== 'all' && m !== parseInt(filterMonth)) return false
      return true
    })
  }, [records, filterYear, filterMonth, rptYear])

  // period ของข้อมูล complaints ที่ filter แล้ว (SourceCard ฝั่งซ้าย)
  const recordsPeriod = useMemo(
    () => thaiDateRange(filteredRecords, 'date',
      { unfiltered: filterYear === 'all' && filterMonth === 'all' && rptYear === 'all' }),
    [filteredRecords, filterYear, filterMonth, rptYear])

  const summary = useMemo(() => {
    const byChannel = {}
    CHANNELS.forEach(ch => {
      byChannel[ch] = { จับกุม: 0, บำบัด: 0, กลั่นแกล้ง: 0, 'อื่นๆ': 0, total: 0 }
    })
    let totalAll = 0
    filteredRecords.forEach(r => {
      totalAll++
      const rawCh = r.channel
      const ch = CHANNELS.includes(rawCh) ? rawCh : (rawCh ? 'อื่นๆ' : null)
      const cat = recordToCategory(r)
      if (ch && byChannel[ch]) {
        byChannel[ch][cat]++
        byChannel[ch].total++
      }
    })
    return { byChannel, totalAll }
  }, [filteredRecords])

  const ranking = useMemo(() => {
    return CHANNELS.map(ch => ({
      channel: ch,
      display: CHANNEL_DISPLAY[ch],
      total: summary.byChannel[ch]?.total || 0
    })).sort((a, b) => b.total - a.total)
  }, [summary])

  const donutData = useMemo(() => {
    if (rptData) {
      return [
        { name: 'พบพฤติการณ์',       value: rptData['พบพฤติการณ์'] || 0,       color: '#EF4444' },
        { name: 'ไม่พบพฤติการณ์',    value: rptData['ไม่พบพฤติการณ์'] || 0,    color: '#94A3B8' },
        { name: 'ไม่พบตัวในพื้นที่',  value: rptData['ไม่พบตัวในพื้นที่'] || 0,  color: '#0EA5E9' },
        { name: 'อยู่ระหว่างสืบสวน', value: rptData['อยู่ระหว่างสืบสวน'] || 0, color: '#F59E0B' },
        { name: 'เสียชีวิต',          value: rptData['เสียชีวิต'] || 0,          color: '#475569' },
      ]
    }
    return []
  }, [rptData])

  // ── loading guard ───────────────────────────────────────────────────────────

  if (isLoading || rptLoading) return (
    <div className="p-16 text-center">
      <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-blue-700 rounded-full animate-spin mb-4"></div>
      <p className="text-slate-500">กำลังโหลดข้อมูล...</p>
    </div>
  )

  const totalCases     = rptData?.['รวมทั้งหมด'] || summary.totalAll
  const completed      = rptData?.['ดำเนินการแล้ว'] || filteredRecords.filter(r => r.status === 'ดำเนินการแล้ว').length
  const found          = rptData?.['พบพฤติการณ์'] || 0
  const notFound       = rptData?.['ไม่พบพฤติการณ์'] || 0
  const notInArea      = rptData?.['ไม่พบตัวในพื้นที่'] || 0
  const investigating  = rptData?.['อยู่ระหว่างสืบสวน'] || 0
  const deceased       = rptData?.['เสียชีวิต'] || 0
  const verifTotal     = found + notFound + notInArea + investigating + deceased
  const donutTotal     = donutData.reduce((s, d) => s + d.value, 0)

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <>
    {isPresentation && <PresentationBar title="ผลการดำเนินงาน RPT_114" />}
    <div className={isPresentation ? '' : 'p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8 bg-slate-50 min-h-screen'}>

      {/* ── Page Header ── */}
      {!isPresentation && (
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-800 rounded-2xl px-6 pt-8 pb-10 text-white shadow-2xl overflow-hidden relative">
        <div className="absolute inset-0 opacity-5 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-3">
              รายงานการดำเนินงาน · ป.ป.ส. กรุงเทพมหานคร
            </div>
            <h1 className="text-3xl lg:text-4xl font-extrabold leading-tight">
              ผลการดำเนินงานจำแนกตามแหล่งข่าว
            </h1>
            <p className="text-sm text-blue-200 mt-3 flex items-center gap-2 flex-wrap">
              สรุปผลการตรวจสอบเรื่องร้องเรียน ตามรายงาน RPT_114 ของ ป.ป.ส.
              {rptData?.period && (
                <span className="px-3 py-0.5 bg-white/15 rounded-full text-white text-xs font-bold border border-white/25">
                  {rptData.period}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={() => setShowUpload(true)}
                className="px-5 py-2.5 bg-white text-blue-800 hover:bg-blue-50 rounded-xl font-bold flex items-center gap-2 transition shadow-lg flex-shrink-0 text-sm">
                <Upload size={16} /> นำเข้า RPT_114
              </button>
            )}
            <PresentationEnterButton />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-400 via-sky-300 to-blue-600 opacity-75" />
      </div>
      )}

      <PresentationSlides isPresentation={isPresentation} normalClassName="max-w-[1600px] mx-auto space-y-10">

      {/* ── Slide 1: KPI Cards ── */}
      <div className="space-y-6">
        {rptError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-center gap-4">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">ไม่สามารถโหลดข้อมูล RPT_114 ได้</p>
              <p className="text-xs text-red-600 mt-0.5">{rptError}</p>
            </div>
            <button onClick={() => loadRpt()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition flex-shrink-0">
              ลองอีกครั้ง
            </button>
          </div>
        )}

        {/* Source banner – slide 1 */}
        <button onClick={() => setShowSourceInfo(true)}
          className="w-full bg-white border border-blue-200 hover:border-blue-400 rounded-2xl px-5 py-4 text-sm text-blue-800 flex items-center gap-4 transition group cursor-pointer shadow-sm hover:shadow-md">
          <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center flex-shrink-0 text-lg shadow-sm">📊</div>
          <div className="flex-1 text-left">
            <div className="font-bold text-blue-900 text-base">📌 5 Cards ด้านบน + ตารางผลพฤติการณ์/ผลดำเนินการ</div>
            <div className="text-xs text-blue-700 mt-1">
              ใช้ตัวเลขจาก <strong>RPT_114</strong> (รายงานทางการ ป.ป.ส.) {rptData?.period && '— ' + rptData.period}
              {!rptData && <span className="ml-2 text-rose-600 font-medium">⚠️ ยังไม่มีข้อมูล RPT_114 ในระบบ</span>}
            </div>
          </div>
          <div className="text-xs text-blue-600 font-semibold group-hover:translate-x-1 transition">ดูรายละเอียด →</div>
        </button>

        {/* RPT_114 fiscal-year filter */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-3.5 flex items-center gap-3 flex-wrap">
          <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center text-base flex-shrink-0">🗓️</div>
          <span className="text-sm font-semibold text-slate-700">ปีงบประมาณ (RPT_114):</span>
          <select value={rptYear} onChange={e => setRptYear(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none">
            <option value="all">ทุกปี (สะสม)</option>
            <option value="no_date">ไม่ระบุวันที่</option>
            {rptAllYears.map(y => <option key={y} value={y}>พ.ศ. {y}</option>)}
          </select>
          <span className="text-xs text-slate-400">
            {rptYear === 'all' ? 'แสดงผลรวมทุกปีงบ'
              : rptYear === 'no_date' ? 'แสดงเฉพาะเรื่องที่ไม่ระบุวันที่ (ฝั่งขวาไม่มีข้อมูล)'
              : `แสดงเฉพาะปีงบ ${rptYear}`}
          </span>
          {rptYear !== 'all' && (
            <button onClick={() => setRptYear('all')}
              className="ml-auto px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-full flex items-center gap-1">
              <X size={12} /> ดูทุกปี
            </button>
          )}
        </div>

        {/* KPI cards — 5 ใบหลัก + ปุ่ม expand (อีก 2 ใบ slide เข้ามา) */}
        {(() => {
          const PRIMARY = [
            <BigCard icon={<AlertCircle />}   label="เรื่องร้องเรียนทั้งหมด" value={totalCases}    sub="ตามรายงาน ป.ป.ส."                color="blue"    />,
            <BigCard icon={<CheckCircle2 />}  label="ดำเนินการแล้ว"          value={completed}     pct={percent(completed, totalCases)}    sub="จากเรื่องทั้งหมด"             color="emerald" />,
            <BigCard icon={<SearchIcon />}    label="พบพฤติการณ์"             value={found}         pct={percent(found, verifTotal)}        sub="จากผลตรวจสอบ"                  color="rose"    />,
            <BigCard icon={<XCircle />}       label="ไม่พบพฤติการณ์"          value={notFound}      pct={percent(notFound, verifTotal)}     sub="ไม่พบบุคคล/สถานที่"           color="slate"   />,
            <BigCard icon={<FileQuestion />}  label="ไม่พบตัวในพื้นที่"       value={notInArea}     pct={percent(notInArea, verifTotal)}    sub="ออกพื้นที่ตรวจไม่พบ"          color="amber"   />,
          ]
          const SECONDARY = [
            <BigCard icon={<SearchIcon />}    label="อยู่ระหว่างสืบสวน"       value={investigating} pct={percent(investigating, verifTotal)} sub="ยังไม่ปิดเรื่อง"               color="blue"    />,
            <BigCard icon={<AlertCircle />}   label="เสียชีวิต"               value={deceased}      pct={percent(deceased, verifTotal)}     sub="ก่อนตรวจสอบเสร็จ"             color="slate"   />,
          ]
          const cellBase = 'flex transition-all duration-300 ease-out'
          const cellVisible = 'p-2 basis-1/2 md:basis-1/3 lg:flex-1 lg:basis-0 min-w-[140px]'
          const cellHidden = 'p-0 basis-0 w-0 min-w-0 opacity-0 scale-95 pointer-events-none'
          return (
            <div className="flex flex-wrap -m-2">
              {PRIMARY.map((card, i) => (
                <div key={`p${i}`} className={`${cellBase} ${cellVisible}`}>{card}</div>
              ))}
              {SECONDARY.map((card, i) => (
                <div key={`s${i}`}
                  style={{ transitionDelay: kpiExpanded ? `${i * 80}ms` : '0ms' }}
                  className={`${cellBase} overflow-hidden ${
                    kpiExpanded ? `${cellVisible} opacity-100 scale-100` : cellHidden
                  }`}>
                  {card}
                </div>
              ))}
              <div className={`${cellBase} ${cellVisible}`}>
                <KpiToggleCard expanded={kpiExpanded} onToggle={() => setKpiExpanded(e => !e)} hiddenCount={SECONDARY.length} />
              </div>
            </div>
          )
        })()}
      </div>{/* end slide 1 */}

      {/* ── Slide 2: Charts ── */}
      <div className="space-y-6">

        {/* Filter bar */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center text-lg">📅</div>
            <h3 className="font-bold text-slate-800 text-base">ตัวกรองช่วงเวลา</h3>
            <span className="ml-2 text-xs text-slate-500">(กรองเฉพาะข้อมูลรายเรื่องด้านล่าง)</span>
            {(filterYear !== 'all' || filterMonth !== 'all') && (
              <button onClick={() => { setFilterYear('all'); setFilterMonth('all') }}
                className="ml-auto px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-full flex items-center gap-1">
                <X size={12} /> ล้างตัวกรอง
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none">
              <option value="all">ทุกปี</option>
              {availableYears.map(y => <option key={y} value={y}>พ.ศ. {y}</option>)}
            </select>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none">
              <option value="all">ทุกเดือน</option>
              {THAI_MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
        </div>

        {/* Source banner – slide 2 */}
        <button onClick={() => setShowSourceInfo(true)}
          className="w-full bg-white border border-amber-200 hover:border-amber-400 rounded-2xl px-5 py-4 text-sm flex items-center gap-4 transition group cursor-pointer shadow-sm hover:shadow-md">
          <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center flex-shrink-0 text-lg shadow-sm">📁</div>
          <div className="flex-1 text-left">
            <div className="font-bold text-amber-900 text-base">📌 Sources Overview + กราฟ + ตารางช่องทาง</div>
            <div className="text-xs text-amber-700 mt-1">
              ใช้ข้อมูล <strong>Export Records</strong> — {filteredRecords.length.toLocaleString()} records (รายเรื่องจริง)
            </div>
          </div>
          <div className="text-xs text-amber-600 font-semibold group-hover:translate-x-1 transition">ดูรายละเอียด →</div>
        </button>

        {/* Sources overview + donut */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 4 channel cards */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-md p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-slate-400 rounded-full"></div>
                <h3 className="text-xl font-semibold text-slate-800">จำแนกตามแหล่งข่าว</h3>
                <span className="text-xs text-slate-400">complaints · {summary.totalAll.toLocaleString()} records</span>
              </div>
              <PeriodBadge period={recordsPeriod} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ranking.map((r, i) => (
                <SourceCard key={r.channel} rank={i + 1} channel={r.display} count={r.total} total={summary.totalAll} />
              ))}
            </div>
          </div>

          {/* Donut chart */}
          {donutData.length > 0 && donutTotal > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-8" onClick={() => setActiveDonutIndex(null)}>
              <h3 className="text-lg font-bold text-slate-800 mb-1">สัดส่วนผลพิจารณาการตรวจสอบ</h3>
              <p className="text-xs text-slate-500 mb-1">จาก RPT_114 · คลิกชิ้นเพื่อดูรายละเอียด</p>
              <PeriodBadge period={rptData?.period} className="mb-5" />
              <div className="relative">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={82} outerRadius={118} paddingAngle={3}
                      activeIndex={activeDonutIndex}
                      onClick={(_, index, e) => { e.stopPropagation(); setActiveDonutIndex(prev => prev === index ? null : index) }}>
                      {donutData.map((d, i) => (
                        <Cell key={i} fill={d.color}
                          style={{ opacity: activeDonutIndex === null || activeDonutIndex === i ? 1 : 0.28, transition: 'opacity 0.2s', cursor: 'pointer' }} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    {activeDonutIndex !== null && donutData[activeDonutIndex] ? (
                      <>
                        <div className="text-2xl font-extrabold text-slate-800 leading-none">
                          {donutData[activeDonutIndex].value.toLocaleString()}
                        </div>
                        <div className="text-sm font-bold mt-0.5" style={{ color: donutData[activeDonutIndex].color }}>
                          {percent(donutData[activeDonutIndex].value, donutTotal)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-2xl font-extrabold text-slate-800 leading-none">{donutTotal.toLocaleString()}</div>
                        <div className="text-xs text-slate-500 font-semibold mt-0.5">รวมผลตรวจสอบ</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2.5 mt-5">
                {donutData.map((d, i) => (
                  <button key={d.name}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-all duration-150"
                    style={activeDonutIndex === i
                      ? { background: d.color + '18', outline: `2px solid ${d.color}55` }
                      : { background: '#f8fafc' }
                    }
                    onClick={(e) => { e.stopPropagation(); setActiveDonutIndex(prev => prev === i ? null : i) }}>
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-sm font-semibold text-slate-700 flex-1 leading-tight">{d.name}</span>
                    <span className="text-base font-extrabold tabular-nums" style={{ color: d.color }}>
                      {d.value.toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-slate-400 w-12 text-right tabular-nums">
                      {percent(d.value, donutTotal)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>{/* end slide 2 */}

      {/* ── Slide 3: Tables + Dashboard ── */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ResultTable
            title="ผลการตรวจสอบพฤติการณ์" icon="🔍" headerClass="from-rose-700 to-rose-600" totalRowClass="from-rose-700 to-rose-600" thClass="text-rose-300"
            rows={[
              { name: 'พบพฤติการณ์',       key: 'พบพฤติการณ์',       color: '#EF4444', emoji: '✅' },
              { name: 'ไม่พบพฤติการณ์',    key: 'ไม่พบพฤติการณ์',    color: '#94A3B8', emoji: '❌' },
              { name: 'ไม่พบตัวในพื้นที่',  key: 'ไม่พบตัวในพื้นที่',  color: '#0EA5E9', emoji: '🚫' },
              { name: 'อยู่ระหว่างสืบสวน', key: 'อยู่ระหว่างสืบสวน', color: '#F59E0B', emoji: '🔍' },
              { name: 'เสียชีวิต',          key: 'เสียชีวิต',          color: '#1E293B', emoji: '☠️' },
            ]}
            subTitle="จาก RPT_114 · ผลการลงพื้นที่ตรวจสอบ"
            rptData={rptData}
          />
          <ResultTable
            title="ผลการดำเนินการ" icon="⚖️" headerClass="from-blue-800 to-blue-700" totalRowClass="from-blue-800 to-blue-700" thClass="text-blue-300"
            rows={[
              { name: 'จับกุม',          key: 'จับกุม',          color: '#DC2626', emoji: '⚖️' },
              { name: 'บำบัด',           key: 'บำบัด',           color: '#F59E0B', emoji: '💊' },
              { name: 'กลั่นแกล้ง',      key: 'กลั่นแกล้ง',      color: '#991B1B', emoji: '⚠️' },
              { name: 'สืบสวนเพิ่มเติม', key: 'สืบสวนเพิ่มเติม', color: '#0EA5E9', emoji: '🔎' },
              { name: 'ยุติเรื่อง',      key: 'ยุติเรื่อง',      color: '#64748B', emoji: '📁' },
              { name: 'อื่นๆ',           key: 'อื่นๆ',           color: '#94A3B8', emoji: '📝' },
            ]}
            subTitle="จาก RPT_114 · ผลลัพธ์การดำเนินคดี"
            rptData={rptData}
          />
        </div>

        <div className="border-t-2 border-slate-200 pt-8">
          <Rpt114Dashboard />
        </div>
      </div>{/* end slide 3 */}

      </PresentationSlides>

      {showUpload && <UploadRptModal onClose={() => setShowUpload(false)} onSaved={() => loadRpt(true)} showToast={showToast} />}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {showSourceInfo && (
        <OperationsSourceModal
          onClose={() => setShowSourceInfo(false)}
          totalCases={totalCases}
          completed={completed}
          filteredCount={filteredRecords.length}
          percent={percent}
        />
      )}
    </div>
    </>
  )
}

// ─── ResultTable (local – used only here) ────────────────────────────────────

function ResultTable({ title, icon, headerClass, totalRowClass, thClass, rows, subTitle, rptData }) {
  const keys = rows.map(r => r.key)
  const grandTotal = keys.reduce((s, k) => s + (rptData?.[k] || 0), 0)
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
      <div className={`bg-gradient-to-r ${headerClass} px-6 py-5 text-white`}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-2xl">{icon}</div>
          <div>
            <h3 className="text-lg font-bold">{title}</h3>
            <p className={`text-xs mt-0.5 opacity-75`}>{subTitle}</p>
            <PeriodBadge period={rptData?.period} tone="dark" className="mt-1" />
          </div>
        </div>
      </div>
      <div className="p-6">
        <div className="overflow-x-auto">
          <table className="min-w-[480px] w-full">
            <thead className="bg-slate-800 text-xs text-white font-bold uppercase">
              <tr>
                <th className="text-left px-5 py-4">หมวด</th>
                <th className="text-right px-5 py-4">จำนวน</th>
                <th className={`text-right px-5 py-4 ${thClass}`}>สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const v = rptData?.[row.key] || 0
                const pct = grandTotal ? ((v / grandTotal) * 100).toFixed(1) : 0
                return (
                  <tr key={row.key} className={`border-t border-slate-100 ${idx % 2 ? 'bg-slate-50/60' : ''} hover:bg-rose-50/40 transition`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-base">{row.emoji}</span>
                        <span className="font-semibold text-slate-800">{row.name}</span>
                      </div>
                    </td>
                    <td className="text-right px-5 py-4">
                      <span className="text-xl font-bold" style={{ color: row.color }}>{v.toLocaleString()}</span>
                    </td>
                    <td className="text-right px-5 py-4">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-bold"
                        style={{ background: row.color + '20', color: row.color }}>{pct}%</span>
                    </td>
                  </tr>
                )
              })}
              <tr className={`bg-gradient-to-r ${totalRowClass} text-white font-bold`}>
                <td className="px-5 py-5 text-base rounded-bl-lg">รวม</td>
                <td className="text-right px-5 py-5 text-xl">{grandTotal.toLocaleString()}</td>
                <td className="text-right px-5 py-5 text-yellow-200 text-base rounded-br-lg">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}