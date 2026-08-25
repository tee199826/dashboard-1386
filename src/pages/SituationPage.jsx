// /situation — สถานการณ์ยาเสพติด (รวม จับกุม/บำบัด/ร้องเรียน เดิม /arrest /incidents /treatment)
// filter เวลา+พื้นที่ ใช้ร่วมกันทุกส่วน (state เดียว) — เลือกส่วนที่แสดงด้วย listbox
import { useState, useMemo, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useDrugIncidents } from '../hooks/useDrugIncidents'
import { useArrestData } from '../hooks/useArrestData'
import { useTreatmentData } from '../hooks/useTreatmentData'
import { useAreaCascade } from '../hooks/useAreaCascade'
import { useFilter } from '../context/FilterContext'
import DateFilter from '../components/DateFilter'
import AreaCascadeBar from '../components/AreaCascadeBar'
import FilterPill from '../components/FilterPill'
import { filterByDateColumn } from '../utils/filterRows'
import { filterArrestRows } from '../utils/arrestData'
import { filterTreatmentRows } from '../utils/treatmentData'
import ArrestSection from '../components/situation/ArrestSection'
import TreatmentSection from '../components/situation/TreatmentSection'
import IncidentsSection from '../components/situation/IncidentsSection'

const SECTIONS = [
  ['arrest', 'จับกุม', 'คดี'],
  ['treatment', 'บำบัด', 'ราย'],
  ['incidents', 'ร้องเรียน', 'เรื่อง'],
]

// จับกุม/บำบัดมี caption ของตัวเอง (ดึงจาก arrest_/treatment_ — สถิติทางการจาก CRIMES/บสต.) — ดูจุดแสดงผล yearRangeLabel ด้านล่าง
// ร้องเรียนไม่ต้องมี caption เพราะคือทุกเหตุการณ์ในระบบอยู่แล้ว ไม่มีความเสี่ยงเข้าใจผิด
const SUB_DISABLED_REASON = { arrest: 'จับกุมมีข้อมูลระดับเขต', treatment: 'บำบัดมีข้อมูลระดับเขต' }
const DISTRICT_ONLY_SECTIONS = ['arrest', 'treatment']

