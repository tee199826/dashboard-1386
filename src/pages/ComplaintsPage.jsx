import { useState, useMemo } from 'react'
import { Download, Table2, Image as ImageIcon, MapPin, ChevronRight } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { useData } from '../context/DataContext'
import { useFilter } from '../context/FilterContext'
import DateFilter from '../components/DateFilter'
import FilterPill from '../components/FilterPill'
import { filterByDateColumn } from '../utils/filterRows'
import { dateToFiscalYear } from '../utils/fiscalYear'
import { formatThaiDate } from '../utils/heroMeta'
import { DNAME_TO_GROUP } from '../utils/constants'
import { exportComplaintsReport } from '../utils/exportComplaints'

// สถานะ 2 กลุ่ม (ดำเนินการแล้ว / คงเหลือ) — แก้นิยามตรงนี้จุดเดียว
const DONE_STATUSES = ['จับกุม', 'บำบัด', 'ดำเนินการแล้ว', 'ยุติเรื่อง', 'ถูกกลั่นแกล้ง']
const isDone = (status) => DONE_STATUSES.includes(status)

const URGENT_VALUES = ['ด่วน', 'ด่วนที่สุด']

const GROUP_ORDER = ['กรุงเทพกลาง', 'กรุงเทพเหนือ', 'กรุงเทพใต้', 'กรุงเทพตะวันออก', 'กรุงธนเหนือ', 'กรุงธนใต้']

// DB สะกด "ราษฎร์บูรณะ" ด้วย ฎ ชฎา (ถูกต้อง) แต่ DNAME_TO_GROUP ใช้ ฏ ปฏัก ตาม GeoJSON เดิม — alias ให้ map กลุ่มติด
const DISTRICT_ALIAS = { 'เขตราษฎร์บูรณะ': 'เขตราษฏร์บูรณะ' }
const groupOf = (district) => DNAME_TO_GROUP[DISTRICT_ALIAS[district] || district] || null

// role/drug เป็น multi-value คั่น comma (มีทั้งแบบมี/ไม่มีเว้นวรรค) — แตกแล้วนับแยกทีละค่า
const splitMulti = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : [])

const COLORS = { slate: '#334155', slateSoft: '#94a3b8', rose: '#e11d48', emerald: '#059669', amber: '#f59e0b' }
const PAGE_SIZE = 50

function Panel({ children, className = '' }) {
  return <div className={`bg-white rounded-lg ring-1 ring-slate-200 p-6 md:p-8 ${className}`}>{children}</div>
}

