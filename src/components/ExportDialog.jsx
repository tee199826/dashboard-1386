import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
import Modal from './Modal'
import { formatThaiDate } from '../utils/heroMeta'

const REPORT_MODES = [
  { id: 'district', label: 'รายเขต (50 เขต)', desc: 'สรุป + รายละเอียด + สถานะ + Top 5 + ข้อหา' },
  { id: 'zone', label: 'รายกลุ่มโซน (6 กลุ่ม)', desc: 'สรุปตามกลุ่มพื้นที่ ไม่แยกเขต' },
]

// ลำดับตรงกับ ACTION_FLAGS_ORDERED ใน exportReport.js (คอลัมน์จริงที่ filter ใช้)
const ACTION_OPTIONS = [
  { key: 'action_arrest', label: 'จับกุม' },
  { key: 'action_search', label: 'ตรวจค้น' },
  { key: 'action_treatment', label: 'บำบัด' },
  { key: 'action_escape', label: 'หลบหนี' },
  { key: 'action_investigating', label: 'อยู่ระหว่างสืบสวน' },
]
const ALL_ACTION_KEYS = ACTION_OPTIONS.map((a) => a.key)

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
 *   open, onClose, onConfirm({ mode, dateRange, zoneDetail, statusFilter })  — dateRange = { from, to } (ISO) หรือ null ถ้าใช้ตัวกรองปัจจุบัน
 *     statusFilter = { done, pending, actions: [action_arrest, ...] } — ส่งต่อให้ exportDrugIncidentReport กรองก่อน aggregate
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
  const [zoneDetail, setZoneDetail] = useState('top3')
  const [dateMode, setDateMode] = useState('filter')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [statusDone, setStatusDone] = useState(true)
  const [statusPending, setStatusPending] = useState(true)
  const [selectedActions, setSelectedActions] = useState(ALL_ACTION_KEYS)

  // รีเซ็ตทุกครั้งที่เปิด — กันค่าเก่าจากการ export รอบก่อนค้าง
  useEffect(() => {
    if (!open) return
    setMode('district')
    setZoneDetail('top3')
    setDateMode('filter')
    setFrom(defaultFrom)
    setTo(defaultTo)
    setStatusDone(true)
    setStatusPending(true)
    setSelectedActions(ALL_ACTION_KEYS)
  }, [open, defaultFrom, defaultTo])

  const toggleAction = (key) => setSelectedActions((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
  const selectAllStatus = () => { setStatusDone(true); setStatusPending(true); setSelectedActions(ALL_ACTION_KEYS) }
  const clearAllStatus = () => { setStatusDone(false); setStatusPending(false); setSelectedActions([]) }

  const customIncomplete = dateMode === 'custom' && (!from || !to)
  const customInvalid = dateMode === 'custom' && from && to && from > to
  const noStatusSelected = !statusDone && !statusPending
  const canConfirm = !busy && !customIncomplete && !customInvalid && !noStatusSelected

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm({
      mode, dateRange: dateMode === 'custom' ? { from, to } : null, zoneDetail,
      statusFilter: { done: statusDone, pending: statusPending, actions: selectedActions },
    })
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
            <RadioOption key={m.id} selected={mode === m.id} onSelect={() => setMode(m.id)} title={m.label} desc={m.desc}>
              {m.id === 'zone' && (
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-slate-500">รายละเอียดเขตในโซน:</div>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input type="radio" checked={zoneDetail === 'top3'} onChange={() => setZoneDetail('top3')} className="accent-violet-600" />
                    Top 3 เขตต่อโซน (18 แถว)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input type="radio" checked={zoneDetail === 'all'} onChange={() => setZoneDetail('all')} className="accent-violet-600" />
                    ทุกเขตในโซน (50 แถว)
                  </label>
                </div>
              )}
            </RadioOption>
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

        <div className="border-t border-slate-100 pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">กรองข้อมูล (เลือกได้หลายอย่าง)</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={selectAllStatus} className="text-[11px] font-medium text-violet-600 hover:underline">เลือกทั้งหมด</button>
              <button type="button" onClick={clearAllStatus} className="text-[11px] font-medium text-slate-400 hover:underline">ล้าง</button>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-medium text-slate-500">สถานะการดำเนินการ</div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={statusDone} onChange={(e) => setStatusDone(e.target.checked)} className="accent-violet-600" />
              ดำเนินการแล้ว
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={statusPending} onChange={(e) => setStatusPending(e.target.checked)} className="accent-violet-600" />
              ยังไม่ดำเนินการ
            </label>
          </div>

          {statusDone && (
            <div className="space-y-1 pt-1">
              <div className="text-[11px] font-medium text-slate-500">ผลการดำเนินการ (เฉพาะที่ดำเนินการแล้ว)</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {ACTION_OPTIONS.map((opt) => (
                  <label key={opt.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={selectedActions.includes(opt.key)} onChange={() => toggleAction(opt.key)} className="accent-violet-600" />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {noStatusSelected && <p className="text-[11px] text-rose-600">เลือกอย่างน้อย 1 สถานะ</p>}
        </div>
      </div>
    </Modal>
  )
}
