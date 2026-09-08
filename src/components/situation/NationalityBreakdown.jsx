// NationalityBreakdown — รายการสัญชาติต่างชาติของผู้ต้องหา (ตัดไทย/ไม่ระบุออกมาแล้ว)
// เดิมพล็อตทุกสัญชาติในกราฟเดียว (~25 หมวด) — หางยาวเหลือชาติละ 1-2 คน อ่านไม่ออกและกินพื้นที่มาก
// ใหม่: กราฟโชว์ top 5 + ปุ่ม "แสดงข้อมูลเพิ่มเติม" เปิด modal ดูที่เหลือทั้งหมด (pattern เดียวกับการ์ด "อื่นๆ" ของ DrugSeizureCards)
// data: [{ name, value }] เรียงมาก→น้อยมาแล้ว (topForeignNationalities) · หน่วยเป็น "คน"
import { useState } from 'react'
import { Globe2, ChevronRight } from 'lucide-react'
import Modal from '../Modal'
import { RankedBarChart, EmptyChart } from '../ReportUI'

const TOP_N = 5

export default function NationalityBreakdown({ data, unit = 'คน' }) {
  const [open, setOpen] = useState(false)
  if (!data.length) return <EmptyChart />

  // ฐาน % = ผู้ต้องหาต่างชาติทั้งหมด (ไม่ใช่ยอดรวมทุกสัญชาติ) — ตอบคำถาม "ในบรรดาต่างชาติ ชาตินี้กี่ %"
  const total = data.reduce((s, d) => s + d.value, 0)
  const top = data.slice(0, TOP_N)
  const rest = data.slice(TOP_N)
  const restSum = rest.reduce((s, d) => s + d.value, 0)
  const pctOf = (v) => (total ? (v / total) * 100 : 0)

  return (
    <>
      <RankedBarChart data={top} unit={unit} />

      {rest.length > 0 && (
        <button onClick={() => setOpen(true)}
          className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg bg-slate-50/80 px-3.5 py-2.5 text-left ring-1 ring-slate-200/80 transition-colors hover:bg-slate-100">
          <span className="text-xs font-semibold text-slate-700">แสดงข้อมูลเพิ่มเติม</span>
          <span className="flex items-center gap-1.5 text-xs tabular-nums text-slate-500">
            อีก {rest.length} สัญชาติ · {restSum.toLocaleString()} {unit}
            <ChevronRight size={13} className="text-slate-400" />
          </span>
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} variant="warning"
        title={`สัญชาติอื่นๆ (${rest.length} สัญชาติ)`} icon={<Globe2 size={18} />}>
        <p className="mb-3 text-xs text-slate-500">
          นอกเหนือจาก {TOP_N} อันดับแรก · % เทียบจากผู้ต้องหาต่างชาติทั้งหมด {total.toLocaleString()} {unit}
        </p>
        <ul className="divide-y divide-slate-100">
          {rest.map((d, i) => (
            <li key={d.name} className="flex items-center gap-3 py-2.5">
              <span className="w-6 shrink-0 text-xs tabular-nums text-slate-400">{TOP_N + i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-slate-700">{d.name}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-900">{d.value.toLocaleString()} {unit}</span>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-400">{pctOf(d.value).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
