import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, AlertTriangle, Loader2, Trash2, X, Download, FileText } from 'lucide-react'
import { supabase } from '../../shared/data/supabase.js'
import { formatThaiDate } from '../../shared/utils/heroMeta.js'
import { downloadBlob, XLSX_MIME } from '../../shared/export/downloadBlob.js'
import { IntelPage, Card, Field, Input, Select } from './FormUI.jsx'
import { DISTRICTS, displayNationalId } from './intelOptions.js'
import { DetailPanel } from './InterviewDetailPanel.jsx'

const PAGE_SIZE = 50

const txt = (v) => (v == null || v === '' ? '—' : String(v))

const isMissingSchema = (m) => /column .* does not exist|could not find the (table|function)|relation .* does not exist|function .* does not exist/i.test(m || '')

const nz = (v) => (v === '' || v == null ? null : v)

// พารามิเตอร์ตัวกรอง → อาร์กิวเมนต์ RPC (ชุดเดียวกันทั้ง search และ export — ผลส่งออกตรงกับที่เห็นบนจอ)
function rpcFilters(q, f) {
  return {
    p_q: nz(q.trim()), p_from: nz(f.from), p_to: nz(f.to),
    p_district: nz(f.district), p_occupation: nz(f.occupation),
    p_age_min: f.ageMin === '' ? null : Number(f.ageMin), p_age_max: f.ageMax === '' ? null : Number(f.ageMax),
  }
}

