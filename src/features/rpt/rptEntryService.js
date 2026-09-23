import { supabase } from '../../shared/data/supabase.js'
import { parseRptWorkbook, splitRecord, REPORT_GROUPS } from './rptParser.js'
import { downloadBlob, XLSX_MIME } from '../../shared/export/downloadBlob.js'
import { buildExportWorkbook } from './rptExportSheet.js'

// rptEntryService — คุยกับฐานข้อมูลให้หน้า /rpt-entry
// ทุกอย่างวิ่งผ่าน RPC ที่ตรวจ is_admin() ฝั่งเซิร์ฟเวอร์ (ดู 20260918_rpt_field_entry.sql)
// ฝั่งนี้จึงไม่มีการตัดสินใจเรื่องสิทธิ์เอง — แค่ส่งข้อมูลกับแปลง error ให้อ่านรู้เรื่อง

// ส่งทีละก้อน — 1,066 แถวยัดใน request เดียวได้ แต่ถ้าวันหน้ารายงานยาวขึ้นจะชน payload limit
const IMPORT_CHUNK = 250

function friendlyError(error, fallback) {
  if (!error) return fallback
  const msg = String(error.message || error)
  if (/forbidden|42501/i.test(msg)) return 'ต้องเป็นผู้ดูแลระบบจึงจะใช้หน้านี้ได้'
  if (/rpt_entry_latlng_bkk/i.test(msg)) return 'พิกัดอยู่นอกกรุงเทพฯ — ตรวจว่าละติจูด/ลองจิจูดสลับกันหรือไม่'
  if (/rpt_entry_person_category/i.test(msg)) return 'ประเภทบุคคลต้องเป็น "ทั่วไป" หรือ "เจ้าหน้าที่รัฐ"'
  if (/does not exist|schema cache/i.test(msg)) return 'ยังไม่ได้รันไฟล์ migration 20260918_rpt_field_entry.sql บนฐานข้อมูล'
  return `${fallback}: ${msg}`
}

/**
 * อ่านไฟล์รายงานแล้วนำเข้าฐานข้อมูล
 * @param {File} file
 * @param {(msg: string) => void} [onProgress]
 * @param {string} [expectReportId] ถ้าระบุ = ไฟล์ต้องเป็นรายงานกลุ่มนี้เท่านั้น
 */
export async function importRptFile(file, onProgress, expectReportId = null) {
  const buf = await file.arrayBuffer()
  const parsed = parseRptWorkbook(buf, file.name)

  // กันใส่ไฟล์ผิดช่อง — เช่นเอาไฟล์กลุ่ม 3 มาใส่ช่องกลุ่ม 1
  // ถ้าปล่อยผ่าน ข้อมูลจะเข้าถูกกลุ่มตาม Report ID ก็จริง แต่คนกรอกจะเข้าใจผิดว่าอัปครบแล้ว
  if (expectReportId && parsed.reportId !== expectReportId) {
    const got = REPORT_GROUPS[parsed.reportId]
    const want = REPORT_GROUPS[expectReportId]
    throw new Error(
      `ไฟล์นี้เป็นรายงาน "กลุ่ม ${got?.no} ${got?.title}" (${parsed.reportId}) ` +
      `แต่ช่องที่เลือกคือ "กลุ่ม ${want?.no} ${want?.title}" — ไฟล์ที่ต้องใช้คือ ${want?.file}.XLSX`,
    )
  }

  const rows = parsed.records.map((r) => splitRecord(r))

  let imported = 0
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
    const chunk = rows.slice(i, i + IMPORT_CHUNK)
    const { data, error } = await supabase.rpc('rpt_import_batch', { p_rows: chunk })
    if (error) throw new Error(friendlyError(error, `นำเข้า ${file.name} ไม่สำเร็จ`))
    imported += data?.records || chunk.length
    onProgress?.(`${parsed.group.label} — ${Math.min(i + IMPORT_CHUNK, rows.length)}/${rows.length}`)
  }

  // บันทึกประวัติครั้งเดียวต่อไฟล์ (rpt_import_batch ถูกเรียกหลายครั้งเพราะแบ่งส่งทีละก้อน)
  // ประวัติล้มไม่ควรทำให้การนำเข้าที่สำเร็จแล้วกลายเป็น error — แค่เตือนไว้
  try {
    await supabase.rpc('rpt_import_finish', {
      p_report_id: parsed.reportId,
      p_file_name: file.name,
      p_title: parsed.title,
      p_period: parsed.params.period,
      p_printed_at: parsed.records[0]?.printed_at || null,
      p_rows: imported,
    })
  } catch (e) {
    parsed.warnings.push(`บันทึกประวัติการอัปโหลดไม่สำเร็จ: ${e.message}`)
  }

  return {
    fileName: file.name,
    reportId: parsed.reportId,
    title: parsed.title,          // หัวรายงานที่อ่านได้จากไฟล์ (null = ไฟล์ไม่มี)
    group: parsed.group,
    params: parsed.params,
    imported,
    warnings: parsed.warnings,
    stats: parsed.stats,
  }
}

