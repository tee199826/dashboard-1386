// ArrestSection — ส่วน "จับกุม" ของหน้า /situation
// ดึงจาก arrest_case + arrest_dim + arrest_age (สถิติจับกุมรายคดีจริงจาก CRIMES กทม., เขต×แขวง × ปีงบ) — ไม่ใช่ drug_incidents.action_arrest
// (แค่เรื่องร้องเรียนที่จบด้วยจับกุม) ตัวเลขจึงเป็นทางการ (~21,700 คดี ปีงบ 2567-2568 เต็มปี) ไม่ใช่ subset ของระบบร้องเรียน
import { useState, useMemo } from 'react'
import { Gavel, Users, ShieldAlert, Shield, Package, Globe2, MapPin, CalendarRange } from 'lucide-react'
import {
  topArrestDistricts, arrestDimensionCounts, computeArrestYoy,
  severityCounts, ageStats, ageHistogram, nationalitySplit, topForeignNationalities,
} from '../../utils/arrestData'
import { exportArrestReport } from '../../utils/exportSituation'
import { Panel, SectionHead, Metric, KpiCard, RankedList, RankedBarChart, SplitBarChart, SplitRatioCard, EmptyChart, PlaceholderCard, Top3List, ActionBar, TablePager } from '../ReportUI'
import DrugSeizureCards from './DrugSeizureCards'
import NationalityBreakdown from './NationalityBreakdown'
import { COLORS } from '../../utils/reportStyle'

const PAGE_SIZE = 50
const NO_DATA_NOTE = 'ยังไม่มีข้อมูลใน DB — รอ map พิกัด (.shp)'

