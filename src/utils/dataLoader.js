import { supabase } from '../lib/supabase'

export async function loadAllData() {
  console.log('[loader] กำลังโหลดจาก Supabase...')

  const BATCH_SIZE = 1000
  let allData = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('complaints')
      .select('*')
      .order('received_date', { ascending: false })
      .range(from, from + BATCH_SIZE - 1)

    if (error) {
      console.error('[loader] Error:', error)
      throw new Error('โหลดข้อมูลไม่สำเร็จ: ' + error.message)
    }

    if (!data || data.length === 0) break

    allData = allData.concat(data)
    console.log('[loader] โหลดแล้ว', allData.length, 'รายการ...')

    if (data.length < BATCH_SIZE) break
    from += BATCH_SIZE
  }

  const records = allData.map(r => ({
    id: r.id,
    group: r.group_no,
    date: r.received_date,
    completedDate: r.completed_date,
    channel: r.channel,
    district: r.district,
    subdistrict: r.subdistrict,
    community: r.community,
    province: r.province,
    personType: r.person_type,
    sex: r.sex,
    occupation: r.occupation,
    role: r.role,
    actionUnit: r.action_unit,
    urgency: r.urgency,
    status: r.status,
    drug: r.drug,
    areaType: r.area_type,
  }))

  console.log('[loader] โหลดสำเร็จทั้งหมด:', records.length, 'รายการ')
  return { records, total: records.length }
}

export async function createComplaint(record) {
  const dbRecord = {
    group_no: record.group,
    received_date: record.date || null,
    completed_date: record.completedDate || null,
    channel: record.channel || null,
    district: record.district || null,
    subdistrict: record.subdistrict || null,
    community: record.community || null,
    province: record.province || 'กรุงเทพมหานคร',
    person_type: record.personType || null,
    sex: record.sex || null,
    occupation: record.occupation || null,
    role: record.role || null,
    action_unit: record.actionUnit || null,
    urgency: record.urgency || null,
    status: record.status || 'ยังไม่ได้รับผล',
    drug: record.drug || null,
    area_type: record.areaType || null,
  }

  const { data, error } = await supabase
    .from('complaints')
    .insert([dbRecord])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateComplaint(id, updates) {
  const dbUpdates = {
    group_no: updates.group,
    received_date: updates.date || null,
    completed_date: updates.completedDate || null,
    channel: updates.channel,
    district: updates.district,
    subdistrict: updates.subdistrict,
    status: updates.status,
    action_unit: updates.actionUnit,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('complaints')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteComplaint(id) {
  const { error } = await supabase
    .from('complaints')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}

export async function bulkInsertComplaints(records) {
  const BATCH_SIZE = 500
  let totalInserted = 0

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE).map(r => ({
      group_no: r.group,
      received_date: r.date || null,
      completed_date: r.completedDate || null,
      channel: r.channel || null,
      district: r.district || null,
      subdistrict: r.subdistrict || null,
      community: r.community || null,
      province: r.province || 'กรุงเทพมหานคร',
      person_type: r.personType || null,
      sex: r.sex || null,
      occupation: r.occupation || null,
      role: r.role || null,
      action_unit: r.actionUnit || null,
      urgency: r.urgency || null,
      status: r.status || 'ยังไม่ได้รับผล',
      drug: r.drug || null,
      area_type: r.areaType || null,
    }))

    const { error } = await supabase.from('complaints').insert(batch)
    if (error) throw error

    totalInserted += batch.length
    console.log('[bulk insert]', totalInserted, '/', records.length)
  }

  return totalInserted
}

export async function deleteByGroup(groupNo) {
  const { error, count } = await supabase
    .from('complaints')
    .delete({ count: 'exact' })
    .eq('group_no', groupNo)

  if (error) throw error
  return count
}

// ========== Operations Summary ==========
export async function loadOperations() {
  const { data, error } = await supabase
    .from('operations_summary')
    .select('*')
    .order('id')
  if (error) throw error
  return data.map(r => ({
    id: r.id,
    channel: r.channel,
    category: r.category,
    count: r.count,
    notes: r.notes,
    year: r.year,
    month: r.month,
  }))
}

export async function createOperation(record) {
  const { data, error } = await supabase
    .from('operations_summary')
    .insert([{
      channel: record.channel,
      category: record.category,
      count: record.count || 0,
      notes: record.notes || null,
      year: record.year || null,
      month: record.month || null,
    }])
    .select().single()
  if (error) throw error
  return data
}

export async function updateOperation(id, updates) {
  const { data, error } = await supabase
    .from('operations_summary')
    .update({
      channel: updates.channel,
      category: updates.category,
      count: updates.count,
      notes: updates.notes,
      year: updates.year,
      month: updates.month,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select().single()
  if (error) throw error
  return data
}

export async function deleteOperation(id) {
  const { error } = await supabase.from('operations_summary').delete().eq('id', id)
  if (error) throw error
}

export async function bulkInsertOperations(records) {
  const batch = records.map(r => ({
    channel: r.channel,
    category: r.category,
    count: r.count || 0,
    notes: r.notes || null,
    year: r.year || null,
    month: r.month || null,
  }))
  const { error } = await supabase.from('operations_summary').insert(batch)
  if (error) throw error
  return batch.length
}
