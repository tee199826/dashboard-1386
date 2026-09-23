

// ดาวน์โหลด Blob เป็นไฟล์ — ใช้ร่วมทุกจุด export (Excel/CSV)
// จุดสำคัญ: ห้าม revokeObjectURL ทันทีหลัง a.click() — Chrome เริ่มดาวน์โหลดแบบ async
// ถ้า URL ถูกถอนก่อน ไฟล์จะไม่ถูกบันทึกโดยไม่มี error (เจอตอนเทส /districts export: blob สร้างแล้ว แต่ไม่มีไฟล์)
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
