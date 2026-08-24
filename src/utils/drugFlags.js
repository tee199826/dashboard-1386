// drugFlags.js — label mapping + aggregate helpers สำหรับคอลัมน์ one-hot ของ drug_incidents
// ใช้ร่วมทุก section ของ /situation (จับกุม/บำบัด/ร้องเรียน)

// พฤติการณ์ — mutually exclusive 4 หมวด (นับตรงๆ %รวม 100 ได้)
export const BEHAVIOR_FLAGS = [
  ['beh_use', 'เสพ'], ['beh_sell', 'ค้า'], ['beh_use_sell', 'ค้าเสพ'], ['beh_produce', 'ผลิต'],
]

// ตัวยา — one-hot 14 + drug_others (array, จัดการแยกต่างหาก)
export const DRUG_FLAGS = [
  ['drug_yaba', 'ยาบ้า'], ['drug_ice', 'ไอซ์'], ['drug_ecstasy', 'ยาอี'], ['drug_ketamine', 'คีตามีน'],
  ['drug_cocaine', 'โคเคน'], ['drug_heroin', 'เฮโรอีน'], ['drug_morphine', 'มอร์ฟีน'], ['drug_opium', 'ฝิ่น'],
  ['drug_kratom', 'กระท่อม'], ['drug_cannabis', 'กัญชา'], ['drug_solvent', 'สารระเหย'], ['drug_4x100', 'สี่คูณร้อย'],
  ['drug_misuse', 'ยาใช้ในทางที่ผิด'], ['drug_psychotropic', 'วัตถุออกฤทธิ์'],
]

// ผลตรวจสอบ
export const RESULT_FLAGS = [
  ['result_found', 'พบพฤติการณ์'], ['result_not_found', 'ไม่พบ'],
  ['result_unprovable', 'ไม่พบตัว'], ['result_deceased', 'เสียชีวิต'],
]

// ผลดำเนินการ
export const ACTION_FLAGS = [
  ['action_arrest', 'จับกุม'], ['action_treatment', 'บำบัด'],
  ['action_search', 'ตรวจค้น'], ['action_escape', 'หลบหนี'], ['action_investigating', 'อยู่ระหว่างสืบสวน'],
]

// ร้ายแรง/ไม่ร้ายแรง — ไม่มี field ตรงใน drug_incidents จึงประมาณจากพฤติการณ์ (แก้ตรงนี้จุดเดียวถ้าเกณฑ์เปลี่ยน)
export const SEVERE_BEHAVIOR_COLS = ['beh_sell', 'beh_produce', 'beh_use_sell'] // ค้า/ผลิต/ค้าเสพ = ร้ายแรง
export const NONSEVERE_BEHAVIOR_COLS = ['beh_use'] // เสพอย่างเดียว = ไม่ร้ายแรง
export const isSevere = (r) => SEVERE_BEHAVIOR_COLS.some((c) => r[c])

export const countFlag = (rows, col) => rows.reduce((n, r) => n + (r[col] ? 1 : 0), 0)

// นับแต่ละ flag ใน list → [{ name, value }] เรียงมาก→น้อย (ตัด 0 ออกเป็นค่า default)
export function flagCounts(rows, flags, { skipZero = true } = {}) {
  return flags
    .map(([col, label]) => ({ name: label, value: countFlag(rows, col) }))
    .filter((d) => !skipZero || d.value > 0)
    .sort((a, b) => b.value - a.value)
}

// ตัวยา: drug_* + drug_others (array ของชื่อยาที่ไม่อยู่ใน one-hot) รวมกัน เรียงมาก→น้อย
export function drugCounts(rows, { top = null } = {}) {
  const data = flagCounts(rows, DRUG_FLAGS)
  const othersMap = {}
  for (const r of rows) {
    if (Array.isArray(r.drug_others)) {
      for (const o of r.drug_others) { if (o) othersMap[o] = (othersMap[o] || 0) + 1 }
    }
  }
  for (const [name, value] of Object.entries(othersMap)) data.push({ name, value })
  data.sort((a, b) => b.value - a.value)
  return top ? data.slice(0, top) : data
}

// แถวที่ระบุตัวยาได้อย่างน้อย 1 ชนิด (สำหรับคำนวณฐาน % ของกราฟตัวยา — ไม่นับแถวที่ drug ทุกตัว false)
export function rowsWithAnyDrug(rows) {
  return rows.filter((r) =>
    DRUG_FLAGS.some(([c]) => r[c]) || (Array.isArray(r.drug_others) && r.drug_others.some(Boolean)))
}
