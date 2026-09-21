// ImportDataModal — นำเข้าไฟล์ Excel/CSV ของผู้ใช้มาเป็น data overlay ของ /pixel-map
// ไฟล์ถูกอ่านในเบราว์เซอร์อย่างเดียว ไม่อัปโหลดขึ้น Supabase — ข้อมูลอยู่แค่ใน layer ของหน้านี้
// จับคู่ชื่อเขตอัตโนมัติ (เติม "เขต" ให้/แก้ตัวสะกดราษฏร์บูรณะ) แล้วโชว์สรุปก่อนยืนยันเสมอ
import { useCallback, useMemo, useRef, useState } from 'react'
import { Upload, FileSpreadsheet, AlertTriangle, Loader2 } from 'lucide-react'
import Modal from '../Modal'
import {
  readImportFile, detectColumns, buildCounts, layerLabelFromFile,
  ACCEPT_IMPORT, DISTRICT_TOTAL,
} from '../../utils/pixelMapImport'

const COUNT_ROWS = '__count__' // ค่าของตัวเลือก "นับจำนวนแถว" ในช่องค่าที่ใช้

function Select({ label, value, onChange, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-2 rounded-lg ring-1 ring-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-violet-500">
        {children}
      </select>
    </label>
  )
}

export default function ImportDataModal({ open, onClose, onConfirm, replacingLabel }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [file, setFile] = useState(null)     // { fileName, sheets: [{ name, headers, rows }] }
  const [sheetIdx, setSheetIdx] = useState(0)
  const [districtCol, setDistrictCol] = useState('')
  const [valueCol, setValueCol] = useState(COUNT_ROWS)

  const reset = useCallback(() => {
    setBusy(false); setError(''); setFile(null); setSheetIdx(0); setDistrictCol(''); setValueCol(COUNT_ROWS)
    if (inputRef.current) inputRef.current.value = ''
  }, [])
  const close = useCallback(() => { reset(); onClose?.() }, [reset, onClose])

  const applySheet = useCallback((sheets, idx) => {
    const sheet = sheets[idx]
    const guess = detectColumns(sheet)
    setSheetIdx(idx)
    setDistrictCol(guess.districtCol ?? sheet.headers[0] ?? '')
    setValueCol(guess.valueCol ?? COUNT_ROWS)
  }, [])

  const handleFile = useCallback(async (e) => {
    const picked = e.target.files?.[0]
    if (!picked) return
    setBusy(true); setError(''); setFile(null)
    try {
      const parsed = await readImportFile(picked)
      setFile(parsed)
      applySheet(parsed.sheets, 0)
    } catch (err) {
      setError(err?.message || 'อ่านไฟล์ไม่สำเร็จ')
      if (inputRef.current) inputRef.current.value = ''
    } finally {
      setBusy(false)
    }
  }, [applySheet])

  const sheet = file?.sheets[sheetIdx] ?? null
  const result = useMemo(() => {
    if (!sheet || !districtCol) return null
    return buildCounts(sheet.rows, { districtCol, valueCol: valueCol === COUNT_ROWS ? null : valueCol })
  }, [sheet, districtCol, valueCol])

  const top = useMemo(() => (
    result ? Object.entries(result.counts).sort((a, b) => b[1] - a[1]).slice(0, 5) : []
  ), [result])

  const confirm = () => {
    if (!result || !sheet) return
    onConfirm?.({
      label: layerLabelFromFile(file.fileName, sheet.name, file.sheets.length > 1),
      counts: result.counts,
      max: result.max,
      meta: {
        fileName: file.fileName,
        sheetName: sheet.name,
        districtCol,
        valueCol: valueCol === COUNT_ROWS ? null : valueCol,
        districtCount: result.districtCount,
        usedRows: result.usedRows,
        total: result.total,
        unmatchedCount: result.unmatched.length,
      },
    })
    reset()
  }

  return (
    <Modal open={open} onClose={close} size="xl"
      title={replacingLabel ? `เปลี่ยนไฟล์ของ ${replacingLabel}` : 'นำเข้าข้อมูลจากไฟล์'}
      icon={<FileSpreadsheet size={18} />}
      actions={
        <>
          <button type="button" onClick={close}
            className="h-10 px-4 rounded-lg ring-1 ring-slate-200 text-sm font-medium text-slate-600 hover:bg-white">ยกเลิก</button>
          <button type="button" onClick={confirm} disabled={!result || result.districtCount === 0}
            className="h-10 px-5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {replacingLabel ? 'ใช้ไฟล์นี้' : 'เพิ่มเป็น layer'}
          </button>
        </>
      }>
      <div className="space-y-4">
        <div>
          <input ref={inputRef} type="file" accept={ACCEPT_IMPORT} onChange={handleFile} className="hidden" id="pixelmap-import-file" />
          <label htmlFor="pixelmap-import-file"
            className="flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed border-slate-300 text-sm font-medium text-slate-600 cursor-pointer hover:border-violet-400 hover:bg-violet-50/40 transition">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {busy ? 'กำลังอ่านไฟล์…' : file ? file.fileName : 'เลือกไฟล์ Excel (.xlsx/.xls) หรือ CSV'}
          </label>
          <p className="mt-1.5 text-[11px] text-slate-400">
            ไฟล์ต้องมีคอลัมน์ชื่อเขต กทม. (พิมพ์ &quot;ดอนเมือง&quot; หรือ &quot;เขตดอนเมือง&quot; ก็ได้) — อ่านในเครื่องเท่านั้น ไม่ถูกอัปโหลดขึ้นระบบ
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-xs text-rose-700">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />{error}
          </div>
        )}

        {sheet && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {file.sheets.length > 1 && (
                <Select label="ชีท" value={String(sheetIdx)} onChange={(v) => applySheet(file.sheets, Number(v))}>
                  {file.sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
                </Select>
              )}
              <Select label="คอลัมน์ชื่อเขต" value={districtCol} onChange={setDistrictCol}>
                {sheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
              <Select label="ค่าที่ใช้" value={valueCol} onChange={setValueCol}>
                <option value={COUNT_ROWS}>นับจำนวนแถว</option>
                {sheet.headers.filter((h) => h !== districtCol).map((h) => <option key={h} value={h}>รวมค่าใน &quot;{h}&quot;</option>)}
              </Select>
            </div>

            {result && (
              <div className="rounded-xl ring-1 ring-slate-200 divide-y divide-slate-100">
                <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
                  <div className="px-3 py-2.5">
                    <div className="text-lg font-bold text-slate-900 tabular-nums">{result.districtCount}<span className="text-xs font-medium text-slate-400">/{DISTRICT_TOTAL}</span></div>
                    <div className="text-[11px] text-slate-500">เขตที่จับคู่ได้</div>
                  </div>
                  <div className="px-3 py-2.5">
                    <div className="text-lg font-bold text-slate-900 tabular-nums">{result.usedRows.toLocaleString()}</div>
                    <div className="text-[11px] text-slate-500">แถวที่ใช้</div>
                  </div>
                  <div className="px-3 py-2.5">
                    <div className="text-lg font-bold text-slate-900 tabular-nums">{result.total.toLocaleString()}</div>
                    <div className="text-[11px] text-slate-500">ค่ารวม</div>
                  </div>
                </div>

                {top.length > 0 && (
                  <div className="px-3 py-2.5 space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">ตัวอย่าง 5 อันดับแรก</div>
                    {top.map(([d, v]) => (
                      <div key={d} className="flex items-center justify-between text-xs text-slate-600">
                        <span className="truncate">{d}</span>
                        <span className="tabular-nums font-medium text-slate-800">{v.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {result.districtCount === 0 && (
                  <div className="flex items-start gap-2 px-3 py-2.5 text-xs text-rose-700 bg-rose-50">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    จับคู่ชื่อเขตไม่ได้เลย — ลองเปลี่ยน &quot;คอลัมน์ชื่อเขต&quot; ให้ตรงกับคอลัมน์ที่เก็บชื่อเขต
                  </div>
                )}

                {result.unmatched.length > 0 && (
                  <div className="px-3 py-2.5 text-[11px] text-amber-700 bg-amber-50/60">
                    <div className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle size={13} /> ข้ามชื่อที่ไม่ใช่เขต กทม. {result.unmatched.length} ชื่อ
                    </div>
                    <div className="mt-1 text-amber-600">
                      {result.unmatched.slice(0, 8).map((u) => `${u.name} (${u.rows})`).join(' · ')}
                      {result.unmatched.length > 8 && ' …'}
                    </div>
                  </div>
                )}

                {result.skippedValueRows > 0 && (
                  <div className="px-3 py-2 text-[11px] text-slate-500">
                    ข้าม {result.skippedValueRows.toLocaleString()} แถวที่คอลัมน์ค่าไม่ใช่ตัวเลข
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
