// บันทึกแบบซักผู้เสพ — โครงตาม "แบบเก็บข้อมูลจากผู้เสพ (แบบเก็บข้อมูลบุคคล ๑-๑)" ปปส.กทม.
//
// ⚠️ เก็บแยกจากชุดข้อมูลนำเข้า Excel (substance_users) — มีตารางของตัวเอง 2 ตาราง:
//   interview_records      — เนื้อหาแบบฟอร์ม (ไม่ระบุตัวบุคคล)
//   interview_records_pii  — ข้อมูลส่วนบุคคล
// ทั้งคู่ล็อก RLS ให้ผู้ดูแลระบบเท่านั้น แต่ยังแยก PII คนละตาราง
// เผื่อวันหน้าเปิดสถิติแบบซักให้อ่านสาธารณะโดยที่ชื่อ/เลขบัตรไม่หลุดไปด้วย
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { draftKeyOf, readDraft, writeDraft, removeDraft } from '../../utils/interviewDraft'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { dateToFiscalYear, localDateISO } from '../../utils/fiscalYear'
import { IntelPage, Card, Field, Input, Select, ChipGroup, RepeatList, SaveBar } from '../../components/intel/FormUI'
import { DISTRICTS, UNIT_FALLBACK, YEAR_OPTIONS, formatNationalId } from '../../utils/intelOptions'
import { loadAreaOptions, loadCommunitiesFromData, mergeCommunities } from '../../utils/areaOptions'
import { loadThaiAddress } from '../../utils/thaiAddress'
import { STATION_TO_BKN } from '../../utils/bknMapping'
import {
  RELIGION_OPTIONS, MARITAL_OPTIONS, RESIDENT_STATUS_OPTIONS, EDUCATION_OPTIONS, OCCUPATION_OPTIONS,
  INCOME_OPTIONS, FIRST_DRUG_OPTIONS, FIRST_SOURCE_OPTIONS, FIRST_REASON_OPTIONS, USE_METHOD_OPTIONS,
  USE_STYLE_OPTIONS, AFTER_FIRST_OPTIONS, MAIN_DRUG_OPTIONS, USAGE_TYPE_OPTIONS, SUBSTITUTE_OPTIONS,
  FREQUENCY_OPTIONS, USE_PLACE_OPTIONS, AVAILABILITY_OPTIONS, PRICE_DRUG_OPTIONS, BUY_CHANNEL_OPTIONS,
  SELLER_TYPE_OPTIONS, SELLER_ZONE_OPTIONS, SEX_OPTIONS, HAS_OPTIONS, CHARGE_OPTIONS, CHANNEL_FRIEND,
  NATIONALITY_OPTIONS, NATIONALITY_THAI, EVER_OPTIONS, EVER_YES, LOC_BKK, LOC_SCOPE_OPTIONS, SELLER_CONTACT_OPTIONS,
} from '../../utils/interviewOptions'

// วันที่วันนี้ตามเวลาเครื่อง (ไทย) — toISOString() เป็น UTC ช่วง 00:00–06:59 จะได้วันของเมื่อวาน
const todayISO = () => localDateISO(new Date())
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? null : n }
const clean = (v) => { const s = String(v ?? '').trim(); return s || null }
// มีค่าจริง (ไม่ใช่ null/undefined/ช่องว่างล้วน) — ใช้ตัวเดียวทั้งไฟล์ ทั้งตรวจช่องบังคับ ตัวกรองตอนบันทึก และ JSX
const filled = (v) => String(v ?? '').trim() !== ''
// ตัวเลขคงเป็นตัวเลข (เดิม clean() แปลงทุกค่าเป็นข้อความ → ปี/เดือนถูกเก็บเป็น "1")
const cleanObj = (o) => {
  const out = {}
  for (const [k, v] of Object.entries(o)) {
    const val = Array.isArray(v) ? (v.length ? v : null) : typeof v === 'number' ? v : clean(v)
    if (val != null) out[k] = val
  }
  return Object.keys(out).length ? out : null
}

const fmtTime = (ms) => new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

// ตัวเลือก + ค่าที่มีอยู่แล้วแต่ไม่อยู่ในรายการ (เช่น ร่างเก่าที่เคยพิมพ์เอง) — ไม่ให้ค่าหายจากช่องเฉย ๆ
const withCurrent = (list, value) => (value && !list.includes(value) ? [value, ...list] : list)

// สน. ในกรุงเทพฯ 88 แห่ง — เลือก สน. แล้วใส่ บก.น. ให้อัตโนมัติ (1 สน. สังกัด 1 บก.น. เสมอ ตามตาราง bknMapping)
// เก็บชื่อ สน. แบบไม่มีคำนำหน้า ให้ตรงกับ STATION_TO_BKN และคอลัมน์ police_station ของข้อมูลเดิม
const STATION_OPTIONS = Object.keys(STATION_TO_BKN)
  .sort((a, b) => a.localeCompare(b, 'th'))
  .map((s) => [s, `สน.${s} · ${STATION_TO_BKN[s]}`])
// รองรับพิมพ์ "สน.ลุมพินี" / "สน. ลุมพินี" / "ลุมพินี" ; ไม่ใช่ สน. ในกรุงเทพฯ (เช่น สภ. ต่างจังหวัด) → ''
const bknOfStation = (v) => STATION_TO_BKN[String(v ?? '').trim().replace(/^สน\.\s*/, '')] || ''
// ตัวเลือก สน. + ค่าเดิมที่ไม่อยู่ในรายการ (ร่างเก่าที่เคยพิมพ์เอง) — ไม่ให้ค่าหายจากช่อง
const stationOptions = (current) => (current && !STATION_TO_BKN[current] ? [[current, current], ...STATION_OPTIONS] : STATION_OPTIONS)

// ระยะเวลา ปี + เดือน → { years, months, text } — ว่างทั้งสองช่อง = null
// เดือนเกิน 11 ปัดขึ้นเป็นปี (0 ปี 18 เดือน → 1 ปี 6 เดือน) ; ปีทศนิยมแปลงเป็นเดือน (1.5 ปี → 1 ปี 6 เดือน)
const toDuration = (y, m) => {
  if (!String(y ?? '').trim() && !String(m ?? '').trim()) return null
  const total = Math.max(0, Math.round((num(y) || 0) * 12 + (num(m) || 0)))
  const years = Math.floor(total / 12), months = total % 12
  return { years, months, text: [years && `${years} ปี`, months && `${months} เดือน`].filter(Boolean).join(' ') || '0 เดือน' }
}

// ช่องระยะเวลาแยก ปี / เดือน — มีหน่วยกำกับท้ายช่อง
function YearMonth({ y, m, onY, onM, disabled }) {
  const box = (value, onChange, unit) => (
    <div className="relative">
      <Input type="number" min="0" inputMode="numeric" value={value} disabled={disabled}
        className="!pr-12" onChange={(e) => onChange(e.target.value)} />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{unit}</span>
    </div>
  )
  return <div className="grid grid-cols-2 gap-2">{box(y, onY, 'ปี')}{box(m, onM, 'เดือน')}</div>
}

const BLANK_ARREST = { seq: '', charge: '', drug: '', amount: '', unit: '', station: '', year: '' }
const BLANK_REHAB = { seq: '', drug: '', place: '', year: '' }
const BLANK_PRICE = { drug: '', price: '', unit: '', period: '' }
// scope = กรุงเทพมหานคร / จังหวัดอื่น ; province ใช้เฉพาะจังหวัดอื่น (กรุงเทพฯ ใส่ให้ตอนบันทึก)
const BLANK_LOC = { scope: '', area: '', province: '', community: '', subdistrict: '', district: '', station: '', bkn: '' }
// contact_channel = ช่องทางติดต่อ (เลือกจากรายการ) ; contact_other = ชื่อช่องทางเมื่อเลือก "อื่นๆ" ; contact_id = ID / ชื่อบัญชี
const BLANK_SELLER = {
  full_name: '', alias: '', sex: '', age: '', appearance: '', type: '', type_other: '', zone: '', phone: '',
  contact_channel: '', contact_other: '', contact_id: '',
  weapon: '', weapon_type: '', vehicle: '',
}

