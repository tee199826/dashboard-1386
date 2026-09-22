// escapeHtml — ใช้กับทุกค่าที่ถูกต่อเป็น HTML string ให้ Leaflet (bindPopup/bindTooltip ตีความเป็น HTML)
// ค่าจากฐานข้อมูล/ไฟล์นำเข้า (เช่น primary_drug แบบ legacy, ชื่อเขต) ห้ามใส่ลง template ตรง ๆ (SEC-09)
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(v) {
  if (v == null) return ''
  return String(v).replace(/[&<>"']/g, (ch) => MAP[ch])
}
