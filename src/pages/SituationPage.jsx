// /situation — สถานการณ์ยาเสพติด (รวม จับกุม/บำบัด/ร้องเรียน เดิม /arrest /incidents /treatment)
// filter เวลา+พื้นที่ ใช้ร่วมกันทุกส่วน (state เดียว) — เลือกส่วนที่แสดงด้วย listbox
import { useState, useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useDrugIncidents } from '../hooks/useDrugIncidents'
import { useAreaCascade } from '../hooks/useAreaCascade'
import { useFilter } from '../context/FilterContext'
import DateFilter from '../components/DateFilter'
import AreaCascadeBar from '../components/AreaCascadeBar'
import { filterByDateColumn } from '../utils/filterRows'
import ArrestSection from '../components/situation/ArrestSection'
import TreatmentSection from '../components/situation/TreatmentSection'
import IncidentsSection from '../components/situation/IncidentsSection'

const SECTIONS = [
  ['arrest', 'จับกุม', 'คดี'],
  ['treatment', 'บำบัด', 'ราย'],
  ['incidents', 'ร้องเรียน', 'เรื่อง'],
]

export default function SituationPage() {
  const { rows: allRows, isLoading, error, reload, availableYears } = useDrugIncidents()
  const { getDateRange, state: filterState } = useFilter()
  const range = getDateRange()
  const [section, setSection] = useState('arrest')

  const dateFiltered = useMemo(() => filterByDateColumn(allRows, 'received_date', range), [allRows, range?.from, range?.to])
  const cascade = useAreaCascade(dateFiltered)

  const arrestRows = useMemo(() => cascade.rows.filter((r) => r.action_arrest), [cascade.rows])
  const treatmentRows = useMemo(() => cascade.rows.filter((r) => r.action_treatment), [cascade.rows])
  const incidentsRows = cascade.rows

  const totals = { arrest: arrestRows.length, treatment: treatmentRows.length, incidents: incidentsRows.length }
  const [, sectionLabel, sectionUnit] = SECTIONS.find(([id]) => id === section)

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-[1280px] mx-auto">
        <div className="rounded-xl border border-slate-200 bg-white p-8 h-64 animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
        <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle size={28} className="text-rose-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">ไม่สามารถโหลดข้อมูลได้</h2>
        <p className="text-sm text-slate-500 mb-4 text-center max-w-xs">{error}</p>
        <button onClick={reload} className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold transition">
          ลองอีกครั้ง
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1280px] mx-auto space-y-7 bg-[#f6f7f9] min-h-screen">
      <header className="border-b border-slate-200 pb-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-slate-500">สถานการณ์ยาเสพติด · drug_incidents</div>
            <h1 className="mt-1.5 text-3xl lg:text-[2rem] font-semibold tracking-tight text-slate-900 leading-tight">สถานการณ์ยาเสพติด</h1>
            <p className="mt-2 text-sm text-slate-500 tabular-nums">
              {totals[section].toLocaleString()} {sectionUnit} · {sectionLabel} ในช่วงที่เลือก
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5" role="tablist" aria-label="เลือกข้อมูล">
              {SECTIONS.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)}
                  className={`h-8 px-3.5 rounded-md text-[13px] transition ${
                    section === id
                      ? 'bg-white text-[#243aa8] font-semibold shadow-[0_1px_2px_rgba(15,22,38,0.08)]'
                      : 'text-slate-500 font-medium hover:text-slate-700'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <DateFilter availableYears={availableYears} />
          </div>
        </div>
      </header>

      <AreaCascadeBar cascade={cascade} />

      {section === 'arrest' && (
        <ArrestSection rows={arrestRows} total={arrestRows.length} allRows={allRows} cascade={cascade} filterState={filterState} range={range} />
      )}
      {section === 'treatment' && (
        <TreatmentSection rows={treatmentRows} total={treatmentRows.length} range={range} cascade={cascade} />
      )}
      {section === 'incidents' && (
        <IncidentsSection rows={incidentsRows} total={incidentsRows.length} allRows={allRows} cascade={cascade}
          filterState={filterState} range={range} availableYears={availableYears} />
      )}
    </div>
  )
}
