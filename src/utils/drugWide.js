// แปลง wide one-hot (drug_*/beh_*/action_*) → field เดิม (primary_drug/behaviors/primary_action)
// derive ฝั่ง client แทน generated column (Postgres reject เพราะ CONCAT_WS ไม่ immutable)
// ใช้: SubstanceRadar / AllDistricts / Overview — เพื่อให้โค้ดที่อ่าน field เดิมทำงานต่อไม่ต้องแก้
//   (?? = เผื่อ row legacy ที่ยังมี field เดิม)

// ลำดับความสำคัญ — ตรงกับ DRUG_COLORS/DRUG_CATEGORIES ใน /radar
export const DRUG_FLAGS = [
  ['drug_yaba', 'ยาบ้า'], ['drug_ice', 'ไอซ์'], ['drug_ecstasy', 'ยาอี'], ['drug_ketamine', 'คีตามีน'],
  ['drug_cocaine', 'โคเคน'], ['drug_heroin', 'เฮโรอีน'], ['drug_morphine', 'มอร์ฟีน'], ['drug_opium', 'ฝิ่น'],
  ['drug_kratom', 'กระท่อม'], ['drug_cannabis', 'กัญชา'], ['drug_4x100', 'สี่คูณร้อย'], ['drug_solvent', 'สารระเหย'],
  ['drug_psychotropic', 'วัตถุออกฤทธิ์'], ['drug_misuse', 'ยาใช้ในทางที่ผิด'],
]

export function derivePrimaryDrug(r) {
  if (r.primary_drug != null) return r.primary_drug
  for (const [f, name] of DRUG_FLAGS) if (r[f]) return name
  return null
}

export function deriveBehaviors(r) {
  if (r.behaviors != null) return r.behaviors
  const b = [r.beh_use && 'เสพ', r.beh_sell && 'ค้า', r.beh_use_sell && 'เสพ/ค้า', r.beh_produce && 'ผลิต'].filter(Boolean)
  return b.length ? b.join(',') : null
}

export function derivePrimaryAction(r) {
  if (r.primary_action != null) return r.primary_action
  return r.action_arrest ? 'จับกุม'
    : r.action_treatment ? 'บำบัด'
    : r.action_investigating ? 'อยู่ระหว่างสืบสวน'
    : r.action_search ? 'ตรวจค้น'
    : r.action_escape ? 'หลบหนี'
    : null
}

// enrich 1 row ให้มี field เดิมครบ (ใช้กับ /radar ที่ select '*')
export const enrichDrugRow = (r) => ({
  ...r,
  primary_drug: derivePrimaryDrug(r),
  behaviors: deriveBehaviors(r),
  primary_action: derivePrimaryAction(r),
})
