import { useMemo } from 'react'
import { Filter, X } from 'lucide-react'
import { useData } from '../context/DataContext'

const THAI_MONTHS = [
  { v: '01', l: 'มกราคม' }, { v: '02', l: 'กุมภาพันธ์' },
  { v: '03', l: 'มีนาคม' }, { v: '04', l: 'เมษายน' },
  { v: '05', l: 'พฤษภาคม' }, { v: '06', l: 'มิถุนายน' },
  { v: '07', l: 'กรกฎาคม' }, { v: '08', l: 'สิงหาคม' },
  { v: '09', l: 'กันยายน' }, { v: '10', l: 'ตุลาคม' },
  { v: '11', l: 'พฤศจิกายน' }, { v: '12', l: 'ธันวาคม' },
]

const CHANNELS = ['อินเตอร์เน็ต', 'สายด่วน 1386', 'ทางรัฐ', 'อื่นๆ']

export default function FilterBar() {
  const { records, filters, setFilters } = useData()

  const years = useMemo(() => {
    const s = new Set()
    records.forEach(r => {
      if (r.date) s.add(parseInt(r.date.slice(0, 4)) + 543)
    })
    return Array.from(s).sort()
  }, [records])

  const districts = useMemo(() => {
    const s = new Set()
    records.forEach(r => { if (r.district) s.add(r.district) })
    return Array.from(s).sort()
  }, [records])

  const hasActive = Object.values(filters).some(v => v !== 'all')
  const set = (key, val) => setFilters({ ...filters, [key]: val })
  const clear = () => setFilters({ year: 'all', month: 'all', group: 'all', district: 'all', channel: 'all' })

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Filter size={18} className="text-blue-700" />
        <h3 className="font-semibold text-slate-800">ตัวกรองข้อมูล</h3>
        {hasActive && (
          <button
            onClick={clear}
            className="ml-auto text-xs text-blue-700 hover:bg-blue-50 px-3 py-1 rounded-full flex items-center gap-1"
          >
            <X size={12} /> ล้างตัวกรอง
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <FilterSelect
          label="ปี"
          value={filters.year}
          onChange={v => set('year', v)}
          options={[{ v: 'all', l: 'ทุกปี' }, ...years.map(y => ({ v: String(y), l: 'พ.ศ. ' + y }))]}
        />
        <FilterSelect
          label="เดือน"
          value={filters.month}
          onChange={v => set('month', v)}
          options={[{ v: 'all', l: 'ทุกเดือน' }, ...THAI_MONTHS]}
        />
        <FilterSelect
          label="กลุ่มเรื่อง"
          value={filters.group}
          onChange={v => set('group', v)}
          options={[
            { v: 'all', l: 'ทุกกลุ่ม' },
            { v: '1', l: '1 - พบพฤติการณ์' },
            { v: '2', l: '2 - มีตัวตน ไม่พบประวัติ' },
            { v: '3', l: '3 - พิสูจน์ทราบไม่ได้' },
            { v: '4', l: '4 - สถานที่' },
            { v: '5', l: '5 - พื้นที่' },
          ]}
        />
        <FilterSelect
          label="เขต"
          value={filters.district}
          onChange={v => set('district', v)}
          options={[{ v: 'all', l: 'ทุกเขต' }, ...districts.map(d => ({ v: d, l: d }))]}
        />
        <FilterSelect
          label="ช่องทาง"
          value={filters.channel}
          onChange={v => set('channel', v)}
          options={[{ v: 'all', l: 'ทุกช่องทาง' }, ...CHANNELS.map(c => ({ v: c, l: c }))]}
        />
      </div>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition"
      >
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )
}
