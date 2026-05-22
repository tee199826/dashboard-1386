import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { useData } from '../context/DataContext'
import * as stats from '../utils/statistics'

export default function AllDistricts() {
  const { records } = useData()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const districts = useMemo(() => stats.getTopDistricts(records, 100), [records])

  const filtered = useMemo(() => {
    if (!search.trim()) return districts
    return districts.filter(d => d.name.includes(search))
  }, [districts, search])

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto">
      <button
        onClick={() => navigate('/overview')}
        className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4 text-sm font-medium"
      >
        <ArrowLeft size={16} /> กลับหน้าหลัก
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-800">เรื่องร้องเรียนทุกเขต</h1>
            <p className="text-sm text-slate-500 mt-1">รวมทั้งหมด {districts.length} เขต</p>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาเขต..."
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-64 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((d, i) => {
            const rankColors = i === 0 ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white'
                             : i === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white'
                             : i === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-500 text-white'
                             : 'bg-blue-100 text-blue-700'
            return (
              <div key={d.name} className="flex items-center justify-between p-5 bg-gradient-to-r from-slate-50 to-white border border-slate-200 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0 ${rankColors}`}>
                    #{i + 1}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 text-lg leading-tight">{d.name}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      ดำเนินการแล้ว <span className="text-emerald-600 font-semibold">{d.completed.toLocaleString()}</span> เรื่อง
                    </div>
                  </div>
                </div>
                <div className="text-right pl-4">
                  <div className="text-3xl font-bold text-blue-700">{d.total.toLocaleString()}</div>
                  <div className="text-xs text-slate-500 -mt-1">เรื่อง</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