// จำนวนแถวต่อคำขอ — ฝั่งฐานข้อมูลจำกัดเพดานไว้ที่ 1,000 อยู่แล้ว
// แบ่งหน้าเพื่อไม่ให้คำขอเดียวดูดชื่อ+ที่อยู่ของทุกคนออกไปพร้อมกัน
export const PAGE_SIZE = 500

// สถานะการนำเข้ารายกลุ่ม — ใช้ให้หน้านำเข้าบอกได้ว่ากลุ่มไหนอัปแล้ว/ยังขาด
export async function importStatus() {
  const { data, error } = await supabase.rpc('rpt_import_status')
  if (error) throw new Error(friendlyError(error, 'อ่านสถานะการนำเข้าไม่สำเร็จ'))
  // แปลงเป็น map ให้หน้าจอหยิบตาม report_id ได้ตรง ๆ
  return Object.fromEntries((data || []).map((r) => [r.report_id, r]))
}

/**
 * ล้างข้อมูลที่นำเข้า — ระบุ reportId = เฉพาะกลุ่มนั้น, ไม่ระบุ = ทั้งหมด
 * ⚠️ ลบแล้วกู้ไม่ได้ และช่องที่กรอกเองของกลุ่มนั้นหายไปด้วย (cascade)
 *    ผู้เรียกต้องยืนยันกับผู้ใช้ก่อนเสมอ
 * @returns {{records:number, field_entries:number}} จำนวนที่ลบจริง
 */
export async function deleteRecords(reportId = null) {
  const { data, error } = await supabase.rpc('rpt_delete_records', { p_report_id: reportId })
  if (error) throw new Error(friendlyError(error, 'ล้างข้อมูลไม่สำเร็จ'))
  return data || { records: 0, field_entries: 0 }
}

// ประวัติการอัปโหลดล่าสุด — ใช้แสดงว่าเคยอัปไฟล์อะไรไปแล้วบ้าง
export async function importHistory(limit = 50) {
  const { data, error } = await supabase.rpc('rpt_import_history', { p_limit: limit })
  if (error) throw new Error(friendlyError(error, 'อ่านประวัติการอัปโหลดไม่สำเร็จ'))
  return data || []
}

export async function listEntries(
  { reportIds = null, district = null, status = null, q = null, period = null, hasGeo = null } = {},
  { limit = PAGE_SIZE, offset = 0 } = {},
) {
  const { data, error } = await supabase.rpc('rpt_entry_list', {
    p_report_ids: reportIds?.length ? reportIds : null,
    p_district: district || null,
    p_status: status || null,
    p_q: q || null,
    p_period: period || null,
    p_has_geo: hasGeo,            // null = ทั้งหมด, true/false = กรอง
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw new Error(friendlyError(error, 'โหลดรายการไม่สำเร็จ'))
  const rows = data || []
  // total_count มากับทุกแถว (window function) — ไม่มีแถว = ไม่มีผลลัพธ์
  return { rows, total: rows[0]?.total_count ?? 0 }
}

// เปิดดูรายตัว — คืนข้อมูลครบทุกช่องรวมเลขบัตรเต็ม
// ฝั่งเซิร์ฟเวอร์บันทึก audit ทุกครั้งว่าใครเปิดดูแถวไหน
export async function getEntry(recordUid) {
  const { data, error } = await supabase.rpc('rpt_entry_get', { p_record_uid: recordUid })
  if (error) throw new Error(friendlyError(error, 'เปิดรายการไม่สำเร็จ'))
  return data
}

export async function saveEntry(recordUid, entry) {
  const { data, error } = await supabase.rpc('rpt_entry_save', {
    p_record_uid: recordUid,
    p_entry: entry,
  })
  if (error) throw new Error(friendlyError(error, 'บันทึกไม่สำเร็จ'))
  return data
}

// ── ส่งออก Excel ───────────────────────────────────────────────────────────
/**
 * ส่งออก Excel — ครบทุกช่องตามหัวรายงาน + ช่องที่ต้องกรอกพร้อม dropdown
 * ⚠️ ฝั่งฐานข้อมูลบันทึก audit ก่อนคืนข้อมูลเสมอ (ดู rpt_export_rows)
 *    ถ้าเขียน audit ไม่สำเร็จ ธุรกรรมล้ม ข้อมูลไม่ออกจากระบบ
 */
export async function exportEntries(filters = {}, meta = {}) {
  const { data, error } = await supabase.rpc('rpt_export_rows', {
    p_report_ids: filters.reportIds?.length ? filters.reportIds : null,
    p_district: filters.district || null,
    p_status: filters.status || null,
    p_q: filters.q || null,
    p_period: filters.period || null,
    p_has_geo: filters.hasGeo ?? null,
    p_filter_label: meta.filterLabel || null,
  })
  if (error) throw new Error(friendlyError(error, 'ส่งออกไม่สำเร็จ'))

  const rows = data || []
  const buf = await buildExportWorkbook(rows, meta)
  downloadBlob(new Blob([buf], { type: XLSX_MIME }),
    `rpt-field-entry-${new Date().toISOString().slice(0, 10)}.xlsx`)
  return rows.length
}
