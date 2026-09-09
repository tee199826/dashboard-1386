// /intel/interview — ค้นหา/รายการแบบซักผู้เสพที่บันทึกไว้ (แอดมินเท่านั้น)
// ชุดข้อมูลของตัวเอง แยกจาก substance_users (ที่นำเข้าจาก Excel) — ที่นี่มีเฉพาะรายการที่กรอกผ่านฟอร์ม
// ต่อ 2 ตารางเข้าด้วยกันด้วย record_uid : interview_records + interview_records_pii
// รายการที่ไม่ได้กรอกชื่อไว้ จะแสดงเป็น "(ไม่ระบุชื่อ)" ตามจริง
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, AlertTriangle, Loader2, Trash2, X, Download, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { fetchAllPages } from '../../utils/supabasePagination'
import { formatThaiDate } from '../../utils/heroMeta'
import { IntelPage, Card, Field, Input, Select } from '../../components/intel/FormUI'
import { DISTRICTS } from '../../utils/intelOptions'

const PAGE_SIZE = 50
const txt = (v) => (v == null || v === '' ? '—' : String(v))
const isMissingSchema = (m) => /column .* does not exist|could not find the table|relation .* does not exist/i.test(m || '')

export default function InterviewSearch() {
  const { logAction } = useAuth()
  const [rows, setRows] = useState([])
  const [pii, setPii] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState(false)

  const [q, setQ] = useState('')
  const [f, setF] = useState({ from: '', to: '', district: '', occupation: '', ageMin: '', ageMax: '' })
  const [page, setPage] = useState(1)
  // เปลี่ยนเงื่อนไขค้นหา → กลับหน้าแรก (รีเซ็ตตรงจุดที่ผู้ใช้กด ไม่ใช่ใน effect)
  const onQ = (v) => { setQ(v); setPage(1) }
  const onF = (patch) => { setF((s) => ({ ...s, ...patch })); setPage(1) }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const su = await fetchAllPages('interview_records', '*', { parallel: true, orderBy: 'record_uid' })
        // PII อ่านได้เฉพาะแอดมิน — ถ้าไม่มีสิทธิ์/ตารางยังไม่สร้าง ให้แสดงส่วนที่เหลือต่อได้
        const { data: piiRows } = await supabase.from('interview_records_pii').select('*')
        if (cancelled) return
        setPii(Object.fromEntries((piiRows || []).map((r) => [r.record_uid, r])))
        setRows(su)
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const occupations = useMemo(
    () => [...new Set(rows.map((r) => r.occupation).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')),
    [rows],
  )

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const min = Number(f.ageMin), max = Number(f.ageMax)
    return rows.filter((r) => {
      const P = pii[r.record_uid]
      if (term) {
        const hay = [r.code, P?.full_name, P?.alias, P?.national_id, P?.phone, r.doc_no]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(term)) return false
      }
      const d = r.surveyed_at ? String(r.surveyed_at).slice(0, 10) : ''
      if (f.from && (!d || d < f.from)) return false
      if (f.to && (!d || d > f.to)) return false
      if (f.district && r.residence?.district !== f.district) return false
      if (f.occupation && r.occupation !== f.occupation) return false
      if (f.ageMin && (r.age == null || r.age < min)) return false
      if (f.ageMax && (r.age == null || r.age > max)) return false
      return true
    }).sort((a, b) => String(b.surveyed_at || '').localeCompare(String(a.surveyed_at || '')))
  }, [rows, pii, q, f])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)   // กันหน้าค้างเกินหลังผลลัพธ์ลดลง
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const handleDelete = async (r) => {
    const P = pii[r.record_uid]
    const who = P?.full_name || r.doc_no || r.record_uid
    if (!window.confirm(`ลบรายการนี้ถาวร?\n\n${who}\nวันที่สำรวจ ${formatThaiDate(r.surveyed_at) || '—'}\n\nลบแล้วกู้คืนไม่ได้`)) return
    setBusy(true)
    try {
      await supabase.from('interview_records_pii').delete().eq('record_uid', r.record_uid)
      const { error: e } = await supabase.from('interview_records').delete().eq('record_uid', r.record_uid)
      if (e) { setError(`ลบไม่สำเร็จ: ${e.message}`); return }
      logAction?.('delete', 'interview_records', r.record_uid, null)
      setDetail(null)
      setRows((s) => s.filter((x) => x.record_uid !== r.record_uid))
    } finally { setBusy(false) }
  }

  const handleExport = async () => {
    setBusy(true)
    try {
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
      filtered.forEach((r) => {
        const P = pii[r.record_uid] || {}
        ws.addRow([
          r.code || '', formatThaiDate(r.surveyed_at) || '', r.doc_no || '', P.full_name || '', P.national_id || '',
          P.phone || '', r.age ?? '', r.religion || '', r.occupation || '', r.income_range || '',
          r.education || '', r.residence?.district || '', r.residence?.subdistrict || '',
          (r.main_drug?.drugs || []).join(', ') || (r.regular_drugs || []).map((d) => d.drug).join(', '),
          r.arrest_count ?? 0, r.rehab_count ?? 0,
        ])
      })
      header.forEach((h, i) => { ws.getColumn(i + 1).width = Math.max(12, h.length + 6) })
      const buf = await wb.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url; a.download = `interview-records-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      logAction?.('view', 'interview_records', null, { action: 'export', count: filtered.length })
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
          <button type="button" onClick={handleExport} disabled={busy || !filtered.length}
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

      {error && (
        <Card>
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-500" />
            <div>
              <p className="text-rose-600 font-medium">
                {schemaMissing ? 'ยังไม่ได้สร้างตารางของแบบซักผู้เสพ' : `เกิดข้อผิดพลาด: ${error}`}
              </p>
              {schemaMissing && (
                <p className="mt-1 text-slate-500">
                  รัน <code className="px-1 py-0.5 rounded bg-slate-100 text-[12px]">supabase/migrations/20260910_interview_records.sql</code> บน Supabase ก่อน
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {!loading && !error && (
        <Card title={`ผลการค้นหา · ${filtered.length.toLocaleString()} รายการ`}
          sub={totalPages > 1 ? `หน้า ${safePage} / ${totalPages}` : undefined}>
          {filtered.length === 0 ? (
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
                      <th className="py-2.5 pr-3 font-medium text-right">อายุ</th>
                      <th className="py-2.5 pr-3 font-medium">อาชีพ</th>
                      <th className="py-2.5 pr-3 font-medium">พื้นที่</th>
                      <th className="py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => {
                      const P = pii[r.record_uid]
                      return (
                        <tr key={r.record_uid} onClick={() => setDetail(r)}
                          className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                          <td className="py-2.5 pr-3 whitespace-nowrap font-semibold text-[#243aa8]">{txt(r.code)}</td>
                          <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap text-slate-600">{formatThaiDate(r.surveyed_at) || '—'}</td>
                          <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">{txt(r.doc_no)}</td>
                          <td className="py-2.5 pr-3 font-medium text-slate-800 whitespace-nowrap">
                            {P?.full_name || <span className="text-slate-400 font-normal">(ไม่ระบุชื่อ)</span>}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">{r.age ?? '—'}</td>
                          <td className="py-2.5 pr-3 text-slate-500 max-w-[220px] truncate" title={r.occupation}>{txt(r.occupation)}</td>
                          <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">
                            {[r.residence?.district?.replace(/^เขต/, ''), r.residence?.subdistrict].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="py-2.5 text-right">
                            <button type="button" title="ลบรายการนี้" disabled={busy}
                              onClick={(e) => { e.stopPropagation(); handleDelete(r) }}
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition disabled:opacity-40">
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                  <span className="tabular-nums">แสดง {pageRows.length} จาก {filtered.length.toLocaleString()} รายการ</span>
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

      {detail && <DetailPanel row={detail} pii={pii[detail.record_uid]} onClose={() => setDetail(null)} onDelete={() => handleDelete(detail)} busy={busy} />}
    </IntelPage>
  )
}

// ── แผงรายละเอียดเต็ม ────────────────────────────────────────────────────────
function Row({ label, value }) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return null
  return (
    <div className="flex gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="w-44 shrink-0 text-[12.5px] text-slate-500">{label}</span>
      <span className="text-[13px] text-slate-800 min-w-0">{Array.isArray(value) ? value.join(', ') : String(value)}</span>
    </div>
  )
}

function Group({ title, children }) {
  return (
    <div className="mb-5">
      <h4 className="text-[13px] font-bold text-slate-800 mb-1.5 pb-1 border-b border-slate-200">{title}</h4>
      {children}
    </div>
  )
}

function DetailPanel({ row: r, pii: P, onClose, onDelete, busy }) {
  const res = r.residence || {}, work = r.work_info || {}, fu = r.first_use || {}
  const md = r.main_drug || {}, buy = r.purchase || {}, addr = P?.address || {}
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-slate-400">แบบเก็บข้อมูลบุคคล ๑-๑</div>
            <h3 className="text-lg font-bold text-slate-900 truncate">{P?.full_name || '(ไม่ระบุชื่อ)'}</h3>
            <p className="text-xs text-slate-500 tabular-nums">
              <span className="font-semibold text-[#243aa8]">{r.code || '—'}</span>
              {' · '}สำรวจ {formatThaiDate(r.surveyed_at) || '—'}{r.doc_no ? ` · เลขที่ ${r.doc_no}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={onDelete} disabled={busy} title="ลบรายการนี้"
              className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"><Trash2 size={16} /></button>
            <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>

        <div className="px-6 py-5">
          <Group title="ส่วนที่ ๑ ข้อมูลบุคคล">
            <Row label="ชื่อ-สกุล" value={P?.full_name} />
            <Row label="ชื่ออื่นๆ" value={P?.alias} />
            <Row label="เลขประจำตัวประชาชน" value={P?.national_id} />
            <Row label="วันเกิด" value={P?.birth_date && formatThaiDate(P.birth_date)} />
            <Row label="อายุ" value={r.age && `${r.age} ปี`} />
            <Row label="ศาสนา" value={r.religion} />
            <Row label="โทรศัพท์มือถือ" value={P?.phone} />
            <Row label="โทรศัพท์ติดต่อได้" value={P?.contact_phone} />
            <Row label="สถานภาพสมรส" value={r.marital_status} />
            <Row label="การศึกษา" value={r.education} />
            <Row label="สถานศึกษา" value={r.education_place} />
            <Row label="อาชีพ" value={r.occupation} />
            <Row label="รายได้ต่อเดือน" value={r.income_range} />
          </Group>

          <Group title="ที่อยู่อาศัยปัจจุบัน">
            <Row label="บริเวณ/สถานที่ใกล้เคียง" value={addr.area} />
            <Row label="เลขที่ / หมู่" value={[addr.no, addr.moo].filter(Boolean).join(' หมู่ ')} />
            <Row label="อาคาร/ชั้น/ห้อง" value={[addr.building, addr.floor && `ชั้น ${addr.floor}`, addr.room && `ห้อง ${addr.room}`].filter(Boolean).join(' · ')} />
            <Row label="ซอย / ถนน" value={[addr.soi, addr.road].filter(Boolean).join(' · ')} />
            <Row label="ชุมชน/อาคาร" value={res.community} />
            <Row label="แขวง / เขต" value={[res.subdistrict, res.district].filter(Boolean).join(' · ')} />
            <Row label="จังหวัด" value={res.province} />
            <Row label="สน. / บก.น." value={[res.station, res.bkn].filter(Boolean).join(' · ')} />
            <Row label="อาศัยอยู่ในฐานะ" value={r.resident_status} />
          </Group>

          <Group title="การทำงาน">
            <Row label="สถานที่ทำงาน" value={work.place} />
            <Row label="เขต / จังหวัด" value={[work.district, work.province].filter(Boolean).join(' · ')} />
            <Row label="ลักษณะงาน" value={work.nature} />
            <Row label="การแพร่ระบาดในที่ทำงาน" value={[work.outbreak, work.outbreak_detail].filter(Boolean).join(' — ')} />
          </Group>

          {!!(r.arrests || []).length && (
            <Group title={`๑. ประวัติถูกจับ (${r.arrest_count ?? r.arrests.length} ครั้ง)`}>
              {r.arrests.map((a, i) => (
                <Row key={i} label={`ครั้งที่ ${a.seq ?? i + 1}`}
                  value={[a.charge, a.drug, a.amount && `${a.amount} ${a.unit || ''}`, a.station, a.year && `ปี ${a.year}`].filter(Boolean).join(' · ')} />
              ))}
            </Group>
          )}

          {!!(r.rehabs || []).length && (
            <Group title={`๒. ประวัติบำบัด (${r.rehab_count ?? r.rehabs.length} ครั้ง)`}>
              {r.rehabs.map((x, i) => (
                <Row key={i} label={`ครั้งที่ ${x.seq ?? i + 1}`}
                  value={[x.drug, x.place, x.year && `ปี ${x.year}`].filter(Boolean).join(' · ')} />
              ))}
            </Group>
          )}

          <Group title="๓. การเสพยาครั้งแรก">
            <Row label="อายุที่เริ่มเสพ" value={r.first_use_age && `${r.first_use_age} ปี`} />
            <Row label="ชนิดยา" value={r.first_drug} />
            <Row label="สาเหตุ" value={r.first_reason} />
            <Row label="ได้มาจาก" value={fu.source} />
            <Row label="วิธีเสพ" value={fu.method} />
            <Row label="ลักษณะการเสพ" value={[fu.style, fu.group_size && `${fu.group_size} คน`].filter(Boolean).join(' · ')} />
            <Row label="อาศัยอยู่ (ตอนนั้น)" value={[fu.community, fu.district, fu.province].filter(Boolean).join(' · ')} />
            <Row label="หลังเสพครั้งแรก" value={[fu.after, fu.after_duration].filter(Boolean).join(' · ')} />
            <Row label="ช่วงหยุดเสพ" value={[fu.quit_duration, fu.quit_reason].filter(Boolean).join(' — ')} />
          </Group>

          <Group title="๔. ยาเสพติดหลักที่ใช้ประจำ">
            <Row label="ชนิดยา" value={md.drugs} />
            <Row label="ระบุเพิ่ม" value={md.drug_other} />
            <Row label="ลักษณะการใช้" value={[md.usage_type, md.usage_with].filter(Boolean).join(' — ')} />
            <Row label="ยาที่ใช้แทน" value={md.substitute} />
            <Row label="ใช้มานาน" value={md.years_using} />
            <Row label="ปริมาณต่อครั้ง/วัน" value={md.amount_per_time} />
            <Row label="ปริมาณสูงสุด" value={md.max_amount} />
            <Row label="วิธีเสพ" value={md.method} />
            <Row label="ความถี่" value={md.frequency} />
            <Row label="ลักษณะการเสพ" value={[md.style, md.group_size && `${md.group_size} คน`].filter(Boolean).join(' · ')} />
            <Row label="สถานที่เสพ" value={[...(md.places || []), md.place_other].filter(Boolean).join(', ')} />
            <Row label="หาซื้อได้" value={[md.availability, md.availability_reason].filter(Boolean).join(' — ')} />
          </Group>

          {!!(r.regular_drugs || []).length && (
            <Group title="๕. ราคายาเสพติด">
              {r.regular_drugs.map((d, i) => (
                <Row key={i} label={d.drug} value={[`${d.price?.toLocaleString?.() ?? d.price} บาท/${d.unit}`, d.period].filter(Boolean).join(' · ')} />
              ))}
              {r.drug_slang && Object.entries(r.drug_slang).map(([k, v]) => <Row key={k} label={`คำเรียก ${k}`} value={v} />)}
            </Group>
          )}

          <Group title="๖. แหล่งที่เคยซื้อ">
            <Row label="ช่องทางซื้อ" value={buy.channels} />
            {(r.dealer_locations || []).map((l, i) => (
              <Row key={i} label={`แหล่งที่ ${i + 1}`}
                value={[l.area, l.community, l.subdistrict, l.district, l.station, l.bkn].filter(Boolean).join(' · ')} />
            ))}
            <Row label="วิธีการซื้อ" value={buy.method} />
            <Row label="รู้แหล่งมาจาก" value={buy.known_from} />
            <Row label="สาเหตุที่ซื้อจากแหล่งนี้" value={buy.why_here} />
            <Row label="จำนวนผู้ขาย" value={buy.seller_count} />
          </Group>

          {!!(P?.sellers || []).length && (
            <Group title="ข้อมูลผู้ขาย">
              {P.sellers.map((s, i) => (
                <Row key={i} label={s.full_name || s.alias || `ผู้ขายที่ ${i + 1}`}
                  value={[s.alias && `(${s.alias})`, s.sex, s.age && `${s.age} ปี`, s.type, s.zone,
                    s.appearance, s.phone, s.weapon === 'มี' && `อาวุธ: ${s.weapon_type || 'มี'}`, s.vehicle]
                    .filter(Boolean).join(' · ')} />
              ))}
            </Group>
          )}

          <Group title="ผู้สัมภาษณ์">
            <Row label="ผู้สัมภาษณ์" value={P?.interviewer?.name} />
            <Row label="สังกัด" value={P?.interviewer?.unit || r.interview_info?.unit} />
            <Row label="โทรศัพท์" value={P?.interviewer?.phone} />
            <Row label="ข้อสังเกต/บันทึกเพิ่มเติม" value={r.note} />
          </Group>
        </div>
      </div>
    </div>
  )
}
