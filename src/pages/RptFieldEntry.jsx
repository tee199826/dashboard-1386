// /rpt-entry — แสดงเรื่องร้องเรียนจากรายงาน ปปส. (RPT_73_1/2/3, RPT_111_4/5)
// แล้วให้เจ้าหน้าที่กรอกข้อมูลที่รายงานไม่มี: พิกัด / ชุมชน / NISPA / บก.น. / สน. /
// กลุ่มพื้นที่ / ประเภทสถานที่ / ประเภทบุคคล (ทั่วไป-เจ้าหน้าที่รัฐ)
//
// 🔒 ผู้ดูแลระบบเท่านั้น (บังคับทั้ง ProtectedRoute ฝั่งหน้าจอ และ is_admin() ในทุก RPC)
//    ชุดข้อมูลนี้มีชื่อ-เลขบัตร-ที่อยู่รายบุคคล ต่างจากหน้า dashboard อื่นที่เปิดสาธารณะ
//
// ข้อมูลที่กรอกอยู่คนละตารางกับข้อมูลที่นำเข้า (rpt_field_entry vs rpt_records)
// → อัปโหลดรายงานฉบับใหม่ทับได้ โดยของที่กรอกไว้ไม่หาย
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Upload, Search, Download, MapPin, X, Loader2, AlertTriangle, Check,
  RefreshCw, Wand2, ExternalLink, Trash2, History, ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { Card, Field, Input, Select, ChipGroup, SaveBar } from '../components/intel/FormUI'
import { REPORT_GROUPS, REPORT_ORDER } from '../utils/rptParser'
import {
  importRptFile, listEntries, getEntry, saveEntry, exportEntries,
  importStatus, importHistory, deleteRecords, PAGE_SIZE,
} from '../utils/rptEntryService'
import {
  BKN_OPTIONS, AREA_GROUP_OPTIONS, stationsOf, PLACE_TYPE_OPTIONS, PLACE_TYPE_OTHER,
  PERSON_CATEGORY_OPTIONS, OFFICIAL_TYPE_OPTIONS, OFFICIAL_TYPE_OTHER,
  latLngError, parseLatLngPaste, suggestEntry, isResultReceived,
} from '../utils/rptEntryOptions'
import { loadAreaOptions, loadCommunitiesFromData, mergeCommunities } from '../utils/areaOptions'
import { DISTRICTS } from '../utils/intelOptions'
import { formatThaiDate } from '../utils/heroMeta'

const STATUS_LABELS = { empty: 'ยังไม่กรอก', draft: 'กรอกค้าง', done: 'กรอกครบ' }
const STATUS_STYLES = {
  empty: 'bg-slate-100 text-slate-500 ring-slate-200',
  draft: 'bg-amber-50 text-amber-700 ring-amber-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

const BLANK_ENTRY = {
  lat: '', lng: '', geo_note: '', community: '', nispa_code: '', bkn: '', police_station: '',
  area_group: '', place_type: '', place_type_other: '',
  person_category: '', official_types: [], official_type_other: '',
  note: '', status: 'draft',
}

const clean = (v) => { const s = String(v ?? '').trim(); return s || null }

// วันที่แบบไทย ใช้ตัวเดียวกับหน้าอื่นในระบบ (พ.ศ.)
const thaiDate = (iso) => formatThaiDate(iso) || '—'
const thaiDateTime = (ts) => {
  const d = new Date(ts)
  if (isNaN(d)) return '—'
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatThaiDate(d.toISOString().slice(0, 10))} ${hh}:${mm}`
}

// ── แถบสถานะการกรอก ────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const s = status || 'empty'
  return (
    <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-medium ring-1 ${STATUS_STYLES[s] || STATUS_STYLES.empty}`}>
      {STATUS_LABELS[s] || s}
    </span>
  )
}

