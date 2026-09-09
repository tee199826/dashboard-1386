// /situation/drug-evidence — ของกลางยาเสพติด (รายละเอียดทั้งหมด)
// เข้ามาจากการ์ด "ของกลางยาเสพติด" ในแท็บจับกุมของหน้า /situation
// ช่วงเวลา + พื้นที่ที่เลือกไว้ถูกส่งมาทาง query params จึงได้ตัวเลขตรงกับหน้าที่กดมา
import { useMemo } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Pill } from 'lucide-react'
import { useDrugIncidents } from '../hooks/useDrugIncidents'
import { useAreaCascade } from '../hooks/useAreaCascade'
import { FilterProvider, useFilter } from '../context/FilterContext'
import DateFilter from '../components/DateFilter'
import AreaCascadeBar from '../components/AreaCascadeBar'
import { Panel, SectionHead, Metric, DrugTileGrid, EmptyChart } from '../components/ReportUI'
import { drugCounts, rowsWithAnyDrug } from '../utils/drugFlags'
import { filterByDateColumn } from '../utils/filterRows'
import { paramsToFilter, paramsToArea } from '../utils/filterParams'

export default function DrugEvidence() {
  const [searchParams] = useSearchParams()
  const initialState = useMemo(() => paramsToFilter(searchParams), [searchParams])
  return (
    <FilterProvider initialState={initialState}>
      <DrugEvidenceInner />
    </FilterProvider>
  )
}

function DrugEvidenceInner() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialArea = useMemo(() => paramsToArea(searchParams), [searchParams])
  const { rows: allRows, isLoading, error, reload, availableYears } = useDrugIncidents()
  const { getDateRange } = useFilter()
  const range = getDateRange()

  const dateFiltered = useMemo(() => filterByDateColumn(allRows, 'received_date', range), [allRows, range])
  const cascade = useAreaCascade(dateFiltered, initialArea)
  // scope=arrest → ของกลางจากคดีจับกุม ; scope=incidents → ตัวยาที่พบในทุกเรื่องร้องเรียน
  const scope = searchParams.get('scope') === 'incidents' ? 'incidents' : 'arrest'
  const V = scope === 'incidents'
    ? { title: 'ตัวยาที่พบ', eyebrow: 'ตัวยาที่พบ', unit: 'เรื่อง', baseLabel: 'เรื่องร้องเรียน', backTo: '/situation?section=incidents', backLabel: 'กลับหน้าภาพรวม' }
    : { title: 'ของกลางยาเสพติด', eyebrow: 'ของกลางยาเสพติด', unit: 'คดี', baseLabel: 'คดีจับกุม', backTo: '/situation?section=arrest', backLabel: 'กลับหน้าจับกุม' }

  const scopedRows = useMemo(
    () => (scope === 'incidents' ? cascade.rows : cascade.rows.filter((r) => r.action_arrest)),
    [cascade.rows, scope],
  )

  const drugData = useMemo(() => drugCounts(scopedRows), [scopedRows])
  const withDrug = useMemo(() => rowsWithAnyDrug(scopedRows).length, [scopedRows])
  const total = scopedRows.length
  const sum = drugData.reduce((s, d) => s + d.value, 0) || 1

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
        <button onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition mb-2">
          <ArrowLeft size={14} /> ย้อนกลับ
        </button>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-slate-500">{V.eyebrow} · drug_incidents</div>
            <h1 className="mt-1.5 flex items-center gap-2.5 text-3xl lg:text-[2rem] font-semibold tracking-tight text-slate-900 leading-tight">
              <Pill size={26} className="text-[#2f49c9] shrink-0" /> {V.title}
            </h1>
            <p className="mt-2 text-sm text-slate-500 tabular-nums">
              {drugData.length.toLocaleString()} ชนิด จาก {total.toLocaleString()} {V.baseLabel} · {cascade.areaLabel}
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <DateFilter availableYears={availableYears} defaultAllYears />
            <Link to={V.backTo}
              className="h-9 px-3.5 inline-flex items-center rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
              {V.backLabel}
            </Link>
          </div>
        </div>
      </header>

      <AreaCascadeBar cascade={cascade} />

      {!drugData.length ? (
        <Panel><EmptyChart /></Panel>
      ) : (
        <>
          <Panel>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-6">
              <Metric span="" eyebrow={V.baseLabel} value={total.toLocaleString()} unit={V.unit} />
              <Metric span="" divider eyebrow="ระบุตัวยาได้" value={withDrug.toLocaleString()} unit={V.unit}
                sub={total ? `${((withDrug / total) * 100).toFixed(1)}% ของทั้งหมด` : null} />
              <Metric span="" divider eyebrow="ชนิดยาที่พบ" value={drugData.length.toLocaleString()} unit="ชนิด" />
              <Metric span="" divider eyebrow="ยาที่พบมากสุด" value={drugData[0]?.name || '—'}
                sub={drugData[0] ? `${drugData[0].value.toLocaleString()} ${V.unit} · ${((drugData[0].value / sum) * 100).toFixed(1)}%` : null} />
            </div>
          </Panel>

          <Panel>
            <SectionHead title={V.title} sub={`สัดส่วนตัวยาที่พบ — รวม 100% (1 ${V.unit}มีได้หลายตัวยา)`} />
            {/* หน้านี้คือ "รายละเอียดทั้งหมด" จึงกาง tile ครบทุกชนิด ไม่ต้องมีปุ่ม "อื่น ๆ" */}
            <DrugTileGrid data={drugData} unit={V.unit} topN={drugData.length} />
          </Panel>

          <Panel>
            <SectionHead title="ตารางรายละเอียด" sub={`ทั้งหมด ${drugData.length} ชนิด เรียงจากมากไปน้อย`} />
            <div className="overflow-auto -mx-1 px-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2.5 pr-3 font-medium w-12">อันดับ</th>
                    <th className="py-2.5 pr-3 font-medium">ชนิดยา</th>
                    <th className="py-2.5 pr-3 font-medium text-right">จำนวน{V.unit}</th>
                    <th className="py-2.5 pr-3 font-medium text-right">สัดส่วน</th>
                    <th className="py-2.5 font-medium w-[38%]">สัดส่วนเทียบอันดับ 1</th>
                  </tr>
                </thead>
                <tbody>
                  {drugData.map((d, i) => (
                    <tr key={d.name} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2.5 pr-3 tabular-nums text-slate-400">{i + 1}</td>
                      <td className="py-2.5 pr-3 font-medium text-slate-800">{d.name}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums font-semibold text-slate-900">{d.value.toLocaleString()}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">{((d.value / sum) * 100).toFixed(1)}%</td>
                      <td className="py-2.5">
                        <span className="block h-2 rounded-full bg-slate-100 overflow-hidden">
                          <span className="block h-full rounded-full bg-[#2f49c9]"
                            style={{ width: `${(d.value / drugData[0].value) * 100}%`, opacity: i === 0 ? 1 : 0.55 }} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-slate-400 tabular-nums">
              ระบุตัวยาได้ {withDrug.toLocaleString()} จาก {total.toLocaleString()} {V.unit} · 1 {V.unit}พบได้หลายชนิด ผลรวมจึงมากกว่าจำนวน{V.unit}
            </p>
          </Panel>
        </>
      )}
    </div>
  )
}