// caseRows/dimRows/ageSummaryRows: กรองตาม cascade+filterState มาแล้วจากหน้า SituationPage (cascade กรองถึงระดับแขวงได้แล้ว)
// ageSummaryRows มาจาก view arrest_age_summary (aggregate รายเขต×ปีงบที่ DB แล้ว — ไม่ใช่รายคน, ดู utils/arrestData.js)
// allCaseRows: arrest_case ที่ยังไม่กรองปี — ใช้กับ YoY อย่างเดียว (ต้องเห็นทั้งปีปัจจุบัน+ปีก่อน) เหมือน allSummaryRows ของบำบัด
export default function ArrestSection({ caseRows, allCaseRows, dimRows, ageSummaryRows, totalCases, cascade, filterState, isLoading, error, reload }) {
  const totalSuspects = useMemo(() => caseRows.reduce((s, r) => s + (r.persons || 0), 0), [caseRows])

  // YoY — โชว์เฉพาะตอนเลือกปีงบเจาะจงและปีก่อนมีข้อมูลจริง (เลือก 'ทั้งหมด' → yoy = null, ไม่มีชิป)
  const yoy = useMemo(() => computeArrestYoy(allCaseRows, cascade, filterState), [allCaseRows, cascade, filterState])
  const yoyNote = (k, unit) =>
    yoy && yoy[k].prev ? `เทียบปีงบ ${yoy.prevFY}: ${yoy[k].prev.toLocaleString()} ${unit}` : null

  // ข้อหา — นับคน, 1 คนมีหลายข้อหาได้ (sum อาจเกินจำนวนผู้ต้องหาจริง) — % เทียบกับผู้ต้องหารวม
  const chargeData = useMemo(() => arrestDimensionCounts(dimRows, 'charge'), [dimRows])

  // ร้ายแรง/ไม่ร้ายแรง — derive จากข้อหา (จำหน่าย/ผลิต/สมคบ/ส่งออก=ร้ายแรง, เสพ/ครอบครอง/ครอบครองเพื่อเสพ=ไม่ร้ายแรง)
  const severity = useMemo(() => severityCounts(dimRows), [dimRows])
  const severitySum = severity.severe + severity.nonSevere
  const severePct = severitySum ? (severity.severe / severitySum) * 100 : 0
  const nonSeverePct = severitySum ? (severity.nonSevere / severitySum) * 100 : 0
  const severityRatioNote = severity.severe
    ? `อัตราส่วน ${(severity.nonSevere / severity.severe).toFixed(2)} : 1 (ไม่ร้ายแรง ต่อ ร้ายแรง)`
    : undefined

  // ตัวยา — สกัดจากพฤติการณ์/ของกลางด้วย DRUG_KEYWORDS (extract_arrest.py) แล้ว dedup (คดี × ตัวยา) ตั้งแต่ ETL
  // แต่ละค่าจึงเป็น "จำนวนคดีที่พบตัวยานั้น" — 1 คดีมีหลายตัวยาได้ ผลรวมทุกตัวยาจึงเกินจำนวนคดีจริงได้
  // คดีที่หา keyword ไม่เจอจะไม่มีแถวในมิตินี้เลย (ไม่มีค่า "ไม่ระบุ") — ฐาน % คือผลรวมคดีที่ระบุตัวยาได้
  const drugData = useMemo(() => arrestDimensionCounts(dimRows, 'drug'), [dimRows])
  const drugTotal = useMemo(() => drugData.reduce((s, d) => s + d.value, 0), [drugData])

  // สัญชาติ — จาก arrest_dim dimension='nationality' (นับคน, มี subdistrict จริงต่างจาก charge/drug)
  // เน้นต่างชาติ (เมียนมาร์/ลาว/กัมพูชา/...) เพราะเป็นประเด็นที่สนใจ — ไทย/ไม่ระบุ รวมเป็นแท่งเดียวด้านบน
  const natSplit = useMemo(() => nationalitySplit(dimRows), [dimRows])
  const natSplitData = [
    { name: 'ไทย', value: natSplit.thai },
    { name: 'ต่างชาติ', value: natSplit.foreign },
  ]
  const natSplitColor = (name) => (name === 'ต่างชาติ' ? COLORS.amber : COLORS.slateSoft)
  const foreignNatData = useMemo(() => topForeignNationalities(dimRows), [dimRows])

  // ช่วงอายุ — จาก arrest_age_summary (aggregate ที่ DB แล้ว, ไม่ใช่รายคน)
  const ageInfo = useMemo(() => ageStats(ageSummaryRows), [ageSummaryRows])
  const ageHistData = useMemo(() => ageHistogram(ageSummaryRows), [ageSummaryRows])

  const top3 = useMemo(() => topArrestDistricts(caseRows, totalCases), [caseRows, totalCases])

  // ข้อหา/ร้ายแรง/ตัวยา/ช่วงอายุ มาจาก arrest_dim, arrest_age_summary — aggregate แค่ระดับเขต ไม่มีคอลัมน์แขวง
  // (ดู extract_arrest.py, arrest_age_summary_view.sql) กรองแขวงไม่ได้จริง แม้เลือกแขวงอยู่ก็ยังเป็นยอดทั้งเขต — ต้องบอกผู้ใช้กันเข้าใจผิด
  const districtOnlyNote = cascade.subdistrict !== 'all' ? ' · ข้อมูลนี้เป็นระดับเขต (ยังไม่แยกแขวง)' : ''

  const [tableOpen, setTableOpen] = useState(false)
  const [page, setPage] = useState(1)
  const tableRows = useMemo(() => caseRows.slice().sort((a, b) => b.fiscal_year - a.fiscal_year || b.cases - a.cases), [caseRows])
  const totalPages = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE))
  const pageRows = useMemo(() => tableRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [tableRows, page])

  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    setExporting(true)
    try {
      await exportArrestReport({
        caseRows, dimRows, ageSummaryRows,
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Gavel} iconBg="bg-slate-100" iconColor="text-slate-600"
          label="จำนวนคดี" value={totalCases.toLocaleString()} unit="คดี"
          delta={yoy?.cases}
          footer={yoyNote('cases', 'คดี') ?? 'คดีจับกุมในช่วงที่เลือก'} />
        <KpiCard icon={Users} iconBg="bg-amber-50" iconColor="text-amber-600"
          label="ผู้ต้องหา" value={totalSuspects.toLocaleString()} unit="คน"
          delta={yoy?.persons}
          footer={`เฉลี่ย ${(totalCases ? totalSuspects / totalCases : 0).toFixed(2)} คน/คดี${
            yoyNote('persons', 'คน') ? ` · ${yoyNote('persons', 'คน')}` : ''}`} />
        <KpiCard icon={ShieldAlert} iconBg="bg-rose-50" iconColor="text-rose-600"
          label="ข้อหาร้ายแรง" value={severitySum ? `${severePct.toFixed(1)}%` : '—'} valueColor="text-rose-600"
          footer={severitySum ? `(${severity.severe.toLocaleString()} คน) จำหน่าย/ผลิต/สมคบ/ส่งออก` : 'ยังไม่มีข้อมูลจำแนกข้อหา'} />
        <KpiCard icon={Shield} iconBg="bg-slate-100" iconColor="text-slate-600"
          label="ข้อหาไม่ร้ายแรง" value={severitySum ? `${nonSeverePct.toFixed(1)}%` : '—'}
          footer={severitySum ? `(${severity.nonSevere.toLocaleString()} คน) เสพ/ครอบครอง/ครอบครองเพื่อเสพ` : 'ยังไม่มีข้อมูลจำแนกข้อหา'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel>
          <SectionHead title="ข้อหา" badge={chargeData.length ? `${chargeData.length} ประเภท` : undefined}
            sub={`นับคน · 1 คนมีหลายข้อหาได้ (รวมข้อหาที่ไม่ระบุ)${districtOnlyNote}`}
            right={`ฐาน: ${totalSuspects.toLocaleString()} คน`} />
          {chargeData.length ? (
            <>
              <RankedList data={chargeData} unit="คน" pctBase={totalSuspects} />
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 tabular-nums">
                <p>% เทียบจากผู้ต้องหา {totalSuspects.toLocaleString()} คน (นับซ้ำได้ถ้ามีหลายข้อหา)</p>
                <span className="font-mono text-[11px]">สถิติรายฐานความผิด</span>
              </div>
            </>
          ) : <EmptyChart />}
        </Panel>
        <Panel>
          <SectionHead title="ร้ายแรง / ไม่ร้ายแรง" icon={ShieldAlert}
            sub={severitySum ? `จำแนกจากข้อหา (จำหน่าย/ผลิต/สมคบ/ส่งออก=ร้ายแรง) · ไม่รวมอื่นๆ/ไม่ระบุ (${severitySum.toLocaleString()} คนที่จำแนกได้)${districtOnlyNote}` : undefined} />
          {severitySum ? (
            <SplitRatioCard unit="คน" ratioNote={severityRatioNote}
              items={[
                { name: 'ไม่ร้ายแรง', value: severity.nonSevere, tone: 'slate', description: 'ส่วนใหญ่เป็นผู้เสพและครอบครองเพื่อเสพ มุ่งเน้นการบำบัดรักษา' },
                { name: 'ร้ายแรง', value: severity.severe, tone: 'rose', description: 'กลุ่มผู้ค้า ผู้ผลิต และเครือข่ายจำหน่ายยาเสพติดในพื้นที่' },
              ]} />
          ) : <EmptyChart />}
        </Panel>
      </div>

      {/* items-start — การ์ดตัวยาสูงตามเนื้อหาจริง ไม่ต้องยืดตามการ์ดสัญชาติที่ยาวกว่ามาก (ไม่งั้นเหลือที่ว่างใต้การ์ด) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Panel>
          <SectionHead title="ของกลางตัวยา" icon={Package}
            badge={drugData.length ? `${drugData.length} ชนิด` : undefined}
            sub={`นับตามคดีที่พบตัวยาแต่ละชนิด · 1 คดีมีหลายตัวยาได้ (ผลรวมจึงเกินจำนวนคดีจริง)${districtOnlyNote}`}
            right={drugTotal ? `ฐาน: ${drugTotal.toLocaleString()} คดี` : undefined} />
          <DrugSeizureCards data={drugData} unit="คดี" />
        </Panel>
        <Panel>
          <SectionHead title="สัญชาติ" icon={Globe2}
            sub={natSplit.total ? `ระบุสัญชาติได้ ${natSplit.coveredPct.toFixed(0)}% · ที่เหลือไม่ระบุ · ต่างชาติหลัก: ${foreignNatData.slice(0, 3).map((d) => d.name).join('/') || '—'}` : undefined} />
          {natSplit.total ? (
            <>
              <SplitBarChart data={natSplitData} unit="คน" colorFor={natSplitColor} />
              {foreignNatData.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <div className="text-xs font-medium text-slate-500 mb-3">สัญชาติต่างชาติ (ตัดไทย/ไม่ระบุออก) · 5 อันดับแรก</div>
                  <NationalityBreakdown data={foreignNatData} unit="คน" />
                </div>
              )}
            </>
          ) : <EmptyChart />}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel>
          <SectionHead title="ในชุมชน / นอกชุมชน" />
          <PlaceholderCard title="ในชุมชน/นอกชุมชน" note={NO_DATA_NOTE} />
        </Panel>
        <Panel>
          <SectionHead title="เขตจับกุมสูงสุด" icon={MapPin} sub="Top 3 · % จากจำนวนคดีทั้งหมดในช่วงที่เลือก" />
          <Top3List data={top3} />
        </Panel>
      </div>

      <Panel>
        <SectionHead title="ช่วงอายุผู้ต้องหา" icon={CalendarRange}
          sub={ageInfo.count ? `จาก ${ageInfo.count.toLocaleString()} คนที่ระบุอายุได้${districtOnlyNote}` : undefined} />
        {ageInfo.count ? (
          <>
            <div className="grid grid-cols-2 gap-4 mb-6 max-w-md">
              <Metric eyebrow="อายุต่ำสุด" value={ageInfo.min} unit="ปี" />
              <Metric eyebrow="อายุสูงสุด" value={ageInfo.max} unit="ปี" />
            </div>
            <RankedBarChart data={ageHistData} unit="คน" highlightFirst={false} />
          </>
        ) : <EmptyChart />}
      </Panel>

      <ActionBar tableOpen={tableOpen} onToggleTable={() => setTableOpen((o) => !o)} onExport={handleExport} exporting={exporting} />

      {tableOpen && (
        <div className="bg-white rounded-xl ring-1 ring-slate-900/[0.06] shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="overflow-auto max-h-[560px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 sticky top-0 z-10 shadow-[0_1px_0_rgba(15,23,42,0.06)]">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">เขต</th>
                  <th className="px-4 py-3 font-semibold">ปีงบ</th>
                  <th className="px-4 py-3 font-semibold text-right">จำนวนคดี</th>
                  <th className="px-4 py-3 font-semibold text-right">ผู้ต้องหา(คน)</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{r.district}</td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums whitespace-nowrap">{r.fiscal_year}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium tabular-nums text-right">{(r.cases || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums text-right">{(r.persons || 0).toLocaleString()}</td>
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
