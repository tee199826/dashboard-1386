import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
import Modal from './Modal'
import { formatThaiDate } from '../utils/heroMeta'

const REPORT_MODES = [
  { id: 'district', label: 'รายเขต (50 เขต)', desc: 'สรุป + รายละเอียด + สถานะ + Top 5 + ข้อหา' },
  { id: 'zone', label: 'รายกลุ่มโซน (6 กลุ่ม)', desc: 'สรุปตามกลุ่มพื้นที่ ไม่แยกเขต' },
]

// การ์ดตัวเลือกแบบ radio — children (ถ้ามี) วางนอก <label> เสมอ กัน click ของ control ข้างในไป toggle radio ซ้อน
function RadioOption({ selected, onSelect, title, desc, children }) {
  return (
    <div className={`rounded-lg ring-1 transition ${selected ? 'ring-violet-500 bg-violet-50/60' : 'ring-slate-200 hover:bg-slate-50'}`}>
      <label className="flex items-start gap-2.5 p-2.5 cursor-pointer">
        <input type="radio" checked={selected} onChange={onSelect} className="mt-0.5 accent-violet-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-800">{title}</div>
          {desc && <div className="text-xs text-slate-500 mt-0.5">{desc}</div>}
        </div>
      </label>
      {selected && children && <div className="px-2.5 pb-2.5 pl-9">{children}</div>}
    </div>
  )
}

/**
 * ExportDialog — modal เลือกรูปแบบรายงาน (รายเขต/รายกลุ่มโซน) + ช่วงวันที่ (ตัวกรองปัจจุบัน/กำหนดเอง)
 * ใช้ร่วมกัน /districts, /bkn, /radar — หน้าที่เรียกรับผิดชอบ fetch/filter แถวเองตาม { mode, dateRange } ที่ได้จาก onConfirm
 * props:
 *   open, onClose, onConfirm({ mode, dateRange })  — dateRange = { from, to } (ISO) หรือ null ถ้าใช้ตัวกรองปัจจุบัน
 *   currentPeriodLabel — ข้อความอธิบายตัวกรองปัจจุบันของหน้า เช่น "ปีงบ 2569"
 *   defaultFrom, defaultTo — ค่าตั้งต้นของช่อง "กำหนดเอง" (ISO) — seed จากช่วงที่หน้ากำลังดูอยู่ ถ้ามี
 *   busy — export กำลังทำงาน (disable ปุ่ม + กัน backdrop close)
 */
export default function ExportDialog({
  open, onClose, onConfirm,
  currentPeriodLabel = 'ตัวกรองปัจจุบัน',
  defaultFrom = '', defaultTo = '',
  busy = false,
}) {
  const [mode, setMode] = useState('district')
  const [dateMode, setDateMode] = useState('filter')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)

  // รีเซ็ตทุกครั้งที่เปิด — กันค่าเก่าจากการ export รอบก่อนค้าง
  useEffect(() => {
    if (!open) return
    setMode('district')
    setDateMode('filter')
    setFrom(defaultFrom)
    setTo(defaultTo)
  }, [open, defaultFrom, defaultTo])

  const customIncomplete = dateMode === 'custom' && (!from || !to)
  const customInvalid = dateMode === 'custom' && from && to && from > to
  const canConfirm = !busy && !customIncomplete && !customInvalid

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm({ mode, dateRange: dateMode === 'custom' ? { from, to } : null })
  }

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title="ส่งออกรายงาน" closeOnBackdrop={!busy}
      actions={(
        <>
          <button type="button" onClick={onClose} disabled={busy}
            className="h-9 px-4 rounded-lg ring-1 ring-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            ยกเลิก
          </button>
          <button type="button" onClick={handleConfirm} disabled={!canConfirm}
            className="h-9 px-4 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5">
            <Download size={14} />{busy ? 'กำลังส่งออก...' : 'ส่งออก Excel'}
          </button>
        </>
      )}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">รูปแบบรายงาน</div>
          {REPORT_MODES.map((m) => (
            <RadioOption key={m.id} selected={mode === m.id} onSelect={() => setMode(m.id)} title={m.label} desc={m.desc} />
          ))}
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">ช่วงวันที่</div>
          <RadioOption selected={dateMode === 'filter'} onSelect={() => setDateMode('filter')}
            title="ใช้ตัวกรองปัจจุบัน" desc={`(${currentPeriodLabel})`} />
          <RadioOption selected={dateMode === 'custom'} onSelect={() => setDateMode('custom')} title="กำหนดเอง">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                  className="flex-1 h-8 px-2 rounded-md ring-1 ring-slate-200 text-xs outline-none focus:ring-2 focus:ring-violet-500" />
                <span className="text-slate-400 text-xs shrink-0">ถึง</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                  className="flex-1 h-8 px-2 rounded-md ring-1 ring-slate-200 text-xs outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              {customInvalid && <p className="text-[11px] text-rose-600">"จาก" ต้องมาก่อน "ถึง"</p>}
              {!customInvalid && from && to && (
                <p className="text-[11px] text-slate-400">{formatThaiDate(from)} – {formatThaiDate(to)}</p>
              )}
            </div>
          </RadioOption>
        </div>
      </div>
    </Modal>
  )
}
