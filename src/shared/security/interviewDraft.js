

// ร่างอัตโนมัติของแบบซักผู้เสพ (auto save)
//
// เก็บใน sessionStorage = อยู่เฉพาะแท็บที่เปิดอยู่
//   รีเฟรชหน้าแล้วยังอยู่ ; ปิดแท็บ/ปิดเบราว์เซอร์แล้วหายเอง
// เลือกแบบนี้เพราะฟอร์มมีข้อมูลส่วนบุคคล (ชื่อ เลขบัตร ที่อยู่) — ไม่ให้ค้างในเครื่องที่ใช้ร่วมกัน
//
// key ผูกกับผู้ใช้ — เปลี่ยนบัญชีในแท็บเดียวกันจะไม่เห็นร่างของคนก่อน
// ทุกฟังก์ชันครอบ try/catch — storage ถูกบล็อก/เต็ม ต้องไม่ทำให้ฟอร์มพัง แค่ไม่มี auto save

const PREFIX = 'interview-draft:v1:'

export const draftKeyOf = (userId) => PREFIX + (userId ?? 'anon')

// คืน { savedAt, data } หรือ null
export function readDraft(key) {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// json = state ของฟอร์มที่ stringify แล้ว (ฟอร์มมีอยู่แล้ว ไม่ stringify ซ้ำ)
export function writeDraft(key, json) {
  try {
    sessionStorage.setItem(key, `{"savedAt":${Date.now()},"data":${json}}`)
  } catch { /* storage เต็ม/ถูกบล็อก — ข้าม */ }
}

export function removeDraft(key) {
  try { sessionStorage.removeItem(key) } catch { /* ข้าม */ }
}

// ออกจากระบบ → ลบร่างของทุกบัญชีในแท็บนี้ (กันคนที่ใช้เครื่องต่อเปิดดูผ่าน DevTools)
export function clearAllDrafts() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k)
    }
  } catch { /* ข้าม */ }
}