// ── กล่องยืนยันก่อนล้างข้อมูล ──────────────────────────────────────────────
// ลบแล้วกู้ไม่ได้ จึงต้องบอกให้ชัดว่าอะไรจะหายบ้าง โดยเฉพาะ "ช่องที่กรอกเอง"
// ที่หายไปด้วยเพราะ cascade — คนมักคิดว่าลบแค่ข้อมูลรายงาน
function ConfirmDelete({ target, stat, onCancel, onConfirm, busy }) {
  const g = target === 'all' ? null : REPORT_GROUPS[target]
  const entries = stat?.entries_done ?? 0
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60" onClick={busy ? undefined : onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex items-center gap-3">
          <AlertTriangle size={20} className="text-rose-600 shrink-0" />
          <h3 className="font-bold text-base text-rose-800">
            {g ? `ล้างข้อมูลกลุ่ม ${g.no}` : 'ล้างข้อมูลทั้งหมด'}
          </h3>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-[13.5px] text-slate-700 leading-relaxed">
            {g ? <>กำลังจะลบข้อมูล <b>กลุ่ม {g.no} · {g.title}</b></>
               : <>กำลังจะลบข้อมูลที่นำเข้า <b>ทั้ง 5 กลุ่ม</b></>}
          </p>
          <ul className="text-[12.5px] text-slate-600 space-y-1 bg-slate-50 rounded-lg p-3">
            <li>• ข้อมูลรายงาน <b className="tabular-nums">{Number(stat?.records || 0).toLocaleString()}</b> รายการ</li>
            <li className={entries > 0 ? 'text-rose-700 font-medium' : ''}>
              • ช่องที่กรอกเอง (พิกัด/ชุมชน/NISPA/บก.น./สน.) ที่กรอกครบแล้ว{' '}
              <b className="tabular-nums">{entries.toLocaleString()}</b> รายการ
            </li>
          </ul>
          <p className="text-[12px] text-rose-700 font-medium">ลบแล้วกู้คืนไม่ได้</p>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onCancel} disabled={busy}
            className="flex-1 h-10 border border-slate-200 rounded-xl hover:bg-slate-50 text-sm font-medium disabled:opacity-40">
            ยกเลิก
          </button>
          <button onClick={onConfirm} disabled={busy}
            className="flex-1 h-10 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {busy && <Loader2 size={15} className="animate-spin" />}
            {busy ? 'กำลังลบ...' : 'ยืนยันลบ'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ประวัติการอัปโหลด ──────────────────────────────────────────────────────
// งานนี้อัปไฟล์เข้ามาเรื่อย ๆ หลายงวด ตาราง rpt_records เก็บแค่สถานะล่าสุดของแต่ละเรื่อง
// จึงต้องมีบันทึกแยกว่าเคยอัปไฟล์อะไรไปแล้วบ้าง กันอัปซ้ำ/อัปตกงวด
function ImportHistory({ rows, loading }) {
  const [open, setOpen] = useState(false)
  if (loading) return null

  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-50 transition">
        <span className="text-[12.5px] font-semibold text-slate-700 flex items-center gap-1.5">
          <History size={14} className="text-slate-400" />
          ประวัติการอัปโหลด {rows.length > 0 && <span className="text-slate-400 font-normal">({rows.length} ไฟล์)</span>}
        </span>
        <ChevronDown size={15} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 max-h-56 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="px-3.5 py-3 text-[12px] text-slate-400">ยังไม่มีประวัติ</p>
          ) : rows.map((b) => {
            const g = REPORT_GROUPS[b.report_id]
            return (
              <div key={b.id} className="px-3.5 py-2 border-b border-slate-50 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] text-slate-700">
                      <span className="font-medium">กลุ่ม {g?.no ?? '?'}</span>
                      <span className="text-slate-400"> · </span>
                      <span className="break-all">{b.file_name}</span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {Number(b.rows_imported).toLocaleString()} รายการ
                      {b.period_label && <> · ช่วง {b.period_label}</>}
                      {b.imported_by_email && <> · โดย {b.imported_by_email}</>}
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                    {thaiDateTime(b.imported_at)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── กล่องนำเข้าไฟล์ ────────────────────────────────────────────────────────
// อัปโหลด "ทีละหัวข้อ" ตามกลุ่ม 1-5 ไม่ใช่กองรวม — เพราะรายงานชุดนี้มี 5 ฉบับ
// ที่ต้องครบถึงจะเห็นภาพรวมได้ ถ้ากองรวมแล้วอัปไม่ครบจะไม่รู้เลยว่าขาดกลุ่มไหน
// แต่ละช่องผูกกับ Report ID ของตัวเอง ใส่ไฟล์ผิดช่องจะถูกปฏิเสธพร้อมบอกว่าควรใช้ไฟล์ไหน
function ImportSlot({ reportId, stat, result, busy, onPick, onDelete }) {
  const g = REPORT_GROUPS[reportId]
  const inputRef = useRef(null)
  const done = !!stat?.records
  const failed = result && !result.ok
  // หัวรายงานเอาจากไฟล์ที่เพิ่งอัปก่อน ถ้ายังไม่ได้อัปรอบนี้ก็ใช้ที่บันทึกไว้ตอนนำเข้าครั้งก่อน
  const fileTitle = result?.ok ? result.title : stat?.report_title

  return (
    <div className={`rounded-xl ring-1 p-3.5 transition ${
      failed ? 'bg-rose-50 ring-rose-200'
        : result?.ok ? 'bg-emerald-50/60 ring-emerald-200'
        : done ? 'bg-white ring-slate-200' : 'bg-slate-50 ring-slate-200'
    }`}>
      <div className="flex items-start gap-3">
        <span className={`h-7 w-7 shrink-0 grid place-items-center rounded-full text-[13px] font-bold ${
          done || result?.ok ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-white'
        }`}>
          {done || result?.ok ? <Check size={15} /> : g.no}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-slate-800 leading-snug">
            กลุ่ม {g.no} · {g.title}
          </p>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{g.file}.XLSX</p>

          {/* หัวรายงานที่อ่านได้จากไฟล์จริง — ให้คนตรวจด้วยตาว่าหยิบไฟล์ถูกกลุ่ม
              (ไม่ใช่ชื่อที่เราตั้งเอง ถ้าไฟล์ผิดกลุ่มจะเห็นตรงนี้ทันที) */}
          {fileTitle && (
            <p className="text-[11.5px] text-slate-700 mt-1.5 leading-snug">
              <span className="text-slate-400">หัวรายงานในไฟล์: </span>{fileTitle}
            </p>
          )}

          {/* สถานะปัจจุบันในฐานข้อมูล */}
          {done ? (
            <div className="text-[11.5px] text-slate-600 mt-1.5 space-y-0.5">
              <p>
                นำเข้าแล้ว <b className="tabular-nums">{Number(stat.records).toLocaleString()}</b> รายการ
                {stat.entries_done > 0 && <> · กรอกครบแล้ว {Number(stat.entries_done).toLocaleString()}</>}
              </p>
              <p className="text-slate-500">
                ช่วงข้อมูล{' '}
                {(stat.periods?.length ? stat.periods : [stat.period_label]).filter(Boolean)
                  .map((pl, i) => (
                    <b key={pl} className={i ? 'before:content-[",_"] before:font-normal' : ''}>{pl}</b>
                  ))}
                {!stat.periods?.length && !stat.period_label && <b>ไม่ระบุ</b>}
              </p>
              {stat.last_imported_at && (
                <p className="text-slate-400">
                  อัปมาแล้ว {Number(stat.batches || 0).toLocaleString()} ไฟล์ · ล่าสุด {thaiDateTime(stat.last_imported_at)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11.5px] text-amber-700 mt-1.5">ยังไม่ได้นำเข้า</p>
          )}

          {/* ผลของการอัปโหลดรอบนี้ */}
          {result?.ok && (
            <div className="mt-1.5">
              <p className="text-[11.5px] text-emerald-700 font-medium">
                อัปโหลดสำเร็จ {result.imported.toLocaleString()} รายการ
                {result.params?.period && <> · ช่วงข้อมูล {result.params.period}</>}
              </p>
              {result.warnings.length > 0 && (
                <details className="mt-1">
                  <summary className="text-[11px] text-amber-700 cursor-pointer">
                    ข้อมูลที่ต้องตรวจ {result.warnings.length} รายการ (ไม่ใช่ข้อผิดพลาด)
                  </summary>
                  <ul className="mt-1 space-y-0.5 max-h-28 overflow-y-auto">
                    {result.warnings.map((w, j) => <li key={j} className="text-[10.5px] text-slate-500">• {w}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
          {failed && <p className="text-[11.5px] text-rose-700 mt-1.5 leading-relaxed">{result.error}</p>}
        </div>

        <input ref={inputRef} type="file" accept=".xlsx,.XLSX" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(reportId, f) }} />
        <div className="flex flex-col gap-1.5 shrink-0">
          <button onClick={() => inputRef.current?.click()} disabled={busy}
            className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition">
            {done || result?.ok ? '+ เพิ่มไฟล์' : 'เลือกไฟล์'}
          </button>
          {done && (
            <button onClick={() => onDelete(reportId)} disabled={busy} title="ล้างข้อมูลกลุ่มนี้"
              className="h-8 px-3 rounded-lg border border-rose-200 bg-white text-[12px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition inline-flex items-center justify-center gap-1">
              <Trash2 size={13} /> ล้าง
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ImportModal({ onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState({})     // reportId -> ผลการอัปรอบนี้
  const [stats, setStats] = useState({})         // reportId -> สถานะในฐานข้อมูล
  const [statErr, setStatErr] = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null)   // reportId | 'all' | null
  const [deleting, setDeleting] = useState(false)
  const allRef = useRef(null)

  // อ่านสถานะว่ากลุ่มไหนเข้าแล้วบ้าง (ยังไม่รัน migration ก็ขึ้นเตือนตรงนี้)
  const [history, setHistory] = useState([])
  const [histLoading, setHistLoading] = useState(true)

  const refreshStats = useCallback(() => {
    importStatus().then((s) => { setStats(s); setStatErr(null) }).catch((e) => setStatErr(e.message))
    importHistory()
      .then(setHistory)
      .catch(() => setHistory([]))          // ประวัติอ่านไม่ได้ ไม่ควรบังหน้านำเข้าทั้งหน้า
      .finally(() => setHistLoading(false))
  }, [])
  useEffect(() => { refreshStats() }, [refreshStats])

  // นำเข้าไฟล์เดียวเข้าช่องที่ระบุ — ถ้า Report ID ไม่ตรง service จะปฏิเสธให้เอง
  const importOne = async (reportId, file) => {
    setBusy(true)
    setResults((r) => ({ ...r, [reportId]: undefined }))
    try {
      const r = await importRptFile(file, setProgress, reportId)
      setResults((s) => ({ ...s, [reportId]: { ok: true, ...r } }))
    } catch (e) {
      setResults((s) => ({ ...s, [reportId]: { ok: false, error: e.message } }))
    } finally {
      setProgress(''); setBusy(false); refreshStats(); onDone?.()
    }
  }

  // ทางลัด: เลือกครบ 5 ไฟล์ทีเดียว แล้วให้ระบบจัดเข้าช่องตาม Report ID ในไฟล์เอง
  const importMany = async (files) => {
    setBusy(true); setResults({})
    for (const file of files) {
      setProgress(`กำลังอ่าน ${file.name}...`)
      try {
        const r = await importRptFile(file, setProgress)
        setResults((s) => ({ ...s, [r.reportId]: { ok: true, ...r } }))
      } catch (e) {
        // อ่านไฟล์ไม่ออกจนไม่รู้ว่าเป็นกลุ่มไหน — โชว์รวมไว้ท้ายกล่อง
        setResults((s) => ({ ...s, [`_err_${file.name}`]: { ok: false, error: e.message, fileName: file.name } }))
      }
    }
    setProgress(''); setBusy(false); refreshStats(); onDone?.()
  }

  // ล้างข้อมูล — ยืนยันแล้วค่อยเรียก แล้วรีเฟรชทั้งกล่องนำเข้าและตารางหลัก
  const runDelete = async () => {
    setDeleting(true)
    try {
      const r = await deleteRecords(confirmTarget === 'all' ? null : confirmTarget)
      setResults((s2) => {
        if (confirmTarget === 'all') return {}
        const next = { ...s2 }
        delete next[confirmTarget]
        return next
      })
      setStatErr(null)
      setProgress(`ล้างแล้ว ${Number(r.records).toLocaleString()} รายการ`)
      setTimeout(() => setProgress(''), 3000)
    } catch (e) {
      setStatErr(e.message)
    } finally {
      setDeleting(false); setConfirmTarget(null); refreshStats(); onDone?.()
    }
  }

  const loose = Object.entries(results).filter(([k]) => k.startsWith('_err_'))
  const doneCount = REPORT_ORDER.filter((id) => stats[id]?.records || results[id]?.ok).length

  // ระบบนี้อัปสะสมหลายงวดโดยตั้งใจ — มีหลายช่วงเวลาจึงเป็นเรื่องปกติ ไม่ใช่ข้อผิดพลาด
  // แต่ต้องบอกให้เห็นว่าตอนนี้ในระบบมีข้อมูลของช่วงไหนบ้าง จะได้รู้ว่าอัปครบหรือยัง
  const periods = [...new Set(REPORT_ORDER.flatMap((id) => stats[id]?.periods || []))].sort()
  const mixedPeriods = periods.length > 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-800">นำเข้ารายงาน ปปส.</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              อัปโหลดทีละหัวข้อ · นำเข้าแล้ว <b className="tabular-nums">{doneCount}</b> จาก {REPORT_ORDER.length} กลุ่ม
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1 hover:bg-slate-100 rounded-lg disabled:opacity-40"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-2.5">
          {statErr && (
            <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 p-3.5 flex items-start gap-2">
              <AlertTriangle size={16} className="text-rose-600 mt-0.5 shrink-0" />
              <p className="text-[12.5px] text-rose-700">{statErr}</p>
            </div>
          )}

          {periods.length > 0 && (
            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3">
              <p className="text-[11.5px] text-slate-600">
                <span className="text-slate-400">ช่วงข้อมูลที่มีในระบบ: </span>
                {periods.map((pl) => (
                  <span key={pl} className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-white ring-1 ring-slate-200 text-[11px]">{pl}</span>
                ))}
              </p>
              {mixedPeriods && (
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  ตัวเลขในหน้าหลักเป็นยอดรวมทุกช่วง — กรองเฉพาะช่วงที่ต้องการได้ที่ตัวกรอง "ช่วงข้อมูล"
                </p>
              )}
            </div>
          )}

          {busy && (
            <div className="rounded-xl bg-blue-50 ring-1 ring-blue-200 p-3 flex items-center gap-2">
              <Loader2 size={15} className="animate-spin text-blue-600" />
              <p className="text-[12.5px] text-blue-800">{progress || 'กำลังนำเข้า...'}</p>
            </div>
          )}

          {REPORT_ORDER.map((id) => (
            <ImportSlot key={id} reportId={id} stat={stats[id]} result={results[id]}
              busy={busy || deleting} onPick={importOne} onDelete={setConfirmTarget} />
          ))}

          <ImportHistory rows={history} loading={histLoading} />

          {loose.map(([k, r]) => (
            <div key={k} className="rounded-xl bg-rose-50 ring-1 ring-rose-200 p-3.5">
              <p className="text-[12.5px] font-semibold text-slate-800 break-all">{r.fileName}</p>
              <p className="text-[12px] text-rose-700 mt-0.5">{r.error}</p>
            </div>
          ))}

          <div className="pt-1.5 border-t border-slate-100 mt-3">
            <input ref={allRef} type="file" accept=".xlsx,.XLSX" multiple className="hidden"
              onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) importMany(f) }} />
            <button onClick={() => allRef.current?.click()} disabled={busy}
              className="text-[12px] text-blue-600 hover:text-blue-800 disabled:opacity-40 font-medium">
              หรือเลือกครบทั้ง 5 ไฟล์พร้อมกัน — ระบบจัดเข้าหัวข้อให้เอง
            </button>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              นำเข้าไฟล์เดิมซ้ำได้ ระบบทับข้อมูลรายงานตามเลขที่ร้องเรียน+เลขที่บุคคล
              ส่วนช่องที่กรอกเพิ่มไว้จะไม่ถูกแตะ
            </p>
            {doneCount > 0 && (
              <button onClick={() => setConfirmTarget('all')} disabled={busy || deleting}
                className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] text-rose-600 hover:text-rose-800 disabled:opacity-40 font-medium">
                <Trash2 size={13} /> ล้างข้อมูลทั้งหมดเพื่อเริ่มใหม่
              </button>
            )}
          </div>
        </div>

        {confirmTarget && (
          <ConfirmDelete
            target={confirmTarget}
            stat={confirmTarget === 'all'
              ? REPORT_ORDER.reduce((acc, id) => ({
                records: acc.records + Number(stats[id]?.records || 0),
                entries_done: acc.entries_done + Number(stats[id]?.entries_done || 0),
              }), { records: 0, entries_done: 0 })
              : stats[confirmTarget]}
            busy={deleting}
            onCancel={() => setConfirmTarget(null)}
            onConfirm={runDelete}
          />
        )}

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button onClick={onClose} disabled={busy}
            className="h-9 px-4 rounded-lg border border-slate-300 text-sm font-medium hover:bg-slate-50 disabled:opacity-40">
            ปิด
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ข้อมูลทั้งหมดจากรายงาน (อ่านอย่างเดียว) ───────────────────────────────
// แสดงทุกช่องที่นำเข้ามา ไม่ตัดทิ้ง — เจ้าหน้าที่ต้องเห็นครบถึงจะกรอกพิกัด/สน. ได้ถูก
// ช่องที่ไม่มีค่าแสดงเป็น "—" เพื่อให้รู้ว่า "ไฟล์ไม่มีข้อมูลช่องนี้" ไม่ใช่ "ระบบไม่ได้อ่าน"
// tone: 'ok' = ได้รับผลแล้ว (ฟ้า) | 'pending' = ยังไม่ได้รับผล (แดง)
const TONE = {
  ok: 'text-sky-700 font-semibold',
  pending: 'text-rose-600 font-semibold',
}

function DetailRow({ label, value, mono = false, wrap = false, tone }) {
  const empty = value == null || value === ''
  const color = tone ? TONE[tone] : (empty ? 'text-slate-300' : 'text-slate-700')
  return (
    <>
      <dt className="text-slate-400 py-0.5">{label}</dt>
      <dd className={`py-0.5 ${color} ${mono ? 'tabular-nums' : ''} ${wrap ? 'whitespace-pre-line' : ''}`}>
        {empty ? '—' : value}
      </dd>
    </>
  )
}

function DetailGroup({ title, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{title}</p>
      <dl className="grid grid-cols-[minmax(84px,auto)_1fr] gap-x-3 text-[12px] leading-relaxed">
        {children}
      </dl>
    </div>
  )
}

function RecordDetail({ rec, pii, group }) {
  const isPerson = group?.kind === 'person'
  const received = isResultReceived(rec)
  return (
    <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4 space-y-3.5">
      <DetailGroup title="เรื่องร้องเรียน">
        <DetailRow label="เลขที่ร้องเรียน" value={rec.complaint_no} mono />
        <DetailRow label="ลำดับในรายงาน" value={rec.seq} mono />
        <DetailRow label="แหล่งข่าว" value={rec.source} />
        <DetailRow label="ภาพถ่าย" value={rec.photo} />
        <DetailRow label="จำนวนครั้งที่ร้อง" value={rec.report_count} mono />
        {rec.report_count_period != null && (
          <DetailRow label="ครั้ง (ในห้วง)" value={rec.report_count_period} mono />
        )}
        <DetailRow label="ระดับความเร่งด่วน" value={rec.urgency} />
        <DetailRow label="ปปส. ภาค" value={rec.ppsm_region} />
        <DetailRow label="ส่งดำเนินการ" value={rec.send_to} />
      </DetailGroup>

      {isPerson && (
        <DetailGroup title="ข้อมูลบุคคล">
          <DetailRow label="เลขที่บุคคล" value={rec.person_no} mono />
          <DetailRow label="ชื่อ" value={pii?.first_name} />
          <DetailRow label="นามสกุล" value={pii?.last_name} />
          <DetailRow label="ชื่ออื่น/ฉายา" value={pii?.aka} />
          <DetailRow label="เลขบัตรประชาชน" value={pii?.national_id} mono />
          <DetailRow label="วันเกิด"
            value={pii?.birth_date ? thaiDate(pii.birth_date) : pii?.birth_date_raw} mono />
          <DetailRow label="เพศ" value={rec.gender} />
          <DetailRow label="อาชีพ" value={rec.occupation} />
          <DetailRow label="ตำแหน่ง" value={rec.position} />
          <DetailRow label="ประเภทบุคคล (ต้นทาง)" value={rec.person_type} />
          <DetailRow label="บทบาท" value={rec.role} />
        </DetailGroup>
      )}

      <DetailGroup title="ที่อยู่ / พื้นที่">
        {isPerson && <DetailRow label="ที่อยู่ตาม ทร.14" value={pii?.addr_house_reg} wrap />}
        <DetailRow label={isPerson ? 'ที่อยู่ปัจจุบัน' : 'รายละเอียดที่อยู่'} value={pii?.addr_detail} wrap />
        <DetailRow label="ชุมชน" value={rec.src_community} />
        <DetailRow label="หมู่บ้าน/ชุมชน" value={rec.src_village} />
        <DetailRow label="แขวง" value={rec.subdistrict} />
        <DetailRow label="เขต" value={rec.district} />
        <DetailRow label="จังหวัด" value={rec.province} />
      </DetailGroup>

      {!isPerson && (
        <DetailGroup title="ลักษณะพื้นที่">
          <DetailRow label="ยาเสพติด" value={rec.drug_types} />
          <DetailRow label="ประเภทพื้นที่" value={rec.area_type} />
          <DetailRow label="รายละเอียดพื้นที่" value={pii?.area_detail} wrap />
        </DetailGroup>
      )}

      <DetailGroup title="การรับเรื่อง / ส่งตรวจสอบ">
        <DetailRow label="การดำเนินการ" value={rec.recv_action} />
        <DetailRow label="วันที่รับเรื่อง" value={rec.recv_date && thaiDate(rec.recv_date)} mono />
        <DetailRow label="ส่งให้หน่วยงาน" value={rec.send_agency} />
        <DetailRow label="เลขที่หนังสือส่ง" value={rec.send_doc_no} mono />
        <DetailRow label="วันที่ส่งตรวจ" value={rec.send_date && thaiDate(rec.send_date)} mono />
      </DetailGroup>

      <DetailGroup title="ผลการดำเนินการ">
        <DetailRow label="สถานะ"
          value={received ? (rec.result_status || 'ได้รับผล') : 'ยังไม่ได้รับผล'}
          tone={received ? 'ok' : 'pending'} />
        <DetailRow label="หน่วยที่ตอบผล" value={rec.result_agency} />
        <DetailRow label="เลขที่หนังสือรับ" value={rec.result_doc_no} mono />
        <DetailRow label="วันที่ตอบผล" value={rec.result_date && thaiDate(rec.result_date)} mono />
        <DetailRow label="พฤติการณ์"
          value={received ? rec.result_behavior : 'ยังไม่มีข้อมูล (รอผลตรวจสอบ)'}
          tone={received ? 'ok' : 'pending'} />
        <DetailRow label="วันที่ดำเนินการ" value={rec.result_action_date && thaiDate(rec.result_action_date)} mono />
        <DetailRow label="พฤติการณ์ยาเสพติด" value={rec.drug_behavior} />
        <DetailRow label="มาตรการต่อบุคคล" value={rec.person_measure} />
        <DetailRow label="ผลการดำเนินงาน" value={rec.result_operation} />
        <DetailRow label="เอกสารแนบ" value={rec.has_attachment ? 'มี' : null} />
      </DetailGroup>

      {pii?.result_detail && (
        <DetailGroup title="รายละเอียดผลการตรวจสอบ">
          <DetailRow label="" value={pii.result_detail} wrap />
        </DetailGroup>
      )}

      {pii?.behavior_detail && (
        <DetailGroup title="รายละเอียดพฤติการณ์">
          <DetailRow label="" value={pii.behavior_detail} wrap />
        </DetailGroup>
      )}

      <DetailGroup title="ที่มาของข้อมูล">
        <DetailRow label="หัวรายงาน" value={rec.report_title} wrap />
        <DetailRow label="ช่วงข้อมูล" value={rec.period_label} />
        <DetailRow label="รายงานพิมพ์" value={rec.printed_at && thaiDate(rec.printed_at)} mono />
        <DetailRow label="นำเข้าเมื่อ" value={rec.imported_at && thaiDateTime(rec.imported_at)} mono />
      </DetailGroup>
    </div>
  )
}

// ── ฟอร์มกรอกข้อมูลเพิ่มเติม ───────────────────────────────────────────────
function EntryForm({
  recordUid, onSaved, onClose, communitiesOf,
  position, hasPrev, hasNext, busyNav, onPrev, onNext,
}) {
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)      // { record, pii, entry }
  const [f, setF] = useState(BLANK_ENTRY)
  const [status, setStatus] = useState(null)
  // จำว่าผู้ใช้ชอบกางหรือย่อ — อ่าน/เขียนใน try/catch เพราะโหมดส่วนตัวอาจโยน error
  const [detailOpen, setDetailOpen] = useState(() => {
    try { return localStorage.getItem('rptEntry.detailOpen') !== '0' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('rptEntry.detailOpen', detailOpen ? '1' : '0') } catch { /* ไม่เป็นไร */ }
  }, [detailOpen])
  const set = (patch) => setF((s) => ({ ...s, ...patch }))

  useEffect(() => {
    let cancelled = false
    getEntry(recordUid)
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        const e = d?.entry
        if (!e) { setF({ ...BLANK_ENTRY, ...suggestEntry(d?.record) }); return }
        // คอลัมน์ที่เป็น null ในฐานต้องกลายเป็น '' ไม่งั้น input เปลี่ยนจาก uncontrolled -> controlled
        // (ยกเว้น official_types ที่เป็น array และ status ที่ต้องมีค่าเสมอ)
        const filled = { ...BLANK_ENTRY }
        for (const k of Object.keys(BLANK_ENTRY)) {
          if (k === 'official_types') filled[k] = e[k] || []
          else filled[k] = e[k] ?? ''
        }
        filled.status = e.status || 'draft'
        setF(filled)
      })
      .catch((err) => !cancelled && setStatus({ error: err.message }))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [recordUid])

  const rec = detail?.record, pii = detail?.pii
  const geoError = latLngError(f.lat, f.lng)
  const hasGeo = f.lat !== '' && f.lng !== '' && !geoError

  // เติมค่าที่เดาได้จากรายงาน (บก.น./สน./กลุ่มพื้นที่/ชุมชน) โดยไม่ทับช่องที่กรอกไปแล้ว
  const applySuggestions = () => {
    const s = suggestEntry(rec)
    set(Object.fromEntries(Object.entries(s).filter(([k, v]) => v && !f[k])))
  }

  const save = async (e) => {
    e?.preventDefault?.()
    if (geoError) { setStatus({ error: geoError }); return false }
    setStatus('saving')
    try {
      const payload = {
        lat: f.lat === '' ? null : Number(f.lat),
        lng: f.lng === '' ? null : Number(f.lng),
        geo_note: clean(f.geo_note),
        community: clean(f.community),
        nispa_code: clean(f.nispa_code),
        bkn: clean(f.bkn),
        police_station: clean(f.police_station),
        area_group: clean(f.area_group),
        place_type: clean(f.place_type),
        place_type_other: f.place_type === PLACE_TYPE_OTHER ? clean(f.place_type_other) : null,
        person_category: clean(f.person_category),
        official_types: f.person_category === 'เจ้าหน้าที่รัฐ' ? f.official_types : [],
        official_type_other:
          f.person_category === 'เจ้าหน้าที่รัฐ' && f.official_types.includes(OFFICIAL_TYPE_OTHER)
            ? clean(f.official_type_other) : null,
        note: clean(f.note),
        status: f.status || 'draft',
      }
      const saved = await saveEntry(recordUid, payload)
      setStatus('saved')
      onSaved?.(recordUid, saved)
      setTimeout(() => setStatus((s) => (s === 'saved' ? null : s)), 2500)
      return true
    } catch (err) {
      setStatus({ error: err.message })
      return false
    }
  }

  // บันทึกแล้วไปรายการถัดไป — ไม่เลื่อนถ้าบันทึกไม่ผ่าน จะได้ไม่ทิ้งงานที่ยังไม่ถูกบันทึก
  const saveAndNext = async () => {
    if (await save()) onNext?.()
  }

  if (loading) {
    return (
      <div className="h-64 grid place-items-center text-slate-400">
        <Loader2 size={22} className="animate-spin" />
      </div>
    )
  }
  if (!detail) {
    return <p className="text-sm text-rose-600 p-4">{status?.error || 'ไม่พบรายการนี้'}</p>
  }

  const fullName = [pii?.first_name, pii?.last_name].filter(Boolean).join(' ')
  const place = pii?.addr_detail || pii?.addr_house_reg || ''
  // ที่อยู่ในไฟล์เป็นข้อความล้วน ไม่มีพิกัด — เปิด Google Maps ด้วยคำค้นเพื่อช่วยปักหมุด
  const mapQuery = encodeURIComponent([place, rec?.subdistrict, rec?.district, 'กรุงเทพมหานคร'].filter(Boolean).join(' '))
  const communityList = communitiesOf(rec?.district, rec?.subdistrict)

  return (
    <form onSubmit={save} className="space-y-4">
      {/* หัวรายการ = ปุ่มพับ/กางข้อมูลจากรายงาน
          ข้อมูลจากรายงานยาว 55 ช่อง ถ้ากางค้างไว้ต้องเลื่อนผ่านทุกครั้งกว่าจะถึงช่องกรอก
          จำสถานะไว้ใน localStorage ด้วย เพราะคนกรอกทีละหลายสิบรายการ ไม่ควรต้องพับใหม่ทุกครั้ง */}
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => setDetailOpen((v) => !v)}
          className="min-w-0 flex-1 text-left group">
          <p className="text-[11px] text-slate-400 flex items-center gap-1">
            <ChevronDown size={12} className={`transition ${detailOpen ? 'rotate-180' : ''}`} />
            {REPORT_GROUPS[rec.report_id]?.label} · ลำดับ {rec.seq}
            <span className="text-slate-300 group-hover:text-slate-500">
              {detailOpen ? '(คลิกเพื่อย่อ)' : '(คลิกเพื่อดูข้อมูลเต็ม)'}
            </span>
          </p>
          <p className="text-[15px] font-semibold text-slate-800 leading-snug">
            {fullName || place || rec.complaint_no}
          </p>
        </button>
        <button type="button" onClick={onClose} className="p-1 -mr-1 text-slate-400 hover:text-slate-700 shrink-0"><X size={18} /></button>
      </div>

      {/* ย่อแล้วยังต้องเห็นที่อยู่ — เป็นข้อมูลหลักที่ใช้ปักพิกัด */}
      {!detailOpen && (
        <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-[12px] text-slate-600 space-y-0.5">
          <p className="line-clamp-2">{place || '—'}</p>
          <p className="text-slate-400">{[rec.subdistrict, rec.district].filter(Boolean).join(' · ')}</p>
        </div>
      )}

      {detailOpen && <RecordDetail rec={rec} pii={pii} group={REPORT_GROUPS[rec.report_id]} />}

      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-slate-700">ข้อมูลที่กรอกเพิ่ม</h3>
        <button type="button" onClick={applySuggestions}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-slate-300 bg-white text-[11.5px] font-medium text-slate-600 hover:bg-slate-50 transition">
          <Wand2 size={13} /> เติมค่าที่เดาได้
        </button>
      </div>

      {/* พิกัด — บอกให้ชัดว่ารายการนี้ปักแล้วหรือยัง
          ค่าที่ปักไว้แล้วถูกโหลดมากรอกให้อัตโนมัติตั้งแต่เปิดรายการ (ดู useEffect ด้านบน) */}
      <div className="space-y-2">
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ${
          hasGeo ? 'bg-sky-50 ring-sky-200' : 'bg-rose-50 ring-rose-200'
        }`}>
          <MapPin size={14} className={hasGeo ? 'text-sky-600' : 'text-rose-600'} />
          <span className={`text-[12px] font-semibold ${hasGeo ? 'text-sky-800' : 'text-rose-700'}`}>
            {hasGeo ? 'ปักพิกัดแล้ว' : 'ยังไม่ได้ปักพิกัด'}
          </span>
          {hasGeo && (
            <button type="button" onClick={() => set({ lat: '', lng: '' })}
              className="ml-auto text-[11px] text-slate-500 hover:text-rose-600">ล้างพิกัด</button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ละติจูด" error={geoError && ' '}>
            <Input value={f.lat} inputMode="decimal" placeholder="13.7563"
              onChange={(e) => {
                // วางพิกัดที่ก๊อปจาก Google Maps ทั้งก้อน ("13.75, 100.50") ลงช่องเดียวได้เลย
                const pasted = parseLatLngPaste(e.target.value)
                if (pasted) set(pasted); else set({ lat: e.target.value })
              }} />
          </Field>
          <Field label="ลองจิจูด" error={geoError || undefined}>
            <Input value={f.lng} inputMode="decimal" placeholder="100.5018"
              onChange={(e) => {
                const pasted = parseLatLngPaste(e.target.value)
                if (pasted) set(pasted); else set({ lng: e.target.value })
              }} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-white border border-slate-300 text-[11.5px] font-medium text-slate-600 hover:bg-slate-50 transition">
            <MapPin size={13} /> หาที่อยู่นี้ใน Google Maps <ExternalLink size={11} className="text-slate-400" />
          </a>
          <span className="text-[11px] text-slate-400">ก๊อปพิกัดมาวางในช่องเดียวได้ ระบบแยกให้เอง</span>
        </div>
        <Field label="ที่มาของพิกัด">
          <Input value={f.geo_note} placeholder="เช่น ปักจาก Google Maps / ประมาณจากปากซอย"
            onChange={(e) => set({ geo_note: e.target.value })} />
        </Field>
      </div>

      {/* ชุมชน + NISPA */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="ชุมชน" hint="เลือกจากรายการหรือพิมพ์เอง">
          <Input list="rpt-community-list" value={f.community}
            onChange={(e) => set({ community: e.target.value })} placeholder="ชื่อชุมชน" />
          <datalist id="rpt-community-list">
            {communityList.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <Field label="เลขที่ / รหัส NISPA">
          <Input value={f.nispa_code} onChange={(e) => set({ nispa_code: e.target.value })} placeholder="—" />
        </Field>
      </div>

      {/* บก.น. / สน. / กลุ่มพื้นที่ */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="บก.น.">
          <Select options={BKN_OPTIONS} value={f.bkn}
            onChange={(e) => {
              // เปลี่ยน บก.น. แล้ว สน. เดิมอาจไม่อยู่ในสังกัดใหม่ — ล้างทิ้งกันข้อมูลขัดกันเอง
              const bkn = e.target.value
              const keep = !f.police_station || stationsOf(bkn).includes(f.police_station)
              set({ bkn, police_station: keep ? f.police_station : '' })
            }} />
        </Field>
        <Field label="สน." hint={f.bkn ? `เฉพาะใน ${f.bkn}` : 'ทั้ง 88 สน.'}>
          <Select options={stationsOf(f.bkn)} value={f.police_station}
            onChange={(e) => set({ police_station: e.target.value })} />
        </Field>
      </div>
      <Field label="กลุ่มพื้นที่">
        <Select options={AREA_GROUP_OPTIONS} value={f.area_group}
          onChange={(e) => set({ area_group: e.target.value })} />
      </Field>

      {/* ประเภทสถานที่ */}
      <Field label="ประเภทสถานที่">
        <Select options={PLACE_TYPE_OPTIONS} value={f.place_type}
          onChange={(e) => set({ place_type: e.target.value })} />
      </Field>
      {f.place_type === PLACE_TYPE_OTHER && (
        <Field label="ระบุประเภทสถานที่" required error={!String(f.place_type_other).trim() && 'ระบุประเภทสถานที่'}>
          <Input value={f.place_type_other} onChange={(e) => set({ place_type_other: e.target.value })} />
        </Field>
      )}

      {/* ประเภทบุคคล — ช่องสุดท้าย */}
      <div className="rounded-xl bg-white ring-1 ring-slate-200 p-3.5 space-y-3">
        <Field label="ประเภทบุคคล" hint="ผู้ถูกร้องเรียนเป็นประชาชนทั่วไป หรือเจ้าหน้าที่รัฐ">
          <div className="pt-1">
            <ChipGroup options={PERSON_CATEGORY_OPTIONS} value={f.person_category}
              onChange={(v) => set({ person_category: v, ...(v === 'เจ้าหน้าที่รัฐ' ? {} : { official_types: [], official_type_other: '' }) })} />
          </div>
        </Field>

        {f.person_category === 'เจ้าหน้าที่รัฐ' && (
          <>
            <Field label="เจ้าหน้าที่รัฐประเภทใด" hint="เลือกได้มากกว่า 1"
              error={f.official_types.length === 0 && 'เลือกอย่างน้อย 1 ประเภท'}>
              <div className="pt-1">
                <ChipGroup multi options={OFFICIAL_TYPE_OPTIONS} value={f.official_types}
                  onChange={(v) => set({ official_types: v })} />
              </div>
            </Field>
            {f.official_types.includes(OFFICIAL_TYPE_OTHER) && (
              <Field label="ระบุประเภทเจ้าหน้าที่รัฐ" required
                error={!String(f.official_type_other).trim() && 'ระบุประเภท'}>
                <Input value={f.official_type_other} placeholder="เช่น เจ้าหน้าที่ราชทัณฑ์"
                  onChange={(e) => set({ official_type_other: e.target.value })} />
              </Field>
            )}
          </>
        )}
      </div>

      <Field label="หมายเหตุ">
        <textarea rows={3} value={f.note} onChange={(e) => set({ note: e.target.value })}
          className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
      </Field>

      <Field label="สถานะการกรอก">
        <div className="pt-1">
          <ChipGroup options={['draft', 'done']} value={f.status}
            onChange={(v) => set({ status: v || 'draft' })} />
        </div>
        <span className="block text-[11px] text-slate-400">draft = กรอกค้างไว้ · done = กรอกครบแล้ว</span>
      </Field>

      <SaveBar status={status} onSave={save} disabled={!!geoError} />

      {/* ไล่กรอกทีละรายการ — บันทึกแล้วกระโดดไปรายการถัดไปในชุดที่กรองอยู่ */}
      {position && position.index >= 0 && (
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <button type="button" onClick={onPrev} disabled={!hasPrev || busyNav}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition">
            <ChevronLeft size={14} /> ก่อนหน้า
          </button>

          <span className="text-[11.5px] text-slate-400 tabular-nums">
            {position.index + 1} / {position.total.toLocaleString()}
          </span>

          <button type="button" onClick={saveAndNext} disabled={!hasNext || busyNav || !!geoError}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-slate-800 text-white text-[12px] font-semibold hover:bg-slate-900 disabled:opacity-30 transition">
            {busyNav ? <Loader2 size={14} className="animate-spin" /> : null}
            บันทึก + ถัดไป <ChevronRight size={14} />
          </button>
        </div>
      )}
    </form>
  )
}

// ── หน้าหลัก ───────────────────────────────────────────────────────────────
export default function RptFieldEntry() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [selected, setSelected] = useState(null)

  const [reportIds, setReportIds] = useState([])
  const [district, setDistrict] = useState('')
  const [entryStatus, setEntryStatus] = useState('')
  const [period, setPeriod] = useState('')
  const [geoFilter, setGeoFilter] = useState(null)   // null = ทั้งหมด | true = มีพิกัด | false = ยังไม่มี
  const [periodOptions, setPeriodOptions] = useState([])
  const [q, setQ] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // โหลดรายการ — หน่วงพิมพ์ 350ms (ยิง RPC ทุกตัวอักษรจะช้าและเปลืองโควตา)
  // ทิ้งผลของคำขอเก่าถ้าตัวกรองเปลี่ยนก่อนได้ผลกลับมา
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true); setError(null)
      try {
        const { rows: data, total: n } = await listEntries(
          { reportIds, district, status: entryStatus, q, period, hasGeo: geoFilter }, { offset: 0 })
        if (!cancelled) { setRows(data); setTotal(n) }
      } catch (e) {
        // error ≠ ไม่มีข้อมูล — ต้องขึ้นเป็นข้อผิดพลาด ไม่ใช่ตารางว่าง
        if (!cancelled) { setError(e.message); setRows([]); setTotal(0) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [reportIds, district, entryStatus, q, period, geoFilter, reloadKey])

  // รายชื่อชุมชนสำหรับ datalist — ไฟล์ GeoJSON ก่อน แล้วเติมจากข้อมูลจริงในฐานเมื่อโหลดเสร็จ
  const [area, setArea] = useState({ subdistricts: {}, communities: {} })
  useEffect(() => {
    let cancelled = false
    loadAreaOptions().then((a) => {
      if (cancelled) return
      setArea(a)
      loadCommunitiesFromData().then((db) => {
        if (!cancelled) setArea({ subdistricts: a.subdistricts, communities: mergeCommunities(a.communities, db) })
      })
    })
    return () => { cancelled = true }
  }, [])
  // ตัวเลือก "ช่วงข้อมูล" เอาจากงวดที่มีอยู่จริงในระบบ (อัปสะสมได้หลายงวด)
  useEffect(() => {
    let cancelled = false
    importStatus()
      .then((st) => {
        if (cancelled) return
        const all = [...new Set(Object.values(st).flatMap((x) => x.periods || []))].sort()
        setPeriodOptions(all)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [reloadKey])

  const communitiesOf = useCallback(
    (d, s) => area.communities[`${d}|${s}`] || area.communities[`${d}|`] || [],
    [area],
  )

  const filterLabel = [
    reportIds.length ? reportIds.map((id) => REPORT_GROUPS[id].short).join(', ') : 'ทุกรายงาน',
    district || 'ทุกเขต',
    entryStatus ? STATUS_LABELS[entryStatus] : 'ทุกสถานะ',
    period || 'ทุกช่วงข้อมูล',
    geoFilter === true ? 'เฉพาะที่มีพิกัดแล้ว' : geoFilter === false ? 'เฉพาะที่ยังไม่มีพิกัด' : null,
    q && `ค้นหา "${q}"`,
  ].filter(Boolean).join(' · ')

  // โหลดหน้าถัดไปต่อท้าย — ปุ่มนี้โผล่เมื่อยังโหลดไม่ครบตามตัวกรอง
  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const { rows: more, total: n } = await listEntries(
        { reportIds, district, status: entryStatus, q, period, hasGeo: geoFilter }, { offset: rows.length })
      const merged = [...rows, ...more]
      setRows(merged)
      setTotal(n)
      return merged                      // ปุ่ม "ถัดไป" ใช้ค่านี้ข้ามไปรายการแรกของหน้าถัดไป
    } catch (e) {
      setError(e.message)
      return rows
    } finally {
      setLoadingMore(false)
    }
  }, [reportIds, district, entryStatus, q, period, geoFilter, rows])

  // ส่งออก — ดึงครบทุกแถวตามตัวกรอง (ไม่ใช่แค่ที่โหลดไว้) และบันทึก audit ก่อนดาวน์โหลด
  const runExport = useCallback(async () => {
    setExporting(true)
    try {
      await exportEntries({ reportIds, district, status: entryStatus, q, period, hasGeo: geoFilter },
        { filterLabel, period: period || rows[0]?.period_label })
    } catch (e) {
      setError(e.message)
    } finally {
      setExporting(false)
    }
  }, [reportIds, district, entryStatus, q, period, geoFilter, filterLabel, rows])

  const counts = useMemo(() => {
    const c = { total: rows.length, empty: 0, draft: 0, done: 0, geo: 0, pending: 0 }
    for (const r of rows) {
      c[r.entry_status] = (c[r.entry_status] || 0) + 1
      if (r.lat != null) c.geo++
      if (!isResultReceived(r)) c.pending++
    }
    return c
  }, [rows])

  // อัปเดตแถวในตารางทันทีหลังบันทึก — ไม่ต้องโหลดรายการใหม่ทั้งชุด
  const onSaved = useCallback((uid, saved) => {
    setRows((rs) => rs.map((r) => (r.record_uid === uid ? {
      ...r,
      entry_status: saved?.status || 'draft',
      lat: saved?.lat ?? null, lng: saved?.lng ?? null,
      community: saved?.community ?? null, nispa_code: saved?.nispa_code ?? null,
      bkn: saved?.bkn ?? null, police_station: saved?.police_station ?? null,
      area_group: saved?.area_group ?? null, place_type: saved?.place_type ?? null,
      person_category: saved?.person_category ?? null, official_types: saved?.official_types || [],
    } : r)))
  }, [])

  // ── เลื่อนไปรายการก่อนหน้า/ถัดไป ────────────────────────────────────────
  // ไล่กรอกทีละรายการโดยไม่ต้องกลับไปคลิกในตาราง
  // ถ้าถึงท้ายรายการที่โหลดไว้แต่ยังมีต่อ ให้โหลดหน้าถัดไปแล้วไปต่อให้เลย
  const selIndex = rows.findIndex((r) => r.record_uid === selected)
  const hasPrev = selIndex > 0
  const hasNext = selIndex >= 0 && (selIndex + 1 < rows.length || rows.length < total)

  const goRelative = useCallback(async (delta) => {
    const i = rows.findIndex((r) => r.record_uid === selected)
    if (i < 0) return
    const target = i + delta
    if (target < 0) return
    if (target < rows.length) { setSelected(rows[target].record_uid); return }
    if (rows.length >= total) return
    const merged = await loadMore()
    if (merged[target]) setSelected(merged[target].record_uid)
  }, [rows, selected, total, loadMore])

  // เปลี่ยนรายการแล้วเลื่อนแผงขวากลับขึ้นบน ไม่งั้นจะค้างอยู่กลางฟอร์มของรายการก่อน
  const panelRef = useRef(null)
  useEffect(() => { panelRef.current?.scrollTo({ top: 0 }) }, [selected])

  const toggleReport = (id) =>
    setReportIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-5 bg-[#f6f7f9] min-h-screen">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">กรอกข้อมูลภาคสนาม — เรื่องร้องเรียน ปปส.</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          รายงาน RPT_73 (รายบุคคล) และ RPT_111 (รายพื้นที่) · เติมพิกัด ชุมชน NISPA บก.น. สน. กลุ่มพื้นที่ ประเภทสถานที่ และประเภทบุคคล
        </p>
      </header>

      {/* แถบเครื่องมือ */}
      <Card className="!p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <span className="block text-xs font-medium text-slate-600 mb-1">ค้นหา</span>
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="เลขที่ร้องเรียน / ชื่อ / ฉายา / ที่อยู่"
                className="w-full h-9 pl-8 pr-2.5 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>
          <div className="w-[170px]">
            <span className="block text-xs font-medium text-slate-600 mb-1">เขต</span>
            <Select options={DISTRICTS} value={district} placeholder="ทุกเขต" onChange={(e) => setDistrict(e.target.value)} />
          </div>
          <div className="w-[190px]">
            <span className="block text-xs font-medium text-slate-600 mb-1">ช่วงข้อมูล</span>
            <Select options={periodOptions} value={period} placeholder="ทุกช่วง"
              onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="w-[150px]">
            <span className="block text-xs font-medium text-slate-600 mb-1">สถานะกรอก</span>
            <Select options={Object.entries(STATUS_LABELS).map(([v, l]) => [v, l])} value={entryStatus}
              placeholder="ทุกสถานะ" onChange={(e) => setEntryStatus(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 transition">
              <Upload size={15} /> นำเข้ารายงาน
            </button>
            <button onClick={reload} title="โหลดใหม่"
              className="h-9 w-9 grid place-items-center rounded-lg border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 transition">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={runExport} disabled={!total || exporting}
              title="ส่งออกทุกแถวตามตัวกรอง — มีการบันทึกประวัติผู้ส่งออก"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition">
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {exporting ? 'กำลังส่งออก...' : 'Excel'}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {REPORT_ORDER.map((id) => {
            const on = reportIds.includes(id)
            return (
              <button key={id} onClick={() => toggleReport(id)}
                className={`h-7 px-2.5 rounded-full text-[11.5px] font-medium ring-1 transition ${
                  on ? 'bg-slate-800 text-white ring-slate-800' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                }`}>
                {REPORT_GROUPS[id].short}
              </button>
            )
          })}
          {reportIds.length > 0 && (
            <button onClick={() => setReportIds([])} className="h-7 px-2 text-[11.5px] text-slate-400 hover:text-slate-700">ล้าง</button>
          )}

          {/* สวิตช์ดูเฉพาะที่ยังไม่ได้ปักพิกัด — ใช้ไล่กรอกให้ครบทีละรายการ */}
          <div className="ml-auto inline-flex rounded-lg ring-1 ring-slate-300 overflow-hidden bg-white">
            {[
              [null, 'ทั้งหมด'],
              [true, 'มีพิกัดแล้ว'],
              [false, 'ยังไม่มีพิกัด'],
            ].map(([v, label]) => (
              <button key={String(v)} onClick={() => setGeoFilter(v)}
                className={`h-7 px-2.5 text-[11.5px] font-medium transition border-r border-slate-200 last:border-0 ${
                  geoFilter === v
                    ? (v === false ? 'bg-rose-600 text-white' : v === true ? 'bg-sky-600 text-white' : 'bg-slate-700 text-white')
                    : 'text-slate-600 hover:bg-slate-50'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* สรุปตัวเลข */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          ['ทั้งหมด', total, 'text-slate-800', false],
          ['ยังไม่กรอก', counts.empty, 'text-slate-500', true],
          ['กรอกค้าง', counts.draft, 'text-amber-600', true],
          ['กรอกครบ', counts.done, 'text-emerald-600', true],
          ['มีพิกัดแล้ว', counts.geo, 'text-blue-600', true],
          ['ยังไม่ได้รับผล', counts.pending, 'text-rose-600', true],
        ].map(([label, n, color, partial]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3.5">
            <p className="text-[11.5px] text-slate-400">{label}</p>
            <p className={`text-xl font-semibold tabular-nums ${color}`}>{n.toLocaleString()}</p>
            {/* นับจากแถวที่โหลดมาแล้วเท่านั้น — บอกให้ชัด จะได้ไม่เข้าใจผิดว่าเป็นยอดรวมทั้งชุด */}
            {partial && rows.length < total && (
              <p className="text-[10px] text-slate-400 mt-0.5">จาก {rows.length.toLocaleString()} ที่โหลดแล้ว</p>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 p-4 flex items-start gap-2">
          <AlertTriangle size={17} className="text-rose-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-rose-800">{error}</p>
            <p className="text-[12px] text-rose-600 mt-0.5">ถ้ายังไม่เคยนำเข้าข้อมูล ให้กด “นำเข้ารายงาน” ก่อน</p>
          </div>
        </div>
      )}

      <div className="flex gap-4 items-start">
        {/* ตาราง */}
        <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-left text-slate-500">
                  {['รายงาน', 'เลขที่ร้องเรียน', 'แหล่งข่าว', 'ชื่อ / สถานที่', 'เลขบัตร',
                    'แขวง', 'เขต', 'สถานะผล', 'ผลตรวจสอบ', 'ผลดำเนินงาน', 'พิกัด', 'บก.น. / สน.',
                    'สถานะกรอก'].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-medium whitespace-nowrap border-b border-slate-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={13} className="px-3 py-12 text-center text-slate-400">
                    <Loader2 size={20} className="animate-spin inline" />
                  </td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={13} className="px-3 py-12 text-center text-slate-400 text-[13px]">
                    ไม่มีรายการตามตัวกรองนี้
                  </td></tr>
                )}
                {!loading && rows.map((r) => {
                  const received = isResultReceived(r)
                  return (
                  <tr key={r.record_uid} onClick={() => setSelected(r.record_uid)}
                    className={`cursor-pointer border-b border-slate-100 transition ${
                      selected === r.record_uid ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{REPORT_GROUPS[r.report_id]?.short || r.report_id}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-slate-700">{r.complaint_no}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{r.source || '—'}</td>
                    <td className="px-3 py-2 max-w-[260px] truncate text-slate-800" title={r.full_name || r.addr_detail || ''}>
                      {r.full_name || r.addr_detail || '—'}
                    </td>
                    {/* รายการเป็นการดึงหลายร้อยแถวพร้อมกัน จึงโชว์แบบปิดบัง
                        เปิดรายตัวเห็นเลขเต็ม และมีบันทึกว่าใครเปิดดู */}
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-slate-500">{r.national_id_masked || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{r.subdistrict || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{r.district || '—'}</td>
                    {/* ยังไม่ได้รับผล = ข้อมูลพฤติการณ์จะยังว่าง ต้องเห็นชัดว่าแถวไหนรออยู่ */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {received
                        ? <span className="text-sky-700 font-semibold">ได้รับผล</span>
                        : <span className="text-rose-600 font-semibold">ยังไม่ได้รับผล</span>}
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap ${received ? 'text-sky-700' : 'text-rose-600 font-medium'}`}>
                      {received ? r.result_behavior : 'รอผลตรวจสอบ'}
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap ${received ? 'text-slate-600' : 'text-rose-400'}`}>
                      {r.result_operation && r.result_operation !== '-' ? r.result_operation : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.lat != null
                        ? (
                          <span className="inline-flex items-center gap-1 text-sky-700 tabular-nums"
                            title={`${r.lat}, ${r.lng}`}>
                            <MapPin size={12} />{Number(r.lat).toFixed(4)}, {Number(r.lng).toFixed(4)}
                          </span>
                        )
                        : <span className="text-rose-600 font-medium">ยังไม่มีพิกัด</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                      {[r.bkn, r.police_station && `สน.${r.police_station}`].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap"><StatusPill status={r.entry_status} /></td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {!loading && rows.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-t border-slate-200 bg-slate-50">
              <span className="text-[11.5px] text-slate-500 tabular-nums">
                แสดง {rows.length.toLocaleString()} จาก {total.toLocaleString()} รายการ
              </span>
              {rows.length < total && (
                <button onClick={loadMore} disabled={loadingMore}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg border border-slate-300 bg-white text-[11.5px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition">
                  {loadingMore && <Loader2 size={12} className="animate-spin" />}
                  โหลดเพิ่มอีก {Math.min(PAGE_SIZE, total - rows.length).toLocaleString()} รายการ
                </button>
              )}
            </div>
          )}
        </div>

        {/* แผงกรอกข้อมูล */}
        {selected && (
          <aside ref={panelRef}
            className="w-[460px] shrink-0 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
            <EntryForm key={selected} recordUid={selected} onSaved={onSaved}
              onClose={() => setSelected(null)} communitiesOf={communitiesOf}
              position={{ index: selIndex, total }}
              hasPrev={hasPrev} hasNext={hasNext} busyNav={loadingMore}
              onPrev={() => goRelative(-1)} onNext={() => goRelative(1)} />
          </aside>
        )}
      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={reload} />}
    </div>
  )
}
