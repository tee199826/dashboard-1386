import { FileText, BarChart3, MapPin, Shield, Map as MapIcon, TrendingUp, Users, Siren, HeartPulse } from 'lucide-react'

// ─── Config ───────────────────────────────────────────────────────────────────
export const ACCEPT = '.xlsx,.xls,.csv'

export const TYPE_LABELS = {
  complaints:     '📋 เรื่องร้องเรียน (complaints)',
  drug_incidents: '🗺️ เหตุการณ์ยาเสพติด (drug_incidents)',
  bkn_summary:    '📊 สรุป บก.น. 1–9 (RPT_115_B)',
  report_114:     '📑 รายงาน RPT_114 (การดำเนินการตามร้องเรียน)',
  substance_users:'🧑 แบบเก็บข้อมูลผู้เสพ (substance_users)',
  // arrest_summary/treatment_summary ไม่อยู่ใน TYPE_LABELS โดยตั้งใจ — dropdown นี้ป้อน "manual mode"
  // (โหมดเดิม ใช้ mapColumns/computePreview ทั่วไป ไม่รองรับ pivot parser) เลือกได้แค่ผ่าน Guided mode (TABLES)
}

// Reverse mapping: ประเภทข้อมูล (ตาราง) → หน้าเว็บที่ได้รับผลกระทบเมื่ออัปไฟล์นี้
export const TABLE_TO_PAGES = {
  complaints: [
    { name: 'ภาพรวม', route: '/', icon: BarChart3 },
    { name: 'รายเขต', route: '/districts', icon: MapPin },
    { name: 'ผลการดำเนินงาน', route: '/operations', icon: TrendingUp },
  ],
  drug_incidents: [
    { name: 'ภาพรวม', route: '/', icon: BarChart3 },
    { name: 'รายเขต', route: '/districts', icon: MapPin },
    { name: 'พิกัดยาเสพติด', route: '/radar', icon: MapIcon },
  ],
  bkn_summary: [
    { name: 'ภาพรวม', route: '/', icon: BarChart3 },
    { name: 'สถิติ บก.น.', route: '/bkn', icon: Shield },
  ],
  report_114: [
    { name: 'ภาพรวม', route: '/', icon: BarChart3 },
    { name: 'ผลการดำเนินงาน', route: '/operations', icon: TrendingUp },
  ],
  substance_users: [
    { name: 'ภาพรวม', route: '/', icon: BarChart3 },
    { name: 'รายเขต', route: '/districts', icon: MapPin },
    { name: 'ผลเก็บข้อมูลผู้เสพ', route: '/substance-users', icon: Users },
  ],
  // หน้า Situation Dashboard (จับกุม/บำบัด) ยังไม่สร้าง (Phase 2) — ชี้ไปภาพรวมไปก่อน
  arrest_summary: [
    { name: 'ภาพรวม', route: '/', icon: BarChart3 },
  ],
  treatment_summary: [
    { name: 'ภาพรวม', route: '/', icon: BarChart3 },
  ],
}

export const COL_LABELS = {
  group_no: 'กลุ่มเรื่อง', received_date: 'วันที่รับเรื่อง',
  completed_date: 'วันที่รับผล', channel: 'แหล่งข่าว',
  district: 'เขต', subdistrict: 'แขวง', community: 'หมู่บ้าน/ชุมชน',
  province: 'จังหวัด', person_type: 'ประเภทบุคคล', sex: 'เพศ',
  occupation: 'อาชีพ', role: 'บทบาท', action_unit: 'การดำเนินการ',
  urgency: 'ระดับความเร่งด่วน', status: 'ผลการดำเนินการ',
  drug: 'ยาเสพติด', area_type: 'ประเภทพื้นที่',
  behaviors: 'พฤติการณ์', primary_drug: 'ยาหลัก',
  primary_action: 'ผลดำเนินการ', police_station: 'สน.',
  lat: 'Latitude', lng: 'Longitude',
  record_uid: 'Record UID',
}

export const HIDE_COLS = new Set(['batch_id', 'source_file', 'row_index', 'record_uid', 'content_hash'])

