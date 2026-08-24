import { supabase } from '../lib/supabase'
import { flattenSubstanceUserRow } from './importEngine'

const UPSERT_BATCH = 500

// คอลัมน์ metadata จาก buildBatch ที่ไม่มีในตาราง DB (ยกเว้น record_uid)
const STRIP_COLS = new Set(['batch_id', 'source_file', 'row_index'])

/**
 * เขียนข้อมูลเข้า Supabase โดย upsert ทีละ 500 แถว
 * ถ้า batch ไหน fail จะรายงานแต่ไม่หยุดทั้งงาน
 * คืน { inserted, updated, failed, error }
 */
export async function upsertRecords(type, rows, batchInfo) {
  const tableName = type === 'drug_incidents' ? 'drug_incidents' : 'complaints'

  // ตัด metadata ออก เหลือแค่ข้อมูลจริงและ record_uid
  const cleanRows = rows.map(r => {
    const obj = {}
    for (const [k, v] of Object.entries(r)) {
      if (!STRIP_COLS.has(k)) obj[k] = v
    }
    return obj
  })

  let inserted = 0
  let updated = 0
  let failed = 0
  let lastError = null

  for (let i = 0; i < cleanRows.length; i += UPSERT_BATCH) {
    const batch = cleanRows.slice(i, i + UPSERT_BATCH)

    try {
      // ตรวจว่า record_uid ไหนมีอยู่แล้วเพื่อแยกนับ insert vs update
      const uids = batch.map(r => r.record_uid).filter(Boolean)
      const { data: existing } = await supabase
        .from(tableName)
        .select('record_uid')
        .in('record_uid', uids)

      const existingSet = new Set((existing || []).map(r => r.record_uid))

      const { error } = await supabase
        .from(tableName)
        .upsert(batch, { onConflict: 'record_uid' })

      if (error) throw error

      inserted += batch.filter(r => !existingSet.has(r.record_uid)).length
      updated  += batch.filter(r =>  existingSet.has(r.record_uid)).length
    } catch (err) {
      failed += batch.length
      lastError = err.message
    }
  }

  let batchLogError = null
  try {
    const { error: logErr } = await supabase.from('upload_batches').insert([{
      batch_id:     batchInfo.batchId,
      target_table: tableName,
      file_name:    batchInfo.fileName,
      row_count:    rows.length,
      status:       failed === 0 ? 'completed' : failed === rows.length ? 'failed' : 'partial',
      uploaded_at:  new Date().toISOString(),
    }])
    if (logErr) batchLogError = logErr.message
  } catch (err) {
    batchLogError = err.message
  }

  return { inserted, updated, failed, error: lastError, batchLogError }
}

/**
 * Upsert เหตุการณ์ยาเสพติด (wide one-hot schema) เข้า drug_incidents
 * rows = output จาก parseDrugIncidents (คอลัมน์ตรง schema + content_hash, ไม่มี PII)
 * natural key = content_hash (idempotent: อัปไฟล์เดิมซ้ำ = UPDATE ทับ ไม่ append)
 *   (ต้องมี unique constraint บน content_hash — มีใน migration 20260624_rebuild_drug_incidents)
 */