// ตัวครอบ — "ล้างข้อมูล" = ลบร่าง แล้วเปลี่ยน key ให้ฟอร์ม mount ใหม่ทั้งก้อน
// (state ทุกช่องกลับเป็นค่าเริ่มต้นพร้อมกัน ไม่ต้องไล่รีเซ็ตทีละ useState แล้วลืมบางช่อง)
export default function InterviewForm() {
  const { user } = useAuth()
  const draftKey = draftKeyOf(user?.id)
  const [formKey, setFormKey] = useState(0)
  const clearAll = () => {
    removeDraft(draftKey)
    setFormKey((k) => k + 1)
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return <InterviewFormBody key={formKey} draftKey={draftKey} onClear={clearAll} />
}

function InterviewFormBody({ draftKey, onClear }) {
  const navigate = useNavigate()
  const { logAction } = useAuth()
  // ร่างที่ค้างในแท็บนี้ — อ่านครั้งเดียวตอน mount (กดล้างข้อมูลแล้ว mount ใหม่จะได้ null)
  // ทุก useState ด้านล่างใช้ค่าจากร่างทับค่าเริ่มต้น — ช่องที่เพิ่มในฟอร์มทีหลังยังได้ค่าเริ่มต้นครบ
  const [draft] = useState(() => readDraft(draftKey))
  const d = draft?.data
  const [status, setStatus] = useState(null)
  const [savedRef, setSavedRef] = useState(null)   // { code, doc_no } ที่ฐานข้อมูลออกให้ตอนบันทึก

  // ── ส่วนที่ 1 ข้อมูลบุคคล ──
  // เลขที่แบบ (doc_no) ไม่มีช่องกรอก — trigger ฝั่งฐานข้อมูลออกเลข ๑-๑/๐๐๐๑ ให้เอง
  const [p, setP] = useState({
    first_name: '', last_name: '', alias: '', age: '', birth_date: '', religion: '', religion_other: '',
    nationality: '', nationality_other: '', national_id: '', phone: '', contact_phone: '',
    addr_area: '', addr_no: '', addr_moo: '', addr_building: '', addr_floor: '', addr_room: '',
    addr_soi: '', addr_road: '', subdistrict: '', district: '', province: 'กรุงเทพมหานคร',
    station: '', bkn: '', resident_status: '',
    marital_status: '', education: '', education_other: '', education_place: '',
    occupation: '', occupation_other: '', work_place: '', work_district: '', work_province: '',
    income_range: '', work_nature: '', workplace_outbreak: '', workplace_outbreak_detail: '',
    ...d?.p,
  })
  const setPf = (patch) => setP((s) => ({ ...s, ...patch }))

  // ── ส่วนที่ 2 ──
  // เคย/ไม่เคย ต้องเลือกก่อน — เลือก "เคย" แล้วถึงจะเปิดให้กรอกรายละเอียด
  const [arrestEver, setArrestEver] = useState(d?.arrestEver ?? '')
  const [rehabEver, setRehabEver] = useState(d?.rehabEver ?? '')
  const [arrests, setArrests] = useState(d?.arrests ?? [])
  const [rehabs, setRehabs] = useState(d?.rehabs ?? [])
  const [fu, setFu] = useState({
    age: '', drug: '', drug_other: '', live_community: '', live_district: '', live_province: '',
    source: '', source_other: '', reason: '', reason_other: '', method: '', style: '', group_size: '',
    after: '', after_y: '', after_m: '', quit_y: '', quit_m: '', never_quit: false, quit_reason: '',
    ...d?.fu,
  })
  const setFuf = (patch) => setFu((s) => ({ ...s, ...patch }))

  const [md, setMd] = useState({
    drugs: [], drug_other: '', usage_type: '', usage_with: '', substitute: [], substitute_other: '',
    years_using: '', amount_per_time: '', max_amount: '', frequency: '', frequency_other: '',
    style: '', group_size: '', places: [], place_other: '', place_district: '', place_province: '', place_station: '',
    availability: '', availability_reason: '',
    ...d?.md,
    // วิธีเสพประจำเลือกได้หลายวิธี — ร่างเก่าที่เคยเลือกได้วิธีเดียว (เก็บเป็นข้อความ) แปลงเป็นรายการ ไม่ให้ค่าหาย
    method: [].concat(d?.md?.method ?? []).filter(Boolean),
  })
  const setMdf = (patch) => setMd((s) => ({ ...s, ...patch }))

  const [prices, setPrices] = useState(d?.prices ?? [{ ...BLANK_PRICE }])
  const [slang, setSlang] = useState({ ยาบ้า: '', ไอซ์: '', เฮโรอีน: '', คีตามีน: '', ยาอี: '', อื่นๆ: '', ...d?.slang })

  const [buy, setBuy] = useState({
    channel: '', friend_address: '', method: '', known_from: '', why_here: '',
    seller_count: '', seller_count_unknown: false,
    ...d?.buy,
  })
  const setBuyf = (patch) => setBuy((s) => ({ ...s, ...patch }))
  const [locations, setLocations] = useState(d?.locations ?? [{ ...BLANK_LOC }])
  const [sellers, setSellers] = useState(d?.sellers ?? [])

  const [tail, setTail] = useState({ note: '', interviewer: '', unit: '', interviewed_at: todayISO(), interviewer_phone: '', ...d?.tail })
  const setTailf = (patch) => setTail((s) => ({ ...s, ...patch }))

  // ── ตัวเลือกพื้นที่ (แขวง/ชุมชน ตามเขต) ──
  const [area, setArea] = useState({ subdistricts: {}, communities: {} })
  useEffect(() => {
    let cancelled = false
    loadAreaOptions().then((a) => {
      if (cancelled) return
      setArea(a)
      loadCommunitiesFromData().then((db) => {
        if (!cancelled) setArea({ subdistricts: a.subdistricts, communities: mergeCommunities(a.communities, db) })
      })
    })
    return () => { cancelled = true }
  }, [])
  const subsOf = (d) => area.subdistricts[d] || []
  const comsOf = (d, s) => area.communities[`${d}|${s}`] || area.communities[`${d}|`] || []

  // รายชื่อจังหวัด/อำเภอ/ตำบลทั่วประเทศ — โหลดเมื่อมีแหล่งซื้อแถวไหนเลือก "จังหวัดอื่น" เท่านั้น
  // (ไฟล์ใหญ่กว่ารายชื่อกรุงเทพฯ มาก ไม่ได้ใช้ก็ไม่ต้องโหลด)
  // null = ยังไม่โหลด/กำลังโหลด ; false = โหลดไม่สำเร็จ → ถอยไปใช้ช่องพิมพ์เอง
  const needThai = locations.some((l) => l.scope && l.scope !== LOC_BKK)
  const [thai, setThai] = useState(null)
  useEffect(() => {
    if (!needThai || thai !== null) return
    let cancelled = false
    loadThaiAddress().then((t) => { if (!cancelled) setThai(t || false) })
    return () => { cancelled = true }
  }, [needThai, thai])

  // ── ช่องบังคับกรอก ──────────────────────────────────────────────────────────
  // ช่องที่ผูกกับตัวเลือก (ช่อง "ระบุ" ของ อื่นๆ / จำนวนคนตอนเสพเป็นกลุ่ม ฯลฯ)
  // จะบังคับเฉพาะตอนที่ช่องนั้นเปิดใช้งานจริง ไม่งั้นจะกรอกให้ครบไม่ได้เลย
  const bad = useMemo(() => {
    const f = filled
    // แหล่งซื้อที่นับว่ากรอกแล้ว: เลือกพื้นที่ก่อน แล้ว
    //   กรุงเทพฯ    → ระบุอย่างน้อย 1 ช่อง (บริเวณ/ชุมชน/แขวง/เขต/สน.)
    //   จังหวัดอื่น → ต้องระบุชื่อจังหวัด
    const hasLoc = locations.some((l) => (l.scope === LOC_BKK
      ? f(l.area) || f(l.community) || f(l.subdistrict) || f(l.district) || f(l.station)
      : f(l.scope) && f(l.province)))
    const e = {
      first_name: !f(p.first_name),
      last_name: !f(p.last_name),
      nationality: !f(p.nationality),
      nationality_other: p.nationality === 'อื่นๆ' && !f(p.nationality_other),
      // เลขบัตร (ช่องกรอกกรองให้เหลือเฉพาะตัวเลขแล้ว):
      //   ยังไม่เลือกสัญชาติ → ยังไม่ตรวจ (ช่องปิดอยู่ ให้ไปเตือนที่ช่องสัญชาติแทน)
      //   ไทย              → บังคับ ต้องครบ 13 หลักพอดี
      //   สัญชาติอื่น       → ไม่บังคับ และไม่ต้องครบ 13 หลัก (เอกสารต่างด้าวเลขไม่เท่ากัน) กรอกเท่าที่มีได้
      national_id: p.nationality === NATIONALITY_THAI && p.national_id.length !== 13,
      education: !f(p.education),
      education_other: p.education === 'อื่นๆ' && !f(p.education_other),
      occupation: !f(p.occupation),
      occupation_other: p.occupation === 'อื่นๆ' && !f(p.occupation_other),
      income_range: !f(p.income_range),

      // ข้อ ๑–๒ : ต้องเลือกเคย/ไม่เคย และถ้า "เคย" ต้องมีรายการอย่างน้อย 1 ครั้ง
      // (ไม่งั้นได้ข้อมูลขัดกันเอง — ตอบว่าเคย แต่ arrest_count = 0)
      arrest_ever: !f(arrestEver),
      arrest_rows: arrestEver === EVER_YES && !arrests.some((a) => f(a.charge) || f(a.drug)),
      rehab_ever: !f(rehabEver),
      rehab_rows: rehabEver === EVER_YES && !rehabs.some((r) => f(r.drug) || f(r.place)),

      fu_age: !f(fu.age),
      fu_live_community: !f(fu.live_community),
      fu_live_district: !f(fu.live_district),
      fu_drug: !f(fu.drug),
      fu_drug_other: fu.drug === 'อื่นๆ' && !f(fu.drug_other),
      fu_source: !f(fu.source),
      fu_source_other: fu.source === 'อื่นๆ' && !f(fu.source_other),
      fu_reason: !f(fu.reason),
      fu_reason_other: fu.reason === 'อื่นๆ' && !f(fu.reason_other),
      fu_method: !f(fu.method),
      fu_style: !f(fu.style),
      fu_group_size: fu.style === 'เสพเป็นกลุ่ม' && !f(fu.group_size),
      fu_after: !f(fu.after),
      // ระยะเวลา: กรอกปี หรือ เดือน อย่างน้อย 1 ช่องก็พอ
      fu_after_duration: fu.after === 'เสพต่อ' && !f(fu.after_y) && !f(fu.after_m),
      // ช่วงหยุดสารเสพติด (ปี/เดือน) และสาเหตุที่หยุดได้ — ไม่บังคับกรอก

      md_drugs: md.drugs.length === 0,
      md_drug_other: md.drugs.includes('อื่นๆ') && !f(md.drug_other),
      md_usage_type: !f(md.usage_type),
      md_usage_with: f(md.usage_type) && md.usage_type !== 'ใช้ชนิดเดียว' && !f(md.usage_with),
      md_substitute: md.substitute.length === 0,
      md_substitute_other: md.substitute.includes('อื่นๆ') && !f(md.substitute_other),
      md_years_using: !f(md.years_using),
      md_amount_per_time: !f(md.amount_per_time),
      md_max_amount: !f(md.max_amount),
      md_method: md.method.length === 0,
      md_frequency: !f(md.frequency),
      md_frequency_other: md.frequency === 'อื่นๆ' && !f(md.frequency_other),
      md_style: !f(md.style),
      md_group_size: md.style === 'เสพเป็นกลุ่ม' && !f(md.group_size),
      md_places: md.places.length === 0,
      md_place_other: md.places.includes('อื่นๆ') && !f(md.place_other),
      md_place_district: !f(md.place_district),
      md_place_province: !f(md.place_province),
      md_place_station: !f(md.place_station),
      md_availability: !f(md.availability),
      md_availability_reason: !f(md.availability_reason),

      friend_address: buy.channel === CHANNEL_FRIEND && !f(buy.friend_address),
      // ผู้ขายที่ใส่ ID/ชื่อบัญชีแล้ว ต้องบอกช่องทางด้วย — ID อย่างเดียวไม่รู้ว่าอยู่แอปไหน
      seller_contact_channel: sellers.some((s) => f(s.contact_id) && !f(s.contact_channel)),
      // เลือกช่องทาง "อื่นๆ" ต้องระบุชื่อช่องทาง
      seller_contact_other: sellers.some((s) => s.contact_channel === 'อื่นๆ' && !f(s.contact_other)),
      locations: !hasLoc,

      interviewer: !f(tail.interviewer),
      unit: !f(tail.unit),
      interviewed_at: !f(tail.interviewed_at),
    }
    e.count = Object.values(e).filter(Boolean).length
    return e
  }, [p, fu, md, buy, locations, tail, arrestEver, arrests, rehabEver, rehabs, sellers])

  // เตือนสีแดงหลังกดบันทึกครั้งแรกเท่านั้น — ไม่งั้นเปิดหน้ามาฟอร์มแดงทั้งใบ
  const [showErrors, setShowErrors] = useState(false)
  const err = (k) => showErrors && bad[k]

  // ── auto save ──────────────────────────────────────────────────────────────
  // เขียนร่างหลังหยุดพิมพ์ 0.8 วินาที ; ยังไม่ได้แก้อะไรเลย (ตรงกับตอนเปิดหน้า) → ไม่สร้างร่าง
  const snapshotJson = JSON.stringify({ p, arrestEver, rehabEver, arrests, rehabs, fu, md, prices, slang, buy, locations, sellers, tail })
  const [initialJson] = useState(snapshotJson)
  const [draftAt, setDraftAt] = useState(draft?.savedAt ?? null)
  useEffect(() => {
    if (savedRef || snapshotJson === initialJson) return   // บันทึกเข้าระบบแล้ว / ยังไม่ได้แก้อะไร
    const t = setTimeout(() => {
      writeDraft(draftKey, snapshotJson)
      setDraftAt(Date.now())
    }, 800)
    return () => clearTimeout(t)   // พิมพ์ต่อเนื่อง/ออกจากหน้า/กดล้าง → ยกเลิกรอบที่ค้าง
  }, [snapshotJson, initialJson, savedRef, draftKey])

  // บันทึกสำเร็จ → หน่วง 3 วินาทีให้จดเลขทัน แล้วไปหน้าค้นหา
  // ผูกกับ savedRef ใน effect — ออกจากหน้า/กดล้างข้อมูลก่อนครบ 3 วินาที timer ถูกยกเลิก ไม่ดึงผู้ใช้กลับมาหน้าค้นหา
  useEffect(() => {
    if (!savedRef) return
    const t = setTimeout(() => navigate('/intel/interview'), 3000)
    return () => clearTimeout(t)
  }, [savedRef, navigate])

  const handleClear = () => {
    if (!window.confirm('ล้างข้อมูลที่กรอกทั้งหมด?\n\nทุกช่องในฟอร์มและร่างที่บันทึกอัตโนมัติจะถูกลบ กู้คืนไม่ได้')) return
    onClear()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (bad.count) {
      setShowErrors(true)
      setStatus({ error: `ยังกรอกไม่ครบ ${bad.count} ช่อง` })
      // เลื่อนไปช่องแรกที่ขาด (รอ React วาดสีแดงเสร็จก่อน)
      setTimeout(() => {
        document.querySelector('[data-invalid="1"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      return
    }
    setStatus('saving')

    // เลือก "ไม่เคย" → ไม่บันทึกแถวที่อาจกรอกค้างไว้ก่อนเปลี่ยนใจ
    const arrestList = (arrestEver === EVER_YES ? arrests : []).filter((a) => a.charge.trim() || a.drug.trim()).map((a) => ({
      seq: num(a.seq), charge: clean(a.charge), drug: clean(a.drug),
      amount: num(a.amount), unit: clean(a.unit), station: clean(a.station), year: num(a.year),
    }))
    const rehabList = (rehabEver === EVER_YES ? rehabs : []).filter((r) => r.drug.trim() || r.place.trim()).map((r) => ({
      seq: num(r.seq), drug: clean(r.drug), place: clean(r.place), year: num(r.year),
    }))
    const regular_drugs = prices.filter((d) => d.drug.trim() && num(d.price) != null && d.unit.trim()).map((d) => ({
      drug: d.drug.trim(), price: num(d.price), unit: d.unit.trim(), period: clean(d.period),
      rawPrice: `${d.price} บาท/${d.unit.trim()}`, amount: 1,
    }))
    // แถวที่ยังไม่เลือกกรุงเทพฯ/จังหวัดอื่น ไม่บันทึก ; บก.น. มีเฉพาะกรุงเทพฯ
    // จังหวัดอื่น: อำเภอเก็บที่ district, ตำบลเก็บที่ subdistrict (คีย์เดียวกับเขต/แขวง)
    const dealer_locations = locations
      .filter((l) => l.scope && [l.area, l.community, l.subdistrict, l.district, l.province, l.station].some(filled))
      .map((l) => {
        const isBkk = l.scope === LOC_BKK
        return {
          area: clean(l.area), community: clean(l.community), subdistrict: clean(l.subdistrict),
          district: clean(l.district), province: isBkk ? LOC_BKK : clean(l.province),
          station: clean(l.station), bkn: isBkk ? clean(bknOfStation(l.station) || l.bkn) : null,
        }
      })

    // สุ่ม UUID — เดิมใช้ hash 32 บิตจากข้อมูลฟอร์ม ซึ่งชนกันได้ แล้วบันทึกล้มด้วย duplicate key
    const record_uid = 'u:' + (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)

    // ระยะเวลาแยก ปี/เดือน → เก็บทั้งตัวเลข (ไว้คำนวณสถิติ) และข้อความอ่านง่าย (แผงรายละเอียดใช้แสดง)
    const afterDur = fu.after === 'เสพต่อ' ? toDuration(fu.after_y, fu.after_m) : null
    const quitDur = fu.never_quit ? null : toDuration(fu.quit_y, fu.quit_m)

    // 1) เนื้อหาแบบฟอร์ม
    const row = {
      record_uid,
      fiscal_year: dateToFiscalYear(tail.interviewed_at),
      surveyed_at: tail.interviewed_at,
      age: num(p.age),
      nationality: clean(p.nationality === 'อื่นๆ' ? p.nationality_other : p.nationality),
      religion: clean(p.religion === 'อื่นๆ' ? p.religion_other : p.religion),
      marital_status: clean(p.marital_status),
      education: clean(p.education === 'อื่นๆ' ? p.education_other : p.education),
      education_place: clean(p.education_place),
      resident_status: clean(p.resident_status),
      residence: cleanObj({
        community: p.addr_building, subdistrict: p.subdistrict, district: p.district,
        // บก.น. อิงจาก สน. เสมอ (กันร่างเก่าที่ บก.น. ไม่ตรงกับ สน.)
        province: p.province, station: p.station, bkn: bknOfStation(p.station) || p.bkn,
      }),
      occupation: clean(p.occupation === 'อื่นๆ' ? p.occupation_other : p.occupation),
      work_info: cleanObj({
        place: p.work_place, district: p.work_district, province: p.work_province,
        nature: p.work_nature, outbreak: p.workplace_outbreak, outbreak_detail: p.workplace_outbreak_detail,
      }),
      income_range: clean(p.income_range),
      arrest_count: arrestList.length,
      arrests: arrestList,
      rehab_count: rehabList.length,
      rehabs: rehabList,
      first_use_age: num(fu.age),
      first_drug: clean(fu.drug === 'อื่นๆ' ? fu.drug_other : fu.drug),
      first_reason: clean(fu.reason === 'อื่นๆ' ? fu.reason_other : fu.reason),
      first_use: cleanObj({
        community: fu.live_community, district: fu.live_district, province: fu.live_province,
        source: fu.source === 'อื่นๆ' ? fu.source_other : fu.source, method: fu.method, style: fu.style, group_size: num(fu.group_size),
        after: fu.after, after_duration: afterDur?.text, after_years: afterDur?.years, after_months: afterDur?.months,
        quit_duration: fu.never_quit ? 'ไม่เคยหยุด' : quitDur?.text, quit_years: quitDur?.years, quit_months: quitDur?.months,
        quit_reason: fu.never_quit ? null : fu.quit_reason,
      }),
      main_drug: cleanObj({
        drugs: md.drugs, drug_other: md.drug_other, usage_type: md.usage_type, usage_with: md.usage_with,
        substitute: md.substitute, substitute_other: md.substitute_other, years_using: md.years_using,
        amount_per_time: md.amount_per_time, max_amount: md.max_amount, method: md.method,
        frequency: md.frequency === 'อื่นๆ' ? md.frequency_other : md.frequency,
        style: md.style, group_size: num(md.group_size), places: md.places, place_other: md.place_other,
        place_district: md.place_district, place_province: md.place_province, place_station: md.place_station,
        availability: md.availability, availability_reason: md.availability_reason,
      }),
      regular_drugs,
      dealer_locations,
      purchase: cleanObj({
        channel: buy.channel, method: buy.method, known_from: buy.known_from, why_here: buy.why_here,
        // ที่อยู่เพื่อนที่ฝากซื้อไม่เก็บตรงนี้ — เป็นข้อมูลบุคคลที่สาม เก็บฝั่ง PII
        seller_count: buy.seller_count_unknown ? 'ระบุไม่ได้ แต่มีมากกว่า 1 ราย' : buy.seller_count,
      }),
      drug_slang: cleanObj(slang),
      interview_info: cleanObj({ unit: tail.unit, interviewed_at: tail.interviewed_at }),
      note: clean(tail.note),
    }

    // 2) ข้อมูลส่วนบุคคล (ตารางแยก — แอดมินเท่านั้น)
    // ช่องทางติดต่อ → [{ channel, id }] (เก็บเป็นรายการ เผื่อวันหน้าให้ใส่ได้หลายช่องทาง)
    // รู้แค่ช่องทางแต่ไม่รู้ ID ก็เก็บ — รู้ว่าผู้ขายใช้แอปไหนก็มีประโยชน์
    // "อื่นๆ" เก็บชื่อช่องทางที่ระบุ ไม่ใช่คำว่า "อื่นๆ"
    const contactsOf = (s) => {
      const channel = s.contact_channel === 'อื่นๆ' ? (clean(s.contact_other) || 'อื่นๆ') : clean(s.contact_channel)
      const id = clean(s.contact_id)
      return channel || id ? [{ channel, id }] : []
    }
    // เก็บผู้ขายที่มีข้อมูลระบุตัวอย่างน้อย 1 อย่าง — รวมเบอร์โทรและ ID ช่องทางติดต่อ (LINE ID อย่างเดียวก็ใช้สืบต่อได้)
    const sellerList = sellers
      .filter((s) => [s.full_name, s.alias, s.appearance, s.phone, s.contact_id].some(filled))
      .map((s) => ({
        full_name: clean(s.full_name), alias: clean(s.alias), sex: clean(s.sex), age: num(s.age),
        appearance: clean(s.appearance), type: clean(s.type === 'อื่นๆ' ? s.type_other : s.type),
        zone: clean(s.zone), phone: clean(s.phone), contacts: contactsOf(s),
        weapon: clean(s.weapon), weapon_type: clean(s.weapon_type), vehicle: clean(s.vehicle),
      }))
    const pii = {
      record_uid,
      full_name: clean([p.first_name, p.last_name].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ')),
      alias: clean(p.alias), national_id: clean(p.national_id),
      birth_date: clean(p.birth_date), phone: clean(p.phone), contact_phone: clean(p.contact_phone),
      friend_address: buy.channel === CHANNEL_FRIEND ? clean(buy.friend_address) : null,
      address: cleanObj({
        area: p.addr_area, no: p.addr_no, moo: p.addr_moo, building: p.addr_building,
        floor: p.addr_floor, room: p.addr_room, soi: p.addr_soi, road: p.addr_road,
      }),
      sellers: sellerList,
      interviewer: cleanObj({ name: tail.interviewer, unit: tail.unit, phone: tail.interviewer_phone }),
    }
    const hasPii = pii.full_name || pii.national_id || pii.phone || pii.address
      || pii.friend_address || sellerList.length || pii.interviewer
    // บันทึก 2 ตารางใน transaction เดียวฝั่งฐานข้อมูล (RPC save_interview) — สำเร็จทั้งคู่หรือไม่เข้าเลย
    // ไม่มีแถวกำพร้าแม้เน็ตหลุด/ปิดแท็บกลางทาง ; ถ้าล้มเหลวข้อมูลในฟอร์มยังอยู่ครบ กดบันทึกใหม่ได้
    const { data: saved, error } = await supabase
      .rpc('save_interview', { p_record: row, p_pii: hasPii ? pii : null })
      .single()
    if (error) { setStatus({ error: `บันทึกไม่สำเร็จ: ${error.message}` }); return }

    setSavedRef({ code: saved?.code || null, doc_no: saved?.doc_no || null })   // effect ด้านบนพาไปหน้าค้นหาใน 3 วินาที
    setStatus('saved')
    removeDraft(draftKey)   // บันทึกเข้าระบบแล้ว ร่างไม่ต้องเก็บต่อ
    logAction?.('create', 'interview_records', record_uid, { hasPii: !!hasPii })
  }

  const unitOptions = UNIT_FALLBACK

  return (
    <IntelPage title="บันทึกแบบซักผู้เสพ"
      sub="แบบเก็บข้อมูลจากผู้เสพ (แบบเก็บข้อมูลบุคคล ๑-๑) · ส่วนวิเคราะห์ข่าวและเฝ้าระวัง ปปส.กทม."
      backTo="/intel/interview">

      <form onSubmit={handleSubmit} className="space-y-5">
        {draft && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] text-blue-900">
            <span className="font-semibold">กู้คืนข้อมูลที่กรอกค้างไว้แล้ว</span>
            {' '}— บันทึกร่างอัตโนมัติล่าสุดเวลา {fmtTime(draft.savedAt)} น.
            <span className="block mt-0.5 text-[11.5px] text-blue-700/80">
              ร่างเก็บไว้เฉพาะในแท็บนี้ ปิดแท็บแล้วจะหาย · ถ้าต้องการเริ่มใหม่ กด "ล้างข้อมูล" ด้านล่าง
            </span>
          </div>
        )}

        <Card title="ส่วนที่ ๑ ข้อมูลบุคคล" sub="ช่องที่ระบุตัวบุคคลถูกเก็บแยกตาราง เข้าถึงได้เฉพาะผู้ดูแลระบบ">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="เลขที่แบบ" hint="ระบบออกเลขให้อัตโนมัติเมื่อกดบันทึก">
              <Input value="๑-๑/…" readOnly disabled />
            </Field>
            <Field label="ชื่อ" required error={err('first_name')}><Input value={p.first_name} onChange={(e) => setPf({ first_name: e.target.value })} /></Field>
            <Field label="นามสกุล" required error={err('last_name')}><Input value={p.last_name} onChange={(e) => setPf({ last_name: e.target.value })} /></Field>
            <Field label="ชื่ออื่นๆ / ฉายา"><Input value={p.alias} onChange={(e) => setPf({ alias: e.target.value })} /></Field>
            <Field label="อายุ (ปี)"><Input type="number" min="0" max="120" value={p.age} onChange={(e) => setPf({ age: e.target.value })} /></Field>
            <Field label="วัน เดือน ปีเกิด"><Input type="date" value={p.birth_date} onChange={(e) => setPf({ birth_date: e.target.value })} /></Field>
            {/* สัญชาติต้องเลือกก่อน — เป็นตัวกำหนดว่าเลขประจำตัวประชาชนบังคับกรอกหรือไม่ */}
            <Field label="สัญชาติ" required error={err('nationality') && 'กรุณาเลือกสัญชาติก่อน'}>
              {/* เปลี่ยนเป็นสัญชาติไทย → ตัดตัวอักษรออกจากเลขบัตร ให้เหลือเฉพาะตัวเลขตามรูปแบบไทย */}
              <ChipGroup options={NATIONALITY_OPTIONS} value={p.nationality}
                onChange={(v) => setPf({
                  nationality: v,
                  national_id: v === NATIONALITY_THAI ? p.national_id.replace(/\D/g, '').slice(0, 13) : p.national_id,
                })} />
            </Field>
            {p.nationality === 'อื่นๆ' && (
              <Field label="ระบุสัญชาติ" required error={err('nationality_other')}>
                <Input value={p.nationality_other} placeholder="เช่น เมียนมา ลาว กัมพูชา"
                  onChange={(e) => setPf({ nationality_other: e.target.value })} autoFocus />
              </Field>
            )}
            {(() => {
              const picked = !!p.nationality
              const isThai = p.nationality === NATIONALITY_THAI
              const n = p.national_id.length
              return (
                <Field label={picked && !isThai ? 'เลขประจำตัวประชาชน (ถ้ามี)' : 'เลขประจำตัวประชาชน'} required={isThai}
                  error={err('national_id') && (n ? `ต้องครบ 13 หลัก (กรอกแล้ว ${n} หลัก)` : 'กรุณากรอกเลข 13 หลัก')}
                  hint={!picked ? 'เลือกสัญชาติก่อน'
                    : isThai ? 'เลข 13 หลัก กรอกตัวเลขเท่านั้น ระบบจะใส่ขีดให้อัตโนมัติ'
                    : 'ไม่ใช่สัญชาติไทย ไม่บังคับกรอก — กรอกเท่าที่มี ไม่ต้องครบ 13 หลัก'}>
                  {/* ไทย: ตัวเลขล้วน 13 หลัก แสดงเป็น x-xxxx-xxxxx-xx-x ขีดใส่ให้อัตโนมัติ พิมพ์ตัวอักษรไม่ติด
                      สัญชาติอื่น: พิมพ์ได้ทั้งตัวเลขและตัวอักษร (เลขเอกสารต่างด้าว/หนังสือเดินทาง) เก็บตามที่พิมพ์ */}
                  <Input value={isThai ? formatNationalId(p.national_id) : p.national_id}
                    inputMode={isThai ? 'numeric' : 'text'} maxLength={isThai ? 17 : 30}
                    disabled={!picked}
                    placeholder={!picked ? 'เลือกสัญชาติก่อน' : isThai ? 'x-xxxx-xxxxx-xx-x' : 'เลขบัตร/เลขเอกสาร เช่น MM1234567'}
                    onChange={(e) => setPf({
                      national_id: isThai ? e.target.value.replace(/\D/g, '').slice(0, 13) : e.target.value.slice(0, 30),
                    })} />
                </Field>
              )
            })()}
            <Field label="โทรศัพท์มือถือ"><Input value={p.phone} onChange={(e) => setPf({ phone: e.target.value })} inputMode="tel" /></Field>
            <Field label="โทรศัพท์ที่ติดต่อได้"><Input value={p.contact_phone} onChange={(e) => setPf({ contact_phone: e.target.value })} inputMode="tel" /></Field>
            <Field label="ศาสนา" className="sm:col-span-3">
              <ChipGroup options={RELIGION_OPTIONS} value={p.religion} onChange={(v) => setPf({ religion: v })} />
            </Field>
            {p.religion === 'อื่นๆ' && (
              <Field label="ระบุศาสนา" className="sm:col-span-3">
                <Input value={p.religion_other} onChange={(e) => setPf({ religion_other: e.target.value })} autoFocus />
              </Field>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="text-[13px] font-semibold text-slate-700 mb-3">ที่อยู่อาศัยปัจจุบัน (ล่าสุด)</div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Field label="บริเวณ/สถานที่ใกล้ที่อยู่" className="sm:col-span-2"><Input value={p.addr_area} onChange={(e) => setPf({ addr_area: e.target.value })} /></Field>
              <Field label="เลขที่"><Input value={p.addr_no} onChange={(e) => setPf({ addr_no: e.target.value })} /></Field>
              <Field label="หมู่ที่"><Input value={p.addr_moo} onChange={(e) => setPf({ addr_moo: e.target.value })} /></Field>
              <Field label="ชุมชน/อาคาร/แฟลต" className="sm:col-span-2"><Input value={p.addr_building} onChange={(e) => setPf({ addr_building: e.target.value })} /></Field>
              <Field label="ชั้น"><Input value={p.addr_floor} onChange={(e) => setPf({ addr_floor: e.target.value })} /></Field>
              <Field label="ห้อง"><Input value={p.addr_room} onChange={(e) => setPf({ addr_room: e.target.value })} /></Field>
              <Field label="ซอย"><Input value={p.addr_soi} onChange={(e) => setPf({ addr_soi: e.target.value })} /></Field>
              <Field label="ถนน"><Input value={p.addr_road} onChange={(e) => setPf({ addr_road: e.target.value })} /></Field>
              <Field label="เขต/อำเภอ">
                <Select options={DISTRICTS} value={p.district}
                  onChange={(e) => setPf({ district: e.target.value, subdistrict: '' })} placeholder="— เลือกเขต —" />
              </Field>
              <Field label="แขวง/ตำบล">
                <Input list="dl-p-sub" value={p.subdistrict} disabled={!p.district}
                  placeholder={p.district ? 'เลือกหรือพิมพ์' : 'เลือกเขตก่อน'}
                  onChange={(e) => setPf({ subdistrict: e.target.value })} />
                <datalist id="dl-p-sub">{subsOf(p.district).map((v) => <option key={v} value={v} />)}</datalist>
              </Field>
              <Field label="กทม./จังหวัด"><Input value={p.province} onChange={(e) => setPf({ province: e.target.value })} /></Field>
              {/* ที่อยู่อาจอยู่ต่างจังหวัด — เลือก สน. จากรายการ หรือพิมพ์ สภ. เองได้ ; ตรงกับ สน. ในกรุงเทพฯ แล้วใส่ บก.น. ให้ */}
              <Field label="สน./สภ." hint="เลือก สน. จากรายการ หรือพิมพ์ สภ. เอง">
                <Input list="dl-station" value={p.station} placeholder="เลือกหรือพิมพ์"
                  onChange={(e) => setPf({ station: e.target.value, bkn: bknOfStation(e.target.value) })} />
              </Field>
              <Field label="บก.น." hint="ระบบใส่ให้ตาม สน. ที่เลือก">
                <Input value={p.bkn} readOnly disabled placeholder={p.station ? 'ไม่ใช่ สน. ในกรุงเทพฯ' : 'เลือก สน. ก่อน'} />
              </Field>
              <Field label="อาศัยอยู่ในฐานะ" className="sm:col-span-2">
                <ChipGroup options={RESIDENT_STATUS_OPTIONS} value={p.resident_status} onChange={(v) => setPf({ resident_status: v })} />
              </Field>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 space-y-4">
            <Field label="สถานภาพการสมรส">
              <ChipGroup options={MARITAL_OPTIONS} value={p.marital_status} onChange={(v) => setPf({ marital_status: v })} />
            </Field>
            <Field label="จบการศึกษา" required error={err('education')}>
              <ChipGroup options={EDUCATION_OPTIONS} value={p.education} onChange={(v) => setPf({ education: v })} />
            </Field>
            {p.education === 'อื่นๆ' && (
              <Field label="ระบุระดับการศึกษา" required error={err('education_other')}>
                <Input value={p.education_other} onChange={(e) => setPf({ education_other: e.target.value })} autoFocus />
              </Field>
            )}
            <Field label="ชื่อสถานศึกษาที่จบ/กำลังศึกษา">
              <Input value={p.education_place} onChange={(e) => setPf({ education_place: e.target.value })} />
            </Field>
            <Field label="อาชีพ" required error={err('occupation')}>
              <ChipGroup options={OCCUPATION_OPTIONS} value={p.occupation} onChange={(v) => setPf({ occupation: v })} />
            </Field>
            {p.occupation === 'อื่นๆ' && (
              <Field label="ระบุอาชีพ" required error={err('occupation_other')}>
                <Input value={p.occupation_other} onChange={(e) => setPf({ occupation_other: e.target.value })} autoFocus />
              </Field>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="สถานที่ทำงาน"><Input value={p.work_place} onChange={(e) => setPf({ work_place: e.target.value })} /></Field>
              <Field label="เขต/อำเภอ (ที่ทำงาน)"><Input value={p.work_district} onChange={(e) => setPf({ work_district: e.target.value })} /></Field>
              <Field label="จังหวัด (ที่ทำงาน)"><Input value={p.work_province} onChange={(e) => setPf({ work_province: e.target.value })} /></Field>
            </div>
            <Field label="รายได้ต่อเดือน" required error={err('income_range')} hint="เลือกจากรายการ หรือพิมพ์เองก็ได้">
              <Input list="dl-income" value={p.income_range} placeholder="เลือกหรือพิมพ์ช่วงรายได้"
                onChange={(e) => setPf({ income_range: e.target.value })} />
            </Field>
            <Field label="ลักษณะงาน"><Input value={p.work_nature} onChange={(e) => setPf({ work_nature: e.target.value })} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <Field label="การแพร่ระบาดในที่ทำงาน">
                <ChipGroup options={HAS_OPTIONS} value={p.workplace_outbreak} onChange={(v) => setPf({ workplace_outbreak: v })} />
              </Field>
              <Field label="ลักษณะ" className="sm:col-span-2">
                <Input value={p.workplace_outbreak_detail} disabled={p.workplace_outbreak !== 'มี'}
                  onChange={(e) => setPf({ workplace_outbreak_detail: e.target.value })} />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="๑. เคยถูกจับคดียาเสพติด" sub="เลือกก่อนว่าเคยหรือไม่เคย — ถ้าเคย ระบุข้อมูล ๒ ครั้งล่าสุด (จำนวนครั้งนับจากรายการที่กรอก)">
          <Field label="เคยถูกจับคดียาเสพติดหรือไม่" required error={err('arrest_ever') && 'กรุณาเลือก'}>
            {/* เลือก "เคย" แล้วเพิ่มแถวว่างให้ 1 แถวทันที จะได้กรอกต่อได้เลย */}
            <ChipGroup options={EVER_OPTIONS} value={arrestEver}
              onChange={(v) => { setArrestEver(v); if (v === EVER_YES && arrests.length === 0) setArrests([{ ...BLANK_ARREST }]) }} />
          </Field>
          {arrestEver === EVER_YES && (
            <div className="mt-4" data-invalid={err('arrest_rows') ? '1' : undefined}>
              {err('arrest_rows') && (
                <p className="mb-2 text-[11px] font-medium text-rose-600">กรุณากรอกอย่างน้อย 1 ครั้ง (ระบุข้อหา หรือ ชนิดยา)</p>
              )}
              <RepeatList rows={arrests} onChange={setArrests} blank={BLANK_ARREST} cols={4}
                addLabel="เพิ่มครั้งที่ถูกจับ" empty="ยังไม่ได้เพิ่มรายการ — กดปุ่มด้านล่างเพื่อเพิ่ม"
                renderRow={(row, patch) => (
                  <>
                    <Field label="ครั้งที่"><Input type="number" value={row.seq} onChange={(e) => patch({ seq: e.target.value })} /></Field>
                    <Field label="ข้อหา"><Input list="dl-charge" value={row.charge} onChange={(e) => patch({ charge: e.target.value })} /></Field>
                    <Field label="ชนิดยา"><Input list="dl-drug" value={row.drug} onChange={(e) => patch({ drug: e.target.value })} /></Field>
                    <Field label="จำนวน"><Input type="number" step="any" value={row.amount} onChange={(e) => patch({ amount: e.target.value })} /></Field>
                    <Field label="หน่วย"><Input list="dl-unit" value={row.unit} onChange={(e) => patch({ unit: e.target.value })} /></Field>
                    <Field label="สน./สภ."><Input value={row.station} onChange={(e) => patch({ station: e.target.value })} /></Field>
                    <Field label="เมื่อปี (พ.ศ.)"><Input list="dl-year" inputMode="numeric" value={row.year} onChange={(e) => patch({ year: e.target.value })} /></Field>
                  </>
                )} />
            </div>
          )}
        </Card>

        <Card title="๒. เคยเข้ารับการบำบัด" sub="เลือกก่อนว่าเคยหรือไม่เคย — ถ้าเคย ระบุข้อมูล ๒ ครั้งล่าสุด">
          <Field label="เคยเข้ารับการบำบัดหรือไม่" required error={err('rehab_ever') && 'กรุณาเลือก'}>
            <ChipGroup options={EVER_OPTIONS} value={rehabEver}
              onChange={(v) => { setRehabEver(v); if (v === EVER_YES && rehabs.length === 0) setRehabs([{ ...BLANK_REHAB }]) }} />
          </Field>
          {rehabEver === EVER_YES && (
            <div className="mt-4" data-invalid={err('rehab_rows') ? '1' : undefined}>
              {err('rehab_rows') && (
                <p className="mb-2 text-[11px] font-medium text-rose-600">กรุณากรอกอย่างน้อย 1 ครั้ง (ระบุชนิดยา หรือ สถานที่บำบัด)</p>
              )}
              <RepeatList rows={rehabs} onChange={setRehabs} blank={BLANK_REHAB} cols={4}
                addLabel="เพิ่มครั้งที่บำบัด" empty="ยังไม่ได้เพิ่มรายการ — กดปุ่มด้านล่างเพื่อเพิ่ม"
                renderRow={(row, patch) => (
                  <>
                    <Field label="ครั้งที่"><Input type="number" value={row.seq} onChange={(e) => patch({ seq: e.target.value })} /></Field>
                    <Field label="ชนิดยา"><Input list="dl-drug" value={row.drug} onChange={(e) => patch({ drug: e.target.value })} /></Field>
                    <Field label="สถานที่บำบัด"><Input value={row.place} onChange={(e) => patch({ place: e.target.value })} /></Field>
                    <Field label="เมื่อปี (พ.ศ.)"><Input list="dl-year" inputMode="numeric" value={row.year} onChange={(e) => patch({ year: e.target.value })} /></Field>
                  </>
                )} />
            </div>
          )}
        </Card>

        <Card title="๓. การเสพยาครั้งแรก">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="อายุประมาณ (ปี)" required error={err('fu_age')}><Input type="number" value={fu.age} onChange={(e) => setFuf({ age: e.target.value })} /></Field>
              <Field label="อาศัยอยู่ กทม./ชุมชน" required error={err('fu_live_community')}><Input value={fu.live_community} onChange={(e) => setFuf({ live_community: e.target.value })} /></Field>
              <Field label="เขต" required error={err('fu_live_district')}><Input value={fu.live_district} onChange={(e) => setFuf({ live_district: e.target.value })} /></Field>
            </div>
            <Field label="ชนิดยาเสพติดที่ใช้เสพครั้งแรก" required error={err('fu_drug') && 'กรุณาเลือก'}>
              <ChipGroup options={FIRST_DRUG_OPTIONS} value={fu.drug} onChange={(v) => setFuf({ drug: v })} />
            </Field>
            {fu.drug === 'อื่นๆ' && <Field label="ระบุชนิดยา" required error={err('fu_drug_other')}><Input value={fu.drug_other} onChange={(e) => setFuf({ drug_other: e.target.value })} /></Field>}
            <Field label="ยาเสพติดที่เสพครั้งแรกได้มาจาก" required error={err('fu_source') && 'กรุณาเลือก'}>
              <ChipGroup options={FIRST_SOURCE_OPTIONS} value={fu.source} onChange={(v) => setFuf({ source: v })} />
            </Field>
            {fu.source === 'อื่นๆ' && (
              <Field label="ระบุแหล่งที่ได้มา" required error={err('fu_source_other')}>
                <Input value={fu.source_other} onChange={(e) => setFuf({ source_other: e.target.value })} autoFocus />
              </Field>
            )}
            <Field label="สาเหตุที่ใช้ยาเสพติดครั้งแรก" required error={err('fu_reason') && 'กรุณาเลือก'}>
              <ChipGroup options={FIRST_REASON_OPTIONS} value={fu.reason} onChange={(v) => setFuf({ reason: v })} />
            </Field>
            {fu.reason === 'อื่นๆ' && <Field label="ระบุสาเหตุ" required error={err('fu_reason_other')}><Input value={fu.reason_other} onChange={(e) => setFuf({ reason_other: e.target.value })} /></Field>}
            <Field label="เสพครั้งแรกโดยวิธี" required error={err('fu_method') && 'กรุณาเลือก'}>
              <ChipGroup options={USE_METHOD_OPTIONS} value={fu.method} onChange={(v) => setFuf({ method: v })} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Field label="ลักษณะการเสพครั้งแรก" required error={err('fu_style') && 'กรุณาเลือก'}>
                <ChipGroup options={USE_STYLE_OPTIONS} value={fu.style} onChange={(v) => setFuf({ style: v })} />
              </Field>
              <Field label="เสพเป็นกลุ่ม ครั้งละประมาณ (คน)" required={fu.style === 'เสพเป็นกลุ่ม'} error={err('fu_group_size')}>
                <Input type="number" value={fu.group_size} disabled={fu.style !== 'เสพเป็นกลุ่ม'}
                  onChange={(e) => setFuf({ group_size: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Field label="หลังจากเสพยาครั้งแรก" required error={err('fu_after') && 'กรุณาเลือก'}>
                <ChipGroup options={AFTER_FIRST_OPTIONS} value={fu.after} onChange={(v) => setFuf({ after: v })} />
              </Field>
              <Field label="เสพต่อนาน" required={fu.after === 'เสพต่อ'}
                error={err('fu_after_duration') && 'กรุณากรอกปี หรือ เดือน อย่างน้อย 1 ช่อง'}>
                <YearMonth y={fu.after_y} m={fu.after_m} disabled={fu.after !== 'เสพต่อ'}
                  onY={(v) => setFuf({ after_y: v })} onM={(v) => setFuf({ after_m: v })} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="เคยมีช่วงหยุดสารเสพติด นาน">
                <YearMonth y={fu.quit_y} m={fu.quit_m} disabled={fu.never_quit}
                  onY={(v) => setFuf({ quit_y: v })} onM={(v) => setFuf({ quit_m: v })} />
              </Field>
              <Field label="สาเหตุที่หยุดได้">
                <Input value={fu.quit_reason} disabled={fu.never_quit}
                  onChange={(e) => setFuf({ quit_reason: e.target.value })} />
              </Field>
            </div>
            {/* ช่องปี/เดือนเป็นตัวเลข พิมพ์คำว่า "ไม่เคย" ไม่ได้แล้ว — จึงมีตัวเลือกนี้แทน */}
            <label className="flex items-center gap-2 text-sm text-slate-700 w-fit cursor-pointer">
              <input type="checkbox" className="accent-blue-600" checked={fu.never_quit}
                onChange={(e) => setFuf({ never_quit: e.target.checked })} />
              ไม่เคยหยุดเสพ
            </label>
          </div>
        </Card>

        <Card title="๔. ยาเสพติดหลักที่ใช้เป็นประจำ">
          <div className="space-y-4">
            <Field label="ยาเสพติดหลักที่ใช้เป็นประจำ (เลือกได้หลายชนิด)" required error={err('md_drugs') && 'กรุณาเลือกอย่างน้อย 1 ชนิด'}>
              <ChipGroup multi options={MAIN_DRUG_OPTIONS} value={md.drugs} onChange={(v) => setMdf({ drugs: v })} />
            </Field>
            {md.drugs.includes('อื่นๆ') && <Field label="ระบุชนิดยา" required error={err('md_drug_other')}><Input value={md.drug_other} onChange={(e) => setMdf({ drug_other: e.target.value })} /></Field>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Field label="ลักษณะการใช้ยา" required error={err('md_usage_type') && 'กรุณาเลือก'}>
                <ChipGroup options={USAGE_TYPE_OPTIONS} value={md.usage_type} onChange={(v) => setMdf({ usage_type: v })} />
              </Field>
              <Field label="ระบุยาที่ใช้ร่วม/สลับ" required={!!md.usage_type && md.usage_type !== 'ใช้ชนิดเดียว'} error={err('md_usage_with')}>
                <Input value={md.usage_with} disabled={md.usage_type === 'ใช้ชนิดเดียว' || !md.usage_type}
                  onChange={(e) => setMdf({ usage_with: e.target.value })} />
              </Field>
            </div>
            <Field label="หากไม่มีตัวยาหลัก จะใช้ยาเสพติดตัวใดแทน (เลือกได้หลายชนิด)" required error={err('md_substitute') && 'กรุณาเลือกอย่างน้อย 1 ข้อ'}>
              <ChipGroup multi options={SUBSTITUTE_OPTIONS} value={md.substitute} onChange={(v) => setMdf({ substitute: v })} />
            </Field>
            {md.substitute.includes('อื่นๆ') && <Field label="ระบุยาที่ใช้แทน" required error={err('md_substitute_other')}><Input value={md.substitute_other} onChange={(e) => setMdf({ substitute_other: e.target.value })} /></Field>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="ใช้มานาน (ปี)" required error={err('md_years_using')}><Input value={md.years_using} onChange={(e) => setMdf({ years_using: e.target.value })} /></Field>
              <Field label="ปริมาณที่ใช้ต่อครั้ง/วัน (ระบุหน่วย)" required error={err('md_amount_per_time')}><Input value={md.amount_per_time} onChange={(e) => setMdf({ amount_per_time: e.target.value })} /></Field>
              <Field label="ปริมาณที่เคยใช้มากที่สุดต่อครั้ง/วัน" required error={err('md_max_amount')}><Input value={md.max_amount} onChange={(e) => setMdf({ max_amount: e.target.value })} /></Field>
            </div>
            <Field label="เสพประจำโดยวิธี (เลือกได้หลายวิธี)" required error={err('md_method') && 'กรุณาเลือกอย่างน้อย 1 วิธี'}>
              <ChipGroup multi options={USE_METHOD_OPTIONS} value={md.method} onChange={(v) => setMdf({ method: v })} />
            </Field>
            <Field label="ความถี่ในการใช้" required error={err('md_frequency') && 'กรุณาเลือก'}>
              <ChipGroup options={FREQUENCY_OPTIONS} value={md.frequency} onChange={(v) => setMdf({ frequency: v })} />
            </Field>
            {md.frequency === 'อื่นๆ' && <Field label="ระบุความถี่" required error={err('md_frequency_other')}><Input value={md.frequency_other} onChange={(e) => setMdf({ frequency_other: e.target.value })} /></Field>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Field label="ลักษณะการเสพส่วนใหญ่" required error={err('md_style') && 'กรุณาเลือก'}>
                <ChipGroup options={USE_STYLE_OPTIONS} value={md.style} onChange={(v) => setMdf({ style: v })} />
              </Field>
              <Field label="เสพเป็นกลุ่ม ครั้งละประมาณ (คน)" required={md.style === 'เสพเป็นกลุ่ม'} error={err('md_group_size')}>
                <Input type="number" value={md.group_size} disabled={md.style !== 'เสพเป็นกลุ่ม'}
                  onChange={(e) => setMdf({ group_size: e.target.value })} />
              </Field>
            </div>
            <Field label="สถานที่ใช้เสพยาเสพติด (เลือกได้หลายที่)" required error={err('md_places') && 'กรุณาเลือกอย่างน้อย 1 ที่'}>
              <ChipGroup multi options={USE_PLACE_OPTIONS} value={md.places} onChange={(v) => setMdf({ places: v })} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Field label="ระบุสถานที่/บริเวณ" required={md.places.includes('อื่นๆ')} error={err('md_place_other')}>
                <Input value={md.place_other} disabled={!md.places.includes('อื่นๆ')}
                  placeholder={md.places.includes('อื่นๆ') ? '' : 'เลือก "อื่นๆ" ก่อน'}
                  onChange={(e) => setMdf({ place_other: e.target.value })} />
              </Field>
              <Field label="เขต" required error={err('md_place_district')}><Input value={md.place_district} onChange={(e) => setMdf({ place_district: e.target.value })} /></Field>
              <Field label="จังหวัด" required error={err('md_place_province')}><Input value={md.place_province} onChange={(e) => setMdf({ place_province: e.target.value })} /></Field>
              <Field label="สน./สภ." required error={err('md_place_station')}><Input value={md.place_station} onChange={(e) => setMdf({ place_station: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Field label="หาซื้อยาเสพติดชนิดนี้ได้" required error={err('md_availability') && 'กรุณาเลือก'}>
                <ChipGroup options={AVAILABILITY_OPTIONS} value={md.availability} onChange={(v) => setMdf({ availability: v })} />
              </Field>
              <Field label="เพราะ" required error={err('md_availability_reason')}><Input value={md.availability_reason} onChange={(e) => setMdf({ availability_reason: e.target.value })} /></Field>
            </div>
          </div>
        </Card>

        <Card title="๕. ราคายาเสพติด" sub="กรอกครบ ชนิดยา + ราคา + หน่วย จึงจะบันทึกและนำไปคิดสถิติราคา">
          <RepeatList rows={prices} onChange={setPrices} blank={BLANK_PRICE} cols={4} addLabel="เพิ่มราคายา"
            renderRow={(row, patch) => (
              <>
                <Field label="ชนิดยา"><Input list="dl-price-drug" value={row.drug} onChange={(e) => patch({ drug: e.target.value })} /></Field>
                <Field label="ราคาต่อหน่วย (บาท)"><Input type="number" step="any" value={row.price} onChange={(e) => patch({ price: e.target.value })} /></Field>
                <Field label="หน่วย"><Input list="dl-unit" value={row.unit} onChange={(e) => patch({ unit: e.target.value })} /></Field>
                <Field label="ห้วงเวลา (เดือน/ปี)"><Input value={row.period} onChange={(e) => patch({ period: e.target.value })} /></Field>
              </>
            )} />
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="text-[13px] font-semibold text-slate-700 mb-3">คำที่ใช้เรียกยาเสพติด</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.keys(slang).map((k) => (
                <Field key={k} label={k}>
                  <Input value={slang[k]} onChange={(e) => setSlang((s) => ({ ...s, [k]: e.target.value }))} />
                </Field>
              ))}
            </div>
          </div>
        </Card>

        <Card title="๖. แหล่งที่เคยซื้อยามาเสพ" sub="เท่าที่สามารถให้ข้อมูลได้">
          <div className="space-y-4">
            <Field label="ช่องทางการซื้อ">
              <ChipGroup options={BUY_CHANNEL_OPTIONS} value={buy.channel} onChange={(v) => setBuyf({ channel: v })} />
            </Field>
            {buy.channel === CHANNEL_FRIEND && (
              <Field label={`ที่อยู่ของเพื่อนที่${CHANNEL_FRIEND}`} required error={err('friend_address')}
                hint="ระบุให้ละเอียดที่สุดเท่าที่ทราบ — เก็บแยกตาราง เข้าถึงได้เฉพาะผู้ดูแลระบบ">
                <Input value={buy.friend_address} onChange={(e) => setBuyf({ friend_address: e.target.value })} autoFocus />
              </Field>
            )}

            <div>
              <div data-invalid={err('locations') ? '1' : undefined} className="mb-2">
                <div className={`text-[13px] font-semibold ${err('locations') ? 'text-rose-600' : 'text-slate-700'}`}>
                  แหล่งที่ซื้อได้ประจำ <span className="text-rose-500">*</span>
                </div>
                {err('locations') && (
                  <div className="text-[11px] font-medium text-rose-600">
                    กรุณาเพิ่มอย่างน้อย 1 แหล่ง — เลือกกรุงเทพมหานครหรือจังหวัดอื่น แล้วระบุพื้นที่ (จังหวัดอื่นต้องระบุชื่อจังหวัด)
                  </div>
                )}
              </div>
              <RepeatList rows={locations} onChange={setLocations} blank={BLANK_LOC} cols={3} addLabel="เพิ่มแหล่งซื้อ"
                renderRow={(row, patch) => {
                  const isBkk = row.scope === LOC_BKK
                  return (
                    <>
                      {/* เลือกพื้นที่ก่อน — สลับพื้นที่แล้วล้างช่องเขต/อำเภอ ฯลฯ เพราะใช้คนละชุด (เก็บบริเวณ/สถานที่ไว้) */}
                      <Field label="แหล่งซื้ออยู่ที่" required className="sm:col-span-3">
                        <ChipGroup options={LOC_SCOPE_OPTIONS} value={row.scope}
                          onChange={(v) => patch({ scope: v, province: '', district: '', subdistrict: '', community: '', station: '', bkn: '' })} />
                      </Field>
                      {row.scope && (
                        <Field label="บริเวณ/สถานที่/จุดสังเกตุ"><Input value={row.area} onChange={(e) => patch({ area: e.target.value })} /></Field>
                      )}
                      {isBkk && (
                        <>
                          <Field label="เขต">
                            <Select options={DISTRICTS} value={row.district}
                              onChange={(e) => patch({ district: e.target.value, subdistrict: '', community: '' })} placeholder="— เลือกเขต —" />
                          </Field>
                          <Field label="แขวง">
                            <Select options={subsOf(row.district)} value={row.subdistrict} disabled={!row.district}
                              onChange={(e) => patch({ subdistrict: e.target.value, community: '' })}
                              placeholder={row.district ? '— เลือกแขวง —' : 'เลือกเขตก่อน'} />
                          </Field>
                          <Field label="ชุมชน/หมู่บ้าน">
                            <Input list={`dl-com-${row.district}-${row.subdistrict}`} value={row.community} disabled={!row.district}
                              placeholder={row.district ? 'เลือกหรือพิมพ์' : 'เลือกเขตก่อน'}
                              onChange={(e) => patch({ community: e.target.value })} />
                            <datalist id={`dl-com-${row.district}-${row.subdistrict}`}>
                              {comsOf(row.district, row.subdistrict).map((v) => <option key={v} value={v} />)}
                            </datalist>
                          </Field>
                          <Field label="สน.">
                            <Select options={stationOptions(row.station)} value={row.station}
                              onChange={(e) => patch({ station: e.target.value, bkn: bknOfStation(e.target.value) })}
                              placeholder="— เลือก สน. —" />
                          </Field>
                          <Field label="บก.น." hint="ระบบใส่ให้ตาม สน. ที่เลือก">
                            <Input value={row.bkn} readOnly disabled placeholder="เลือก สน. ก่อน" />
                          </Field>
                        </>
                      )}
                      {row.scope && !isBkk && (
                        <>
                          {thai ? (
                            // เลือกไล่ลำดับ จังหวัด → อำเภอ → ตำบล ; เปลี่ยนตัวบนแล้วล้างตัวล่าง กันอำเภอไม่ตรงจังหวัด
                            <>
                              <Field label="จังหวัด" required>
                                <Select options={withCurrent(thai.provinces, row.province)} value={row.province}
                                  onChange={(e) => patch({ province: e.target.value, district: '', subdistrict: '' })}
                                  placeholder="— เลือกจังหวัด —" />
                              </Field>
                              <Field label="อำเภอ">
                                <Select options={withCurrent(thai.amphoesOf(row.province), row.district)} value={row.district}
                                  disabled={!row.province}
                                  onChange={(e) => patch({ district: e.target.value, subdistrict: '' })}
                                  placeholder={row.province ? '— เลือกอำเภอ —' : 'เลือกจังหวัดก่อน'} />
                              </Field>
                              <Field label="ตำบล">
                                <Select options={withCurrent(thai.tambonsOf(row.province, row.district), row.subdistrict)} value={row.subdistrict}
                                  disabled={!row.district}
                                  onChange={(e) => patch({ subdistrict: e.target.value })}
                                  placeholder={row.district ? '— เลือกตำบล —' : 'เลือกอำเภอก่อน'} />
                              </Field>
                            </>
                          ) : thai === false ? (
                            // โหลดรายชื่อไม่สำเร็จ — ให้พิมพ์เองได้ ผู้กรอกจะได้ไม่ติดค้าง
                            <>
                              <Field label="จังหวัด" required hint="โหลดรายชื่อไม่สำเร็จ — พิมพ์เองได้">
                                <Input value={row.province} placeholder="เช่น ชลบุรี" onChange={(e) => patch({ province: e.target.value })} />
                              </Field>
                              <Field label="อำเภอ"><Input value={row.district} onChange={(e) => patch({ district: e.target.value })} /></Field>
                              <Field label="ตำบล"><Input value={row.subdistrict} onChange={(e) => patch({ subdistrict: e.target.value })} /></Field>
                            </>
                          ) : (
                            <Field label="จังหวัด / อำเภอ / ตำบล" className="sm:col-span-2">
                              <Select options={[]} value="" disabled onChange={() => {}} placeholder="กำลังโหลดรายชื่อจังหวัด..." />
                            </Field>
                          )}
                          <Field label="ชุมชน/หมู่บ้าน"><Input value={row.community} onChange={(e) => patch({ community: e.target.value })} /></Field>
                          <Field label="สภ."><Input value={row.station} onChange={(e) => patch({ station: e.target.value })} /></Field>
                        </>
                      )}
                    </>
                  )
                }} />
            </div>

            <div>
              <div className="text-[13px] font-semibold text-slate-700 mb-2">ข้อมูลผู้ขาย</div>
              <p className="text-[11.5px] text-slate-400 mb-2">เก็บแยกตาราง เข้าถึงได้เฉพาะผู้ดูแลระบบ</p>
              <RepeatList rows={sellers} onChange={setSellers} blank={BLANK_SELLER} cols={3}
                addLabel="เพิ่มผู้ขาย" empty="ยังไม่ระบุข้อมูลผู้ขาย"
                renderRow={(row, patch) => (
                  <>
                    <Field label="ชื่อ-นามสกุล"><Input value={row.full_name} onChange={(e) => patch({ full_name: e.target.value })} /></Field>
                    <Field label="ชื่ออื่นๆ"><Input value={row.alias} onChange={(e) => patch({ alias: e.target.value })} /></Field>
                    <Field label="เพศ"><Select options={SEX_OPTIONS} value={row.sex} onChange={(e) => patch({ sex: e.target.value })} /></Field>
                    <Field label="อายุ (ปี)"><Input type="number" value={row.age} onChange={(e) => patch({ age: e.target.value })} /></Field>
                    <Field label="ลักษณะรูปพรรณ (ลักษณะเด่น)"><Input value={row.appearance} onChange={(e) => patch({ appearance: e.target.value })} /></Field>
                    <Field label="ลักษณะของผู้ขาย"><Select options={SELLER_TYPE_OPTIONS} value={row.type} onChange={(e) => patch({ type: e.target.value })} /></Field>
                    <Field label="ระบุลักษณะ (อื่นๆ)">
                      <Input value={row.type_other} disabled={row.type !== 'อื่นๆ'}
                        placeholder={row.type === 'อื่นๆ' ? '' : 'เลือก "อื่นๆ" ก่อน'}
                        onChange={(e) => patch({ type_other: e.target.value })} />
                    </Field>
                    <Field label="พื้นที่ขาย"><Select options={SELLER_ZONE_OPTIONS} value={row.zone} onChange={(e) => patch({ zone: e.target.value })} /></Field>
                    <Field label="โทรศัพท์ที่ใช้ติดต่อ"><Input value={row.phone} onChange={(e) => patch({ phone: e.target.value })} inputMode="tel" /></Field>
                    <Field label="อาวุธ"><Select options={HAS_OPTIONS} value={row.weapon} onChange={(e) => patch({ weapon: e.target.value })} /></Field>
                    <Field label="ประเภทอาวุธ"><Input value={row.weapon_type} disabled={row.weapon !== 'มี'} onChange={(e) => patch({ weapon_type: e.target.value })} /></Field>
                    <Field label="ยานพาหนะ (ยี่ห้อ/สี/ทะเบียน)"><Input value={row.vehicle} onChange={(e) => patch({ vehicle: e.target.value })} /></Field>

                    {/* ช่องทางติดต่อ — เลือกจากรายการเท่านั้น ; "อื่นๆ" ต้องระบุ ; ใส่ ID แล้วต้องเลือกช่องทาง */}
                    {(() => {
                      const hasId = filled(row.contact_id)
                      return (
                        <>
                          <Field label="ช่องทางติดต่อ" required={hasId}
                            error={err('seller_contact_channel') && hasId && !filled(row.contact_channel)}>
                            {/* withCurrent — ร่างเก่าที่เคยพิมพ์ช่องทางเองจะยังเห็นค่าเดิม ไม่หายไปเฉย ๆ */}
                            <Select options={withCurrent(SELLER_CONTACT_OPTIONS, row.contact_channel)} value={row.contact_channel ?? ''}
                              onChange={(e) => patch({ contact_channel: e.target.value })} placeholder="— เลือกช่องทาง —" />
                          </Field>
                          {row.contact_channel === 'อื่นๆ' && (
                            <Field label="ระบุช่องทาง (อื่นๆ)" required
                              error={err('seller_contact_other') && !filled(row.contact_other)}>
                              <Input value={row.contact_other ?? ''} placeholder="เช่น Signal, Discord" autoFocus
                                onChange={(e) => patch({ contact_other: e.target.value })} />
                            </Field>
                          )}
                          <Field label="ID / ชื่อบัญชี">
                            <Input value={row.contact_id ?? ''} placeholder="เช่น @abc123"
                              onChange={(e) => patch({ contact_id: e.target.value })} />
                          </Field>
                        </>
                      )
                    })()}
                  </>
                )} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="วิธีการซื้อยาเสพติด"><Input value={buy.method} onChange={(e) => setBuyf({ method: e.target.value })} /></Field>
              <Field label="รู้แหล่งซื้อนี้มาจาก"><Input value={buy.known_from} onChange={(e) => setBuyf({ known_from: e.target.value })} /></Field>
              <Field label="สาเหตุที่ซื้อจากแหล่งนี้"><Input value={buy.why_here} onChange={(e) => setBuyf({ why_here: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Field label="แหล่งซื้อนี้มีผู้ขาย (ราย)">
                <Input type="number" value={buy.seller_count} disabled={buy.seller_count_unknown}
                  onChange={(e) => setBuyf({ seller_count: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700 h-9">
                <input type="checkbox" className="accent-blue-600" checked={buy.seller_count_unknown}
                  onChange={(e) => setBuyf({ seller_count_unknown: e.target.checked })} />
                ระบุไม่ได้ แต่มีมากกว่า ๑ ราย
              </label>
            </div>
          </div>
        </Card>

        <Card title="ข้อสังเกต / ข้อเสนอแนะ / ผู้สัมภาษณ์">
          <div className="space-y-4">
            <Field label="ข้อสังเกต/ข้อคิดเห็น/ข้อเสนอแนะ/บันทึกเพิ่มเติม จากผู้สัมภาษณ์">
              <textarea rows={4} value={tail.note} onChange={(e) => setTailf({ note: e.target.value })}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-y" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Field label="ผู้สัมภาษณ์" required error={err('interviewer')}><Input value={tail.interviewer} onChange={(e) => setTailf({ interviewer: e.target.value })} /></Field>
              <Field label="สังกัด" required error={err('unit')}><Input value={tail.unit} onChange={(e) => setTailf({ unit: e.target.value })} /></Field>
              <Field label="วันที่สัมภาษณ์" required error={err('interviewed_at')}>
                <Input type="date" value={tail.interviewed_at} onChange={(e) => setTailf({ interviewed_at: e.target.value })} />
              </Field>
              <Field label="หมายเลขโทรศัพท์ผู้เก็บข้อมูล"><Input value={tail.interviewer_phone} onChange={(e) => setTailf({ interviewer_phone: e.target.value })} inputMode="tel" /></Field>
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SaveBar status={status} label="บันทึกข้อมูล" />
          <div className="flex flex-wrap items-center gap-3">
            {draftAt && !savedRef && (
              <span className="text-[12px] text-slate-400">บันทึกร่างอัตโนมัติ {fmtTime(draftAt)} น. · เก็บเฉพาะในแท็บนี้</span>
            )}
            <button type="button" onClick={handleClear} disabled={status === 'saving'}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
              <RotateCcw size={15} /> ล้างข้อมูล
            </button>
          </div>
        </div>
        {savedRef && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
            <div className="text-[12px] font-medium text-emerald-800">บันทึกแล้ว — จดเลขทั้งสองนี้ไว้บนแบบฟอร์มกระดาษ</div>
            <div className="mt-1.5 flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <div className="text-[11px] text-emerald-700">เลขที่แบบ</div>
                <div className="text-2xl font-bold tracking-wide text-emerald-900">{savedRef.doc_no || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] text-emerald-700">รหัสอ้างอิงสำหรับค้นหา</div>
                <div className="text-2xl font-bold tracking-wide text-emerald-900">{savedRef.code || '—'}</div>
              </div>
            </div>
          </div>
        )}
      </form>

      <datalist id="dl-income">{INCOME_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-station">{STATION_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</datalist>      <datalist id="dl-year">{YEAR_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-unit">{unitOptions.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-charge">{CHARGE_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-drug">{FIRST_DRUG_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-price-drug">{PRICE_DRUG_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist>
    </IntelPage>
  )
}
