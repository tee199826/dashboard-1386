// DrugSeizureCards — "ของกลางตัวยา" แบบการ์ด grid (แทนโดนัท/bar list เดิม) ตาม mockup ที่ผู้ใช้กำหนด
// การ์ด 1 = ตัวยาอันดับ 1 (เน้นใหญ่สุด), การ์ด 2-5 = อันดับรองลงมา, การ์ดสุดท้าย = "อื่นๆ" กดเปิด modal ดูที่เหลือทั้งหมด
// โทนน้ำเงินอ่อน (blue-100/200) เป็นข้อยกเว้นที่ผู้ใช้สั่งไว้เอง — ส่วนอื่นของ /situation ยังคุม palette slate+rose+emerald+amber ตามเดิม
// data: [{ name, value }] เรียงมาก→น้อยมาแล้ว (arrestDimensionCounts) · total: ฐาน % (ผลรวมทุกตัวยา)
// นับเป็น "คดี" ต่อตัวยา — dedup (casecode, ตัวยา) มาจาก extract_arrest.py แล้ว แต่ 1 คดีมีหลายตัวยาได้ ผลรวมจึงเกินจำนวนคดีจริง
import { useState } from 'react'
import { Package, Snowflake, Syringe, FlaskConical, Pill, Leaf, Cannabis, Sparkles, Flower2, ChevronRight } from 'lucide-react'
import Modal from '../Modal'
import { EmptyChart } from '../ReportUI'

const TOP_N = 5

// ไอคอนต่อชนิดตัวยา — ครอบคลุม DRUG_KEYWORDS ทั้ง 10 ตัวใน extract_arrest.py (ยาบ้าใช้เม็ด WY แยกต่างหาก)
const DRUG_ICON = {
  'ไอซ์': Snowflake, 'เฮโรอีน': Syringe, 'คีตามีน': FlaskConical, 'ยาอี': Pill,
  'กัญชา': Cannabis, 'กระท่อม': Leaf, 'โคเคน': Sparkles, 'ฝิ่น': Flower2, 'มอร์ฟีน': Syringe,
}

const pctOf = (value, total) => (total ? (value / total) * 100 : 0)

// เม็ดยาบ้า "WY" — วงกลมส้ม ตาม mockup (ตัวเดียวในหน้าที่ใช้สีส้ม เพราะเป็นสัญลักษณ์ของตัวยา ไม่ใช่สีสถานะ)
function WyPill({ size }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-orange-500 font-bold text-white ring-2 ring-orange-300/60"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}>
      WY
    </span>
  )
}

function DrugIcon({ name, size }) {
  if (name === 'ยาบ้า') return <WyPill size={size} />
  const Icon = DRUG_ICON[name] || Package
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-white/80 text-blue-700 ring-1 ring-blue-200"
      style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.75} />
    </span>
  )
}

// primary = การ์ดอันดับ 1 (พื้นเข้มขึ้น + ไอคอน/ตัวเลขใหญ่กว่า) ให้เป็นจุดสายตาแรกของ panel
function DrugCard({ name, value, total, unit, primary }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl text-center transition-colors ${
      primary ? 'bg-blue-200 ring-1 ring-blue-300/70 p-6 min-h-[190px]' : 'bg-blue-100 ring-1 ring-blue-200/70 p-5 min-h-[160px]'
    }`}>
      <DrugIcon name={name} size={primary ? 52 : 40} />
      <div className={`mt-3 font-semibold text-blue-900 ${primary ? 'text-lg' : 'text-[15px]'}`}>{name}</div>
      <div className={`mt-1.5 font-semibold tabular-nums text-blue-900 ${primary ? 'text-3xl' : 'text-2xl'}`}>
        {value.toLocaleString()} <span className="text-sm font-medium text-blue-700/80">{unit}</span>
      </div>
      <div className={`mt-1 font-semibold tabular-nums text-blue-700 ${primary ? 'text-base' : 'text-sm'}`}>
        {pctOf(value, total).toFixed(1)}%
      </div>
    </div>
  )
}

export default function DrugSeizureCards({ data, unit = 'คดี' }) {
  const [open, setOpen] = useState(false)
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return <EmptyChart />

  const top = data.slice(0, TOP_N)
  const rest = data.slice(TOP_N)
  const restSum = rest.reduce((s, d) => s + d.value, 0)

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {top.map((d, i) => (
          <DrugCard key={d.name} name={d.name} value={d.value} total={total} unit={unit} primary={i === 0} />
        ))}
        {rest.length > 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl bg-blue-100 ring-1 ring-blue-200/70 p-5 min-h-[160px] text-center">
            <DrugIcon name="อื่นๆ" size={40} />
            <div className="mt-3 text-[15px] font-semibold text-blue-900">อื่นๆ</div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums text-blue-900">
              {restSum.toLocaleString()} <span className="text-sm font-medium text-blue-700/80">{unit}</span>
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-blue-700">{pctOf(restSum, total).toFixed(1)}%</div>
            <button onClick={() => setOpen(true)}
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white/80 px-3 py-1.5 text-xs font-semibold text-blue-800 ring-1 ring-blue-200 transition-colors hover:bg-white">
              แสดงรายละเอียด <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} variant="warning"
        title={`ของกลางตัวยาอื่นๆ (${rest.length} ชนิด)`} icon={<Package size={18} />}>
        <p className="mb-3 text-xs text-slate-500">
          นอกเหนือจาก {TOP_N} อันดับแรก · % เทียบจาก {total.toLocaleString()} {unit} ที่ระบุตัวยาได้ทั้งหมด
        </p>
        <ul className="divide-y divide-slate-100">
          {rest.map((d) => (
            <li key={d.name} className="flex items-center gap-3 py-2.5">
              <DrugIcon name={d.name} size={30} />
              <span className="min-w-0 flex-1 truncate text-slate-700">{d.name}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-900">{d.value.toLocaleString()} {unit}</span>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-400">{pctOf(d.value, total).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
