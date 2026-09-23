

// เพดานไฟล์นำเข้า (SEC-11) — ตรวจจาก metadata ก่อน file.arrayBuffer() เพื่อไม่ให้ไฟล์ใหญ่/ผิดชนิด
// ถูกอ่านทั้งก้อนเข้าหน่วยความจำแล้วส่งเข้า parser (XLSX.read ทำงาน synchronous บน main thread)
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024   // 25 MiB — ไฟล์รายงานจริงอยู่หลัก KB–ต้น MB
export const MAX_SHEET_ROWS = 200_000               // เพดานแถวต่อชีตที่ให้ parser อ่าน (กัน workbook ที่ขยายใหญ่ผิดปกติ)
export const UPLOAD_EXTS = ['xlsx', 'xls', 'csv']

const fmtMB = (b) => (b / 1024 / 1024).toFixed(1)

/**
 * ตรวจไฟล์ก่อนอ่าน — คืน error message (string) ถ้าไม่ผ่าน, null ถ้าผ่าน
 * @param {File} file
 * @param {string[]} exts นามสกุลที่ยอมรับ (ตัวพิมพ์เล็ก ไม่มีจุด)
 */
export function checkUploadFile(file, exts = UPLOAD_EXTS) {
  if (!file) return 'ไม่พบไฟล์'
  const ext = String(file.name || '').split('.').pop().toLowerCase()
  if (!exts.includes(ext)) return `รองรับเฉพาะไฟล์ ${exts.map((e) => '.' + e).join(', ')} เท่านั้น`
  if (typeof file.size === 'number' && file.size > MAX_UPLOAD_BYTES) {
    return `ไฟล์ใหญ่เกิน ${fmtMB(MAX_UPLOAD_BYTES)} MB (ไฟล์นี้ ${fmtMB(file.size)} MB)`
  }
  return null
}

/** เหมือน checkUploadFile แต่ throw Error — ใช้ในเส้นทางที่ parser โยน error อยู่แล้ว */
export function assertUploadFile(file, exts = UPLOAD_EXTS) {
  const msg = checkUploadFile(file, exts)
  if (msg) throw new Error(msg)
}
