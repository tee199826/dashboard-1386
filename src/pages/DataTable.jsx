import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { createComplaint, updateComplaint, deleteComplaint, bulkInsertComplaints, deleteByGroup } from '../utils/dataLoader'
import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Filter, Plus, Download, Eye, Pencil, Trash2, X, ChevronLeft, ChevronRight, RotateCcw, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react'
import * as XLSX from 'xlsx'

const ROWS_PER_PAGE = 10
const GROUPS = [
  { v: 1, l: '1 - พบพฤติการณ์' },
  { v: 2, l: '2 - มีตัวตน ไม่พบประวัติ' },
  { v: 3, l: '3 - พิสูจน์ทราบไม่ได้' },
  { v: 4, l: '4 - สถานที่' },
  { v: 5, l: '5 - พื้นที่' },
]
const CHANNELS = ['อินเตอร์เน็ต', 'สายด่วน 1386', 'ทางรัฐ', 'อื่นๆ']
const STATUSES = ['ดำเนินการแล้ว', 'ยังไม่ได้รับผล']
const ACTION_UNITS = ['ส่งต่อ', 'ดำเนินการเอง', 'ทำร่วม']

export default function DataTable() {
  const { records, isLoading, reload } = useData()
  const { isAdmin, logAction } = useAuth()
  const [searchParams] = useSearchParams()

  const [filterDate, setFilterDate] = useState('')
  const [filterDistrict, setFilterDistrict] = useState('all')
  const [filterGroup, setFilterGroup] = useState('all')
  const [filterChannel, setFilterChannel] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const statusParam = searchParams.get('status')
    if (statusParam) setFilterStatus(statusParam)
  }, [searchParams])

  const [viewRow, setViewRow] = useState(null)
  const [editRow, setEditRow] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [deleteId, setDeleteId] = useState(null)

  const allDistricts = useMemo(() => {
    const s = new Set()
    records.forEach(r => { if (r.district) s.add(r.district) })
    return Array.from(s).sort()
  }, [records])

  const filtered = useMemo(() => {
    return records.filter(r => {
      if (filterDate && r.date !== filterDate) return false
      if (filterDistrict !== 'all' && r.district !== filterDistrict) return false
      if (filterGroup !== 'all' && String(r.group) !== filterGroup) return false
      if (filterChannel !== 'all' && r.channel !== filterChannel) return false
      if (filterStatus !== 'all' && r.status !== filterStatus) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          (r.district && r.district.toLowerCase().includes(q)) ||
          (r.subdistrict && r.subdistrict.toLowerCase().includes(q)) ||
          (r.community && r.community.toLowerCase().includes(q)) ||
          String(r.id).includes(q)
        )
      }
      return true
    })
  }, [records, filterDate, filterDistrict, filterGroup, filterChannel, filterStatus, search])

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE) || 1
  const pageData = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  const clearFilters = () => {
    setFilterDate(''); setFilterDistrict('all'); setFilterGroup('all')
    setFilterChannel('all'); setFilterStatus('all'); setSearch('')
    setPage(1)
  }

  const handleExport = () => {
    const exportData = filtered.map(r => ({
      'ID': r.id, 'กลุ่ม': r.group, 'วันที่รับเรื่อง': r.date || '',
      'ช่องทาง': r.channel || '', 'เขต': r.district || '', 'แขวง': r.subdistrict || '',
      'ชุมชน': r.community || '', 'หน่วยดำเนินการ': r.actionUnit || '',
      'สถานะ': r.status || '', 'ยาเสพติด': r.drug || '', 'ประเภทพื้นที่': r.areaType || '',
    }))
    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'complaints')
    XLSX.writeFile(wb, `complaints_${new Date().toISOString().slice(0, 10)}.xlsx`)
    if (logAction) logAction('view', 'complaints', null, { action: 'export', count: filtered.length })
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteComplaint(deleteId)
      if (logAction) await logAction('delete', 'complaints', deleteId, { id: deleteId })
      setDeleteId(null)
      reload()
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + err.message)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ฐานข้อมูลเรื่องร้องเรียน สำนักงานป้องกันปราบปรามยาเสพติด</h1>
          <p className="text-sm text-emerald-600 font-semibold mt-1">{filtered.length.toLocaleString()} รายการ</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleExport}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium flex items-center gap-2 shadow-sm transition">
            <Download size={16} /> Export Excel
          </button>
          {isAdmin && (
            <button onClick={() => setShowAdd(true)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium flex items-center gap-2 shadow-sm transition">
              <Plus size={16} /> เพิ่มข้อมูลใหม่
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={18} className="text-blue-600" />
          <h3 className="font-bold text-slate-800">ค้นหาและคัดกรองข้อมูล</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">📅 วันที่รับเรื่อง</label>
            <input type="date" value={filterDate} onChange={e => { setFilterDate(e.target.value); setPage(1) }}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">📍 พื้นที่ (เขต)</label>
            <select value={filterDistrict} onChange={e => { setFilterDistrict(e.target.value); setPage(1) }}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              <option value="all">ทุกเขต</option>
              {allDistricts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">🏷️ กลุ่มเรื่อง</label>
            <select value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setPage(1) }}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              <option value="all">ทุกกลุ่ม</option>
              {GROUPS.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">📱 ช่องทาง</label>
            <select value={filterChannel} onChange={e => { setFilterChannel(e.target.value); setPage(1) }}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              <option value="all">ทุกช่องทาง</option>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={clearFilters}
              className="w-full px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition">
              <RotateCcw size={14} /> ล้างตัวกรอง
            </button>
          </div>
        </div>
        <div className="mt-3 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="ค้นหา (ID, เขต, แขวง, ชุมชน)..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gradient-to-r from-slate-700 to-slate-800 text-xs font-bold text-white uppercase tracking-wide">
          <div className="col-span-2">ID / วันที่</div>
          <div className="col-span-3">พื้นที่ (เขต/แขวง)</div>
          <div className="col-span-2">ช่องทาง</div>
          <div className="col-span-2">กลุ่ม</div>
          <div className="col-span-2">สถานะ</div>
          <div className="col-span-1 text-center">จัดการ</div>
        </div>

        {isLoading ? (
          <div className="p-16 text-center text-slate-500">กำลังโหลด...</div>
        ) : pageData.length === 0 ? (
          <div className="p-16 text-center text-slate-400">ไม่พบข้อมูล</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pageData.map(r => (
              <div key={r.id} className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-blue-50/30 transition items-center group">
                <div className="col-span-2">
                  <div className="text-xs text-slate-400">#{r.id}</div>
                  <div className="text-blue-600 font-bold text-sm">{formatThaiDate(r.date)}</div>
                </div>
                <div className="col-span-3">
                  <div className="font-semibold text-slate-800 text-sm">{r.district || '-'}</div>
                  <div className="text-xs text-slate-500">{r.subdistrict || '-'}</div>
                </div>
                <div className="col-span-2">
                  <span className="inline-block px-2.5 py-1 bg-sky-50 text-sky-700 rounded-md text-xs font-medium">
                    {r.channel || '-'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="inline-block px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md text-xs font-medium">
                    กลุ่ม {r.group}
                  </span>
                </div>
                <div className="col-span-2">
                  {r.status === 'ดำเนินการแล้ว' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold">
                      <CheckCircle2 size={11} /> ดำเนินการแล้ว
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-semibold">
                      <AlertCircle size={11} /> รอดำเนินการ
                    </span>
                  )}
                </div>
                <div className="col-span-1 flex items-center justify-center gap-0.5">
                  <button onClick={() => setViewRow(r)} className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-600 transition" title="ดู">
                    <Eye size={15} />
                  </button>
                  {isAdmin && (
                    <>
                      <button onClick={() => setEditRow(r)} className="p-1.5 hover:bg-amber-100 rounded-lg text-amber-600 transition" title="แก้ไข">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => setDeleteId(r.id)} className="p-1.5 hover:bg-rose-100 rounded-lg text-rose-600 transition" title="ลบ">
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50">
            <div className="text-sm text-slate-600">
              แสดง <strong>{(page - 1) * ROWS_PER_PAGE + 1}–{Math.min(page * ROWS_PER_PAGE, filtered.length)}</strong> จาก <strong>{filtered.length.toLocaleString()}</strong> รายการ
              <span className="text-blue-600 ml-2">
                (เหลืออีก {Math.max(0, filtered.length - page * ROWS_PER_PAGE).toLocaleString()} เรื่อง)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white text-sm disabled:opacity-40 flex items-center gap-1 transition">
                <ChevronLeft size={14} /> ก่อนหน้า
              </button>
              <span className="px-4 py-1.5 text-sm font-bold text-blue-600">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white text-sm disabled:opacity-40 flex items-center gap-1 transition">
                ถัดไป <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {viewRow && <ViewModal row={viewRow} onClose={() => setViewRow(null)} />}
      {editRow && <EditModal row={editRow} onClose={() => setEditRow(null)} onSaved={() => { reload(); setEditRow(null) }} logAction={logAction} />}
      {showAdd && <AddDataModal onClose={() => setShowAdd(false)} onSaved={() => { reload(); setShowAdd(false) }} logAction={logAction} />}

      {deleteId && (
        <Modal onClose={() => setDeleteId(null)} title="ยืนยันการลบ" size="sm">
          <div className="p-6">
            <p className="text-slate-700 mb-6">ต้องการลบรายการ ID: <strong>{deleteId}</strong> ใช่หรือไม่?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg">ลบ</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ─── Helpers ─── */

function formatThaiDate(dateStr) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`
  } catch { return dateStr }
}

function Modal({ children, onClose, title, size = 'md' }) {
  const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' }
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

function FormField({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-medium text-slate-800">{value || '-'}</div>
    </div>
  )
}

/* ─── ViewModal ─── */

function ViewModal({ row, onClose }) {
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

function EditModal({ row, onClose, onSaved, logAction }) {
  const [form, setForm] = useState(row)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateComplaint(row.id, form)
      if (logAction) await logAction('update', 'complaints', row.id, { id: row.id })
      onSaved()
    } catch (err) {
      alert('บันทึกไม่สำเร็จ: ' + err.message)
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
        <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </Modal>
  )
}

/* ─── AddDataModal (2 tabs) ─── */

function AddDataModal({ onClose, onSaved, logAction }) {
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
        ? <ManualForm onSaved={onSaved} onClose={onClose} logAction={logAction} />
        : <UploadForm onSaved={onSaved} onClose={onClose} logAction={logAction} />
      }
    </Modal>
  )
}

/* ─── ManualForm ─── */

function ManualForm({ onSaved, onClose, logAction }) {
  const [form, setForm] = useState({
    group: 1, date: '', channel: '', district: '', subdistrict: '',
    community: '', actionUnit: '', status: 'ยังไม่ได้รับผล',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = await createComplaint(form)
      if (logAction) await logAction('create', 'complaints', data?.id, { district: form.district, group: form.group })
      onSaved()
    } catch (err) {
      alert('บันทึกไม่สำเร็จ: ' + err.message)
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
        <FormField label="วันที่รับเรื่อง">
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="form-input" />
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
        <FormField label="เขต">
          <input value={form.district} onChange={e => set('district', e.target.value)} className="form-input" placeholder="เช่น เขตทุ่งครุ" />
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
      <div className="flex gap-3 justify-end px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
        <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-white">ยกเลิก</button>
        <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : 'เพิ่มข้อมูล'}
        </button>
      </div>
    </>
  )
}

/* ─── UploadForm ─── */

function UploadForm({ onSaved, onClose, logAction }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('append')
  const [targetGroup, setTargetGroup] = useState(1)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = async (f) => {
    if (!f) return
    setFile(f); setError(''); setParsing(true)
    try {
      const buffer = await f.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
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
    if (!confirm(`ต้องการ${mode === 'replace' ? 'แทนที่' : 'เพิ่ม'}ข้อมูล ${preview.total} รายการใช่ไหม?`)) return
    setUploading(true)
    try {
      if (mode === 'replace') await deleteByGroup(targetGroup)
      await bulkInsertComplaints(preview.records)
      if (logAction) await logAction('create', 'complaints', null, { action: 'bulk_upload', mode, group: targetGroup, count: preview.total })
      alert(`สำเร็จ! ${mode === 'replace' ? 'แทนที่' : 'เพิ่ม'}ข้อมูล ${preview.total} รายการเรียบร้อย`)
      onSaved()
    } catch (err) {
      alert('อัปโหลดไม่สำเร็จ: ' + err.message)
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
            <button onClick={handleUpload} disabled={uploading} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 text-sm font-medium">
              {uploading ? 'กำลังอัปโหลด...' : `อัปโหลด ${preview.total.toLocaleString()} รายการ`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Excel row → record schema ─── */

function mapRowToRecord(row, groupNumber) {
  const get = (...keys) => {
    for (const k of keys) {
      for (const rk of Object.keys(row)) {
        if (rk.includes(k) && row[rk] != null && String(row[rk]).trim() !== '' && String(row[rk]).trim() !== '-') {
          return row[rk]
        }
      }
    }
    return null
  }

  const dateRaw = get('วันที่รับเรื่อง', 'วันที่')
  const completedRaw = get('วันที่ดำเนินการ', 'วันที่ดำเนิน')

  const resultSummary = get('ผลการดำเนินการ')
  let status = 'ยังไม่ได้รับผล'
  if (resultSummary && String(resultSummary).includes('ได้รับผล')) status = 'ดำเนินการแล้ว'
  else if (completedRaw) status = 'ดำเนินการแล้ว'

  let channel = get('แหล่งข่าว', 'ช่องทาง')
  if (channel) {
    const c = String(channel).trim()
    channel = ['อินเตอร์เน็ต', 'สายด่วน 1386', 'ทางรัฐ'].includes(c) ? c : 'อื่นๆ'
  }

  return {
    group: groupNumber,
    date: parseExcelDate(dateRaw),
    completedDate: parseExcelDate(completedRaw),
    channel,
    district: get('อำเภอ', 'เขต'),
    subdistrict: get('ตำบล', 'แขวง'),
    community: get('หมู่บ้าน', 'ชุมชน'),
    province: get('จังหวัด') || 'กรุงเทพมหานคร',
    personType: get('ประเภทบุคคล'),
    sex: get('เพศ'),
    occupation: get('อาชีพ'),
    role: get('บทบาท'),
    actionUnit: get('การดำเนินการ', 'หน่วยดำเนินการ'),
    urgency: get('ความเร่งด่วน'),
    status,
    drug: get('ยาเสพติด'),
    areaType: get('ประเภทพื้นที่'),
  }
}

function parseExcelDate(v) {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  if (!s || s === '-') return null
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) {
    let y = parseInt(m[3])
    if (y > 2400) y -= 543
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return s
}