export async function upsertDrugIncidents(rows, batchInfo) {
  if (!rows || rows.length === 0) return { inserted: 0, updated: 0, failed: 0, error: null }

  // dedup ใน batch เดียวกันตาม content_hash (กัน ON CONFLICT ซ้ำในคำสั่งเดียว) — last-wins
  const byHash = new Map()
  const noHash = []
  for (const r of rows) {
    if (r.content_hash) byHash.set(r.content_hash, r)
    else noHash.push(r)
  }
  const clean = [...byHash.values(), ...noHash]

  let inserted = 0, updated = 0, failed = 0, lastError = null
  for (let i = 0; i < clean.length; i += UPSERT_BATCH) {
    const batch = clean.slice(i, i + UPSERT_BATCH)
    try {
      // ตรวจ content_hash ที่มีอยู่แล้วเพื่อแยกนับ insert vs update
      const hashes = batch.map(r => r.content_hash).filter(Boolean)
      const { data: existing } = await supabase
        .from('drug_incidents')
        .select('content_hash')
        .in('content_hash', hashes)
      const existingSet = new Set((existing || []).map(r => r.content_hash))

      const { error } = await supabase
        .from('drug_incidents')
        .upsert(batch, { onConflict: 'content_hash', ignoreDuplicates: false })
      if (error) throw error

      inserted += batch.filter(r => !existingSet.has(r.content_hash)).length
      updated  += batch.filter(r =>  existingSet.has(r.content_hash)).length
    } catch (err) {
      failed += batch.length
      lastError = err.message
    }
  }

  let batchLogError = null
  try {
    const { error: logErr } = await supabase.from('upload_batches').insert([{
      batch_id:     batchInfo.batchId,
      target_table: 'drug_incidents',
      file_name:    batchInfo.fileName,
      row_count:    clean.length,
      status:       failed === 0 ? 'completed' : failed === clean.length ? 'failed' : 'partial',
      uploaded_at:  new Date().toISOString(),
    }])
    if (logErr) batchLogError = logErr.message
  } catch (err) {
    batchLogError = err.message
  }

  return { inserted, updated, failed, error: lastError, batchLogError }
}

/**
 * Upsert สถิติการจับกุมเข้าตาราง arrest_summary
 * rows = output จาก parseArrestFile (คอลัมน์ตรง schema + content_hash)
 * natural key = content_hash (จาก fiscal_year+district — ไม่รวมค่าตัวเลข)
 *   → อัปไฟล์เดิมซ้ำที่แก้ยอด = UPDATE ทับ ไม่ append (ต้องมี unique constraint บน content_hash)
 */
export async function upsertArrestSummary(rows, batchInfo) {
  if (!rows || rows.length === 0) return { inserted: 0, updated: 0, failed: 0, error: null }

  const byHash = new Map()
  const noHash = []
  for (const r of rows) {
    if (r.content_hash) byHash.set(r.content_hash, r)
    else noHash.push(r)
  }
  const clean = [...byHash.values(), ...noHash]

  let inserted = 0, updated = 0, failed = 0, lastError = null
  for (let i = 0; i < clean.length; i += UPSERT_BATCH) {
    const batch = clean.slice(i, i + UPSERT_BATCH)
    try {
      const hashes = batch.map(r => r.content_hash).filter(Boolean)
      const { data: existing } = await supabase
        .from('arrest_summary')
        .select('content_hash')
        .in('content_hash', hashes)
      const existingSet = new Set((existing || []).map(r => r.content_hash))

      const { error } = await supabase
        .from('arrest_summary')
        .upsert(batch, { onConflict: 'content_hash', ignoreDuplicates: false })
      if (error) throw error

      inserted += batch.filter(r => !existingSet.has(r.content_hash)).length
      updated  += batch.filter(r =>  existingSet.has(r.content_hash)).length
    } catch (err) {
      failed += batch.length
      lastError = err.message
    }
  }

  let batchLogError = null
  try {
    const { error: logErr } = await supabase.from('upload_batches').insert([{
      batch_id:     batchInfo.batchId,
      target_table: 'arrest_summary',
      file_name:    batchInfo.fileName,
      row_count:    clean.length,
      status:       failed === 0 ? 'completed' : failed === clean.length ? 'failed' : 'partial',
      uploaded_at:  new Date().toISOString(),
    }])
    if (logErr) batchLogError = logErr.message
  } catch (err) {
    batchLogError = err.message
  }

  return { inserted, updated, failed, error: lastError, batchLogError }
}

/**
 * Upsert สถิติผู้เข้าบำบัดเข้าตาราง treatment_summary
 * rows = output จาก parseTreatmentFile (คอลัมน์ตรง schema + content_hash)
 * natural key = content_hash (จาก fiscal_year+district+dimension+dim_value)
 */
