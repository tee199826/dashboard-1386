// /situation — สถานการณ์ยาเสพติด (รวม จับกุม/บำบัด/ร้องเรียน เดิม /arrest /incidents /treatment)
// filter เวลา+พื้นที่ ใช้ร่วมกันทุกส่วน (state เดียว) — เลือกส่วนที่แสดงด้วยแท็บ
// แต่ละแท็บมาจากคนละชุดข้อมูล: จับกุม = arrest_* (CRIMES กทม.) · บำบัด/ร้องเรียน = drug_incidents (ระบบ 1386)
import { useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useDrugIncidents } from '../hooks/useDrugIncidents'
import { useArrestData } from '../hooks/useArrestData'
import { useAreaCascade } from '../hooks/useAreaCascade'
import { useFilter } from '../context/FilterContext'
import DateFilter from '../components/DateFilter'
import AreaCascadeBar from '../components/AreaCascadeBar'
import { filterByDateColumn } from '../utils/filterRows'
import { filterArrestRows, arrestSubdistrictOptions } from '../utils/arrestData'
import ArrestSection from '../components/situation/ArrestSection'
import TreatmentSection from '../components/situation/TreatmentSection'
import IncidentsSection from '../components/situation/IncidentsSection'

const SECTIONS = [
  ['arrest', 'จับกุม', 'คดี'],
  ['treatment', 'บำบัด', 'ราย'],
  ['incidents', 'ร้องเรียน', 'เรื่อง'],
]

// จับกุมมาจาก arrest_case ที่มีแค่ fiscal_year (ไม่มีวันที่ระดับวัน) — ปิดโหมดกรองตามเดือน/ช่วงวันที่กำหนดเอง
const FISCAL_ONLY_SECTIONS = ['arrest']
// จับกุมมีข้อมูลถึงระดับแขวง (arrest_case.subdistrict) แต่ไม่มีระดับชุมชน
const COMMUNITY_DISABLED_REASON = { arrest: 'จับกุมมีข้อมูลถึงระดับแขวง' }
const SOURCE_EYEBROW = { arrest: 'CRIMES กทม. · arrest_case', treatment: 'drug_incidents', incidents: 'drug_incidents' }

