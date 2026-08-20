import { useState, useEffect } from 'react'
import { Download, Camera } from 'lucide-react'
import Modal from './Modal'

const FORMATS = [
  { id: 'jpg', label: 'JPG' },
  { id: 'png', label: 'PNG' },
]
const SCALES = [
  { id: 2, label: '2x (แนะนำ)' },
  { id: 1, label: '1x' },
  { id: 4, label: '4x' },
]

/**
 * MapExportDialog — modal ตัวเลือกส่งออกภาพแผนที่ (JPG/PNG) ของ /radar
 * props: open, onClose, onConfirm({ format, scale, showDistrictNames, showLegend, showTitle }), busy
 */
export default function MapExportDialog({ open, onClose, onConfirm, busy = false }) {
  const [format, setFormat] = useState('jpg')
  const [scale, setScale] = useState(2)
  const [showDistrictNames, setShowDistrictNames] = useState(true)
  const [showLegend, setShowLegend] = useState(true)
  const [showTitle, setShowTitle] = useState(true)

  useEffect(() => {
    if (!open) return
    setFormat('jpg')
    setScale(2)
    setShowDistrictNames(true)
    setShowLegend(true)
    setShowTitle(true)
  }, [open])

  const handleConfirm = () => {
    if (busy) return
    onConfirm({ format, scale, showDistrictNames, showLegend, showTitle })
  }

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title="ส่งออกภาพแผนที่" closeOnBackdrop={!busy}
      icon={<Camera size={18} />}
      actions={(
        <>
          <button type="button" onClick={onClose} disabled={busy}
            className="h-9 px-4 rounded-lg ring-1 ring-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            ยกเลิก
          </button>
          <button type="button" onClick={handleConfirm} disabled={busy}
            className="h-9 px-4 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5">
            <Download size={14} />{busy ? 'กำลังสร้างภาพ...' : 'ดาวน์โหลด'}
          </button>
        </>
      )}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">รูปแบบ</div>
          <div className="flex gap-2">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFormat(f.id)}
                className={`flex-1 h-9 rounded-lg text-sm font-medium ring-1 transition ${
                  format === f.id ? 'bg-violet-600 text-white ring-violet-600' : 'ring-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">ความละเอียด</div>
          <div className="flex gap-2">
            {SCALES.map((s) => (
              <button key={s.id} type="button" onClick={() => setScale(s.id)}
                className={`flex-1 h-9 rounded-lg text-xs font-medium ring-1 transition ${
                  scale === s.id ? 'bg-violet-600 text-white ring-violet-600' : 'ring-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3 space-y-1.5">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={showDistrictNames} onChange={(e) => setShowDistrictNames(e.target.checked)} className="accent-violet-600" />
            แสดงชื่อเขต
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={showLegend} onChange={(e) => setShowLegend(e.target.checked)} className="accent-violet-600" />
            แสดงคำอธิบายสัญลักษณ์ (legend)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} className="accent-violet-600" />
            แสดงหัวข้อ + ช่วงวันที่
          </label>
        </div>
      </div>
    </Modal>
  )
}
