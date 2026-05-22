import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts'
import { AlertCircle, CheckCircle2, Search as SearchIcon, XCircle, FileQuestion, X, Upload, FileSpreadsheet, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'

const CHANNELS = ['อินเตอร์เน็ต', 'สายด่วน 1386', 'ทางรัฐ', 'อื่นๆ']
const CHANNEL_DISPLAY = {
  'อินเตอร์เน็ต': 'อินเตอร์เน็ต',
  'สายด่วน 1386': 'สายด่วน 1386',
  'ทางรัฐ': 'ทางรัฐ',
  'อื่นๆ': 'ช่องทางอื่นๆ',
}
const CATEGORIES = ['จับกุม', 'บำบัด', 'กลั่นแกล้ง', 'อื่นๆ']
const CATEGORY_COLORS = {
  'จับกุม': '#EF4444',
  'บำบัด': '#F59E0B',
  'กลั่นแกล้ง': '#991B1B',
  'อื่นๆ': '#94A3B8',
}
const THAI_MONTHS = [
  { v: 1, l: 'มกราคม' }, { v: 2, l: 'กุมภาพันธ์' }, { v: 3, l: 'มีนาคม' },
  { v: 4, l: 'เมษายน' }, { v: 5, l: 'พฤษภาคม' }, { v: 6, l: 'มิถุนายน' },
  { v: 7, l: 'กรกฎาคม' }, { v: 8, l: 'สิงหาคม' }, { v: 9, l: 'กันยายน' },
  { v: 10, l: 'ตุลาคม' }, { v: 11, l: 'พฤศจิกายน' }, { v: 12, l: 'ธันวาคม' },
]


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

export default function Operations() {
  const { isAdmin } = useAuth()
  const { records, isLoading } = useData()

  const [rptData, setRptData] = useState(null)
  const [rptLoading, setRptLoading] = useState(true)

  const [filterYear, setFilterYear] = useState('all')
  const [filterMonth, setFilterMonth] = useState('all')
  const [showUpload, setShowUpload] = useState(false)
  const [showSourceInfo, setShowSourceInfo] = useState(false)

  const loadRpt = async () => {
    setRptLoading(true)
    try {
      const { data } = await supabase
        .from('operations_summary')
        .select('*')
        .eq('channel', 'รวมทุกช่องทาง')

      if (data && data.length > 0) {
        const map = {}
        let period = ''
        data.forEach(r => {
          map[r.category] = r.count
          if (r.notes && r.notes.includes('RPT_114')) {
            const match = r.notes.match(/RPT_114\s*(.+)/)
            if (match) period = match[1]
          }
        })
        setRptData({ ...map, period })
      } else {
        setRptData(null)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setRptLoading(false)
    }
  }

  useEffect(() => { loadRpt() }, [])

  const availableYears = useMemo(() => {
    const s = new Set()
    records.forEach(r => {
      if (r.date) s.add(parseInt(r.date.slice(0, 4)) + 543)
    })
    return Array.from(s).sort()
  }, [records])

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (!r.date) return filterYear === 'all'
      const y = parseInt(r.date.slice(0, 4)) + 543
      const m = parseInt(r.date.slice(5, 7))
      if (filterYear !== 'all' && y !== parseInt(filterYear)) return false
      if (filterMonth !== 'all' && m !== parseInt(filterMonth)) return false
      return true
    })
  }, [records, filterYear, filterMonth])

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

  const chartData = useMemo(() => {
    return CHANNELS.map(ch => ({
      channel: CHANNEL_DISPLAY[ch],
      จับกุม: summary.byChannel[ch]?.จับกุม || 0,
      บำบัด: summary.byChannel[ch]?.บำบัด || 0,
      กลั่นแกล้ง: summary.byChannel[ch]?.กลั่นแกล้ง || 0,
      'อื่นๆ': summary.byChannel[ch]?.['อื่นๆ'] || 0,
    }))
  }, [summary])

  const donutData = useMemo(() => {
    if (rptData) {
      return [
        { name: 'พบพฤติการณ์', value: rptData['พบพฤติการณ์'] || 0, color: '#EF4444' },
        { name: 'ไม่พบพฤติการณ์', value: rptData['ไม่พบพฤติการณ์'] || 0, color: '#94A3B8' },
        { name: 'ไม่พบตัวในพื้นที่', value: rptData['ไม่พบตัวในพื้นที่'] || 0, color: '#0EA5E9' },
      ]
    }
    return []
  }, [rptData])

  if (isLoading || rptLoading) return (
    <div className="p-16 text-center">
      <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-blue-700 rounded-full animate-spin mb-4"></div>
      <p className="text-slate-500">กำลังโหลดข้อมูล...</p>
    </div>
  )

  const totalCases = rptData?.['รวมทั้งหมด'] || summary.totalAll
  const completed = rptData?.['ดำเนินการแล้ว'] || filteredRecords.filter(r => r.status === 'ดำเนินการแล้ว').length
  const found = rptData?.['พบพฤติการณ์'] || 0
  const notFound = rptData?.['ไม่พบพฤติการณ์'] || 0
  const notInArea = rptData?.['ไม่พบตัวในพื้นที่'] || 0
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6" style={{ fontFamily: 'Sarabun, sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ผลการดำเนินงานจำแนกตามแหล่งข่าว</h1>
          <p className="text-sm text-slate-500 mt-1">
            สรุปผลการตรวจสอบเรื่องร้องเรียน
            {rptData?.period && <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{rptData.period}</span>}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowUpload(true)}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium flex items-center gap-2 shadow-sm">
            <Upload size={16} /> นำเข้า RPT_114
          </button>
        )}
      </div>

      {/* Source Banner - 5 Cards */}
      <button
        onClick={() => setShowSourceInfo(true)}
        className="w-full bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 hover:border-blue-400 rounded-xl px-4 py-3 text-sm text-blue-800 flex items-center gap-3 transition group cursor-pointer">
        <div className="w-9 h-9 bg-blue-500 text-white rounded-lg flex items-center justify-center flex-shrink-0">
          📊
        </div>
        <div className="flex-1 text-left">
          <div className="font-bold text-blue-900">📌 5 Cards ด้านบน + ตารางผลพฤติการณ์/ผลดำเนินการ</div>
          <div className="text-xs text-blue-700 mt-0.5">
            ใช้ตัวเลขจาก <strong>RPT_114</strong> (รายงานทางการ ป.ป.ส.) {rptData?.period && '— ' + rptData.period}
            {!rptData && <span className="ml-2 text-rose-600 font-medium">⚠️ ยังไม่มีข้อมูล RPT_114 ในระบบ</span>}
          </div>
        </div>
        <div className="text-xs text-blue-600 font-medium group-hover:translate-x-1 transition">
          ดูรายละเอียด →
        </div>
      </button>

      {/* 5 Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <BigCard icon={<AlertCircle />} label="เรื่องร้องเรียนทั้งหมด" value={totalCases} sub="ตามรายงาน ป.ป.ส." color="blue" />
        <BigCard icon={<CheckCircle2 />} label="ดำเนินการแล้ว" value={completed} pct={percent(completed, totalCases)} sub="จากเรื่องทั้งหมด" color="emerald" />
        <BigCard icon={<SearchIcon />} label="พบพฤติการณ์" value={found} pct={percent(found, totalCases)} sub="จากการตรวจสอบจริง" color="rose" />
        <BigCard icon={<XCircle />} label="ไม่พบพฤติการณ์" value={notFound} pct={percent(notFound, totalCases)} sub="ไม่พบบุคคล/สถานที่" color="slate" />
        <BigCard icon={<FileQuestion />} label="ไม่พบตัวในพื้นที่" value={notInArea} pct={percent(notInArea, totalCases)} sub="อยู่ระหว่างสืบสวน/ปิดเรื่อง" color="amber" />
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">📅</div>
          <h3 className="font-semibold text-slate-800">ตัวกรองช่วงเวลา</h3>
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
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium">
            <option value="all">ทุกปี</option>
            {availableYears.map(y => <option key={y} value={y}>พ.ศ. {y}</option>)}
          </select>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium">
            <option value="all">ทุกเดือน</option>
            {THAI_MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
        </div>
      </div>

      {/* Source Banner - ส่วนล่าง */}
      <button
        onClick={() => setShowSourceInfo(true)}
        className="w-full bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 hover:border-amber-400 rounded-xl px-4 py-3 text-sm flex items-center gap-3 transition group cursor-pointer">
        <div className="w-9 h-9 bg-amber-500 text-white rounded-lg flex items-center justify-center flex-shrink-0">
          📁
        </div>
        <div className="flex-1 text-left">
          <div className="font-bold text-amber-900">📌 Sources Overview + กราฟ + ตารางช่องทาง</div>
          <div className="text-xs text-amber-700 mt-0.5">
            ใช้ข้อมูล <strong>Export Records</strong> — {filteredRecords.length.toLocaleString()} records (รายเรื่องจริง)
          </div>
        </div>
        <div className="text-xs text-amber-600 font-medium group-hover:translate-x-1 transition">
          ดูรายละเอียด →
        </div>
      </button>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-semibold text-lg text-slate-800 mb-1">สัดส่วนการจัดการแยกตามแหล่งข่าว</h3>
          <p className="text-xs text-slate-500 mb-4">เปรียบเทียบผลลัพธ์ 4 หมวด (รายเรื่อง · จาก complaints)</p>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="channel" tick={{ fontSize: 11, fill: '#475569' }} angle={-25} textAnchor="end" height={70} interval={0} />
              <YAxis tick={{ fontSize: 12, fill: '#475569' }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="จับกุม" stackId="a" fill={CATEGORY_COLORS['จับกุม']} />
              <Bar dataKey="บำบัด" stackId="a" fill={CATEGORY_COLORS['บำบัด']} />
              <Bar dataKey="กลั่นแกล้ง" stackId="a" fill={CATEGORY_COLORS['กลั่นแกล้ง']} />
              <Bar dataKey="อื่นๆ" stackId="a" fill={CATEGORY_COLORS['อื่นๆ']} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {donutData.length > 0 && donutTotal > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-semibold text-lg text-slate-800 mb-1">สัดส่วนผลพิรุธการตรวจสอบ</h3>
            <p className="text-xs text-slate-500 mb-4">จาก RPT_114 · รวม {donutTotal.toLocaleString()} เรื่อง</p>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2}>
                  {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
              {donutData.map(d => (
                <div key={d.name}>
                  <div className="text-lg font-bold" style={{ color: d.color }}>
                    {percent(d.value, donutTotal)}
                  </div>
                  <div className="text-xs text-slate-600">{d.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sources Overview */}
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">📊</div>
            <div>
              <h3 className="font-bold text-lg">ภาพรวมสถิติจำแนกตามแหล่งข่าว</h3>
              <p className="text-xs text-blue-200 mt-0.5">Sources Overview · จาก complaints {summary.totalAll.toLocaleString()} records</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {ranking.map((r, i) => (
              <SourceCard key={r.channel} rank={i + 1} channel={r.display} count={r.total} total={summary.totalAll} />
            ))}
          </div>
        </div>
      </div>

      {/* ตารางผลจาก RPT_114 - 2 ตาราง */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ตาราง 1: ผลการตรวจสอบพฤติการณ์ */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-rose-600 to-pink-700 px-6 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">🔍</div>
              <div>
                <h3 className="font-bold text-lg">ผลการตรวจสอบพฤติการณ์</h3>
                <p className="text-xs text-pink-100 mt-0.5">จาก RPT_114 · ผลการลงพื้นที่ตรวจสอบ</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <table className="w-full">
              <thead className="bg-slate-50 text-xs text-slate-700 uppercase">
                <tr>
                  <th className="text-left px-4 py-3 font-bold">หมวด</th>
                  <th className="text-right px-4 py-3 font-bold">จำนวน</th>
                  <th className="text-right px-4 py-3 font-bold text-rose-700">สัดส่วน</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'พบพฤติการณ์',       key: 'พบพฤติการณ์',       color: '#EF4444', emoji: '✅' },
                  { name: 'ไม่พบพฤติการณ์',    key: 'ไม่พบพฤติการณ์',    color: '#94A3B8', emoji: '❌' },
                  { name: 'ไม่พบตัวในพื้นที่',  key: 'ไม่พบตัวในพื้นที่',  color: '#0EA5E9', emoji: '🚫' },
                  { name: 'อยู่ระหว่างสืบสวน', key: 'อยู่ระหว่างสืบสวน', color: '#F59E0B', emoji: '🔍' },
                  { name: 'เสียชีวิต',          key: 'เสียชีวิต',          color: '#1E293B', emoji: '☠️' },
                ].map((row, idx) => {
                  const v = rptData?.[row.key] || 0
                  const totalInvestigated = ['พบพฤติการณ์', 'ไม่พบพฤติการณ์', 'ไม่พบตัวในพื้นที่', 'อยู่ระหว่างสืบสวน', 'เสียชีวิต']
                    .reduce((s, k) => s + (rptData?.[k] || 0), 0)
                  const pct = totalInvestigated ? ((v / totalInvestigated) * 100).toFixed(1) : 0
                  return (
                    <tr key={row.key} className={`border-t border-slate-100 ${idx % 2 ? 'bg-slate-50/50' : ''} hover:bg-rose-50/30 transition`}>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{row.emoji}</span>
                          <span className="font-medium text-slate-800">{row.name}</span>
                        </div>
                      </td>
                      <td className="text-right px-4 py-3.5">
                        <span className="text-lg font-bold" style={{ color: row.color }}>{v.toLocaleString()}</span>
                      </td>
                      <td className="text-right px-4 py-3.5">
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold"
                          style={{ background: row.color + '20', color: row.color }}>
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-gradient-to-r from-rose-600 to-pink-700 text-white font-bold">
                  <td className="px-4 py-4 rounded-bl-lg">รวม</td>
                  <td className="text-right px-4 py-4 text-lg">
                    {['พบพฤติการณ์', 'ไม่พบพฤติการณ์', 'ไม่พบตัวในพื้นที่', 'อยู่ระหว่างสืบสวน', 'เสียชีวิต']
                      .reduce((s, k) => s + (rptData?.[k] || 0), 0).toLocaleString()}
                  </td>
                  <td className="text-right px-4 py-4 text-yellow-200 rounded-br-lg">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ตาราง 2: ผลดำเนินการ */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-700 to-indigo-900 px-6 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">⚖️</div>
              <div>
                <h3 className="font-bold text-lg">ผลการดำเนินการ</h3>
                <p className="text-xs text-blue-200 mt-0.5">จาก RPT_114 · ผลลัพธ์การดำเนินคดี</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <table className="w-full">
              <thead className="bg-slate-50 text-xs text-slate-700 uppercase">
                <tr>
                  <th className="text-left px-4 py-3 font-bold">หมวด</th>
                  <th className="text-right px-4 py-3 font-bold">จำนวน</th>
                  <th className="text-right px-4 py-3 font-bold text-blue-700">สัดส่วน</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'จับกุม',          key: 'จับกุม',          color: '#DC2626', emoji: '⚖️' },
                  { name: 'บำบัด',           key: 'บำบัด',           color: '#F59E0B', emoji: '💊' },
                  { name: 'กลั่นแกล้ง',      key: 'กลั่นแกล้ง',      color: '#991B1B', emoji: '⚠️' },
                  { name: 'สืบสวนเพิ่มเติม', key: 'สืบสวนเพิ่มเติม', color: '#0EA5E9', emoji: '🔎' },
                  { name: 'ยุติเรื่อง',      key: 'ยุติเรื่อง',      color: '#64748B', emoji: '📁' },
                  { name: 'อื่นๆ',           key: 'อื่นๆ',           color: '#94A3B8', emoji: '📝' },
                ].map((row, idx) => {
                  const v = rptData?.[row.key] || 0
                  const totalAction = ['จับกุม', 'บำบัด', 'กลั่นแกล้ง', 'สืบสวนเพิ่มเติม', 'ยุติเรื่อง', 'อื่นๆ']
                    .reduce((s, k) => s + (rptData?.[k] || 0), 0)
                  const pct = totalAction ? ((v / totalAction) * 100).toFixed(1) : 0
                  return (
                    <tr key={row.key} className={`border-t border-slate-100 ${idx % 2 ? 'bg-slate-50/50' : ''} hover:bg-blue-50/30 transition`}>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{row.emoji}</span>
                          <span className="font-medium text-slate-800">{row.name}</span>
                        </div>
                      </td>
                      <td className="text-right px-4 py-3.5">
                        <span className="text-lg font-bold" style={{ color: row.color }}>{v.toLocaleString()}</span>
                      </td>
                      <td className="text-right px-4 py-3.5">
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold"
                          style={{ background: row.color + '20', color: row.color }}>
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-gradient-to-r from-blue-700 to-indigo-900 text-white font-bold">
                  <td className="px-4 py-4 rounded-bl-lg">รวม</td>
                  <td className="text-right px-4 py-4 text-lg">
                    {['จับกุม', 'บำบัด', 'กลั่นแกล้ง', 'สืบสวนเพิ่มเติม', 'ยุติเรื่อง', 'อื่นๆ']
                      .reduce((s, k) => s + (rptData?.[k] || 0), 0).toLocaleString()}
                  </td>
                  <td className="text-right px-4 py-4 text-yellow-200 rounded-br-lg">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showUpload && <UploadRptModal onClose={() => setShowUpload(false)} onSaved={() => { loadRpt(); setShowUpload(false) }} />}

      {/* Source Info Modal */}
      {showSourceInfo && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSourceInfo(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-700 to-indigo-900 px-6 py-4 text-white flex items-center justify-between">
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
                    <span className="text-slate-500">รวมทั้งหมด</span>
                    <div className="font-bold text-blue-700">{totalCases.toLocaleString()} เรื่อง</div>
                  </div>
                  <div className="bg-white p-2 rounded">
                    <span className="text-slate-500">ดำเนินการแล้ว</span>
                    <div className="font-bold text-emerald-700">{completed.toLocaleString()} ({percent(completed, totalCases)})</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-blue-700">✓ ใช้สำหรับ: 5 Cards บนสุด, ตารางผลพฤติการณ์/ผลดำเนินการ</div>
              </div>

              <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg">
                <h3 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
                  <span>📁</span> 2. ข้อมูล Export Records
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  <strong>ไฟล์รายเรื่องที่ export จากระบบ ป.ป.ส.</strong> — มีรายละเอียดทุก case
                  (วันที่, เขต, แขวง, ช่องทาง, สถานะ ฯลฯ) ใช้สำหรับการวิเคราะห์เชิงลึก
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2 rounded">
                    <span className="text-slate-500">รวม</span>
                    <div className="font-bold text-amber-700">{filteredRecords.length.toLocaleString()} records</div>
                  </div>
                  <div className="bg-white p-2 rounded">
                    <span className="text-slate-500">ช่องทางหลัก</span>
                    <div className="font-bold text-amber-700">6 ช่องทาง</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-amber-700">✓ ใช้สำหรับ: Sources Overview, กราฟ, ตารางช่องทาง</div>
              </div>

              <div className="bg-slate-100 border border-slate-200 p-4 rounded-lg">
                <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <span>💡</span> ทำไมตัวเลขต่างกัน?
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  ทั้ง 2 แหล่งมาจาก ป.ป.ส. แต่ <strong>RPT_114 รวมทุก case</strong> ในระบบ
                  ส่วน <strong>Export Records เป็น subset</strong> ที่ส่งออกเป็นไฟล์รายเรื่อง
                  (ต่างกัน ~6 records — เป็นเรื่องปกติ)
                </p>
                <p className="text-sm text-slate-700 leading-relaxed mt-2">
                  <strong>หลักการ:</strong> ใช้ RPT_114 สำหรับนำเสนอ/รายงาน · ใช้ Records สำหรับวิเคราะห์เชิงลึก
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function percent(num, total) {
  if (!total) return '0%'
  return ((num / total) * 100).toFixed(1) + '%'
}

function BigCard({ icon, label, value, pct, sub, color }) {
  const colors = {
    blue:    { icon: 'text-blue-600',    bg: 'bg-blue-50',    value: 'text-blue-700',    pct: 'text-blue-600',    bar: 'bg-blue-500' },
    emerald: { icon: 'text-emerald-600', bg: 'bg-emerald-50', value: 'text-emerald-700', pct: 'text-emerald-600', bar: 'bg-emerald-500' },
    rose:    { icon: 'text-rose-600',    bg: 'bg-rose-50',    value: 'text-rose-700',    pct: 'text-rose-600',    bar: 'bg-rose-500' },
    slate:   { icon: 'text-slate-500',   bg: 'bg-slate-100',  value: 'text-slate-700',   pct: 'text-slate-500',   bar: 'bg-slate-500' },
    amber:   { icon: 'text-amber-600',   bg: 'bg-amber-50',   value: 'text-amber-700',   pct: 'text-amber-600',   bar: 'bg-amber-500' },
  }
  const c = colors[color] || colors.blue
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${c.bar}`}></div>
      <div className="flex items-start gap-2 mb-3">
        <div className={`w-9 h-9 ${c.bg} ${c.icon} rounded-lg flex items-center justify-center flex-shrink-0`}>{icon}</div>
        <div className="text-sm text-slate-700 font-medium leading-tight flex-1 pt-1">{label}</div>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <div className={`text-3xl font-extrabold ${c.value}`}>{(value || 0).toLocaleString()}</div>
        {pct && <div className={`text-sm font-bold ${c.pct}`}>{pct}</div>}
      </div>
      {sub && <div className="text-xs text-slate-500 leading-tight">{sub}</div>}
    </div>
  )
}

const SOURCE_THEMES = {
  'อินเตอร์เน็ต':  { icon: '🌐', gradient: 'from-blue-500 to-purple-600',   light: 'bg-blue-50',    text: 'text-blue-700' },
  'สายด่วน 1386':  { icon: '📞', gradient: 'from-emerald-500 to-teal-600',  light: 'bg-emerald-50', text: 'text-emerald-700' },
  'ทางรัฐ':        { icon: '🏛️', gradient: 'from-violet-400 to-purple-500', light: 'bg-violet-50',  text: 'text-violet-700' },
  'ช่องทางอื่นๆ':  { icon: '📋', gradient: 'from-orange-500 to-red-500',    light: 'bg-orange-50',  text: 'text-orange-700' },
}

const RANK_COLORS = {
  1: 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white',
  2: 'bg-gradient-to-r from-slate-300 to-slate-400 text-white',
  3: 'bg-gradient-to-r from-orange-400 to-orange-500 text-white',
  4: 'bg-slate-100 text-slate-500',
}

function SourceCard({ rank, channel, count, total }) {
  const theme = SOURCE_THEMES[channel] || SOURCE_THEMES['ช่องทางอื่นๆ']
  const rankColor = RANK_COLORS[rank] || 'bg-slate-100 text-slate-500'
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
  return (
    <div className="group bg-white border-2 border-slate-100 rounded-2xl overflow-hidden hover:border-transparent hover:-translate-y-1 hover:shadow-xl transition-all duration-300 cursor-pointer">
      <div className={`h-1.5 bg-gradient-to-r ${theme.gradient}`} />
      <div className="p-5">
        {/* Icon + Rank */}
        <div className="flex items-start justify-between mb-4">
          <div className={`w-14 h-14 ${theme.light} rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>
            {theme.icon}
          </div>
          <div className={`text-xs font-bold px-2.5 py-1 rounded-full ${rankColor}`}>
            #{rank}
          </div>
        </div>

        {/* Channel name */}
        <div className="text-sm text-slate-600 font-medium mb-1">{channel}</div>

        {/* Count */}
        <div className={`text-4xl font-extrabold bg-gradient-to-r ${theme.gradient} bg-clip-text text-transparent mb-3`}>
          {count.toLocaleString()}
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500">สัดส่วน</span>
            <span className={`text-sm font-bold ${theme.text}`}>{pct}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div className={`h-full bg-gradient-to-r ${theme.gradient} group-hover:opacity-90 transition-opacity duration-300`}
              style={{ width: `${Math.max(parseFloat(pct), 2)}%` }} />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
          จาก {total.toLocaleString()} เรื่องร้องฯ
        </div>
      </div>
    </div>
  )
}

function Modal({ children, onClose, title }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function UploadRptModal({ onClose, onSaved }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = async (f) => {
    if (!f) return
    setFile(f)
    setError('')
    setPreview(null)
    try {
      const buffer = await f.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const sheetName = wb.SheetNames.find(n => n.includes('RPT') || n.includes('114')) || wb.SheetNames[0]
      const sheet = wb.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

      let period = ''
      for (const row of data) {
        if (!row) continue
        if (row[8] === 'ระหว่างวันที่ : ') period = row[11]
      }

      const sumRow = data.find(r => r && String(r[1] || '').trim() === 'รวมทั้งหมด')
      if (!sumRow) throw new Error('ไม่พบแถว "รวมทั้งหมด" — ตรวจสอบว่าเป็นไฟล์ RPT_114')

      const totals = {
        total:        Number(sumRow[2])  || 0,
        completed:    Number(sumRow[3])  || 0,
        completed_pct: Number(sumRow[4]) || 0,
        found:        Number(sumRow[5])  || 0,
        notFound:     Number(sumRow[6])  || 0,
        notInArea:    Number(sumRow[7])  || 0,
        investigating: Number(sumRow[8]) || 0,
        deceased:     Number(sumRow[9])  || 0,
        arrested:     Number(sumRow[10]) || 0,
        moreInvest:   Number(sumRow[11]) || 0,
        treatment:    Number(sumRow[12]) || 0,
        harass:       Number(sumRow[13]) || 0,
        closed:       Number(sumRow[14]) || 0,
        other:        Number(sumRow[15]) || 0,
      }

      let year = 2569
      if (period) {
        const match = String(period).match(/(\d{2,4})\s*$/)
        if (match) {
          const y = parseInt(match[1])
          year = y < 100 ? 2500 + y : y
        }
      }

      setPreview({ period, totals, year })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleUpload = async () => {
    if (!preview) return
    if (!confirm('แทนที่ข้อมูล RPT_114 ปี ' + preview.year + ' ทั้งหมด?')) return
    setUploading(true)
    try {
      await supabase.from('operations_summary').delete().eq('channel', 'รวมทุกช่องทาง').eq('year', preview.year)
      const t = preview.totals
      const note = 'RPT_114 ' + (preview.period || '')
      const rows = [
        { channel: 'รวมทุกช่องทาง', category: 'รวมทั้งหมด',        count: t.total,         year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'ดำเนินการแล้ว',     count: t.completed,     year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'พบพฤติการณ์',       count: t.found,         year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'ไม่พบพฤติการณ์',    count: t.notFound,      year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'ไม่พบตัวในพื้นที่',  count: t.notInArea,     year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'อยู่ระหว่างสืบสวน', count: t.investigating, year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'จับกุม',            count: t.arrested,      year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'บำบัด',             count: t.treatment,     year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'กลั่นแกล้ง',        count: t.harass,        year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'ยุติเรื่อง',        count: t.closed,        year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'อื่นๆ',             count: t.other,         year: preview.year, notes: note },
      ]
      const { error } = await supabase.from('operations_summary').insert(rows)
      if (error) throw error
      alert('นำเข้าสำเร็จ! รวม ' + t.total + ' รายการ')
      onSaved()
    } catch (err) {
      alert('ไม่สำเร็จ: ' + err.message)
      setUploading(false)
    }
  }

  return (
    <Modal onClose={onClose} title="นำเข้ารายงาน RPT_114 (ป.ป.ส.)">
      <div className="p-6">
        {!preview && !error ? (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-sm text-blue-800">
              <strong>รองรับไฟล์รายงาน RPT_114</strong><br />
              "รายงานการดำเนินการตามข้อร้องเรียน" จากระบบ ป.ป.ส.
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
              className={`border-2 border-dashed rounded-xl p-10 text-center ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50'}`}>
              <Upload size={48} className="mx-auto text-slate-400 mb-3" />
              <div className="font-semibold text-slate-700 mb-3">ลากไฟล์ RPT_114 มาวาง</div>
              <label className="inline-block">
                <input type="file" accept=".xlsx,.xls" onChange={e => handleFile(e.target.files[0])} className="hidden" />
                <span className="px-5 py-2.5 bg-blue-600 text-white rounded-lg cursor-pointer font-medium inline-block">เลือกไฟล์</span>
              </label>
            </div>
          </>
        ) : error ? (
          <>
            <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-5 mb-4">
              <AlertTriangle className="text-rose-600 inline mr-2" size={18} />
              <span className="text-rose-700 font-medium">{error}</span>
            </div>
            <button onClick={() => { setError(''); setFile(null) }} className="w-full px-4 py-2 bg-slate-100 rounded-lg">ลองใหม่</button>
          </>
        ) : (
          <>
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 mb-4">
              <CheckCircle2 className="text-emerald-600 inline mr-2" size={20} />
              <strong className="text-emerald-900">อ่านไฟล์สำเร็จ</strong>
              <div className="text-xs text-emerald-700 mt-1">
                📅 ช่วง: {preview.period} · 🗓️ ปี: พ.ศ. {preview.year}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="text-xs text-blue-600">เรื่องร้องเรียน</div>
                <div className="text-2xl font-bold text-blue-700">{preview.totals.total.toLocaleString()}</div>
              </div>
              <div className="bg-emerald-50 p-3 rounded-lg">
                <div className="text-xs text-emerald-600">ดำเนินการ</div>
                <div className="text-2xl font-bold text-emerald-700">{preview.totals.completed.toLocaleString()}</div>
              </div>
              <div className="bg-rose-50 p-3 rounded-lg">
                <div className="text-xs text-rose-600">พบพฤติการณ์</div>
                <div className="text-xl font-bold text-rose-700">{preview.totals.found.toLocaleString()}</div>
              </div>
              <div className="bg-slate-100 p-3 rounded-lg">
                <div className="text-xs text-slate-600">ไม่พบ</div>
                <div className="text-xl font-bold text-slate-700">{preview.totals.notFound.toLocaleString()}</div>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setPreview(null); setFile(null) }} className="px-4 py-2 border rounded-lg">เลือกไฟล์ใหม่</button>
              <button onClick={handleUpload} disabled={uploading} className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
                {uploading ? 'กำลังนำเข้า...' : 'ยืนยันนำเข้า'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
