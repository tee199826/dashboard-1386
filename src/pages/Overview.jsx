import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, LabelList, Sector,
} from 'recharts'
import {
  TrendingUp, CheckCircle2, Clock, MapPin,
  User, Users, ArrowRightLeft, Ban, ArrowRight, Trophy, ChevronDown, Info, X, Search, RefreshCw,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import * as stats from '../utils/statistics'

const BEHAVIOR_COLORS = { 'เสพ': '#3B82F6', 'ค้า': '#EF4444', 'เสพ/ค้า': '#F59E0B', 'ผลิต': '#8B5CF6' }

const BKK_GROUPS = {
  'กรุงเทพเหนือ': '🟡', 'กรุงเทพใต้': '🔵', 'กรุงเทพกลาง': '🟢',
  'กรุงเทพตะวันออก': '🟠', 'กรุงธนเหนือ': '🟣', 'กรุงธนใต้': '🔴',
}

const DNAME_TO_GROUP = {
  'เขตดอนเมือง':'กรุงเทพเหนือ','เขตหลักสี่':'กรุงเทพเหนือ','เขตบางเขน':'กรุงเทพเหนือ',
  'เขตสายไหม':'กรุงเทพเหนือ','เขตลาดพร้าว':'กรุงเทพเหนือ','เขตบึงกุ่ม':'กรุงเทพเหนือ','เขตคันนายาว':'กรุงเทพเหนือ',
  'เขตพระนคร':'กรุงเทพกลาง','เขตดุสิต':'กรุงเทพกลาง','เขตบางรัก':'กรุงเทพกลาง',
  'เขตป้อมปราบศัตรูพ่าย':'กรุงเทพกลาง','เขตสัมพันธวงศ์':'กรุงเทพกลาง','เขตบางซื่อ':'กรุงเทพกลาง',
  'เขตจตุจักร':'กรุงเทพกลาง','เขตห้วยขวาง':'กรุงเทพกลาง','เขตวังทองหลาง':'กรุงเทพกลาง',
  'เขตมีนบุรี':'กรุงเทพตะวันออก','เขตลาดกระบัง':'กรุงเทพตะวันออก','เขตหนองจอก':'กรุงเทพตะวันออก',
  'เขตคลองสามวา':'กรุงเทพตะวันออก','เขตสะพานสูง':'กรุงเทพตะวันออก','เขตบางกะปิ':'กรุงเทพตะวันออก',
  'เขตสวนหลวง':'กรุงเทพตะวันออก','เขตประเวศ':'กรุงเทพตะวันออก','เขตพระโขนง':'กรุงเทพตะวันออก',
  'เขตปทุมวัน':'กรุงเทพใต้','เขตพญาไท':'กรุงเทพใต้','เขตราชเทวี':'กรุงเทพใต้',
  'เขตวัฒนา':'กรุงเทพใต้','เขตคลองเตย':'กรุงเทพใต้','เขตยานนาวา':'กรุงเทพใต้',
  'เขตสาทร':'กรุงเทพใต้','เขตบางคอแหลม':'กรุงเทพใต้','เขตดินแดง':'กรุงเทพใต้','เขตบางนา':'กรุงเทพใต้',
  'เขตคลองสาน':'กรุงธนเหนือ','เขตธนบุรี':'กรุงธนเหนือ','เขตบางกอกใหญ่':'กรุงธนเหนือ',
  'เขตบางกอกน้อย':'กรุงธนเหนือ','เขตบางพลัด':'กรุงธนเหนือ','เขตตลิ่งชัน':'กรุงธนเหนือ',
  'เขตทวีวัฒนา':'กรุงธนเหนือ','เขตภาษีเจริญ':'กรุงธนเหนือ',
  'เขตบางแค':'กรุงธนใต้','เขตหนองแขม':'กรุงธนใต้','เขตบางขุนเทียน':'กรุงธนใต้',
  'เขตราษฏร์บูรณะ':'กรุงธนใต้','เขตทุ่งครุ':'กรุงธนใต้','เขตจอมทอง':'กรุงธนใต้','เขตบางบอน':'กรุงธนใต้',
}

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
  const { records, isLoading, reload } = useData()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  const [trendYear, setTrendYear] = useState('all')
  const [channelYear, setChannelYear] = useState('all')
  const [channelMonth, setChannelMonth] = useState('all')
  const [selectedDistricts, setSelectedDistricts] = useState([])
  const [showDistrictPicker, setShowDistrictPicker] = useState(false)
  const [showSourceInfo, setShowSourceInfo] = useState(false)
  const [activeBehaviorIndex, setActiveBehaviorIndex] = useState(null)
  const [activeChannelIndex, setActiveChannelIndex] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const [incidents, setIncidents] = useState([])
  const [bGroup, setBGroup] = useState('all')
  const [bDistrict, setBDistrict] = useState('all')
  const [bSubdistrict, setBSubdistrict] = useState('all')
  const [bCommunity, setBCommunity] = useState('all')
  const [bSearch, setBSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      let all = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('drug_incidents')
          .select('district, subdistrict, community, behaviors')
          .range(from, from + 999)
        if (error || !data || data.length === 0) break
        all = all.concat(data)
        if (data.length < 1000) break
        from += 1000
      }
      setIncidents(all)
    }
    load()
  }, [])

  const data = records ?? []
  const years = useMemo(() => stats.getYears(data), [data])

  const filteredRecords = data

  const totals = useMemo(() => {
    const total     = filteredRecords.length
    const completed = filteredRecords.filter(r => r.status === 'ดำเนินการแล้ว').length
    const pending   = total - completed   // ทุก status ที่ไม่ใช่ 'ดำเนินการแล้ว'
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

  if (isLoading) return (
    <div className="p-16 text-center">
      <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-blue-700 rounded-full animate-spin mb-4" />
      <p className="text-slate-500">กำลังโหลดข้อมูล...</p>
    </div>
  )

  const DONUT_COLORS = ['#1E40AF', '#3B82F6', '#10B981', '#FACC15']
  const ACTION_ICONS = [
    { icon: <User size={36} />, color: 'amber' },
    { icon: <Users size={36} />, color: 'rose' },
    { icon: <ArrowRightLeft size={36} />, color: 'sky' },
    { icon: <Ban size={36} />, color: 'emerald' },
  ]

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      <style>{`@keyframes pie-tip-in{from{opacity:0;transform:translateY(8px) scale(0.95)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800">ภาพรวม</h1>
          <button
            onClick={() => setShowSourceInfo(true)}
            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-full text-xs font-medium text-blue-700 flex items-center gap-1">
            <Info size={12} /> แหล่งข้อมูล
          </button>
          <button
            onClick={reload}
            disabled={isLoading}
            title="โหลดข้อมูลใหม่จากฐานข้อมูล"
            className="p-1.5 rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition disabled:opacity-40">
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <p className="text-sm text-slate-500 mt-1">สถิติเรื่องร้องเรียนยาเสพติด · กรุงเทพมหานคร</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

      {/* แนวโน้มรายเดือน */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
              <TrendingUp size={20} className="text-blue-600" /> แนวโน้มรายเดือน
              <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">📁 จาก records {records.length} เรื่อง</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">จำนวนเรื่องรับเข้าและการดำเนินการในแต่ละเดือน</p>
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

      {/* Top 10 เขต */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
              <MapPin size={20} className="text-blue-600" />
              {selectedDistricts.length === 0 ? '10 เขตที่มีเรื่องร้องเรียนมากที่สุด' : `เปรียบเทียบ ${selectedDistricts.length} เขต`}
              <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">📁 จาก records {records.length} เรื่อง</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">จัดอันดับตามจำนวนเรื่องที่ได้รับ</p>
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

      {/* Row: ช่องทาง + Top 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut ช่องทาง */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
                ช่องทางการรับเรื่อง
                <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">📁 จาก records {records.length} เรื่อง</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">สัดส่วนช่องทางที่ประชาชนใช้ร้องเรียน</p>
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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-5">
            <Trophy size={20} className="text-amber-500" /> 5 อันดับเขตที่ร้องเรียนสูงสุด
          </h3>
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

      {/* สัดส่วนพฤติการณ์ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* gradient accent */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold text-slate-800">สัดส่วนพฤติการณ์ยาเสพติด</h3>
              <p className="text-sm text-slate-500 mt-0.5">จำแนกตามพฤติการณ์ · กรองตามพื้นที่</p>
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

              <div className="space-y-2.5">
                {/* Search */}
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

                {/* Cascade selects */}
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

              {/* Active tags */}
              {bHasFilter && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1">
                  {bGroup !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs font-semibold">{BKK_GROUPS[bGroup]} {bGroup}<button onMouseDown={() => { setBGroup('all'); setBDistrict('all'); setBSubdistrict('all'); setBCommunity('all') }} className="opacity-75 hover:opacity-100 ml-0.5">×</button></span>}
                  {bDistrict !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-600 text-white rounded-full text-xs font-semibold">{bDistrict}<button onMouseDown={() => { setBDistrict('all'); setBSubdistrict('all'); setBCommunity('all') }} className="opacity-75 hover:opacity-100 ml-0.5">×</button></span>}
                  {bSubdistrict !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-600 text-white rounded-full text-xs font-semibold">{bSubdistrict}<button onMouseDown={() => { setBSubdistrict('all'); setBCommunity('all') }} className="opacity-75 hover:opacity-100 ml-0.5">×</button></span>}
                  {bCommunity !== 'all' && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-600 text-white rounded-full text-xs font-semibold">{bCommunity}<button onMouseDown={() => setBCommunity('all')} className="opacity-75 hover:opacity-100 ml-0.5">×</button></span>}
                  {bSearch && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700 text-white rounded-full text-xs font-semibold">🔍 {bSearch}<button onMouseDown={() => setBSearch('')} className="opacity-75 hover:opacity-100 ml-0.5">×</button></span>}
                </div>
              )}
            </div>

            {/* Right: Chart + stat cards */}
            <div className="flex-1 min-w-0 flex flex-col">
              {behaviorData.length > 0 ? (
                <>
                  {/* Donut chart */}
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
                    {/* Center label */}
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

                  {/* Stat cards */}
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

      {/* หน่วยดำเนินการ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-base font-semibold text-slate-800 text-center mb-6">หน่วยดำเนินการ</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {actions.map((a, i) => (
            <ActionIcon key={a.name} icon={ACTION_ICONS[i]?.icon} label={a.name}
              pct={a.pct} count={a.count} color={ACTION_ICONS[i]?.color ?? 'blue'} />
          ))}
        </div>
      </div>

      {/* Source Info Modal */}
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
                    <span className="text-slate-500">รวมทั้งหมด</span>
                    <div className="font-bold text-blue-700">{totals.total.toLocaleString()} เรื่อง</div>
                  </div>
                  <div className="bg-white p-2 rounded">
                    <span className="text-slate-500">ดำเนินการแล้ว</span>
                    <div className="font-bold text-emerald-700">{totals.completed.toLocaleString()} ({totals.pct}%)</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-blue-700">✓ ใช้สำหรับ: 3 Cards บนสุด, ตารางผลพฤติการณ์/ผลดำเนินการ</div>
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
                    <div className="font-bold text-amber-700">{records.length.toLocaleString()} records</div>
                  </div>
                  <div className="bg-white p-2 rounded">
                    <span className="text-slate-500">ช่องทางหลัก</span>
                    <div className="font-bold text-amber-700">6 ช่องทาง</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-amber-700">✓ ใช้สำหรับ: กราฟรายเดือน, Top เขต, ช่องทาง, จัดการข้อมูล</div>
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
    blue:    { bg: '#2563EB', footer: '#1D4ED8' },
    emerald: { bg: '#059669', footer: '#047857' },
    amber:   { bg: '#D97706', footer: '#B45309' },
    rose:    { bg: '#E11D48', footer: '#BE123C' },
  }
  const c = colors[color] || colors.blue
  const clickable = !!onClick

  return (
    <div
      onClick={onClick}
      className={`rounded-xl shadow-sm text-white overflow-hidden group transition-all duration-300 ${
        clickable
          ? 'cursor-pointer hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 active:shadow-lg'
          : 'hover:shadow-lg'
      }`}
      style={{ backgroundColor: c.bg }}>

      <div className="relative px-5 pt-5 pb-3 min-h-[140px]">
        {/* Icon ใหญ่จาง */}
        <div className="absolute right-2 top-3 opacity-25 group-hover:opacity-40 transition-opacity duration-300 pointer-events-none">
          <div className="text-white" style={{ transform: 'scale(3.5)', transformOrigin: 'top right' }}>
            {icon}
          </div>
        </div>

        {/* Sparkle effect ตอน hover */}
        {clickable && (
          <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
        )}

        <div className="relative z-10">
          <div className="text-5xl font-extrabold leading-none mb-2 tracking-tight drop-shadow-sm">
            {value}
          </div>
          <div className="text-sm font-medium opacity-95">{label}</div>
          {unit && <div className="text-xs opacity-80 mt-0.5">{unit}</div>}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 text-xs flex items-center justify-between font-medium relative overflow-hidden"
           style={{ backgroundColor: c.footer }}>
        <span className="relative z-10 flex items-center gap-1">
          {clickable && <span className="opacity-80">👆</span>}
          {clickable ? 'คลิกเพื่อดูข้อมูล' : 'ดูเพิ่มเติม'}
        </span>
        <span className="relative z-10 inline-block transform transition-all duration-300 group-hover:translate-x-1 group-hover:scale-125">
          →
        </span>
        {clickable && (
          <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-300"></div>
        )}
      </div>
    </div>
  )
}

function PieTooltipCard({ label, value, pct, color, total, rank, rankOfTotal, mouseX, mouseY }) {
  const W = 232
  const vw = window.innerWidth, vh = window.innerHeight
  const OFF = 22

  // Clamp position so card stays inside viewport
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
      {/* Color accent line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '14px 14px 0 0', background: color, opacity: 0.9 }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11, marginTop: 4 }}>
        <div style={{
          width: 10, height: 28, borderRadius: 3, flexShrink: 0,
          background: color, boxShadow: `0 0 12px ${color}70`,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 800, lineHeight: 1.3, letterSpacing: '-0.01em' }}>{label}</div>
          <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, marginTop: 2 }}>
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

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 11 }} />

      {/* Value */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>จำนวน</span>
        <span style={{ color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.45, marginLeft: 5 }}>เรื่อง</span>
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          width: `${Math.min(pctNum, 100)}%`, height: '100%',
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          borderRadius: 99,
          boxShadow: `0 0 10px ${color}70`,
          transition: 'width 0.35s cubic-bezier(0.2,0,0,1)',
        }} />
      </div>

      {/* vs average row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>เทียบค่าเฉลี่ย ({avgPct.toFixed(1)}%)</span>
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
