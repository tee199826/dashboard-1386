// /situation — สถานการณ์ยาเสพติด (รวม จับกุม/บำบัด/ร้องเรียน เดิม /arrest /incidents /treatment)
// filter เวลา+พื้นที่ ใช้ร่วมกันทุกส่วน (state เดียว) — เลือกส่วนที่แสดงด้วย listbox
import { useState, useMemo, useEffect } from 'react'
import { AlertTriangle, ChevronRight, Database } from 'lucide-react'
import { useDrugIncidents } from '../hooks/useDrugIncidents'
import { useArrestData } from '../hooks/useArrestData'
import { useTreatmentData } from '../hooks/useTreatmentData'
import { useAreaCascade } from '../hooks/useAreaCascade'
import { useFilter } from '../context/FilterContext'
import DateFilter from '../components/DateFilter'
import AreaCascadeBar from '../components/AreaCascadeBar'
import { SegmentedTabs } from '../components/ReportUI'
import { filterByDateColumn } from '../utils/filterRows'
import { filterArrestRows, arrestSubdistrictOptions } from '../utils/arrestData'
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
// จับกุม: arrest_case มีระดับแขวงแล้ว (ไม่มีชุมชน) — บำบัดยังมีแค่ระดับเขต
const SUB_DISABLED_REASON = { treatment: 'บำบัดมีข้อมูลระดับเขต' }
const COMMUNITY_DISABLED_REASON = { arrest: 'จับกุมมีข้อมูลระดับแขวง (ไม่มีระดับชุมชน)', treatment: 'บำบัดมีข้อมูลระดับเขต' }
const SUBDISTRICT_DISABLED_SECTIONS = ['treatment']
const COMMUNITY_DISABLED_SECTIONS = ['arrest', 'treatment']
// จับกุม/บำบัดมีแค่ fiscal_year ไม่มีวันที่จริงระดับวัน — ปิดโหมดกรองตามเดือน/ช่วงวันที่กำหนดเอง
const FISCAL_ONLY_SECTIONS = ['arrest', 'treatment']
// footer การ์ดที่มาข้อมูล — ข้อความจริงตามระบบต้นทางของแต่ละ section (ดู comment หัวไฟล์ hooks/useArrestData.js, useTreatmentData.js)
const SOURCE_LABEL = {
  arrest: 'ระบบสารสนเทศสถานีตำรวจ (CRIMES) สำนักงานตำรวจแห่งชาติ — สถิติจับกุมคดียาเสพติด กทม.',
  treatment: 'ระบบบำบัดรักษาและฟื้นฟูผู้ติดยาเสพติด (บสต.) กทม.',
  incidents: 'ระบบร้องเรียนยาเสพติด 1386',
}

