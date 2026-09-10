// reportStyle.js — style constants ใช้ร่วมทุก section ของ /situation (แยกจาก ReportUI.jsx เพื่อไม่ให้ fast-refresh พัง)
// palette เรียบ/ทางการ: accent น้ำเงินกรมเดียว + สีมีความหมาย (เขียว/แดง) เฉพาะกราฟ split
export const COLORS = {
  accent: '#2f49c9', accentSoft: '#e9edfb', accentInk: '#243aa8',
  slate: '#334155', slateSoft: '#aab4c2', rose: '#d0455a', emerald: '#0e9d6b', amber: '#f59e0b',
  track: '#eef1f6',
}

// เลือกสีตัวอักษรบนแถบสีให้อ่านออก (เข้ม/สว่างตามความสว่างของพื้น) — ใช้กับ % ใน split bar
export const readableOn = (hex) => {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#1f2937' : '#ffffff'
}

// legacy — เผื่อ component เก่ายังอ้าง (Recharts ถูกแทนด้วย CSS bar แล้ว)
export const barTooltipStyle = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }
export const labelStyle = { fontSize: 11, fill: '#475569', fontWeight: 600 }

// ลำดับสีสำหรับโดนัทหลายชิ้น (เช่น ตัวยา top5) — วนใช้สีหลัก, "อื่นๆ" (index เกิน sequence) ใช้เทาอ่อนแยกต่างหาก
export const DONUT_SEQUENCE = [COLORS.amber, COLORS.rose, COLORS.emerald, COLORS.slate, COLORS.slateSoft]
export const DONUT_OTHER_COLOR = '#cbd5e1'
