// reportStyle.js — style constants ใช้ร่วมทุก section ของ /situation (แยกจาก ReportUI.jsx เพื่อไม่ให้ fast-refresh พัง)
export const COLORS = { slate: '#334155', slateSoft: '#94a3b8', rose: '#e11d48', emerald: '#059669', amber: '#f59e0b' }
export const barTooltipStyle = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }
export const labelStyle = { fontSize: 11, fill: '#475569', fontWeight: 600 }

// สี ข้อหา/พฤติการณ์ 4 หมวด — คงที่ทั้งระบบ (ใช้ซ้ำกับ BknDrugStats) ไม่ลอกสีจ้าจาก PDF template
export const BEHAVIOR_COLOR = { 'เสพ': COLORS.slateSoft, 'ค้า': COLORS.amber, 'ค้าเสพ': COLORS.rose, 'ผลิต': COLORS.emerald }
// ลำดับสีสำหรับโดนัทหลายชิ้น (เช่น ตัวยา top5) — วนใช้ 4 สีหลัก, "อื่นๆ" ใช้เทาอ่อนแยกต่างหาก
export const DONUT_SEQUENCE = [COLORS.amber, COLORS.rose, COLORS.emerald, COLORS.slate, COLORS.slateSoft]
export const DONUT_OTHER_COLOR = '#cbd5e1'
