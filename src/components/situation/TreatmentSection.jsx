// TreatmentSection — ส่วน "บำบัด" ของหน้า /situation
// ดึงจาก treatment_summary + treatment_dim (สถิติบำบัดจริงจาก บสต. กทม., เขต × ปีงบ) — ไม่ใช่ drug_incidents.action_treatment
// (แค่เรื่องร้องเรียนที่จบด้วยบำบัด ~201 ราย) ตัวเลขจึงเป็นทางการ (เช่น 5,996 ราย ปีงบ 2569)
import { useState, useMemo } from 'react'
import { HeartPulse, TrendingUp, Pill, Users, Briefcase, Scale, MapPin } from 'lucide-react'
import {
  computeTreatmentYoy, topTreatmentDistricts, dimensionCounts, section113Pct, topWithOther, withDonutColors,
} from '../../utils/treatmentData'
import { exportTreatmentReport } from '../../utils/exportSituation'
import { Panel, SectionHead, Metric, DonutChart, RankedBarChart, EmptyChart, PlaceholderCard, Top3List, ActionBar, TablePager } from '../ReportUI'
import { COLORS } from '../../utils/reportStyle'

const PAGE_SIZE = 50
const NO_DATA_NOTE = 'ยังไม่มีข้อมูลใน DB — รอ import'

