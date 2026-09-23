import { createComplaint, bulkInsertComplaints, deleteByGroup } from '../../shared/data/dataLoader.js'
import { useState } from 'react'
import { Pencil, Upload, FileSpreadsheet, CheckCircle2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { checkUploadFile, MAX_SHEET_ROWS } from '../../shared/security/uploadLimits.js'
import { GROUPS, CHANNELS, STATUSES, ACTION_UNITS } from './complaintFields.js'
import { Modal, FormField } from './ComplaintRecordDialogs.jsx'
import { ConfirmModal } from '../../shared/ui/ConfirmModal.jsx'
import { mapRowToRecord } from './complaintImport.js'

/* ─── AddDataModal (2 tabs) ─── */
export function AddDataModal({ onClose, onSaved, logAction, showToast }) {
  const [tab, setTab] = useState('manual')

  return (
    <Modal onClose={onClose} title="เพิ่มข้อมูลใหม่" size="lg">
      {/* Tab bar */}
      <div className="border-b border-slate-200 px-6 flex-shrink-0 bg-white">
        <div className="flex gap-0">
          {[
            { key: 'manual', icon: <Pencil size={14} />, label: 'กรอกเอง (ทีละรายการ)' },
            { key: 'upload', icon: <FileSpreadsheet size={14} />, label: 'อัปโหลด Excel (หลายรายการ)' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition ${
                tab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'manual'
        ? <ManualForm onSaved={onSaved} onClose={onClose} logAction={logAction} showToast={showToast} />
        : <UploadForm onSaved={onSaved} onClose={onClose} logAction={logAction} showToast={showToast} />
      }
    </Modal>
  )
}

/* ─── ManualForm ─── */
function ManualForm({ onSaved, onClose, logAction, showToast }) {
  const [form, setForm] = useState({
    group: 1, date: '', channel: '', district: '', subdistrict: '',
    community: '', actionUnit: '', status: 'ยังไม่ได้รับผล',
  })
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  // วันที่รับเรื่อง + เขต บังคับกรอก — เดิมกดเพิ่มได้ทั้งที่ว่างทุกช่อง ทำให้มีแถวเปล่า (มีแค่กลุ่ม) หลุดเข้าฐาน
  // และแถวที่ไม่มีวันที่จะไม่ถูกนับในทุกปีงบ (ตัวเลข "ทุกปี" กับ "ปีงบ" ไม่ตรงกัน)
  const missing = [!form.date && 'วันที่รับเรื่อง', !form.district.trim() && 'เขต'].filter(Boolean)

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = await createComplaint(form)
      if (logAction) await logAction('create', 'complaints', data?.id, { district: form.district, group: form.group })
      showToast?.('เพิ่มข้อมูลสำเร็จ')
      onSaved()
    } catch (err) {
      showToast?.('บันทึกไม่สำเร็จ: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="p-6 grid grid-cols-2 gap-4">
        <FormField label="กลุ่มเรื่อง *">
          <select value={form.group} onChange={e => set('group', parseInt(e.target.value))} className="form-input">
            {GROUPS.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
          </select>
        </FormField>
        <FormField label="วันที่รับเรื่อง *">
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="form-input" required />
        </FormField>
        <FormField label="ช่องทาง">
          <select value={form.channel} onChange={e => set('channel', e.target.value)} className="form-input">
            <option value="">-</option>{CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>
        <FormField label="สถานะ">
          <select value={form.status} onChange={e => set('status', e.target.value)} className="form-input">
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>
        <FormField label="เขต *">
          <input value={form.district} onChange={e => set('district', e.target.value)} className="form-input" placeholder="เช่น เขตทุ่งครุ" required />
        </FormField>
        <FormField label="แขวง">
          <input value={form.subdistrict} onChange={e => set('subdistrict', e.target.value)} className="form-input" />
        </FormField>
        <FormField label="ชุมชน/หมู่บ้าน">
          <input value={form.community} onChange={e => set('community', e.target.value)} className="form-input" />
        </FormField>
        <FormField label="หน่วยดำเนินการ">
          <select value={form.actionUnit} onChange={e => set('actionUnit', e.target.value)} className="form-input">
            <option value="">-</option>{ACTION_UNITS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </FormField>
      </div>
      <div className="flex gap-3 justify-end items-center px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
        {missing.length > 0 && <span className="text-xs text-rose-600 mr-auto">กรุณากรอก {missing.join(' และ ')}</span>}
        <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-white">ยกเลิก</button>
        <button onClick={() => setConfirmOpen(true)} disabled={saving || missing.length > 0}
          title={missing.length ? `กรุณากรอก ${missing.join(' และ ')}` : undefined}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : 'เพิ่มข้อมูล'}
        </button>
      </div>
      {confirmOpen && (
        <ConfirmModal
          title="ยืนยันการเพิ่มข้อมูล"
          message="ต้องการเพิ่มข้อมูลเรื่องร้องเรียนใหม่เข้าระบบใช่หรือไม่?"
          detail={`เขต: ${form.district || '-'} · ช่องทาง: ${form.channel || '-'} · กลุ่ม: ${form.group}`}
          onConfirm={() => { setConfirmOpen(false); handleSave() }}
          onCancel={() => setConfirmOpen(false)}
          confirmLabel="เพิ่มข้อมูล"
        />
      )}
    </>
  )
}

/* ─── UploadForm ─── */
function UploadForm({ onSaved, logAction, showToast }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('append')
  const [targetGroup, setTargetGroup] = useState(1)
  const [dragOver, setDragOver] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleFile = async (f) => {
    if (!f) return
    setFile(f); setError('')
    const gate = checkUploadFile(f, ['xlsx', 'xls'])
    if (gate) { setError(gate); return }
    setParsing(true)
    try {
      const buffer = await f.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', sheetRows: MAX_SHEET_ROWS })
      let allRecords = []
      for (const sheetName of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null })
        rows.forEach(row => {
          const rec = mapRowToRecord(row, targetGroup)
          if (rec.district || rec.date) allRecords.push(rec)
        })
      }
      setPreview({ total: allRecords.length, sample: allRecords.slice(0, 5), records: allRecords, sheetNames: wb.SheetNames })
    } catch (err) {
      setError('อ่านไฟล์ไม่ได้: ' + err.message)
    } finally {
      setParsing(false)
    }
  }

  const handleUpload = async () => {
    if (!preview) return
    setUploading(true)
    try {
      if (mode === 'replace') await deleteByGroup(targetGroup)
      await bulkInsertComplaints(preview.records)
      if (logAction) await logAction('create', 'complaints', null, { action: 'bulk_upload', mode, group: targetGroup, count: preview.total })
      showToast?.(`${mode === 'replace' ? 'แทนที่' : 'เพิ่ม'}ข้อมูลสำเร็จ ${preview.total.toLocaleString()} รายการ`)
      onSaved()
    } catch (err) {
      showToast?.('อัปโหลดไม่สำเร็จ: ' + err.message, 'error')
      setUploading(false)
    }
  }

  return (
    <div className="p-6">
      {!preview ? (
        <>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <FormField label="กลุ่มเรื่องที่จะนำเข้า *">
              <select value={targetGroup} onChange={e => setTargetGroup(parseInt(e.target.value))} className="form-input">
                {GROUPS.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
              </select>
            </FormField>
            <FormField label="โหมดนำเข้า">
              <select value={mode} onChange={e => setMode(e.target.value)} className="form-input">
                <option value="append">เพิ่มข้อมูลใหม่ (Append)</option>
                <option value="replace">แทนที่กลุ่มนี้ทั้งหมด (Replace)</option>
              </select>
            </FormField>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400'}`}>
            <Upload size={44} className="mx-auto text-slate-400 mb-3" />
            <div className="text-slate-700 font-semibold mb-1">ลากไฟล์ Excel มาวางที่นี่</div>
            <div className="text-sm text-slate-500 mb-4">หรือ</div>
            <label className="inline-block cursor-pointer">
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files[0])} />
              <span className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm inline-block transition">
                เลือกไฟล์
              </span>
            </label>
            <div className="text-xs text-slate-400 mt-3">รองรับ .xlsx, .xls</div>
            {parsing && <div className="mt-3 text-blue-600 text-sm font-medium">กำลังอ่านไฟล์...</div>}
            {error && <div className="mt-3 text-rose-600 text-sm">{error}</div>}
          </div>

          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <strong>หมายเหตุ:</strong> ระบบตรวจจับ column อัตโนมัติ — รองรับชื่อ column เช่น เขต, อำเภอ, แขวง, ตำบล, วันที่รับเรื่อง, แหล่งข่าว, การดำเนินการ ฯลฯ
          </div>
        </>
      ) : (
        <>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 flex items-center gap-3">
            <CheckCircle2 size={24} className="text-emerald-600 flex-shrink-0" />
            <div>
              <div className="font-bold text-emerald-800">พบ {preview.total.toLocaleString()} รายการ</div>
              <div className="text-sm text-emerald-700">จาก {preview.sheetNames.length} sheet — {file.name}</div>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-sm font-semibold text-slate-700 mb-2">ตัวอย่าง 5 รายการแรก:</div>
            <div className="rounded-xl overflow-hidden border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    {['เขต', 'แขวง', 'วันที่', 'ช่องทาง', 'สถานะ'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.sample.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2">{r.district || '-'}</td>
                      <td className="px-3 py-2">{r.subdistrict || '-'}</td>
                      <td className="px-3 py-2">{r.date || '-'}</td>
                      <td className="px-3 py-2">{r.channel || '-'}</td>
                      <td className="px-3 py-2">{r.status || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`p-3 rounded-lg text-sm font-medium ${mode === 'replace' ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-blue-50 text-blue-800 border border-blue-200'}`}>
            {mode === 'replace' ? `⚠️ จะลบข้อมูลกลุ่ม ${targetGroup} ทั้งหมด แล้วแทนที่ด้วย ${preview.total} รายการใหม่` : `➕ เพิ่ม ${preview.total} รายการเข้ากลุ่ม ${targetGroup}`}
          </div>

          <div className="flex gap-3 justify-end mt-5">
            <button onClick={() => { setPreview(null); setFile(null) }} className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-sm">
              เลือกไฟล์ใหม่
            </button>
            <button onClick={() => setConfirmOpen(true)} disabled={uploading} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 text-sm font-medium">
              {uploading ? 'กำลังอัปโหลด...' : `อัปโหลด ${preview.total.toLocaleString()} รายการ`}
            </button>
          </div>
          {confirmOpen && (
            <ConfirmModal
              title={mode === 'replace' ? '⚠️ ยืนยันการแทนที่ข้อมูล' : 'ยืนยันการอัปโหลด'}
              message={mode === 'replace'
                ? `จะลบข้อมูลกลุ่ม ${targetGroup} ทั้งหมด แล้วแทนที่ด้วย ${preview.total.toLocaleString()} รายการใหม่`
                : `ต้องการเพิ่มข้อมูล ${preview.total.toLocaleString()} รายการเข้ากลุ่ม ${targetGroup} ใช่หรือไม่?`}
              detail={`ไฟล์: ${file?.name} · โหมด: ${mode === 'replace' ? 'แทนที่' : 'เพิ่ม'}`}
              onConfirm={() => { setConfirmOpen(false); handleUpload() }}
              onCancel={() => setConfirmOpen(false)}
              confirmLabel={mode === 'replace' ? 'แทนที่ข้อมูล' : 'ยืนยันอัปโหลด'}
              danger={mode === 'replace'}
            />
          )}
        </>
      )}
    </div>
  )
}