// Guided mode ใหม่ — เลือก "ตาราง" ที่จะอัปตรงๆ (mental model: 1 ไฟล์ = 1 ตาราง)
export const TABLES = [
  { id: 'drug_incidents',  emoji: '🎯', name: 'เหตุการณ์ยาเสพติด',     icon: MapIcon,    grad: 'from-violet-500 to-purple-600',  shadow: 'shadow-violet-500/30' },
  { id: 'complaints',      emoji: '📞', name: 'เรื่องร้องเรียน 1386',    icon: FileText,   grad: 'from-blue-500 to-indigo-600',    shadow: 'shadow-blue-500/30' },
  { id: 'substance_users', emoji: '🧑', name: 'แบบเก็บข้อมูลผู้เสพ',     icon: Users,      grad: 'from-emerald-500 to-teal-600',   shadow: 'shadow-emerald-500/30' },
  { id: 'bkn_summary',     emoji: '📊', name: 'สรุป บก.น. (RPT 115_B)',  icon: Shield,     grad: 'from-amber-500 to-orange-600',   shadow: 'shadow-amber-500/30' },
  { id: 'report_114',      emoji: '📑', name: 'รายงาน RPT_114',          icon: TrendingUp, grad: 'from-rose-500 to-pink-600',       shadow: 'shadow-rose-500/30' },
  { id: 'arrest_summary',    emoji: '🚔', name: 'สถิติการจับกุม',        icon: Siren,      grad: 'from-red-500 to-orange-600',     shadow: 'shadow-red-500/30' },
  { id: 'treatment_summary', emoji: '🏥', name: 'สถิติการบำบัด',         icon: HeartPulse, grad: 'from-cyan-500 to-sky-600',       shadow: 'shadow-cyan-500/30' },
]

export const GROUP_NAMES = {
  1: 'กลุ่ม 1: พบพฤติการณ์',
  2: 'กลุ่ม 2: มีตัวตน ไม่พบประวัติ',
  3: 'กลุ่ม 3: พิสูจน์ทราบไม่ได้',
  4: 'กลุ่ม 4: สถานที่',
  5: 'กลุ่ม 5: พื้นที่',
}

// ─── Data Flow Guide — คู่มือ หน้าเว็บ ↔ ไฟล์ ↔ ตาราง DB ──────────────────────────

// class literal ต่อสี (ให้ Tailwind scan เจอ) — gradient ไอคอน + border/shadow ตอน hover
export const FLOW_COLORS = {
  blue:   { grad: 'from-blue-500 to-blue-600',     border: 'hover:border-blue-200',   shadow: 'hover:shadow-blue-500/10' },
  indigo: { grad: 'from-indigo-500 to-indigo-600', border: 'hover:border-indigo-200', shadow: 'hover:shadow-indigo-500/10' },
  slate:  { grad: 'from-slate-500 to-slate-600',   border: 'hover:border-slate-300',  shadow: 'hover:shadow-slate-500/10' },
  cyan:   { grad: 'from-cyan-500 to-cyan-600',     border: 'hover:border-cyan-200',   shadow: 'hover:shadow-cyan-500/10' },
  amber:  { grad: 'from-amber-500 to-amber-600',   border: 'hover:border-amber-200',  shadow: 'hover:shadow-amber-500/10' },
  violet: { grad: 'from-violet-500 to-violet-600', border: 'hover:border-violet-200', shadow: 'hover:shadow-violet-500/10' },
}

export const FLOW_MAP = [
  { page: 'ภาพรวม', route: '/', icon: BarChart3, color: 'blue', files: ['ทุกไฟล์ — แสดงรวม'], tables: ['ทุกตาราง'] },
  { page: 'รายเขต', route: '/districts', icon: MapPin, color: 'indigo', files: ['เรื่องร้องเรียน', 'เหตุการณ์ยาเสพติด', 'แบบเก็บข้อมูลผู้เสพ'], tables: ['complaints', 'drug_incidents', 'substance_users'] },
  { page: 'สถิติ บก.น.', route: '/bkn', icon: Shield, color: 'slate', files: ['สรุป บก.น. (RPT 115_B)'], tables: ['bkn_summary'] },
  { page: 'พิกัดยาเสพติด', route: '/radar', icon: MapIcon, color: 'cyan', files: ['เหตุการณ์ยาเสพติด (ต้องมี lat/lng)'], tables: ['drug_incidents'] },
  { page: 'ผลการดำเนินงาน', route: '/operations', icon: TrendingUp, color: 'amber', files: ['รายงาน 114 (RPT_114)'], tables: ['report_114'] },
  { page: 'ผลเก็บข้อมูลผู้เสพ', route: '/substance-users', icon: Users, color: 'violet', files: ['แบบเก็บข้อมูลจากผู้เสพ (Google Form export)'], tables: ['substance_users'] },
]
