// IncidentsSection — ส่วน "ร้องเรียน" ของหน้า /situation (ยกเนื้อจาก IncidentsPage เดิม + เพิ่มตาม infographic template)
import { useState, useMemo } from 'react'
import { FileWarning, CheckCircle2, CircleDashed, TrendingUp, ListChecks, Pill, SearchCheck, Workflow, MapPin, ArrowLeftRight } from 'lucide-react'
import { formatThaiDate } from '../../utils/heroMeta'
import { BEHAVIOR_FLAGS, DRUG_FLAGS, RESULT_FLAGS, drugCounts, countFlag } from '../../utils/drugFlags'
import { computeYoy, top3Districts, pickComparePair } from '../../utils/situationCompare'
import { exportIncidentsReport } from '../../utils/exportSituation'
import { Panel, SectionHead, Metric, RankedBarChart, EmptyChart, Top3List, ActionBar, TablePager } from '../ReportUI'
import BehaviorCompareChart from './BehaviorCompareChart'

const PAGE_SIZE = 50

export default function IncidentsSection({ rows, total, allRows, cascade, filterState, range, availableYears }) {
  const doneCount = useMemo(() => rows.filter((r) => r.result_found || r.action_arrest || r.action_treatment).length, [rows])
  const remainingCount = total - doneCount
  const donePct = total ? (doneCount / total) * 100 : 0
  const remainingPct = total ? (remainingCount / total) * 100 : 0

  const behData = useMemo(() => BEHAVIOR_FLAGS
    .map(([col, label]) => ({ name: label, value: countFlag(rows, col) }))
    .sort((a, b) => b.value - a.value), [rows])

  const drugData = useMemo(() => drugCounts(rows, { top: 10 }), [rows])

  const resultData = useMemo(() => RESULT_FLAGS
    .map(([col, label]) => ({ name: label, value: countFlag(rows, col), key: col }))
    .sort((a, b) => b.value - a.value), [rows])

  // พบแล้วผลเป็นอะไร — subset result_found=true
  const foundOutcome = useMemo(() => {
    const found = rows.filter((r) => r.result_found)
    const arrestN = countFlag(found, 'action_arrest')
    const treatN = countFlag(found, 'action_treatment')
    const investN = countFlag(found, 'action_investigating')
    const otherN = found.length - found.filter((r) => r.action_arrest || r.action_treatment || r.action_investigating).length
    return {
      total: found.length,
      data: [
        { name: 'จับกุม', value: arrestN },
        { name: 'บำบัด', value: treatN },
        { name: 'อยู่ระหว่างสืบสวน', value: investN },
        { name: 'อื่น', value: otherN },
      ].sort((a, b) => b.value - a.value),
    }
  }, [rows])

  // ── %เปรียบเทียบปีงบก่อน ──
  const yoy = useMemo(() => computeYoy(allRows, cascade, filterState), [allRows, cascade, filterState])
  const yoyView = !yoy ? { value: '—', sub: 'เลือกปีงบเพื่อเปรียบเทียบ' }
    : yoy.pct == null ? { value: '—', sub: 'ไม่มีข้อมูลปีงบก่อนเพื่อเปรียบเทียบ' }
    : { value: `${yoy.pct > 0 ? '+' : ''}${yoy.pct.toFixed(1)}%`, sub: `ปีงบ ${yoy.prevFY}: ${yoy.prevTotal.toLocaleString()} เรื่อง` }

  // ── เขต top3 ร้องเรียนสูงสุด ──
  const top3 = useMemo(() => top3Districts(rows, total), [rows, total])

  // ── กราฟพฤติการณ์เทียบ 2 ปีงบ ──
  const comparePair = useMemo(() => pickComparePair(filterState, availableYears), [filterState, availableYears])

  const [tableOpen, setTableOpen] = useState(false)
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page])

  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    setExporting(true)
    try {
      await exportIncidentsReport({
        rows,
        periodLabel: range ? `${formatThaiDate(range.from)} - ${formatThaiDate(range.to)}` : 'ทั้งหมด',
        filterLabel: cascade.areaLabel,
        filenamePrefix: 'incidents-report',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-8">
      <Panel>
        <div className="grid grid-cols-12 gap-y-6">
          <Metric span="sm:col-span-3" icon={FileWarning} eyebrow="เรื่องทั้งหมด" value={total.toLocaleString()} unit="เรื่อง" />
          <Metric span="sm:col-span-3" divider icon={CheckCircle2} accent="text-emerald-700" eyebrow="ดำเนินการแล้ว"
            value={`${donePct.toFixed(1)}%`} sub={`${doneCount.toLocaleString()} เรื่อง`} />
          <Metric span="sm:col-span-3" divider icon={CircleDashed} accent="text-rose-600" eyebrow="คงเหลือ"
            value={`${remainingPct.toFixed(1)}%`} sub={`${remainingCount.toLocaleString()} เรื่อง`} />
          <Metric span="sm:col-span-3" divider icon={TrendingUp} eyebrow="เทียบปีงบก่อน" value={yoyView.value} sub={yoyView.sub} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel>
          <SectionHead title="พฤติการณ์" icon={ListChecks} sub="4 หมวด (แยกจากกัน) — %รวม 100" />
          {behData.some((d) => d.value > 0) ? <RankedBarChart data={behData} unit="เรื่อง" /> : <EmptyChart />}
        </Panel>
        <Panel>
          <SectionHead title="ตัวยา" icon={Pill} sub="Top 10 · 1 เรื่องอาจพบหลายชนิด" />
          {drugData.length ? <RankedBarChart data={drugData} unit="เรื่อง" /> : <EmptyChart />}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel>
          <SectionHead title="ผลตรวจสอบ" icon={SearchCheck} />
          {resultData.some((d) => d.value > 0) ? <RankedBarChart data={resultData} unit="เรื่อง" /> : <EmptyChart />}
        </Panel>
        <Panel>
          <SectionHead title="พบแล้วผลเป็นอะไร" icon={Workflow} sub={`ใน ${foundOutcome.total.toLocaleString()} เรื่องที่พบพฤติการณ์`} />
          {foundOutcome.total ? <RankedBarChart data={foundOutcome.data} unit="เรื่อง" /> : <EmptyChart />}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel>
          <SectionHead title="เขตร้องเรียนสูงสุด" icon={MapPin} sub="Top 3 · % จากจำนวนเรื่องทั้งหมดในช่วงที่เลือก" />
          <Top3List data={top3} />
        </Panel>
        <Panel>
          <SectionHead title="พฤติการณ์เทียบ 2 ปีงบ" icon={ArrowLeftRight} sub={comparePair ? undefined : 'ยังไม่มีข้อมูลครบ 2 ปีงบสำหรับเปรียบเทียบ'} />
          {comparePair
            ? <BehaviorCompareChart allRows={allRows} cascade={cascade} fyOld={comparePair[1]} fyNew={comparePair[0]} />
            : <EmptyChart />}
        </Panel>
      </div>

      <ActionBar tableOpen={tableOpen} onToggleTable={() => setTableOpen((o) => !o)} onExport={handleExport} exporting={exporting} />

      {tableOpen && (
        <div className="bg-white rounded-xl ring-1 ring-slate-900/[0.06] shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="overflow-auto max-h-[560px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 sticky top-0 z-10 shadow-[0_1px_0_rgba(15,23,42,0.06)]">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">วันที่</th>
                  <th className="px-4 py-3 font-semibold">เขต</th>
                  <th className="px-4 py-3 font-semibold">แขวง</th>
                  <th className="px-4 py-3 font-semibold">พฤติการณ์</th>
                  <th className="px-4 py-3 font-semibold">ตัวยา</th>
                  <th className="px-4 py-3 font-semibold">ผลตรวจสอบ</th>
                  <th className="px-4 py-3 font-semibold">ผลดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const isDone = r.result_found || r.action_arrest || r.action_treatment
                  return (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 text-slate-600 tabular-nums whitespace-nowrap">{formatThaiDate(r.received_date) || '-'}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{r.district || '-'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.subdistrict || '-'}</td>
                      <td className="px-4 py-3 text-slate-500">{BEHAVIOR_FLAGS.filter(([c]) => r[c]).map(([, l]) => l).join(', ') || '-'}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {[...DRUG_FLAGS.filter(([c]) => r[c]).map(([, l]) => l), ...(Array.isArray(r.drug_others) ? r.drug_others.filter(Boolean) : [])].join(', ') || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${isDone ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {RESULT_FLAGS.filter(([c]) => r[c]).map(([, l]) => l).join(', ') || 'ยังไม่มีผล'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {[r.action_arrest && 'จับกุม', r.action_treatment && 'บำบัด', r.action_investigating && 'สืบสวน',
                          r.action_search && 'ตรวจค้น', r.action_escape && 'หลบหนี'].filter(Boolean).join(', ') || '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <TablePager page={page} totalPages={totalPages} total={rows.length}
            onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(totalPages, p + 1))} />
        </div>
      )}
    </div>
  )
}