function SectionHead({ title, sub }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

function Metric({ span, accent = 'text-slate-900', eyebrow, value, unit, sub, divider }) {
  return (
    <div className={`col-span-12 ${span} ${divider ? 'sm:border-l sm:border-slate-200 sm:pl-6' : ''}`}>
      <div className="text-[11px] font-medium uppercase tracking-widest text-slate-500 leading-tight min-h-[28px]">{eyebrow}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={`text-4xl font-semibold tracking-tight tabular-nums leading-none ${accent}`}>{value}</span>
        {unit && <span className="text-xs text-slate-400">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-xs text-slate-500 tabular-nums">{sub}</div>}
    </div>
  )
}

const barTooltipStyle = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }
const labelStyle = { fontSize: 11, fill: '#475569', fontWeight: 600 }

// percent=true : label บนแท่งเป็น % (ตัวหาร = ผลรวมในกราฟ → รวม 100%) ; bubble (Tooltip) ยังโชว์จำนวนจริง
function RankedBarChart({ data, unit = 'ครั้ง', percent = true }) {
  const sum = data.reduce((s, d) => s + d.value, 0) || 1
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 12, fill: '#475569' }} />
        <Tooltip contentStyle={barTooltipStyle} formatter={(v) => [v.toLocaleString(), unit]} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => <Cell key={d.name} fill={i === 0 ? COLORS.amber : COLORS.slateSoft} />)}
          <LabelList dataKey="value" position="right" style={labelStyle}
            formatter={(v) => (percent ? `${((v / sum) * 100).toFixed(1)}%` : v.toLocaleString())} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function ComplaintsPage() {
  const { records, isLoading } = useData()
  const { getDateRange } = useFilter()
  const range = getDateRange()

  const availableYears = useMemo(() => {
    const s = new Set()
    records.forEach((r) => { const fy = dateToFiscalYear(r.date); if (fy) s.add(fy) })
    return [...s].sort((a, b) => b - a)
  }, [records])

  const dateFiltered = useMemo(() => filterByDateColumn(records, 'date', range), [records, range])

  // ── cascading area filter: กลุ่ม → เขต → แขวง → ชุมชน ──
  const [group, setGroup] = useState('all')
  const [district, setDistrict] = useState('all')
  const [subdistrict, setSubdistrict] = useState('all')
  const [community, setCommunity] = useState('all')

  const districtOptions = useMemo(() => {
    const s = new Set()
    dateFiltered.forEach((r) => {
      if (!r.district || !r.district.startsWith('เขต')) return // ตัดอำเภอนอก กทม.
      if (group !== 'all' && groupOf(r.district) !== group) return
      s.add(r.district)
    })
    return [...s].sort((a, b) => a.localeCompare(b, 'th'))
  }, [dateFiltered, group])

  const subdistrictOptions = useMemo(() => {
    if (district === 'all') return []
    const s = new Set()
    dateFiltered.forEach((r) => { if (r.district === district && r.subdistrict) s.add(r.subdistrict) })
    return [...s].sort((a, b) => a.localeCompare(b, 'th'))
  }, [dateFiltered, district])

  const communityOptions = useMemo(() => {
    if (subdistrict === 'all') return []
    const s = new Set()
    dateFiltered.forEach((r) => { if (r.subdistrict === subdistrict && r.community) s.add(r.community) })
    return [...s].sort((a, b) => a.localeCompare(b, 'th'))
  }, [dateFiltered, subdistrict])

  const rows = useMemo(() => dateFiltered.filter((r) => {
    if (group !== 'all' && groupOf(r.district) !== group) return false
    if (district !== 'all' && r.district !== district) return false
    if (subdistrict !== 'all' && r.subdistrict !== subdistrict) return false
    if (community !== 'all' && r.community !== community) return false
    return true
  }), [dateFiltered, group, district, subdistrict, community])

  // ── KPI ──
  const total = rows.length
  const doneCount = useMemo(() => rows.filter((r) => isDone(r.status)).length, [rows])
  const remainingCount = total - doneCount
  const donePct = total ? (doneCount / total) * 100 : 0
  const remainingPct = total ? (remainingCount / total) * 100 : 0
  const urgentCount = useMemo(() => rows.filter((r) => URGENT_VALUES.includes(r.urgency)).length, [rows])
  const urgentPct = total ? (urgentCount / total) * 100 : 0

  // ── G1 พฤติการณ์ (นับตามบทบาท ไม่ใช่นับเรื่อง — role เป็น multi-value) ──
  const roleData = useMemo(() => {
    const m = {}
    rows.forEach((r) => splitMulti(r.role).forEach((role) => { m[role] = (m[role] || 0) + 1 }))
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [rows])

  // ── G2 ผลดำเนินการ ──
  const statusData = useMemo(() => {
    const m = {}
    rows.forEach((r) => { const s = r.status || 'ไม่ระบุ'; m[s] = (m[s] || 0) + 1 })
    return Object.entries(m).map(([name, value]) => ({ name, value, done: isDone(name) })).sort((a, b) => b.value - a.value)
  }, [rows])

  // ── G3 ตัวยา top10 (multi-value เหมือน role) ──
  const drugData = useMemo(() => {
    const m = {}
    rows.forEach((r) => splitMulti(r.drug).forEach((d) => { m[d] = (m[d] || 0) + 1 }))
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10)
  }, [rows])

  // ── G4 ช่องทาง ──
  const channelData = useMemo(() => {
    const m = {}
    rows.forEach((r) => { const c = r.channel || 'ไม่ระบุ'; m[c] = (m[c] || 0) + 1 })
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [rows])

  // ผลรวมสำหรับคิด % บนแท่ง (คำนวณครั้งเดียว — เลี่ยง reduce ซ้ำในทุก label ของ LabelList)
  const statusSum = statusData.reduce((s, d) => s + d.value, 0) || 1
  const channelSum = channelData.reduce((s, d) => s + d.value, 0) || 1

  // ── table toggle + pagination ──
  const [tableOpen, setTableOpen] = useState(false)
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page])

  // ── export ──
  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    setExporting(true)
    try {
      const areaLabel = [
        group !== 'all' ? group : null,
        district !== 'all' ? district : null,
        subdistrict !== 'all' ? subdistrict : null,
        community !== 'all' ? community : null,
      ].filter(Boolean).join(' · ') || 'ทุกพื้นที่'
      await exportComplaintsReport({
        rows,
        periodLabel: range ? `${formatThaiDate(range.from)} - ${formatThaiDate(range.to)}` : 'ทั้งหมด',
        filterLabel: areaLabel,
        filenamePrefix: 'complaints-report',
      })
    } finally {
      setExporting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
        <div className="rounded-lg bg-white ring-1 ring-slate-200 p-8 h-64 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8 bg-[#fafaf9] min-h-screen">
      {/* ── HEADER ── */}
      <header className="border-b border-slate-200 pb-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-slate-500">Complaints · สายด่วน 1386</div>
            <h1 className="mt-1.5 text-3xl lg:text-[2rem] font-semibold tracking-tight text-slate-900 leading-tight">เรื่องร้องเรียน</h1>
            <p className="mt-2 text-sm text-slate-500 tabular-nums">{total.toLocaleString()} เรื่อง ในช่วงที่เลือก</p>
          </div>
          <DateFilter availableYears={availableYears} />
        </div>
      </header>

      {/* ── AREA CASCADE — ลำดับชั้นเจาะลึกซ้าย→ขวา (สไตล์เดียวกับหน้า situation) ── */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
        <span className="inline-flex items-center gap-1.5 pr-1 text-xs font-semibold text-slate-500">
          <MapPin size={15} className="text-slate-400" /> พื้นที่
        </span>
        <FilterPill label="กลุ่ม" value={group}
          onChange={(v) => { setGroup(v); setDistrict('all'); setSubdistrict('all'); setCommunity('all') }}
          options={[['all', 'ทุกกลุ่ม'], ...GROUP_ORDER.map((g) => [g, g])]} />
        <ChevronRight size={15} className="text-slate-300 shrink-0" />
        <FilterPill label="เขต" value={district}
          onChange={(v) => { setDistrict(v); setSubdistrict('all'); setCommunity('all') }}
          options={[['all', 'ทุกเขต'], ...districtOptions.map((d) => [d, d.replace(/^เขต/, '')])]} />
        <ChevronRight size={15} className="text-slate-300 shrink-0" />
        <FilterPill label="แขวง" value={subdistrict}
          onChange={(v) => { setSubdistrict(v); setCommunity('all') }}
          options={[['all', district === 'all' ? 'เลือกเขตก่อน' : 'ทุกแขวง'], ...subdistrictOptions.map((s) => [s, s])]}
          disabled={district === 'all'} />
        <ChevronRight size={15} className="text-slate-300 shrink-0" />
        <FilterPill label="ชุมชน" value={community} onChange={setCommunity}
          options={[['all', subdistrict === 'all' ? 'เลือกแขวงก่อน' : 'ทุกชุมชน'], ...communityOptions.map((c) => [c, c])]}
          disabled={subdistrict === 'all'} />
      </div>

      {/* ── KPI ── */}
      <Panel>
        <div className="grid grid-cols-12 gap-y-6">
          <Metric span="sm:col-span-3" eyebrow="เรื่องทั้งหมด" value={total.toLocaleString()} unit="เรื่อง" />
          <Metric span="sm:col-span-3" divider accent="text-emerald-700" eyebrow="ดำเนินการแล้ว"
            value={`${donePct.toFixed(1)}%`} sub={`${doneCount.toLocaleString()} เรื่อง`} />
          <Metric span="sm:col-span-3" divider accent="text-rose-600" eyebrow="คงเหลือ"
            value={`${remainingPct.toFixed(1)}%`} sub={`${remainingCount.toLocaleString()} เรื่อง`} />
          <Metric span="sm:col-span-3" divider accent="text-amber-600" eyebrow="ด่วน"
            value={urgentCount.toLocaleString()} unit="เรื่อง" sub={`${urgentPct.toFixed(1)}% ของทั้งหมด`} />
        </div>
      </Panel>

      {/* ── CHARTS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel>
          <SectionHead title="พฤติการณ์" sub="นับตามจำนวนบทบาทที่ปรากฏ (1 เรื่องอาจมีหลายบทบาท) ไม่ใช่จำนวนเรื่อง" />
          {roleData.length ? <RankedBarChart data={roleData} /> : <EmptyChart />}
        </Panel>
        <Panel>
          <SectionHead title="ผลดำเนินการ" />
          {statusData.length ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(180, statusData.length * 36)}>
                <BarChart data={statusData} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 12, fill: '#475569' }} />
                  <Tooltip contentStyle={barTooltipStyle} formatter={(v) => [v.toLocaleString(), 'เรื่อง']} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {statusData.map((d) => <Cell key={d.name} fill={d.done ? COLORS.emerald : COLORS.slateSoft} />)}
                    <LabelList dataKey="value" position="right" style={labelStyle}
                      formatter={(v) => `${((v / statusSum) * 100).toFixed(1)}%`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-600" /> ดำเนินการแล้ว</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400" /> คงเหลือ</span>
              </div>
            </>
          ) : <EmptyChart />}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel>
          <SectionHead title="ตัวยา" sub="Top 10 · นับตามจำนวนตัวยาที่ปรากฏ (1 เรื่องอาจพบหลายชนิด)" />
          {drugData.length ? <RankedBarChart data={drugData} unit="ครั้ง" /> : <EmptyChart />}
        </Panel>
        <Panel>
          <SectionHead title="ช่องทาง" />
          {channelData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={channelData} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip contentStyle={barTooltipStyle} formatter={(v) => [v.toLocaleString(), 'เรื่อง']} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {channelData.map((d, i) => <Cell key={d.name} fill={i === 0 ? COLORS.amber : COLORS.slateSoft} />)}
                  <LabelList dataKey="value" position="top" style={labelStyle}
                    formatter={(v) => `${((v / channelSum) * 100).toFixed(1)}%`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </Panel>
      </div>

      {/* ── ปุ่มล่าง ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setTableOpen((o) => !o)}
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md ring-1 ring-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
          <Table2 size={15} /> {tableOpen ? 'ซ่อนตาราง' : 'ดูตาราง'}
        </button>
        <button onClick={handleExport} disabled={exporting}
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md ring-1 ring-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-wait">
          <Download size={15} /> {exporting ? 'กำลังสร้างไฟล์...' : 'Export Excel'}
        </button>
        <button disabled title="รอ template"
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md ring-1 ring-slate-200 bg-white text-sm font-medium text-slate-400 cursor-not-allowed">
          <ImageIcon size={15} /> Infographic
        </button>
      </div>

      {/* ── ตาราง ── */}
      {tableOpen && (
        <div className="bg-white rounded-lg ring-1 ring-slate-200 overflow-hidden">
          <div className="overflow-auto max-h-[560px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 font-medium">วันที่</th>
                  <th className="px-3 py-2.5 font-medium">เขต</th>
                  <th className="px-3 py-2.5 font-medium">แขวง</th>
                  <th className="px-3 py-2.5 font-medium">ชุมชน</th>
                  <th className="px-3 py-2.5 font-medium">ช่องทาง</th>
                  <th className="px-3 py-2.5 font-medium">พฤติการณ์</th>
                  <th className="px-3 py-2.5 font-medium">ตัวยา</th>
                  <th className="px-3 py-2.5 font-medium">ผลดำเนินการ</th>
                  <th className="px-3 py-2.5 font-medium">ด่วน</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums whitespace-nowrap">{formatThaiDate(r.date) || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{r.district || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.subdistrict || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.community || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.channel || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{splitMulti(r.role).join(', ') || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{splitMulti(r.drug).join(', ') || '-'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${isDone(r.status) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {r.status || 'ไม่ระบุ'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {URGENT_VALUES.includes(r.urgency)
                        ? <span className="text-amber-600 font-semibold text-xs">{r.urgency}</span>
                        : <span className="text-slate-300 text-xs">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span className="tabular-nums">หน้า {page} / {totalPages} · {rows.length.toLocaleString()} รายการ</span>
            <div className="flex gap-1.5">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-md ring-1 ring-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                ก่อนหน้า
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-md ring-1 ring-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                ถัดไป
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyChart() {
  return <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">ไม่มีข้อมูลในช่วงที่เลือก</div>
}
