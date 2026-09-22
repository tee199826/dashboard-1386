import { X } from "lucide-react"
import { updateComplaint } from "../../shared/data/dataLoader.js"
import { useState, useEffect } from 'react'
import { GROUPS, CHANNELS, STATUSES, ACTION_UNITS, formatThaiDate } from "./complaintFields.js"
import { ConfirmModal } from "../../shared/ui/ConfirmModal.jsx"

/* ─── ViewModal ─── */
export function ViewModal({ row, onClose }) {
  return (
    <Modal onClose={onClose} title={`รายละเอียด ID: ${row.id}`} size="lg">
      <div className="p-6 grid grid-cols-2 gap-4">
        <Field label="กลุ่มเรื่อง" value={row.group} />
        <Field label="วันที่รับเรื่อง" value={formatThaiDate(row.date)} />
        <Field label="ช่องทาง" value={row.channel} />
        <Field label="สถานะ" value={row.status} />
        <Field label="เขต" value={row.district} />
        <Field label="แขวง" value={row.subdistrict} />
        <Field label="ชุมชน" value={row.community} />
        <Field label="หน่วยดำเนินการ" value={row.actionUnit} />
        <Field label="ประเภทบุคคล" value={row.personType} />
        <Field label="บทบาท" value={row.role} />
        <Field label="ยาเสพติด" value={row.drug} />
        <Field label="ประเภทพื้นที่" value={row.areaType} />
      </div>
    </Modal>
  )
}

/* ─── EditModal ─── */
export function EditModal({ row, onClose, onSaved, logAction, showToast }) {
  const [form, setForm] = useState(row)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateComplaint(row.id, form)
      if (logAction) await logAction('update', 'complaints', row.id, { id: row.id })
      showToast?.('แก้ไขข้อมูลสำเร็จ')
      onSaved()
    } catch (err) {
      showToast?.('บันทึกไม่สำเร็จ: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} title={`แก้ไข ID: ${row.id}`} size="lg">
      <div className="p-6 grid grid-cols-2 gap-4">
        <FormField label="กลุ่มเรื่อง">
          <select value={form.group} onChange={e => set('group', parseInt(e.target.value))} className="form-input">
            {GROUPS.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
          </select>
        </FormField>
        <FormField label="วันที่รับเรื่อง">
          <input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} className="form-input" />
        </FormField>
        <FormField label="ช่องทาง">
          <select value={form.channel || ''} onChange={e => set('channel', e.target.value)} className="form-input">
            <option value="">-</option>{CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>
        <FormField label="สถานะ">
          <select value={form.status || ''} onChange={e => set('status', e.target.value)} className="form-input">
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>
        <FormField label="เขต">
          <input value={form.district || ''} onChange={e => set('district', e.target.value)} className="form-input" />
        </FormField>
        <FormField label="แขวง">
          <input value={form.subdistrict || ''} onChange={e => set('subdistrict', e.target.value)} className="form-input" />
        </FormField>
        <FormField label="ชุมชน">
          <input value={form.community || ''} onChange={e => set('community', e.target.value)} className="form-input" />
        </FormField>
        <FormField label="หน่วยดำเนินการ">
          <select value={form.actionUnit || ''} onChange={e => set('actionUnit', e.target.value)} className="form-input">
            <option value="">-</option>{ACTION_UNITS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </FormField>
      </div>
      <div className="flex gap-3 justify-end px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
        <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-white">ยกเลิก</button>
        <button onClick={() => setConfirmOpen(true)} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
      {confirmOpen && (
        <ConfirmModal
          title="ยืนยันการแก้ไขข้อมูล"
          message={`ต้องการบันทึกการแก้ไขรายการ ID: ${row.id} ใช่หรือไม่?`}
          detail="ข้อมูลที่แก้ไขจะถูกอัปเดตในระบบทันที"
          onConfirm={() => { setConfirmOpen(false); handleSave() }}
          onCancel={() => setConfirmOpen(false)}
          confirmLabel="บันทึกการแก้ไข"
        />
      )}
    </Modal>
  )
}

export function Modal({ children, onClose, title, size = 'md' }) {
  const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' }
  // ปิดด้วย Esc — เดิมปิดได้แค่ปุ่ม X / คลิกนอกกล่อง
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl ${sizes[size]} w-full max-h-[90vh] overflow-hidden flex flex-col`}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

export function FormField({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export function Field({ label, value }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-medium text-slate-800">{value || '-'}</div>
    </div>
  )
}
