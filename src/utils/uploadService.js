import { supabase } from '../lib/supabase'

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
      console.error(`[uploadService] batch ${Math.floor(i / UPSERT_BATCH) + 1} failed:`, err)
      failed += batch.length
      lastError = err.message
    }
  }

  // บันทึก batch log — ถ้า table ยังไม่มีให้แจ้ง warning แต่ไม่ล้มงาน
  try {
    await supabase.from('upload_batches').insert([{
      batch_id:     batchInfo.batchId,
      target_table: tableName,
      file_name:    batchInfo.fileName,
      row_count:    rows.length,
      status:       failed === 0 ? 'completed' : failed === rows.length ? 'failed' : 'partial',
    }])
  } catch (err) {
    console.warn('[uploadService] บันทึก upload_batches ไม่ได้ (อาจยังไม่มีตาราง):', err.message)
  }

  return { inserted, updated, failed, error: lastError }
}