export default function SituationPage() {
  const { rows: allRows, isLoading, error, reload, availableYears } = useDrugIncidents()
  const arrestData = useArrestData()
  const { getDateRange, state: filterState } = useFilter()
  const range = getDateRange()
  // แท็บอ่านจาก ?section= ให้ sidebar deep-link เข้าตรงส่วนได้ (และ active state ตรงกับ URL)
  const [searchParams, setSearchParams] = useSearchParams()
  const urlSection = searchParams.get('section')
  const section = SECTIONS.some(([id]) => id === urlSection) ? urlSection : 'arrest'
  const setSection = (id) => setSearchParams({ section: id }, { replace: true })

  const dateFiltered = useMemo(() => filterByDateColumn(allRows, 'received_date', range), [allRows, range])
  const cascade = useAreaCascade(dateFiltered)

  const treatmentRows = useMemo(() => cascade.rows.filter((r) => r.action_treatment), [cascade.rows])
  const incidentsRows = cascade.rows

  // จับกุม — คนละตารางกับ drug_incidents (ไม่มี received_date, กรองด้วยปีงบ+พื้นที่เอง ดู utils/arrestData.js)
  const arrestCaseRows = useMemo(() => filterArrestRows(arrestData.caseRows, cascade, filterState), [arrestData.caseRows, cascade, filterState])
  const arrestDimRows = useMemo(() => filterArrestRows(arrestData.dimRows, cascade, filterState), [arrestData.dimRows, cascade, filterState])
  const arrestAgeSummaryRows = useMemo(() => filterArrestRows(arrestData.ageSummaryRows, cascade, filterState), [arrestData.ageSummaryRows, cascade, filterState])
  const arrestTotalCases = useMemo(() => arrestCaseRows.reduce((s, r) => s + (r.cases || 0), 0), [arrestCaseRows])
  // dropdown แขวงของแท็บจับกุมต้องมาจาก arrest_case.subdistrict เอง — ไม่ใช่ cascade.subdistrictOptions
  // (มาจาก drug_incidents คนละชุดข้อมูล แขวงที่มีอาจไม่ตรงกัน) ดู utils/arrestData.js:arrestSubdistrictOptions
  const arrestSubOptions = useMemo(() => arrestSubdistrictOptions(arrestData.caseRows, cascade, filterState), [arrestData.caseRows, cascade, filterState])

  // จับกุมไม่มีระดับชุมชน — เข้าแท็บนี้แล้วรีเซ็ตชุมชนกลับ 'all' กันค่าค้างจากแท็บอื่นทำให้ข้อมูลหาย
  useEffect(() => {
    if (section === 'arrest' && cascade.community !== 'all') cascade.setCommunity('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  // สลับมาแท็บจับกุมพร้อมแขวงที่ค้างจากแท็บร้องเรียน (คนละชุดข้อมูล) แต่แขวงนั้นไม่มีเคสจับกุมในเขตนี้
  // → เคลียร์กัน dropdown โชว์ค่าว่างและกราฟหายทั้งหน้า
  useEffect(() => {
    if (section === 'arrest' && cascade.subdistrict !== 'all' && !arrestSubOptions.includes(cascade.subdistrict)) {
      cascade.setSubdistrict('all')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, arrestSubOptions])

  const totals = { arrest: arrestTotalCases, treatment: treatmentRows.length, incidents: incidentsRows.length }
  const [, sectionLabel, sectionUnit] = SECTIONS.find(([id]) => id === section)
  const sectionYears = section === 'arrest' ? arrestData.availableYears : availableYears

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
            <div className="text-xs uppercase tracking-widest text-slate-500">สถานการณ์ยาเสพติด · {SOURCE_EYEBROW[section]}</div>
            <h1 className="mt-1.5 text-3xl lg:text-[2rem] font-semibold tracking-tight text-slate-900 leading-tight">สถานการณ์ยาเสพติด</h1>
            <p className="mt-2 text-sm text-slate-500 tabular-nums">
              {totals[section].toLocaleString()} {sectionUnit} · {sectionLabel} ในช่วงที่เลือก
            </p>
            {section === 'arrest' && arrestData.availableYears.length > 0 && (
              <p className="mt-1 text-xs text-slate-400 tabular-nums">
                ข้อมูลปีงบ {arrestData.availableYears.slice().reverse().join(', ')} · ที่มา: สถิติจับกุมคดียาเสพติด CRIMES กทม.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="inline-flex rounded-xl border border-slate-300 bg-slate-100 p-1 shadow-sm" role="tablist" aria-label="เลือกข้อมูล">
              {SECTIONS.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)}
                  className={`h-11 px-6 rounded-lg text-[15px] transition ${
                    section === id
                      ? 'bg-white text-[#243aa8] font-bold shadow-[0_2px_6px_rgba(15,22,38,0.12)]'
                      : 'text-slate-500 font-semibold hover:text-slate-700 hover:bg-white/60'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <DateFilter availableYears={sectionYears} defaultAllYears
              disabledModes={FISCAL_ONLY_SECTIONS.includes(section) ? ['month', 'custom'] : []} />
          </div>
        </div>
      </header>

      <AreaCascadeBar cascade={cascade}
        disableCommunity={section === 'arrest'} disableCommunityReason={COMMUNITY_DISABLED_REASON[section]}
        subdistrictOptions={section === 'arrest' ? arrestSubOptions : undefined} />

      {section === 'arrest' && (
        <ArrestSection
          caseRows={arrestCaseRows} allCaseRows={arrestData.caseRows} dimRows={arrestDimRows}
          ageSummaryRows={arrestAgeSummaryRows} totalCases={arrestTotalCases}
          cascade={cascade} filterState={filterState}
          isLoading={arrestData.isLoading} error={arrestData.error} reload={arrestData.reload} />
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