export default function InterviewSearch() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [occupations, setOccupations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [detail, setDetail] = useState(null)          // { record, pii } จาก interview_get
  const [busy, setBusy] = useState(false)
  // ลบ/ส่งออกไม่สำเร็จ — แยกจาก error ตอนโหลด ไม่งั้นตารางผลค้นหาหายทั้งหน้าจนต้องรีเฟรช
  const [actionError, setActionError] = useState(null)

  const [q, setQ] = useState('')
  const [f, setF] = useState({ from: '', to: '', district: '', occupation: '', ageMin: '', ageMax: '' })
  const [page, setPage] = useState(1)
  // เปลี่ยนเงื่อนไขค้นหา → กลับหน้าแรก (รีเซ็ตตรงจุดที่ผู้ใช้กด ไม่ใช่ใน effect)
  const onQ = (v) => { setQ(v); setPage(1) }
  const onF = (patch) => { setF((s) => ({ ...s, ...patch })); setPage(1) }

  // ตัวเลือกอาชีพ — โหลดครั้งเดียว (ไม่แตะ PII)
  useEffect(() => {
    supabase.rpc('interview_filter_options').then(({ data }) => {
      setOccupations((data || []).map((r) => r.occupation).filter(Boolean))
    })
  }, [])

  // ค้นหาฝั่งเซิร์ฟเวอร์ — หน่วงพิมพ์ 300ms ; ทิ้งผลคำขอเก่าถ้าเงื่อนไขเปลี่ยนก่อนได้ผล
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      const { data, error: e } = await supabase.rpc('interview_search', {
        ...rpcFilters(q, f), p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
      })
      if (cancelled) return
      // error ≠ ไม่มีข้อมูล — แสดงเป็นข้อผิดพลาด ไม่ใช่ "ไม่พบรายการ" (SEC-13)
      if (e) { setError(e.message); setRows([]); setTotal(0) }
      else { setError(null); setRows(data || []); setTotal(data?.[0]?.total_count ?? 0) }
      setLoading(false)
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, f, page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)   // กันหน้าค้างเกินหลังผลลัพธ์ลดลง

  // เปิดรายละเอียด — ดึง PII เต็มเฉพาะแถวนี้ (เซิร์ฟเวอร์บันทึก audit 'view' ให้)
  const openDetail = useCallback(async (r) => {
    setBusy(true)
    try {
      const { data, error: e } = await supabase.rpc('interview_get', { p_record_uid: r.record_uid })
      if (e) { setActionError(`เปิดรายละเอียดไม่สำเร็จ: ${e.message}`); return }
      if (data?.record) setDetail({ record: data.record, pii: data.pii || null })
    } finally { setBusy(false) }
  }, [])

  const handleDelete = async (r) => {
    const who = r.full_name || r.doc_no || r.record_uid
    if (!window.confirm(`ลบรายการนี้ถาวร?\n\n${who}\nวันที่สำรวจ ${formatThaiDate(r.surveyed_at) || '—'}\n\nลบแล้วกู้คืนไม่ได้`)) return
    setBusy(true)
    setActionError(null)
    try {
      // ลบผ่าน RPC — เซิร์ฟเวอร์ลบ + บันทึก audit 'delete' ในธุรกรรมเดียว (PII ลบตาม FK cascade)
      // ล้มเหลว → actionError (ไม่ใช่ error ตอนโหลด) ตารางผลค้นหาจะได้ไม่หายทั้งหน้า
      const { data: ok, error: e } = await supabase.rpc('interview_delete', { p_record_uid: r.record_uid })
      if (e) { setActionError(`ลบไม่สำเร็จ: ${e.message}`); return }
      if (!ok) { setActionError('ลบไม่สำเร็จ: ไม่พบรายการ (อาจถูกลบไปแล้ว)'); return }
      setDetail(null)
      setRows((s) => s.filter((x) => x.record_uid !== r.record_uid))
      setTotal((n) => Math.max(0, n - 1))
    } finally { setBusy(false) }
  }

  const handleExport = async () => {
    setBusy(true)
    setActionError(null)
    try {
      // เซิร์ฟเวอร์บันทึก audit 'export' ก่อนคืนข้อมูล — ถ้า audit ล้ม จะไม่ได้ข้อมูล (SEC-10)
      const { data, error: e } = await supabase.rpc('interview_export', rpcFilters(q, f))
      if (e) { setActionError(`ส่งออกไม่สำเร็จ: ${e.message}`); return }
      const list = data || []
      if (!list.length) { setActionError('ส่งออกไม่สำเร็จ: ไม่มีรายการตรงเงื่อนไข'); return }
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = '1386 Dashboard'; wb.created = new Date()
      const ws = wb.addWorksheet('แบบซักผู้เสพ')
      const header = ['รหัสอ้างอิง', 'วันที่สำรวจ', 'เลขที่แบบ', 'ชื่อ-สกุล', 'เลขบัตร', 'โทรศัพท์', 'อายุ', 'เพศ/ศาสนา',
        'อาชีพ', 'รายได้', 'การศึกษา', 'เขต', 'แขวง', 'ยาที่ใช้ประจำ', 'จับกุม(ครั้ง)', 'บำบัด(ครั้ง)']
      ws.addRow(header).eachCell((c) => {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
      })
      list.forEach((r) => {
        const P = r.pii || {}
        ws.addRow([
          r.code || '', formatThaiDate(r.surveyed_at) || '', r.doc_no || '', P.full_name || '',
          displayNationalId(P.national_id) || '',
          P.phone || '', r.age ?? '', r.religion || '', r.occupation || '', r.income_range || '',
          r.education || '', r.residence?.district || '', r.residence?.subdistrict || '',
          (r.main_drug?.drugs || []).join(', ') || (r.regular_drugs || []).map((d) => d.drug).join(', '),
          r.arrest_count ?? 0, r.rehab_count ?? 0,
        ])
      })
      header.forEach((h, i) => { ws.getColumn(i + 1).width = Math.max(12, h.length + 6) })
      const buf = await wb.xlsx.writeBuffer()
      downloadBlob(new Blob([buf], { type: XLSX_MIME }), `interview-records-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) {
      setActionError(`ส่งออก Excel ไม่สำเร็จ: ${e.message}`)
    } finally { setBusy(false) }
  }

  const schemaMissing = error && isMissingSchema(error)

  return (
    <IntelPage title="ค้นหาแบบซักผู้เสพ"
      sub="ชุดข้อมูลเฉพาะของแบบซักผู้เสพ (แยกจากข้อมูลนำเข้า Excel) — ค้นหา ดูรายละเอียด ลบ และส่งออก Excel">

      <Card>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <Field label="คำค้น" hint="ค้นจาก รหัสอ้างอิง · ชื่อ-สกุล · ฉายา · เลขบัตร · เบอร์โทร · เลขที่แบบ">
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <Input value={q} onChange={(e) => onQ(e.target.value)} placeholder="เช่น ผส-69-0001 หรือ ชื่อ-สกุล" className="!pl-8" />
            </div>
          </Field>
          <button type="button" onClick={handleExport} disabled={busy || loading || !total}
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap">
            <Download size={15} /> Export Excel
          </button>
          <Link to="/intel/interview/new"
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 whitespace-nowrap">
            <Plus size={16} /> บันทึกใหม่
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Field label="ตั้งแต่วันที่"><Input type="date" value={f.from} onChange={(e) => onF({ from: e.target.value })} /></Field>
          <Field label="ถึงวันที่"><Input type="date" value={f.to} onChange={(e) => onF({ to: e.target.value })} /></Field>
          <Field label="เขต"><Select options={DISTRICTS} value={f.district} onChange={(e) => onF({ district: e.target.value })} placeholder="ทุกเขต" /></Field>
          <Field label="อาชีพ"><Select options={occupations} value={f.occupation} onChange={(e) => onF({ occupation: e.target.value })} placeholder="ทุกอาชีพ" /></Field>
          <Field label="อายุตั้งแต่"><Input type="number" min="0" value={f.ageMin} onChange={(e) => onF({ ageMin: e.target.value })} /></Field>
          <Field label="ถึงอายุ"><Input type="number" min="0" value={f.ageMax} onChange={(e) => onF({ ageMax: e.target.value })} /></Field>
        </div>
      </Card>

      {loading && (
        <Card><div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> กำลังโหลด...</div></Card>
      )}

      {actionError && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} title="ปิด"
            className="p-0.5 rounded text-rose-500 hover:bg-rose-100"><X size={15} /></button>
        </div>
      )}

      {error && (
        <Card>
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-500" />
            <div>
              <p className="text-rose-600 font-medium">
                {schemaMissing ? 'ยังไม่ได้สร้างตาราง/ฟังก์ชันของแบบซักผู้เสพ' : `เกิดข้อผิดพลาด: ${error}`}
              </p>
              {schemaMissing && (
                <p className="mt-1 text-slate-500">
                  รัน <code className="px-1 py-0.5 rounded bg-slate-100 text-[12px]">supabase/migrations/20260910_interview_records.sql</code>
                  {' '}และ <code className="px-1 py-0.5 rounded bg-slate-100 text-[12px]">20260915_security_baseline.sql</code> บน Supabase ก่อน
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {!loading && !error && (
        <Card title={`ผลการค้นหา · ${total.toLocaleString()} รายการ`}
          sub={totalPages > 1 ? `หน้า ${safePage} / ${totalPages}` : undefined}>
          {rows.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-center">
              <FileText size={28} className="text-slate-300" />
              <p className="text-sm text-slate-500">ไม่พบรายการที่ตรงกับเงื่อนไข</p>
            </div>
          ) : (
            <>
              <div className="overflow-auto -mx-1 px-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="py-2.5 pr-3 font-medium">รหัสอ้างอิง</th>
                      <th className="py-2.5 pr-3 font-medium">วันที่สำรวจ</th>
                      <th className="py-2.5 pr-3 font-medium">เลขที่แบบ</th>
                      <th className="py-2.5 pr-3 font-medium">ชื่อ-สกุล</th>
                      <th className="py-2.5 pr-3 font-medium">เลขบัตร</th>
                      <th className="py-2.5 pr-3 font-medium text-right">อายุ</th>
                      <th className="py-2.5 pr-3 font-medium">อาชีพ</th>
                      <th className="py-2.5 pr-3 font-medium">พื้นที่</th>
                      <th className="py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.record_uid} onClick={() => !busy && openDetail(r)}
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                        <td className="py-2.5 pr-3 whitespace-nowrap font-semibold text-[#243aa8]">{txt(r.code)}</td>
                        <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap text-slate-600">{formatThaiDate(r.surveyed_at) || '—'}</td>
                        <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">{txt(r.doc_no)}</td>
                        <td className="py-2.5 pr-3 font-medium text-slate-800 whitespace-nowrap">
                          {r.full_name || <span className="text-slate-400 font-normal">(ไม่ระบุชื่อ)</span>}
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap text-slate-500">{txt(r.national_id_masked)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">{r.age ?? '—'}</td>
                        <td className="py-2.5 pr-3 text-slate-500 max-w-[220px] truncate" title={r.occupation}>{txt(r.occupation)}</td>
                        <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">
                          {[r.district?.replace(/^เขต/, ''), r.subdistrict].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="py-2.5 text-right">
                          <button type="button" title="ลบรายการนี้" disabled={busy}
                            onClick={(e) => { e.stopPropagation(); handleDelete(r) }}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition disabled:opacity-40">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                  <span className="tabular-nums">แสดง {rows.length} จาก {total.toLocaleString()} รายการ</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium disabled:opacity-40">ก่อนหน้า</button>
                    <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium disabled:opacity-40">ถัดไป</button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {detail && (
        <DetailPanel row={detail.record} pii={detail.pii} onClose={() => setDetail(null)}
          onDelete={() => handleDelete({ ...detail.record, full_name: detail.pii?.full_name })} busy={busy} />
      )}
    </IntelPage>
  )
}