// summaryRows/dimRows: กรองตาม cascade+filterState (ปีงบ) มาแล้วจากหน้า SituationPage
// allSummaryRows: ยังไม่กรองปี — ใช้กับ YoY (ต้องเห็นทั้งปีปัจจุบัน+ปีก่อน)
export default function TreatmentSection({ summaryRows, dimRows, total, allSummaryRows, cascade, filterState, isLoading, error, reload }) {
  const totalOld = useMemo(() => summaryRows.reduce((s, r) => s + (r.old_person || 0), 0), [summaryRows])
  const totalNew = useMemo(() => summaryRows.reduce((s, r) => s + (r.new_person || 0), 0), [summaryRows])
  const oldNewSum = totalOld + totalNew
  const oldNewData = useMemo(() => [
    { name: 'รายเก่า', value: totalOld, color: COLORS.slateSoft },
    { name: 'รายใหม่', value: totalNew, color: COLORS.amber },
  ], [totalOld, totalNew])

  const drugDonutData = useMemo(() => withDonutColors(topWithOther(dimensionCounts(dimRows, 'drug'), 5)), [dimRows])
  const drugSum = useMemo(() => drugDonutData.reduce((s, d) => s + d.value, 0), [drugDonutData])

  const sexDonutData = useMemo(() => withDonutColors(dimensionCounts(dimRows, 'sex')), [dimRows])
  const sexSum = useMemo(() => sexDonutData.reduce((s, d) => s + d.value, 0), [sexDonutData])

  const occupationData = useMemo(() => dimensionCounts(dimRows, 'occupation', { top: 8 }), [dimRows])
  const educationData = useMemo(() => dimensionCounts(dimRows, 'education'), [dimRows])
  const statusData = useMemo(() => dimensionCounts(dimRows, 'status'), [dimRows])
  const sectionData = useMemo(() => dimensionCounts(dimRows, 'section'), [dimRows])
  const section113 = useMemo(() => section113Pct(dimRows), [dimRows])

  const yoy = useMemo(() => computeTreatmentYoy(allSummaryRows, cascade, filterState), [allSummaryRows, cascade, filterState])
  const yoyView = !yoy ? { value: '—', sub: 'เลือกปีงบเพื่อเปรียบเทียบ' }
    : yoy.pct == null ? { value: '—', sub: 'ไม่มีข้อมูลปีงบก่อนเพื่อเปรียบเทียบ' }
    : { value: `${yoy.pct > 0 ? '+' : ''}${yoy.pct.toFixed(1)}%`, sub: `ปีงบ ${yoy.prevFY}: ${yoy.prevTotal.toLocaleString()} ราย` }

  const top3 = useMemo(() => topTreatmentDistricts(summaryRows, total), [summaryRows, total])

  const [tableOpen, setTableOpen] = useState(false)
  const [page, setPage] = useState(1)
  const tableRows = useMemo(() => summaryRows.slice().sort((a, b) => b.fiscal_year - a.fiscal_year || b.total_person - a.total_person), [summaryRows])
  const totalPages = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE))
  const pageRows = useMemo(() => tableRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [tableRows, page])

  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    setExporting(true)
    try {
      await exportTreatmentReport({
        summaryRows, dimRows,
        periodLabel: filterState.mode === 'fiscal' && filterState.fiscalYear ? `ปีงบ ${filterState.fiscalYear}` : 'ทุกปีงบ',
        filterLabel: cascade.areaLabel,
        filenamePrefix: 'treatment-report',
      })
    } finally {
      setExporting(false)
    }
  }

  if (isLoading) {
    return <Panel><div className="h-40 animate-pulse bg-slate-50 rounded-md" /></Panel>
  }
  if (error) {
    return (
      <Panel>
        <div className="text-center py-8">
          <p className="text-sm text-slate-500 mb-4">{error}</p>
          <button onClick={reload} className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-sm font-semibold transition">
            ลองอีกครั้ง
          </button>
        </div>
      </Panel>
    )
  }

  return (
    <div className="space-y-8">
      <Panel>
        <div className="grid grid-cols-12 gap-y-6">
          <Metric span="sm:col-span-6" icon={HeartPulse} eyebrow="จำนวนผู้บำบัด" value={total.toLocaleString()} unit="ราย" />
          <Metric span="sm:col-span-6" divider icon={TrendingUp} eyebrow="เทียบปีงบก่อน" value={yoyView.value} sub={yoyView.sub} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel>
          <SectionHead title="ตัวยาหลัก" icon={Pill} sub="Top 5 · % คำนวณจากรายที่ระบุตัวยาได้เท่านั้น" />
          {drugDonutData.length ? (
            <DonutChart data={drugDonutData} unit="ราย" pctBase={drugSum} centerValue={drugSum} centerLabel="ระบุตัวยาได้" />
          ) : <EmptyChart />}
        </Panel>
        <Panel>
          <SectionHead title="เพศ" icon={Users} />
          {sexDonutData.length ? (
            <DonutChart data={sexDonutData} unit="ราย" pctBase={sexSum} centerValue={sexSum} centerLabel="ระบุเพศได้" />
          ) : <EmptyChart />}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel>
          <SectionHead title="อาชีพ" icon={Briefcase} sub="Top 8" />
          {occupationData.length ? <RankedBarChart data={occupationData} unit="ราย" /> : <EmptyChart />}
        </Panel>
        <Panel>
          <SectionHead title="มาตรา" icon={Scale}
            sub={section113.total ? `ม.113 = ${section113.pct.toFixed(1)}% ของรายที่ระบุมาตราได้ (${section113.m113.toLocaleString()}/${section113.total.toLocaleString()} ราย)` : undefined} />
          {sectionData.length ? <RankedBarChart data={sectionData} unit="ราย" /> : <EmptyChart />}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel>
          <SectionHead title="การศึกษา" />
          {educationData.length ? <RankedBarChart data={educationData} unit="ราย" /> : <EmptyChart />}
        </Panel>
        <Panel>
          <SectionHead title="สถานะ" />
          {statusData.length ? <RankedBarChart data={statusData} unit="ราย" /> : <EmptyChart />}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel>
          <SectionHead title="รายเก่า / รายใหม่" sub="ผู้บำบัดจำแนกตามประวัติ" />
          {oldNewSum ? (
            <>
              <DonutChart data={oldNewData} unit="ราย" pctBase={oldNewSum} centerValue={oldNewSum} centerLabel="ผู้บำบัดที่จำแนกได้" />
              <div className="mt-3 text-xs text-slate-400 tabular-nums">รวมผู้บำบัดที่จำแนกประวัติได้ {oldNewSum.toLocaleString()} ราย</div>
            </>
          ) : <EmptyChart />}
        </Panel>
        <Panel>
          <SectionHead title="เขตบำบัดสูงสุด" icon={MapPin} sub="Top 3 · % จากจำนวนผู้บำบัดทั้งหมดในช่วงที่เลือก" />
          <Top3List data={top3} />
        </Panel>
      </div>

      <div>
        <SectionHead title="ข้อมูลรายบุคคล" sub="ยังไม่มีข้อมูลระดับเขตใน DB" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <PlaceholderCard title="ช่วงอายุ / อายุสูงสุด-ต่ำสุด" note={NO_DATA_NOTE} />
          <PlaceholderCard title="จิตเวช (รักษาจิตร่วม)" note={NO_DATA_NOTE} />
          <PlaceholderCard title="สัญชาติ" note={NO_DATA_NOTE} />
        </div>
      </div>

      <ActionBar tableOpen={tableOpen} onToggleTable={() => setTableOpen((o) => !o)} onExport={handleExport} exporting={exporting} />

      {tableOpen && (
        <div className="bg-white rounded-xl ring-1 ring-slate-900/[0.06] shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="overflow-auto max-h-[560px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 sticky top-0 z-10 shadow-[0_1px_0_rgba(15,23,42,0.06)]">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">เขต</th>
                  <th className="px-4 py-3 font-semibold">ปีงบ</th>
                  <th className="px-4 py-3 font-semibold text-right">จำนวนผู้บำบัด</th>
                  <th className="px-4 py-3 font-semibold text-right">รายเก่า</th>
                  <th className="px-4 py-3 font-semibold text-right">รายใหม่</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{r.district}</td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums whitespace-nowrap">{r.fiscal_year}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium tabular-nums text-right">{(r.total_person || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums text-right">{r.old_person != null ? r.old_person.toLocaleString() : '-'}</td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums text-right">{r.new_person != null ? r.new_person.toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePager page={page} totalPages={totalPages} total={tableRows.length}
            onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(totalPages, p + 1))} />
        </div>
      )}
    </div>
  )
}
