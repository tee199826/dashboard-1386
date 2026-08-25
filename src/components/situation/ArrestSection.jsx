// ArrestSection — ส่วน "จับกุม" ของหน้า /situation
// ดึงจาก arrest_summary + arrest_drug (สถิติจับกุมจริงจาก CRIMES กทม., เขต × ปีงบ) — ไม่ใช่ drug_incidents.action_arrest
// (แค่เรื่องร้องเรียนที่จบด้วยจับกุม) ตัวเลขจึงเป็นทางการ (เช่น 10,835 คดี ปีงบ 2569) ไม่ใช่ subset ของระบบร้องเรียน
import { useState, useMemo } from 'react'
import { computeArrestYoy, topArrestDistricts } from '../../utils/arrestData'
import { exportArrestReport } from '../../utils/exportSituation'
import { Panel, SectionHead, Metric, DonutChart, EmptyChart, PlaceholderCard, Top3List, ActionBar, TablePager } from '../ReportUI'
import { COLORS, DONUT_SEQUENCE, DONUT_OTHER_COLOR } from '../../utils/reportStyle'

const PAGE_SIZE = 50
const NO_DATA_NOTE = 'ยังไม่มีข้อมูลใน DB — รอ import'

// summaryRows/drugRows: กรองตาม cascade+filterState (ปีงบ) มาแล้วจากหน้า SituationPage
// allSummaryRows: ยังไม่กรองปี — ใช้กับ YoY (ต้องเห็นทั้งปีปัจจุบัน+ปีก่อน)
export default function ArrestSection({ summaryRows, drugRows, totalCases, allSummaryRows, cascade, filterState, isLoading, error, reload }) {
  const totalSuspects = useMemo(() => summaryRows.reduce((s, r) => s + (r.suspects_person || 0), 0), [summaryRows])
  const totalOld = useMemo(() => summaryRows.reduce((s, r) => s + (r.suspects_old || 0), 0), [summaryRows])
  const totalNew = useMemo(() => summaryRows.reduce((s, r) => s + (r.suspects_new || 0), 0), [summaryRows])
  const oldNewSum = totalOld + totalNew
  const oldNewData = useMemo(() => [
    { name: 'รายเก่า', value: totalOld, color: COLORS.slateSoft },
    { name: 'รายใหม่', value: totalNew, color: COLORS.amber },
  ], [totalOld, totalNew])

  // ตัวยา — arrest_drug มี 6 ค่าคงที่ (ยาบ้า/ไอซ์/เฮโรอีน/คีตามีน/ยาอี/โคคาอีน) ไม่ต้อง top-N ตัด — โชว์ครบ
  const drugDonutData = useMemo(() => {
    const m = {}
    drugRows.forEach((r) => { m[r.dim_value] = (m[r.dim_value] || 0) + (r.cases || 0) })
    return Object.entries(m)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .map((d, i) => ({ ...d, color: DONUT_SEQUENCE[i] ?? DONUT_OTHER_COLOR }))
  }, [drugRows])
  // sum(cases) ของ arrest_drug ต่ำกว่าจำนวนคดีจริงเสมอ (ไม่ใช่ทุกคดีระบุตัวยาได้) — ฐาน % จึงต้องใช้ยอดนี้ ไม่ใช่ totalCases
  const drugCasesSum = useMemo(() => drugDonutData.reduce((s, d) => s + d.value, 0), [drugDonutData])

  const yoy = useMemo(() => computeArrestYoy(allSummaryRows, cascade, filterState), [allSummaryRows, cascade, filterState])
  const yoyView = !yoy ? { value: '—', sub: 'เลือกปีงบเพื่อเปรียบเทียบ' }
    : yoy.pct == null ? { value: '—', sub: 'ไม่มีข้อมูลปีงบก่อนเพื่อเปรียบเทียบ' }
    : { value: `${yoy.pct > 0 ? '+' : ''}${yoy.pct.toFixed(1)}%`, sub: `ปีงบ ${yoy.prevFY}: ${yoy.prevTotal.toLocaleString()} คดี` }

  const top3 = useMemo(() => topArrestDistricts(summaryRows, totalCases), [summaryRows, totalCases])

  const [tableOpen, setTableOpen] = useState(false)
  const [page, setPage] = useState(1)
  const tableRows = useMemo(() => summaryRows.slice().sort((a, b) => b.fiscal_year - a.fiscal_year || b.cases - a.cases), [summaryRows])
  const totalPages = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE))
  const pageRows = useMemo(() => tableRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [tableRows, page])

  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    setExporting(true)
    try {
      await exportArrestReport({
        summaryRows, drugRows,
        periodLabel: filterState.mode === 'fiscal' && filterState.fiscalYear ? `ปีงบ ${filterState.fiscalYear}` : 'ทุกปีงบ',
        filterLabel: cascade.areaLabel,
        filenamePrefix: 'arrest-report',
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
          <Metric span="sm:col-span-4" eyebrow="จำนวนคดี" value={totalCases.toLocaleString()} unit="คดี" />
          <Metric span="sm:col-span-4" divider eyebrow="ผู้ต้องหา" value={totalSuspects.toLocaleString()} unit="คน" />
          <Metric span="sm:col-span-4" divider eyebrow="เทียบปีงบก่อน" value={yoyView.value} sub={yoyView.sub} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel>
          <SectionHead title="ข้อหา" />
          <PlaceholderCard title="ข้อหา" note={NO_DATA_NOTE} />
        </Panel>
        <Panel>
          <SectionHead title="ร้ายแรง / ไม่ร้ายแรง" />
          <PlaceholderCard title="ร้ายแรง/ไม่ร้ายแรง" note={NO_DATA_NOTE} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel>
          <SectionHead title="ของกลางตัวยา" sub="% คำนวณจากคดีที่ระบุตัวยาได้เท่านั้น" />
          {drugDonutData.length ? (
            <>
              <DonutChart data={drugDonutData} unit="คดี" pctBase={drugCasesSum} centerValue={drugCasesSum} centerLabel="คดีที่ระบุตัวยาได้" />
              <div className="mt-3 text-xs text-slate-400 tabular-nums">ระบุตัวยาได้ {drugCasesSum.toLocaleString()} จาก {totalCases.toLocaleString()} คดี</div>
            </>
          ) : <EmptyChart />}
        </Panel>
        <Panel>
          <SectionHead title="ในชุมชน / นอกชุมชน" />
          <PlaceholderCard title="ในชุมชน/นอกชุมชน" note={NO_DATA_NOTE} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel>
          <SectionHead title="รายเก่า / รายใหม่" sub="ผู้ต้องหาจำแนกตามประวัติ" />
          {oldNewSum ? (
            <>
              <DonutChart data={oldNewData} unit="คน" pctBase={oldNewSum} centerValue={oldNewSum} centerLabel="ผู้ต้องหาที่จำแนกได้" />
              {/* old+new นับแยกจาก suspects_person ในต้นฉบับ ไม่การันตีว่าผลรวมเท่ากันเป๊ะทุกเขต — ไม่โชว์เป็นสัดส่วน "X จาก Y" กันตัวเลขดูขัดแย้งกันเอง (บางเขต old+new > suspects_person) */}
              <div className="mt-3 text-xs text-slate-400 tabular-nums">รวมผู้ต้องหาที่จำแนกประวัติได้ {oldNewSum.toLocaleString()} คน</div>
            </>
          ) : <EmptyChart />}
        </Panel>
        <Panel>
          <SectionHead title="เขตจับกุมสูงสุด" sub="Top 3 · % จากจำนวนคดีทั้งหมดในช่วงที่เลือก" />
          <Top3List data={top3} />
        </Panel>
      </div>

      <ActionBar tableOpen={tableOpen} onToggleTable={() => setTableOpen((o) => !o)} onExport={handleExport} exporting={exporting} />

      {tableOpen && (
        <div className="bg-white rounded-lg ring-1 ring-slate-200 overflow-hidden">
          <div className="overflow-auto max-h-[560px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 font-medium">เขต</th>
                  <th className="px-3 py-2.5 font-medium">ปีงบ</th>
                  <th className="px-3 py-2.5 font-medium text-right">จำนวนคดี</th>
                  <th className="px-3 py-2.5 font-medium text-right">ผู้ต้องหา(คน)</th>
                  <th className="px-3 py-2.5 font-medium text-right">รายเก่า</th>
                  <th className="px-3 py-2.5 font-medium text-right">รายใหม่</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{r.district}</td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">{r.fiscal_year}</td>
                    <td className="px-3 py-2.5 text-slate-700 tabular-nums text-right">{(r.cases || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums text-right">{(r.suspects_person || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums text-right">{r.suspects_old != null ? r.suspects_old.toLocaleString() : '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums text-right">{r.suspects_new != null ? r.suspects_new.toLocaleString() : '-'}</td>
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
