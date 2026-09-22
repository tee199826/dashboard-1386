import { useData } from "../../shared/state/DataContext.jsx"
import { useAuth } from "../../shared/state/AuthContext.jsx"
import { deleteComplaint } from "../../shared/data/dataLoader.js"
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Filter, Plus, Download, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, RotateCcw, CheckCircle2, AlertCircle, ArrowUpDown } from "lucide-react"
import Toast from "../../shared/ui/Toast.jsx"
import * as XLSX from 'xlsx'
import { SORT_OPTIONS, fetchSortedComplaints } from "./complaintTable.js"
import { GROUPS, CHANNELS, formatThaiDate } from "./complaintFields.js"
import { Modal, ViewModal, EditModal } from "./ComplaintRecordDialogs.jsx"
import { AddDataModal } from "./AddDataModal.jsx"

export default function DataTable() {
  const { reload } = useData()
  const { isAdmin, logAction } = useAuth()
  const [searchParams] = useSearchParams()

  // ── Sort state (drives direct Supabase query with .order()) ──────────────
  const [sortOrder, setSortOrder] = useState('created_at_desc')
  const [tableRecords, setTableRecords] = useState([])
  const [tableLoading, setTableLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setTableLoading(true)
    try {
      const rows = await fetchSortedComplaints(sortOrder)
      setTableRecords(rows)
    } catch {
      setTableRecords([])
    } finally {
      setTableLoading(false)
    }
  }, [sortOrder])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Filter state ──────────────────────────────────────────────────────────
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
  const [toast, setToast] = useState(null)
  const showToast = (message, type = 'success') => setToast({ message, type })

  const allDistricts = useMemo(() => {
    const s = new Set()
    tableRecords.forEach(r => { if (r.district) s.add(r.district) })
    return Array.from(s).sort()
  }, [tableRecords])

  const filtered = useMemo(() => {
    return tableRecords.filter(r => {
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
  }, [tableRecords, filterDate, filterDistrict, filterGroup, filterChannel, filterStatus, search])

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
      fetchData()
      showToast('ลบข้อมูลสำเร็จ')
    } catch (err) {
      setDeleteId(null)
      showToast('ลบไม่สำเร็จ: ' + err.message, 'error')
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto bg-slate-50 min-h-screen space-y-8" style={{ fontFamily: 'Sarabun, sans-serif' }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-800 rounded-2xl px-6 pt-8 pb-10 text-white shadow-2xl overflow-hidden relative">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-3">สำนักงานป้องกันปราบปรามยาเสพติด · ป.ป.ส.</div>
            <h1 className="text-3xl lg:text-4xl font-extrabold leading-tight">ฐานข้อมูลเรื่องร้องเรียน</h1>
            <p className="text-sm text-blue-200 mt-3">{filtered.length.toLocaleString()} รายการ · จัดการข้อมูลเรื่องร้องเรียนยาเสพติด กรุงเทพมหานคร</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleExport}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg transition text-sm">
              <Download size={16} /> Export Excel
            </button>
            {isAdmin && (
              <button onClick={() => setShowAdd(true)}
                className="px-5 py-2.5 bg-white text-blue-800 hover:bg-blue-50 rounded-xl font-bold flex items-center gap-2 shadow-lg transition text-sm">
                <Plus size={16} /> เพิ่มข้อมูลใหม่
              </button>
            )}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-400 via-sky-300 to-blue-600 opacity-75" />
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={18} className="text-blue-600" />
          <h3 className="font-bold text-slate-800">ค้นหาและคัดกรองข้อมูล</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <ArrowUpDown size={11} className="text-blue-500" /> เรียงลำดับ
            </label>
            <select
              value={sortOrder}
              onChange={e => { setSortOrder(e.target.value); setPage(1) }}
              className="w-full px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 outline-none text-blue-800 font-medium"
            >
              {SORT_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
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
      <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700 text-xs font-bold text-white uppercase tracking-wide">
          <div className="col-span-2">ID / วันที่</div>
          <div className="col-span-3">พื้นที่ (เขต/แขวง)</div>
          <div className="col-span-2">ช่องทาง</div>
          <div className="col-span-2">กลุ่ม</div>
          <div className="col-span-2">สถานะ</div>
          <div className="col-span-1 text-center">จัดการ</div>
        </div>

        {tableLoading ? (
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
      {editRow && <EditModal row={editRow} onClose={() => setEditRow(null)} onSaved={() => { reload(); fetchData(); setEditRow(null) }} logAction={logAction} showToast={showToast} />}
      {showAdd && <AddDataModal onClose={() => setShowAdd(false)} onSaved={() => { reload(); fetchData(); setShowAdd(false) }} logAction={logAction} showToast={showToast} />}

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
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

const ROWS_PER_PAGE = 10
