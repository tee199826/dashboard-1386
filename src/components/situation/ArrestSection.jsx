// ArrestSection — ส่วน "จับกุม" ของหน้า /situation (ยกเนื้อจาก ArrestPage เดิม + เพิ่มตาม infographic template)
import { useState, useMemo } from 'react'
import { formatThaiDate } from '../../utils/heroMeta'
import { BEHAVIOR_FLAGS, DRUG_FLAGS, drugCounts, rowsWithAnyDrug, countFlag, isSevere } from '../../utils/drugFlags'
import { computeYoy, top3Districts } from '../../utils/situationCompare'
import { exportArrestReport } from '../../utils/exportSituation'
import { Panel, SectionHead, Metric, RankedBarChart, EmptyChart, SplitBarChart, Top3List, PlaceholderCard, ActionBar, TablePager } from '../ReportUI'
import { COLORS } from '../../utils/reportStyle'

const PAGE_SIZE = 50

export default function ArrestSection({ rows: arrestRows, total, allRows, cascade, filterState, range }) {
  // ── G1 ข้อหา (พฤติการณ์ 4 หมวด mutually exclusive — %รวม 100) ──
  const behData = useMemo(() => BEHAVIOR_FLAGS
    .map(([col, label]) => ({ name: label, value: countFlag(arrestRows, col) }))
    .sort((a, b) => b.value - a.value), [arrestRows])

  // ── G2 ของกลางตัวยา (นับเฉพาะที่ระบุตัวยาได้) ──
  const withDrug = useMemo(() => rowsWithAnyDrug(arrestRows).length, [arrestRows])
  const drugData = useMemo(() => drugCounts(arrestRows), [arrestRows])

  // ── G3 ในชุมชน/นอกชุมชน — community มีค่า = ในชุมชน, ว่าง = นอกชุมชน ──
  const communityData = useMemo(() => {
    const inCommunity = arrestRows.filter((r) => r.community).length
    return [
      { name: 'ในชุมชน', value: inCommunity },
      { name: 'นอกชุมชน', value: total - inCommunity },
    ]
  }, [arrestRows, total])

  // ── G4 ร้ายแรง/ไม่ร้ายแรง (ประมาณจากพฤติการณ์ — ดู isSevere ใน drugFlags.js) ──
  const severityData = useMemo(() => {
    const severe = arrestRows.filter(isSevere).length
    return [
      { name: 'ร้ายแรง', value: severe },
      { name: 'ไม่ร้ายแรง', value: total - severe },
    ]
  }, [arrestRows, total])

  // ── G5 %เปรียบเทียบปีงบก่อน ──
  const yoy = useMemo(() => computeYoy(allRows, cascade, filterState, (r) => r.action_arrest), [allRows, cascade, filterState])
  const yoyView = !yoy ? { value: '—', sub: 'เลือกปีงบเพื่อเปรียบเทียบ' }
    : yoy.pct == null ? { value: '—', sub: 'ไม่มีข้อมูลปีงบก่อนเพื่อเปรียบเทียบ' }
    : { value: `${yoy.pct > 0 ? '+' : ''}${yoy.pct.toFixed(1)}%`, sub: `ปีงบ ${yoy.prevFY}: ${yoy.prevTotal.toLocaleString()} คดี` }

  // ── G6 เขต top3 %จับกุมสูงสุด ──
  const top3 = useMemo(() => top3Districts(arrestRows, total), [arrestRows, total])

  const [tableOpen, setTableOpen] = useState(false)
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(arrestRows.length / PAGE_SIZE))
  const pageRows = useMemo(() => arrestRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [arrestRows, page])

  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    setExporting(true)
    try {
      await exportArrestReport({
        rows: arrestRows,
        periodLabel: range ? `${formatThaiDate(range.from)} - ${formatThaiDate(range.to)}` : 'ทั้งหมด',
        filterLabel: cascade.areaLabel,
        filenamePrefix: 'arrest-report',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-8">
      <Panel>
        <div className="grid grid-cols-12 gap-y-6">
          <Metric span="sm:col-span-4" eyebrow="จำนวนคดี" value={total.toLocaleString()} unit="คดี" />
          <Metric span="sm:col-span-4" divider eyebrow="จำนวนผู้ต้องหา" value={total.toLocaleString()} unit="คน"
            sub="นับ 1 คดี = 1 ผู้ต้องหา" />
          <Metric span="sm:col-span-4" divider eyebrow="เทียบปีงบก่อน" value={yoyView.value} sub={yoyView.sub} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel>
          <SectionHead title="ข้อหา" sub="พฤติการณ์ 4 หมวด (แยกจากกัน) — %รวม 100" />
          {behData.some((d) => d.value > 0) ? <RankedBarChart data={behData} unit="คดี" /> : <EmptyChart />}
        </Panel>
        <Panel>
          <SectionHead title="ของกลางตัวยา" sub="1 คดีมีหลายตัวยาได้ · % คำนวณจากคดีที่ระบุตัวยาได้เท่านั้น" />
          {drugData.length ? (
            <>
              <RankedBarChart data={drugData} unit="คดี" />
              <div className="mt-3 text-xs text-slate-400 tabular-nums">ระบุตัวยาได้ {withDrug.toLocaleString()} จาก {total.toLocaleString()} คดี</div>
            </>
          ) : <EmptyChart />}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel>
          <SectionHead title="ในชุมชน / นอกชุมชน" sub="community มีค่า = ในชุมชน · ว่าง = นอกชุมชน" />
          {total ? <SplitBarChart data={communityData} unit="คดี" colorFor={(n) => n === 'ในชุมชน' ? COLORS.emerald : COLORS.slateSoft} /> : <EmptyChart />}
        </Panel>
        <Panel>
          <SectionHead title="ร้ายแรง / ไม่ร้ายแรง" sub="จำแนกโดยประมาณจากพฤติการณ์ (ค้า/ผลิต/ค้าเสพ = ร้ายแรง, เสพ = ไม่ร้ายแรง)" />
          {total ? <SplitBarChart data={severityData} unit="คดี" colorFor={(n) => n === 'ร้ายแรง' ? COLORS.rose : COLORS.slateSoft} /> : <EmptyChart />}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel>
          <SectionHead title="เก่า / ใหม่" sub="ยังไม่มี field นี้ใน drug_incidents" />
          <PlaceholderCard title="เก่า/ใหม่" note="ยังไม่มี field นี้ใน drug_incidents" />
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
                  <th className="px-3 py-2.5 font-medium">วันที่</th>
                  <th className="px-3 py-2.5 font-medium">เขต</th>
                  <th className="px-3 py-2.5 font-medium">แขวง</th>
                  <th className="px-3 py-2.5 font-medium">ชุมชน</th>
                  <th className="px-3 py-2.5 font-medium">ข้อหา</th>
                  <th className="px-3 py-2.5 font-medium">ตัวยา</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums whitespace-nowrap">{formatThaiDate(r.received_date) || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{r.district || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.subdistrict || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.community || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {BEHAVIOR_FLAGS.filter(([c]) => r[c]).map(([, l]) => l).join(', ') || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {[...DRUG_FLAGS.filter(([c]) => r[c]).map(([, l]) => l), ...(Array.isArray(r.drug_others) ? r.drug_others.filter(Boolean) : [])].join(', ') || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePager page={page} totalPages={totalPages} total={arrestRows.length}
            onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(totalPages, p + 1))} />
        </div>
      )}
    </div>
  )
}