export async function upsertTreatmentSummary(rows, batchInfo) {
  if (!rows || rows.length === 0) return { inserted: 0, updated: 0, failed: 0, error: null }

  const byHash = new Map()
  const noHash = []
  for (const r of rows) {
    if (r.content_hash) byHash.set(r.content_hash, r)
    else noHash.push(r)
  }
  const clean = [...byHash.values(), ...noHash]

  let inserted = 0, updated = 0, failed = 0, lastError = null
  for (let i = 0; i < clean.length; i += UPSERT_BATCH) {
    const batch = clean.slice(i, i + UPSERT_BATCH)
    try {
      const hashes = batch.map(r => r.content_hash).filter(Boolean)
      const { data: existing } = await supabase
        .from('treatment_summary')
        .select('content_hash')
        .in('content_hash', hashes)
      const existingSet = new Set((existing || []).map(r => r.content_hash))

      const { error } = await supabase
        .from('treatment_summary')
        .upsert(batch, { onConflict: 'content_hash', ignoreDuplicates: false })
      if (error) throw error

      inserted += batch.filter(r => !existingSet.has(r.content_hash)).length
      updated  += batch.filter(r =>  existingSet.has(r.content_hash)).length
    } catch (err) {
      failed += batch.length
      lastError = err.message
    }
  }

  let batchLogError = null
  try {
    const { error: logErr } = await supabase.from('upload_batches').insert([{
      batch_id:     batchInfo.batchId,
      target_table: 'treatment_summary',
      file_name:    batchInfo.fileName,
      row_count:    clean.length,
      status:       failed === 0 ? 'completed' : failed === clean.length ? 'failed' : 'partial',
      uploaded_at:  new Date().toISOString(),
    }])
    if (logErr) batchLogError = logErr.message
  } catch (err) {
    batchLogError = err.message
  }

  return { inserted, updated, failed, error: lastError, batchLogError }
}

/**
 * Upsert รายงาน RPT_115_B เข้าตาราง bkn_summary
 * conflict key: report_id, period, bkn, group_no
 */
export async function upsertBknSummary(rows, batchInfo) {
  if (!rows || rows.length === 0) return { inserted: 0, updated: 0, failed: 0, error: null }

  // ตรวจว่ามีข้อมูลช่วงนี้อยู่แล้วหรือไม่ (ใช้ period ของแถวแรก)
  const period = rows[0]?.period ?? null
  let isUpdate = false
  try {
    const { count } = await supabase
      .from('bkn_summary')
      .select('*', { count: 'exact', head: true })
      .eq('report_id', '115_B')
      .eq('period', period)
    isUpdate = (count ?? 0) > 0
  } catch { /* ถ้าตรวจไม่ได้ให้ถือว่าเป็น insert */ }

  let inserted = 0, updated = 0, failed = 0, lastError = null

  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH).map(r => ({
      report_id:   '115_B',
      period:      r.period,
      bkn:         r.bkn,
      group_no:    r.group_no,
      total:       r.total,
      pending:     r.pending,
      done:        r.done,
      batch_id:    batchInfo.batchId,
      source_file: batchInfo.fileName,
    }))

    try {
      const { error } = await supabase
        .from('bkn_summary')
        .upsert(batch, { onConflict: 'report_id,period,bkn,group_no' })
      if (error) throw error
      if (isUpdate) updated += batch.length
      else          inserted += batch.length
    } catch (err) {
      failed += batch.length
      lastError = err.message
    }
  }

  let batchLogError = null
  try {
    const { error: logErr } = await supabase.from('upload_batches').insert([{
      batch_id:     batchInfo.batchId,
      target_table: 'bkn_summary',
      file_name:    batchInfo.fileName,
      row_count:    rows.length,
      status:       failed === 0 ? 'completed' : failed === rows.length ? 'failed' : 'partial',
      uploaded_at:  new Date().toISOString(),
    }])
    if (logErr) batchLogError = logErr.message
  } catch (err) {
    batchLogError = err.message
  }

  return { inserted, updated, failed, error: lastError, batchLogError }
}

/**
 * Upsert ข้อมูลแบบเก็บผู้เสพเข้าตาราง substance_users
 * รับ raw rows (header แบนจาก Excel) → flatten เป็น jsonb 4 ก้อนก่อน upsert
 * natural key = record_uid (จาก 'ประทับเวลา') → อัปไฟล์เดิมซ้ำ = UPDATE ทับ ไม่ append
 *   (ต้องมี unique constraint บน record_uid ใน DB — แยกเป็น SQL)
 */