export default function SituationPage() {
  const { rows: allRows, isLoading, error, reload, availableYears } = useDrugIncidents()
  const arrestData = useArrestData()
  const treatmentData = useTreatmentData()
  const { getDateRange, state: filterState } = useFilter()
  const range = getDateRange()
  const [section, setSection] = useState('arrest')

  const dateFiltered = useMemo(() => filterByDateColumn(allRows, 'received_date', range), [allRows, range?.from, range?.to])
  const cascade = useAreaCascade(dateFiltered)

  // จับกุม/บำบัดมีข้อมูลระดับเขตเท่านั้น — เข้าแท็บนี้แล้วรีเซ็ตแขวง/ชุมชนกลับ 'all' กันค่าค้างจากแท็บอื่นทำให้ข้อมูลหาย
  useEffect(() => {
    if (DISTRICT_ONLY_SECTIONS.includes(section) && cascade.subdistrict !== 'all') cascade.setSubdistrict('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  const incidentsRows = cascade.rows

  const arrestSummaryRows = useMemo(() => filterArrestRows(arrestData.summaryRows, cascade, filterState), [arrestData.summaryRows, cascade, filterState])
  const arrestDrugRows = useMemo(() => filterArrestRows(arrestData.drugRows, cascade, filterState), [arrestData.drugRows, cascade, filterState])
  const arrestTotalCases = useMemo(() => arrestSummaryRows.reduce((s, r) => s + (r.cases || 0), 0), [arrestSummaryRows])

  const treatmentSummaryRows = useMemo(() => filterTreatmentRows(treatmentData.summaryRows, cascade, filterState), [treatmentData.summaryRows, cascade, filterState])
  const treatmentDimRows = useMemo(() => filterTreatmentRows(treatmentData.dimRows, cascade, filterState), [treatmentData.dimRows, cascade, filterState])
  const treatmentTotal = useMemo(() => treatmentSummaryRows.reduce((s, r) => s + (r.total_person || 0), 0), [treatmentSummaryRows])

  const totals = { arrest: arrestTotalCases, treatment: treatmentTotal, incidents: incidentsRows.length }
  const [, sectionLabel, sectionUnit] = SECTIONS.find(([id]) => id === section)
  const yearRangeLabel = availableYears.length ? `${Math.min(...availableYears)}–${Math.max(...availableYears)}` : null
  const arrestYearRangeLabel = arrestData.availableYears.length
    ? `${Math.min(...arrestData.availableYears)}–${Math.max(...arrestData.availableYears)}` : null
  const treatmentYearRangeLabel = treatmentData.availableYears.length
    ? `${Math.min(...treatmentData.availableYears)}–${Math.max(...treatmentData.availableYears)}` : null

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
        <div className="rounded-lg bg-white ring-1 ring-slate-200 p-8 h-64 animate-pulse" />
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
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8 bg-[#fafaf9] min-h-screen overflow-x-hidden">
      <header className="border-b border-slate-200 pb-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-slate-500">
              สถานการณ์ยาเสพติด · {section === 'arrest' ? 'CRIMES กทม.' : section === 'treatment' ? 'บสต. กทม.' : 'drug_incidents'}
            </div>
            <h1 className="mt-1.5 text-3xl lg:text-[2rem] font-semibold tracking-tight text-slate-900 leading-tight">สถานการณ์ยาเสพติด</h1>
            <p className="mt-2 text-sm text-slate-500 tabular-nums">
              {totals[section].toLocaleString()} {sectionUnit} · {sectionLabel} ในช่วงที่เลือก
            </p>
            {section === 'arrest' ? (
              arrestYearRangeLabel && (
                <p className="mt-1 text-xs text-slate-400 break-words max-w-xl">
                  ข้อมูลปีงบ {arrestYearRangeLabel} · ที่มา: CRIMES
                </p>
              )
            ) : section === 'treatment' ? (
              treatmentYearRangeLabel && (
                <p className="mt-1 text-xs text-slate-400 break-words max-w-xl">
                  ข้อมูลปีงบ {treatmentYearRangeLabel} · ที่มา: บสต.
                </p>
              )
            ) : (
              yearRangeLabel && (
                <p className="mt-1 text-xs text-slate-400 break-words max-w-xl">
                  ข้อมูลปีงบ {yearRangeLabel}
                </p>
              )
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <FilterPill label="เลือกข้อมูล" value={section} onChange={setSection}
              options={SECTIONS.map(([id, label]) => [id, label])} />
            <DateFilter
              availableYears={section === 'arrest' ? arrestData.availableYears : section === 'treatment' ? treatmentData.availableYears : availableYears}
              disabledModes={DISTRICT_ONLY_SECTIONS.includes(section) ? ['month', 'custom'] : []} />
          </div>
        </div>
      </header>

      <AreaCascadeBar cascade={cascade}
        disableSub={DISTRICT_ONLY_SECTIONS.includes(section)} disableSubReason={SUB_DISABLED_REASON[section]} />

      {section === 'arrest' && (
        <ArrestSection
          summaryRows={arrestSummaryRows} drugRows={arrestDrugRows} totalCases={arrestTotalCases}
          allSummaryRows={arrestData.summaryRows} cascade={cascade} filterState={filterState}
          isLoading={arrestData.isLoading} error={arrestData.error} reload={arrestData.reload} />
      )}
      {section === 'treatment' && (
        <TreatmentSection
          summaryRows={treatmentSummaryRows} dimRows={treatmentDimRows} total={treatmentTotal}
          allSummaryRows={treatmentData.summaryRows} cascade={cascade} filterState={filterState}
          isLoading={treatmentData.isLoading} error={treatmentData.error} reload={treatmentData.reload} />
      )}
      {section === 'incidents' && (
        <IncidentsSection rows={incidentsRows} total={incidentsRows.length} allRows={allRows} cascade={cascade}
          filterState={filterState} range={range} availableYears={availableYears} />
      )}
    </div>
  )
}
