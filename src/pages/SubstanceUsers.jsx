import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from 'recharts'
import {
  Users, Activity, Clock, ShieldAlert, HeartPulse, AlertTriangle, MapPin, Search,
} from 'lucide-react'
import { fetchAllPages } from '../utils/supabasePagination'
import PeriodBadge from '../components/PeriodBadge'
import IncidentMap from '../components/IncidentMap'

const PIE_COLORS = ['#3B82F6', '#EF4444', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#64748B']
const FIELDS = 'age,occupation,income_range,arrest_count,rehab_count,first_use_age,first_drug,first_reason,arrests,rehabs,regular_drugs,dealer_locations'

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

export default function SubstanceUsers() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── district table controls (section 6) ──
  const [search, setSearch] = useState('')
  const [sortDesc, setSortDesc] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null)
      try {
        const data = await fetchAllPages('substance_users', FIELDS)
        setRows(data)
      } catch {
        setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const agg = useMemo(() => {
    const total = rows.length

    // KPI
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

    // [3.2] first_drug pie (top 6 + อื่นๆ)
    const fdMap = {}
    rows.forEach(r => { const d = (r.first_drug || '').trim(); if (d) fdMap[d] = (fdMap[d] || 0) + 1 })
    const firstDrug = topN(fdMap, 6)

    // [3.3] first_reason (split comma → count) horizontal
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
  }, [rows])

  // ── choropleth layer (section 6) — reuse IncidentMap district layer ──
  const districtLayerKey = `su-${rows.length}`
  const districtLayerStyle = useMemo(() => (feature) => {
    const dn = feature.properties?.dname
    const c = agg.distMap[dn] || 0
    if (c === 0) return { color: '#cbd5e1', weight: 1, fillColor: '#f1f5f9', fillOpacity: 0.35, opacity: 0.5 }
    const t = c / agg.districtMax
    return { color: '#1e40af', weight: 1.2, fillColor: '#2563eb', fillOpacity: 0.2 + t * 0.6, opacity: 0.85 }
  }, [agg.distMap, agg.districtMax])
  const districtLayerOnEachFeature = useMemo(() => (feature, layer) => {
    const dn = feature.properties?.dname || 'ไม่ระบุ'
    const c = agg.distMap[dn] || 0
    layer.bindTooltip(`${dn} — ${c} ราย`, { sticky: true, className: 'district-tooltip' })
  }, [agg.distMap])

  const filteredTable = useMemo(() => {
    const q = search.trim()
    let t = agg.districtTable.filter(d => !q || d.name.includes(q))
    t = [...t].sort((a, b) => sortDesc ? b.count - a.count : a.count - b.count)
    return t
  }, [agg.districtTable, search, sortDesc])

  const period = `ข้อมูลจาก ${agg.total} ราย`

  if (loading) return (
    <div className="p-16 text-center">
      <div className="inline-block w-12 h-12 border-4 border-slate-200 border-t-blue-700 rounded-full animate-spin mb-4" />
      <p className="text-slate-500">กำลังโหลดข้อมูล...</p>
    </div>
  )
  if (error) return (
    <div className="p-8 max-w-md mx-auto mt-8 bg-red-50 border border-red-200 rounded-2xl text-center">
      <AlertTriangle size={24} className="text-red-500 mx-auto mb-3" />
      <p className="text-sm text-red-600">{error}</p>
    </div>
  )

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8">
      {/* Hero */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-800 rounded-2xl px-6 py-5 text-white shadow-lg">
        <div className="text-xs font-semibold uppercase tracking-widest text-blue-300 mb-1">ข้อมูลผู้เสพ · Substance Users</div>
        <h1 className="text-3xl font-bold leading-tight">ผู้เสพ</h1>
      </div>

      {/* [1] KPI Strip */}
      <section className="space-y-3">
        <SectionHeader title="ภาพรวม" period={period} />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard icon={<Users size={20} />} label="ผู้เสพรวม" value={agg.total.toLocaleString()}
            sub="ทั้งหมดในระบบ" bg="from-blue-700 to-blue-600" foot="#1D4ED8" source="substance_users" />
          <KpiCard icon={<Activity size={20} />} label="อายุเฉลี่ย" value={agg.avgAge.toFixed(1)}
            sub="ปี" bg="from-sky-600 to-sky-500" foot="#0369A1" source="substance_users" />
          <KpiCard icon={<Clock size={20} />} label="อายุเริ่มเสพเฉลี่ย"
            value={agg.avgFirstAge > 0 ? agg.avgFirstAge.toFixed(1) : '—'}
            sub={agg.avgFirstAge > 0 ? 'ปี' : 'ไม่มีข้อมูล'} bg="from-violet-600 to-violet-500" foot="#5B21B6" source="substance_users" />
          <KpiCard icon={<ShieldAlert size={20} />} label="% เคยถูกจับ"
            value={`${agg.total ? ((agg.arrested / agg.total) * 100).toFixed(0) : 0}%`}
            sub={`${agg.arrested} ราย`} bg="from-red-600 to-rose-500" foot="#B91C1C" source="substance_users" />
          <KpiCard icon={<HeartPulse size={20} />} label="% เคยบำบัด"
            value={`${agg.total ? ((agg.rehabbed / agg.total) * 100).toFixed(0) : 0}%`}
            sub={`${agg.rehabbed} ราย`} bg="from-emerald-600 to-green-500" foot="#047857" source="substance_users" />
        </div>
      </section>

      {/* [2] Demographics */}
      <section className="space-y-3">
        <SectionHeader title="ข้อมูลประชากร" period={period} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="กลุ่มอายุ">
            <VBar data={agg.ageGroups} color="#3B82F6" />
          </ChartCard>
          <ChartCard title="อาชีพ (10 อันดับ)">
            <HBar data={agg.occupations} color="#8B5CF6" height={300} />
          </ChartCard>
          <ChartCard title="รายได้ต่อเดือน">
            <HBar data={agg.income} color="#10B981" height={300} />
          </ChartCard>
        </div>
      </section>

      {/* [3] ประวัติการเสพ */}
      <section className="space-y-3">
        <SectionHeader title="ประวัติการเสพ" period={period} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="อายุที่เริ่มเสพ">
            {agg.firstUseHist.length ? <VBar data={agg.firstUseHist} color="#F59E0B" /> : <Empty />}
          </ChartCard>
          <ChartCard title="ชนิดยาที่ใช้ครั้งแรก">
            <DonutPie data={agg.firstDrug} />
          </ChartCard>
          <ChartCard title="สาเหตุการเสพครั้งแรก">
            <HBar data={agg.firstReason} color="#EF4444" height={300} />
          </ChartCard>
        </div>
      </section>

      {/* [4] ยาประจำ + ราคา */}
      <section className="space-y-3">
        <SectionHeader title="ยาที่ใช้ประจำ และ ราคา" period={period} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="ยาที่ใช้เป็นประจำ">
            {agg.regularDrugs.length ? <HBar data={agg.regularDrugs} color="#3B82F6" height={300} />
              : <Empty />}
          </ChartCard>
          <ChartCard title="ราคาเฉลี่ยต่อยา (บาท · ผู้ระบุ ≥ 3 ราย)">
            {agg.priceAvg.length ? <HBar data={agg.priceAvg} color="#0EA5E9" height={300} unit=" บาท" />
              : <Empty />}
          </ChartCard>
        </div>
      </section>

      {/* [5] ประวัติถูกจับ + บำบัด */}
      <section className="space-y-3">
        <SectionHeader title="ประวัติการถูกจับ และ การบำบัด" period={period} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="จำนวนครั้งที่ถูกจับ">
            <VBar data={agg.arrestBuckets} color="#EF4444" />
          </ChartCard>
          <ChartCard title="ชนิดยาตอนถูกจับ">
            {agg.arrestDrugs.length ? <HBar data={agg.arrestDrugs} color="#F59E0B" height={300} /> : <Empty />}
          </ChartCard>
          <ChartCard title="ข้อหา">
            {agg.charges.length ? <DonutPie data={agg.charges} /> : <Empty />}
          </ChartCard>
        </div>
      </section>

      {/* [6] แหล่งซื้อ × Map */}
      <section className="space-y-3">
        <SectionHeader title="แหล่งซื้อยา รายเขต" period={period} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* map */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <MapPin size={16} className="text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-800">แผนที่กรุงเทพฯ · เขตที่เข้มกว่า = มีแหล่งซื้อมากกว่า</h3>
            </div>
            <div className="h-[500px]">
              <IncidentMap
                className="w-full h-full"
                points={[]}
                viewMode="point"
                getColor={() => '#2563eb'}
                districtLayerKey={districtLayerKey}
                districtLayerStyle={districtLayerStyle}
                districtLayerOnEachFeature={districtLayerOnEachFeature}
              />
            </div>
          </div>

          {/* table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">เขต × จำนวนราย</h3>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเขต..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none" />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[440px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white text-xs sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-bold">เขต</th>
                    <th onClick={() => setSortDesc(s => !s)}
                      className="text-right px-4 py-2.5 font-bold cursor-pointer select-none whitespace-nowrap">
                      จำนวน {sortDesc ? '▼' : '▲'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTable.map((d, i) => (
                    <tr key={d.name} className={`border-t border-slate-100 ${i % 2 ? 'bg-slate-50/50' : ''} hover:bg-blue-50/40`}>
                      <td className="px-4 py-2 text-slate-700">{d.name}</td>
                      <td className="px-4 py-2 text-right font-semibold text-blue-700 tabular-nums">{d.count.toLocaleString()}</td>
                    </tr>
                  ))}
                  {filteredTable.length === 0 && (
                    <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-400 text-sm">ไม่พบเขต</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── local helpers (reuse patterns จากหน้าเดิม) ───────────────────────────────

function SectionHeader({ title, period }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-blue-600 rounded-full" />
        <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
      </div>
      <PeriodBadge period={period} />
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Empty() {
  return <div className="h-[260px] flex items-center justify-center text-slate-400 text-sm">ไม่มีข้อมูล</div>
}

// vertical bar (categorical)
function VBar({ data, color, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 16, right: 10, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={data.length > 5 ? -20 : 0} textAnchor={data.length > 5 ? 'end' : 'middle'} height={data.length > 5 ? 50 : 30} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} name="จำนวน">
          <LabelList dataKey="value" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#334155' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// horizontal bar (long labels)
function HBar({ data, color, height = 260, unit = '' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} width={130}
          tickFormatter={v => (v.length > 18 ? v.slice(0, 17) + '…' : v)} />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
          formatter={v => [`${v.toLocaleString()}${unit}`, 'จำนวน']} />
        <Bar dataKey="value" fill={color} radius={[0, 5, 5, 0]} name="จำนวน">
          <LabelList dataKey="value" position="right" style={{ fontSize: 10, fontWeight: 600, fill: '#475569' }}
            formatter={v => `${v.toLocaleString()}${unit}`} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function DonutPie({ data, height = 260 }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={2}>
            {data.map((d, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ bottom: 0 }}>
        <div className="text-2xl font-bold text-slate-800 tabular-nums leading-none">{total.toLocaleString()}</div>
        <div className="text-xs text-slate-500 mt-0.5">รวม</div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="truncate max-w-[110px]">{d.name}</span>
            <span className="text-slate-400">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// KpiCard — pattern เดียวกับ /bkn (tone dark) แต่ replicate ในไฟล์นี้ (ของ /bkn ไม่ export, ห้ามแตะหน้านั้น)
function KpiCard({ icon, label, value, sub, bg, foot, source }) {
  return (
    <div className={`rounded-2xl text-white overflow-hidden shadow-sm bg-gradient-to-br ${bg}`}>
      <div className="relative px-5 pt-5 pb-3 min-h-[118px]">
        <div className="absolute right-3 top-3 opacity-15 pointer-events-none" style={{ transform: 'scale(3.2)', transformOrigin: 'top right' }}>
          {icon}
        </div>
        <div className="relative z-10">
          <div className="text-4xl font-extrabold leading-tight mb-1.5 tabular-nums">{value}</div>
          <div className="text-sm font-semibold opacity-95 leading-none">{label}</div>
          <div className="text-xs opacity-65 mt-1">{sub}</div>
        </div>
      </div>
      <div className="px-5 py-1.5 text-xs font-medium opacity-60" style={{ background: foot }}>{source}</div>
    </div>
  )
}