export async function upsertSubstanceUsers(rawRows, batchInfo) {
  if (!rawRows || rawRows.length === 0) return { inserted: 0, updated: 0, failed: 0, error: null }

  const flat = rawRows.map((r, i) => flattenSubstanceUserRow(r, batchInfo.fileName, i + 1)).map(r => ({
    ...r,
    batch_id:    batchInfo.batchId,
    source_file: batchInfo.fileName,
  }))

  // dedup ภายในไฟล์เดียวกันตาม record_uid (กัน Postgres "ON CONFLICT cannot affect row a second time")
  // เก็บแถวสุดท้ายที่เจอต่อ record_uid
  const byUid = new Map()
  const noUid = []
  for (const r of flat) {
    if (r.record_uid) byUid.set(r.record_uid, r)
    else noUid.push(r)
  }
  const rows = [...byUid.values(), ...noUid]

  let inserted = 0, updated = 0, failed = 0, lastError = null
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH)
    try {
      // ตรวจ record_uid ที่มีอยู่แล้วเพื่อแยกนับ insert vs update
      const uids = batch.map(r => r.record_uid).filter(Boolean)
      const { data: existing } = await supabase
        .from('substance_users')
        .select('record_uid')
        .in('record_uid', uids)
      const existingSet = new Set((existing || []).map(r => r.record_uid))

      const { error } = await supabase
        .from('substance_users')
        .upsert(batch, { onConflict: 'record_uid', ignoreDuplicates: false })
      if (error) throw error

      inserted += batch.filter(r => !existingSet.has(r.record_uid)).length
      updated  += batch.filter(r =>  existingSet.has(r.record_uid)).length
    } catch (err) {
      failed += batch.length
      lastError = err.message
    }
  }

  let batchLogError = null
  try {
    const { error: logErr } = await supabase.from('upload_batches').insert([{
      batch_id:     batchInfo.batchId,
      target_table: 'substance_users',
      file_name:    batchInfo.fileName,
      row_count:    rows.length,
      status:       failed === 0 ? 'completed' : failed === rows.length ? 'failed' : 'partial',
      uploaded_at:  new Date().toISOString(),
    }])
    if (logErr) batchLogError = logErr.message
  } catch (err) {
    batchLogError = err.message
  }

  return { inserted, updated, failed, error: lastError, batchLogError }
}

/**
 * Upsert รายงาน RPT_114 เข้าตาราง report_114
 * conflict key: report_id, fiscal_year, group_name
 */
export async function upsertRpt114(rows, batchInfo) {
  if (!rows || rows.length === 0) return { inserted: 0, updated: 0, failed: 0, error: null }

  const fiscal_year = rows[0]?.fiscal_year ?? null
  let isUpdate = false
  try {
    const { count } = await supabase
      .from('report_114')
      .select('*', { count: 'exact', head: true })
      .eq('report_id', '114')
      .eq('fiscal_year', fiscal_year)
    isUpdate = (count ?? 0) > 0
  } catch { /* ถ้าตรวจไม่ได้ให้ถือว่าเป็น insert */ }

  let inserted = 0, updated = 0, failed = 0, lastError = null

  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH).map(r => ({
      ...r,
      batch_id:    batchInfo.batchId,
      source_file: batchInfo.fileName,
    }))

    try {
      const { error } = await supabase
        .from('report_114')
        .upsert(batch, { onConflict: 'report_id,fiscal_year,group_name' })
      if (error) throw error
      if (isUpdate) updated += batch.length
      else          inserted += batch.length
    } catch (err) {
      failed += batch.length
      lastError = err.message
    }
  }

  let batchLogError = null
  try {
    const { error: logErr } = await supabase.from('upload_batches').insert([{
      batch_id:     batchInfo.batchId,
      target_table: 'report_114',
      file_name:    batchInfo.fileName,
      row_count:    rows.length,
      status:       failed === 0 ? 'completed' : failed === rows.length ? 'failed' : 'partial',
      uploaded_at:  new Date().toISOString(),
    }])
    if (logErr) batchLogError = logErr.message
  } catch (err) {
    batchLogError = err.message
  }

  return { inserted, updated, failed, error: lastError, batchLogError }
}
