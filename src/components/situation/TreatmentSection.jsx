// TreatmentSection — ส่วน "บำบัด" ของหน้า /situation (ยกเนื้อจาก TreatmentPage เดิม)
import { useState, useMemo } from 'react'
import { groupOf } from '../../hooks/useAreaCascade'
import { formatThaiDate } from '../../utils/heroMeta'
import { DRUG_FLAGS, drugCounts, rowsWithAnyDrug } from '../../utils/drugFlags'
import { exportTreatmentReport } from '../../utils/exportSituation'
import { Panel, SectionHead, Metric, RankedBarChart, EmptyChart, PlaceholderCard, ActionBar, TablePager } from '../ReportUI'

const PAGE_SIZE = 50
// ข้อมูลรายบุคคลที่ระบบยังไม่มีระดับ กทม. — รอ re-export ไฟล์บำบัดพร้อม filter กทม. จากระบบ บสต.
const PLACEHOLDER_DIMENSIONS = ['เก่า/ใหม่', 'ช่วงอายุ+อายุสูง/ต่ำสุด', 'อาชีพ', 'เพศ', 'สัญชาติ', 'มาตรา 113', 'จิตเวช', 'รักษาจิตร่วม%']

export default function TreatmentSection({ rows: treatmentRows, total, range, cascade }) {
  const withDrug = useMemo(() => rowsWithAnyDrug(treatmentRows).length, [treatmentRows])
  const drugData = useMemo(() => drugCounts(treatmentRows), [treatmentRows])

  const [areaMode, setAreaMode] = useState('group') // 'group' | 'district'
  const areaData = useMemo(() => {
    const m = {}
    treatmentRows.forEach((r) => {
      if (!r.district) return
      const key = areaMode === 'group' ? (groupOf(r.district) || 'ไม่ระบุ') : r.district.replace(/^เขต/, '')
      m[key] = (m[key] || 0) + 1
    })
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [treatmentRows, areaMode])

  const [tableOpen, setTableOpen] = useState(false)
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(treatmentRows.length / PAGE_SIZE))
  const pageRows = useMemo(() => treatmentRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [treatmentRows, page])

  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    setExporting(true)
    try {
      await exportTreatmentReport({
        rows: treatmentRows,
        periodLabel: range ? `${formatThaiDate(range.from)} - ${formatThaiDate(range.to)}` : 'ทั้งหมด',
        filterLabel: cascade.areaLabel,
        filenamePrefix: 'treatment-report',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-8">
      <Panel>
        <div className="grid grid-cols-12 gap-y-6">
          <Metric span="sm:col-span-12" eyebrow="จำนวนผู้บำบัด" value={total.toLocaleString()} unit="ราย" />
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel>
          <SectionHead title="ตัวยา" sub="1 รายอาจเกี่ยวข้องหลายตัวยาได้ · % คำนวณจากรายที่ระบุตัวยาได้เท่านั้น" />
          {drugData.length ? (
            <>
              <RankedBarChart data={drugData} unit="ราย" />
              <div className="mt-3 text-xs text-slate-400 tabular-nums">ระบุตัวยาได้ {withDrug.toLocaleString()} จาก {total.toLocaleString()} ราย</div>
            </>
          ) : <EmptyChart />}
        </Panel>
        <Panel>
          <div className="flex items-center justify-between mb-4">
            <SectionHead title="พื้นที่" />
            <div className="flex gap-1 p-0.5 rounded-md ring-1 ring-slate-200 bg-slate-50 -mt-4">
              {[['group', 'รายกลุ่ม'], ['district', 'รายเขต']].map(([m, l]) => (
                <button key={m} onClick={() => setAreaMode(m)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                    areaMode === m ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}>{l}</button>
              ))}
            </div>
          </div>
          {areaData.length ? <RankedBarChart data={areaData} unit="ราย" /> : <EmptyChart />}
        </Panel>
      </div>

      <div>
        <SectionHead title="ข้อมูลรายบุคคล" sub="ยังไม่มีในระดับ กทม. — รอ re-export ไฟล์บำบัดพร้อม filter กทม." />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {PLACEHOLDER_DIMENSIONS.map((d) => <PlaceholderCard key={d} title={d} />)}
        </div>
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
                      {[...DRUG_FLAGS.filter(([c]) => r[c]).map(([, l]) => l), ...(Array.isArray(r.drug_others) ? r.drug_others.filter(Boolean) : [])].join(', ') || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePager page={page} totalPages={totalPages} total={treatmentRows.length}
            onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(totalPages, p + 1))} />
        </div>
      )}
    </div>
  )
}