export default function SituationPage() {
  const { rows: allRows, isLoading, error, reload, availableYears } = useDrugIncidents()
  const arrestData = useArrestData()
  const treatmentData = useTreatmentData()
  const { getDateRange, state: filterState } = useFilter()
  const range = getDateRange()
  const [section, setSection] = useState('arrest')

  const dateFiltered = useMemo(() => filterByDateColumn(allRows, 'received_date', range), [allRows, range?.from, range?.to])
  const cascade = useAreaCascade(dateFiltered)

  // บำบัดมีข้อมูลระดับเขตเท่านั้น — เข้าแท็บนี้แล้วรีเซ็ตแขวง/ชุมชนกลับ 'all' กันค่าค้างจากแท็บอื่นทำให้ข้อมูลหาย
  // จับกุมกรองแขวงได้แล้ว แต่ยังไม่มีระดับชุมชน — รีเซ็ตแค่ชุมชนพอ
  useEffect(() => {
    if (SUBDISTRICT_DISABLED_SECTIONS.includes(section)) {
      if (cascade.subdistrict !== 'all') cascade.setSubdistrict('all')
    } else if (COMMUNITY_DISABLED_SECTIONS.includes(section) && cascade.community !== 'all') {
      cascade.setCommunity('all')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  const incidentsRows = cascade.rows

  const arrestCaseRows = useMemo(() => filterArrestRows(arrestData.caseRows, cascade, filterState), [arrestData.caseRows, cascade, filterState])
  const arrestDimRows = useMemo(() => filterArrestRows(arrestData.dimRows, cascade, filterState), [arrestData.dimRows, cascade, filterState])
  const arrestAgeSummaryRows = useMemo(() => filterArrestRows(arrestData.ageSummaryRows, cascade, filterState), [arrestData.ageSummaryRows, cascade, filterState])
  const arrestTotalCases = useMemo(() => arrestCaseRows.reduce((s, r) => s + (r.cases || 0), 0), [arrestCaseRows])
  // dropdown แขวง (เฉพาะ section จับกุม) ต้องมาจาก arrest_case.subdistrict เอง — ไม่ใช่ cascade.subdistrictOptions
  // (มาจาก drug_incidents คนละชุดข้อมูล แขวงที่มีอาจไม่ตรงกัน) ดู utils/arrestData.js:arrestSubdistrictOptions
  const arrestSubOptions = useMemo(() => arrestSubdistrictOptions(arrestData.caseRows, cascade, filterState), [arrestData.caseRows, cascade, filterState])

  // สลับมาแท็บจับกุมพร้อมแขวงที่ค้างจากแท็บร้องเรียน (คนละชุดข้อมูล) แต่แขวงนั้นไม่มีเคสจับกุมในเขตนี้ → เคลียร์กัน dropdown โชว์ค่าว่าง
  useEffect(() => {
    if (section === 'arrest' && cascade.subdistrict !== 'all' && !arrestSubOptions.includes(cascade.subdistrict)) {
      cascade.setSubdistrict('all')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, arrestSubOptions])

  const treatmentSummaryRows = useMemo(() => filterTreatmentRows(treatmentData.summaryRows, cascade, filterState), [treatmentData.summaryRows, cascade, filterState])
  const treatmentDimRows = useMemo(() => filterTreatmentRows(treatmentData.dimRows, cascade, filterState), [treatmentData.dimRows, cascade, filterState])
  const treatmentTotal = useMemo(() => treatmentSummaryRows.reduce((s, r) => s + (r.total_person || 0), 0), [treatmentSummaryRows])

  const totals = { arrest: arrestTotalCases, treatment: treatmentTotal, incidents: incidentsRows.length }
  const [, sectionLabel, sectionUnit] = SECTIONS.find(([id]) => id === section)
  const formatYearRange = (years) => {
    if (!years.length) return null
    const min = Math.min(...years), max = Math.max(...years)
    return min === max ? String(min) : `${min}–${max}`
  }
  const yearRangeLabel = formatYearRange(availableYears)
  const arrestYearRangeLabel = formatYearRange(arrestData.availableYears)
  const treatmentYearRangeLabel = formatYearRange(treatmentData.availableYears)

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
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6 bg-[#fafaf9] min-h-screen overflow-x-hidden">
      <header className="border-b border-slate-200 pb-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <nav className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <span>สถานการณ์อาชญากรรม</span>
              <ChevronRight size={13} className="text-slate-400 shrink-0" />
              <span className="text-slate-800 font-semibold">สถานการณ์ยาเสพติด</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-400">{section === 'arrest' ? 'CRIMES กทม.' : section === 'treatment' ? 'บสต. กทม.' : 'drug_incidents'}</span>
            </nav>
            <h1 className="mt-1.5 text-3xl lg:text-[2rem] font-semibold tracking-tight text-slate-900 leading-tight">สถานการณ์ยาเสพติด</h1>
            <p className="mt-2 text-sm text-slate-500 tabular-nums">
              <span className="font-semibold text-slate-700">{totals[section].toLocaleString()}</span> {sectionUnit} · {sectionLabel} ในช่วงที่เลือก
            </p>
            {section === 'arrest' ? (
              arrestYearRangeLabel && (
                <p className="mt-1 text-xs text-slate-400 break-words max-w-xl">
                  ข้อมูลปีงบ {arrestYearRangeLabel} · ที่มา: CRIMES กทม.
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
            <SegmentedTabs value={section} onChange={setSection}
              options={SECTIONS.map(([id, label]) => ({ id, label, count: totals[id] }))} />
            <DateFilter accent="amber" size="lg"
              availableYears={section === 'arrest' ? arrestData.availableYears : section === 'treatment' ? treatmentData.availableYears : availableYears}
              disabledModes={FISCAL_ONLY_SECTIONS.includes(section) ? ['month', 'custom'] : []} />
          </div>
        </div>
      </header>

      <AreaCascadeBar cascade={cascade}
        disableSub={SUBDISTRICT_DISABLED_SECTIONS.includes(section)} disableSubReason={SUB_DISABLED_REASON[section]}
        disableCommunity={COMMUNITY_DISABLED_SECTIONS.includes(section)} disableCommunityReason={COMMUNITY_DISABLED_REASON[section]}
        subdistrictOptions={section === 'arrest' ? arrestSubOptions : undefined} />

      <div key={section} className="animate-rise space-y-8">
        {section === 'arrest' && (
          <ArrestSection
            caseRows={arrestCaseRows} allCaseRows={arrestData.caseRows} dimRows={arrestDimRows} ageSummaryRows={arrestAgeSummaryRows} totalCases={arrestTotalCases}
            cascade={cascade} filterState={filterState}
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

      <div className="bg-white rounded-xl ring-1 ring-slate-900/[0.06] shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4 flex items-center gap-2 text-xs text-slate-500">
        <Database size={15} className="text-slate-400 shrink-0" />
        <span>ที่มาข้อมูล: {SOURCE_LABEL[section]}</span>
      </div>
    </div>
  )
}
