// บันทึกแบบซักผู้เสพ — โครงตาม "แบบเก็บข้อมูลจากผู้เสพ (แบบเก็บข้อมูลบุคคล ๑-๑)" ปปส.กทม.
//
// ⚠️ เก็บแยกจากชุดข้อมูลนำเข้า Excel (substance_users) — มีตารางของตัวเอง 2 ตาราง:
//   interview_records      — เนื้อหาแบบฟอร์ม (ไม่ระบุตัวบุคคล)
//   interview_records_pii  — ข้อมูลส่วนบุคคล
// ทั้งคู่ล็อก RLS ให้ผู้ดูแลระบบเท่านั้น แต่ยังแยก PII คนละตาราง
// เผื่อวันหน้าเปิดสถิติแบบซักให้อ่านสาธารณะโดยที่ชื่อ/เลขบัตรไม่หลุดไปด้วย
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { dateToFiscalYear } from '../../utils/fiscalYear'
import { IntelPage, Card, Field, Input, Select, ChipGroup, RepeatList, SaveBar } from '../../components/intel/FormUI'
import { DISTRICTS, UNIT_FALLBACK, YEAR_OPTIONS, simpleHash } from '../../utils/intelOptions'
import { loadAreaOptions, loadCommunitiesFromData, mergeCommunities } from '../../utils/areaOptions'
import {
  RELIGION_OPTIONS, MARITAL_OPTIONS, RESIDENT_STATUS_OPTIONS, EDUCATION_OPTIONS, OCCUPATION_OPTIONS,
  INCOME_OPTIONS, FIRST_DRUG_OPTIONS, FIRST_SOURCE_OPTIONS, FIRST_REASON_OPTIONS, USE_METHOD_OPTIONS,
  USE_STYLE_OPTIONS, AFTER_FIRST_OPTIONS, MAIN_DRUG_OPTIONS, USAGE_TYPE_OPTIONS, SUBSTITUTE_OPTIONS,
  FREQUENCY_OPTIONS, USE_PLACE_OPTIONS, AVAILABILITY_OPTIONS, PRICE_DRUG_OPTIONS, BUY_CHANNEL_OPTIONS,
  SELLER_TYPE_OPTIONS, SELLER_ZONE_OPTIONS, SEX_OPTIONS, HAS_OPTIONS, CHARGE_OPTIONS,
} from '../../utils/interviewOptions'

const todayISO = () => new Date().toISOString().slice(0, 10)
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? null : n }
const clean = (v) => { const s = String(v ?? '').trim(); return s || null }
const cleanObj = (o) => {
  const out = {}
  for (const [k, v] of Object.entries(o)) {
    const val = Array.isArray(v) ? (v.length ? v : null) : clean(v)
    if (val != null) out[k] = val
  }
  return Object.keys(out).length ? out : null
}

const BLANK_ARREST = { seq: '', charge: '', drug: '', amount: '', unit: '', station: '', year: '' }
const BLANK_REHAB = { seq: '', drug: '', place: '', year: '' }
const BLANK_PRICE = { drug: '', price: '', unit: '', period: '' }
const BLANK_LOC = { area: '', community: '', subdistrict: '', district: '', station: '', bkn: '' }
const BLANK_SELLER = { full_name: '', alias: '', sex: '', age: '', appearance: '', type: '', type_other: '', zone: '', phone: '', weapon: '', weapon_type: '', vehicle: '' }

export default function InterviewForm() {
  const navigate = useNavigate()
  const { logAction } = useAuth()
  const [status, setStatus] = useState(null)
  const [savedCode, setSavedCode] = useState(null)   // รหัสอ้างอิงที่ฐานข้อมูลสร้างให้ตอนบันทึก

  // ── ส่วนที่ 1 ข้อมูลบุคคล ──
  const [p, setP] = useState({
    doc_no: '', full_name: '', alias: '', age: '', birth_date: '', religion: '', religion_other: '',
    national_id: '', phone: '', contact_phone: '',
    addr_area: '', addr_no: '', addr_moo: '', addr_building: '', addr_floor: '', addr_room: '',
    addr_soi: '', addr_road: '', subdistrict: '', district: '', province: 'กรุงเทพมหานคร',
    station: '', bkn: '', resident_status: '',
    marital_status: '', education: '', education_other: '', education_place: '',
    occupation: '', occupation_other: '', work_place: '', work_district: '', work_province: '',
    income_range: '', work_nature: '', workplace_outbreak: '', workplace_outbreak_detail: '',
  })
  const setPf = (patch) => setP((s) => ({ ...s, ...patch }))

  // ── ส่วนที่ 2 ──
  const [arrests, setArrests] = useState([])
  const [rehabs, setRehabs] = useState([])
  const [fu, setFu] = useState({
    age: '', drug: '', drug_other: '', live_community: '', live_district: '', live_province: '',
    source: '', source_other: '', reason: '', reason_other: '', method: '', style: '', group_size: '',
    after: '', after_duration: '', quit_duration: '', quit_reason: '',
  })
  const setFuf = (patch) => setFu((s) => ({ ...s, ...patch }))

  const [md, setMd] = useState({
    drugs: [], drug_other: '', usage_type: '', usage_with: '', substitute: [], substitute_other: '',
    years_using: '', amount_per_time: '', max_amount: '', method: '', frequency: '', frequency_other: '',
    style: '', group_size: '', places: [], place_other: '', place_district: '', place_province: '', place_station: '',
    availability: '', availability_reason: '',
  })
  const setMdf = (patch) => setMd((s) => ({ ...s, ...patch }))

  const [prices, setPrices] = useState([{ ...BLANK_PRICE }])
  const [slang, setSlang] = useState({ ยาบ้า: '', ไอซ์: '', เฮโรอีน: '', คีตามีน: '', ยาอี: '', อื่นๆ: '' })

  const [buy, setBuy] = useState({
    channels: [], method: '', known_from: '', why_here: '',
    seller_count: '', seller_count_unknown: false,
  })
  const setBuyf = (patch) => setBuy((s) => ({ ...s, ...patch }))
  const [locations, setLocations] = useState([{ ...BLANK_LOC }])
  const [sellers, setSellers] = useState([])

  const [tail, setTail] = useState({ note: '', interviewer: '', unit: '', interviewed_at: todayISO(), interviewer_phone: '' })
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

  const canSave = !!tail.interviewed_at

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSave) return
    setStatus('saving')

    const arrestList = arrests.filter((a) => a.charge.trim() || a.drug.trim()).map((a) => ({
      seq: num(a.seq), charge: clean(a.charge), drug: clean(a.drug),
      amount: num(a.amount), unit: clean(a.unit), station: clean(a.station), year: num(a.year),
    }))
    const rehabList = rehabs.filter((r) => r.drug.trim() || r.place.trim()).map((r) => ({
      seq: num(r.seq), drug: clean(r.drug), place: clean(r.place), year: num(r.year),
    }))
    const regular_drugs = prices.filter((d) => d.drug.trim() && num(d.price) != null && d.unit.trim()).map((d) => ({
      drug: d.drug.trim(), price: num(d.price), unit: d.unit.trim(), period: clean(d.period),
      rawPrice: `${d.price} บาท/${d.unit.trim()}`, amount: 1,
    }))
    const dealer_locations = locations
      .filter((l) => l.district.trim() || l.subdistrict.trim() || l.community.trim() || l.area.trim())
      .map((l) => ({
        area: clean(l.area), community: clean(l.community), subdistrict: clean(l.subdistrict),
        district: clean(l.district), province: 'กรุงเทพมหานคร', station: clean(l.station), bkn: clean(l.bkn),
      }))

    const hash = simpleHash([
      tail.interviewed_at, p.doc_no, p.national_id, p.full_name, p.age, p.occupation,
      dealer_locations[0]?.district, regular_drugs.map((d) => `${d.drug}:${d.price}`).join(','), Date.now(),
    ].map((v) => v ?? '').join('|'))
    const record_uid = 'h:' + hash

    // 1) เนื้อหาแบบฟอร์ม
    const row = {
      record_uid,
      fiscal_year: dateToFiscalYear(tail.interviewed_at),
      surveyed_at: tail.interviewed_at,
      doc_no: clean(p.doc_no),
      age: num(p.age),
      religion: clean(p.religion === 'อื่นๆ' ? p.religion_other : p.religion),
      marital_status: clean(p.marital_status),
      education: clean(p.education === 'อื่นๆ' ? p.education_other : p.education),
      education_place: clean(p.education_place),
      resident_status: clean(p.resident_status),
      residence: cleanObj({
        community: p.addr_building, subdistrict: p.subdistrict, district: p.district,
        province: p.province, station: p.station, bkn: p.bkn,
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
        source: fu.source === 'อื่นๆ' ? fu.source_other : fu.source, method: fu.method, style: fu.style, group_size: fu.group_size,
        after: fu.after, after_duration: fu.after_duration,
        quit_duration: fu.quit_duration, quit_reason: fu.quit_reason,
      }),
      main_drug: cleanObj({
        drugs: md.drugs, drug_other: md.drug_other, usage_type: md.usage_type, usage_with: md.usage_with,
        substitute: md.substitute, substitute_other: md.substitute_other, years_using: md.years_using,
        amount_per_time: md.amount_per_time, max_amount: md.max_amount, method: md.method,
        frequency: md.frequency === 'อื่นๆ' ? md.frequency_other : md.frequency,
        style: md.style, group_size: md.group_size, places: md.places, place_other: md.place_other,
        place_district: md.place_district, place_province: md.place_province, place_station: md.place_station,
        availability: md.availability, availability_reason: md.availability_reason,
      }),
      regular_drugs,
      dealer_locations,
      purchase: cleanObj({
        channels: buy.channels, method: buy.method, known_from: buy.known_from, why_here: buy.why_here,
        seller_count: buy.seller_count_unknown ? 'ระบุไม่ได้ แต่มีมากกว่า 1 ราย' : buy.seller_count,
      }),
      drug_slang: cleanObj(slang),
      interview_info: cleanObj({ unit: tail.unit, interviewed_at: tail.interviewed_at }),
      note: clean(tail.note),
    }

    const { data: saved, error } = await supabase.from('interview_records')
      .insert([row]).select('code').single()
    if (error) { setStatus({ error: `บันทึกไม่สำเร็จ: ${error.message}` }); return }
    setSavedCode(saved?.code || null)

    // 2) ข้อมูลส่วนบุคคล (ตารางแยก — แอดมินเท่านั้น)
    const sellerList = sellers.filter((s) => s.full_name.trim() || s.alias.trim() || s.appearance.trim())
      .map((s) => ({
        full_name: clean(s.full_name), alias: clean(s.alias), sex: clean(s.sex), age: num(s.age),
        appearance: clean(s.appearance), type: clean(s.type === 'อื่นๆ' ? s.type_other : s.type),
        zone: clean(s.zone), phone: clean(s.phone),
        weapon: clean(s.weapon), weapon_type: clean(s.weapon_type), vehicle: clean(s.vehicle),
      }))
    const pii = {
      record_uid,
      full_name: clean(p.full_name), alias: clean(p.alias), national_id: clean(p.national_id),
      birth_date: clean(p.birth_date), phone: clean(p.phone), contact_phone: clean(p.contact_phone),
      address: cleanObj({
        area: p.addr_area, no: p.addr_no, moo: p.addr_moo, building: p.addr_building,
        floor: p.addr_floor, room: p.addr_room, soi: p.addr_soi, road: p.addr_road,
      }),
      sellers: sellerList,
      interviewer: cleanObj({ name: tail.interviewer, unit: tail.unit, phone: tail.interviewer_phone }),
    }
    const hasPii = pii.full_name || pii.national_id || pii.phone || pii.address || sellerList.length || pii.interviewer
    if (hasPii) {
      const { error: e2 } = await supabase.from('interview_records_pii').insert([pii])
      if (e2) {
        setStatus({ error: `บันทึกสถิติสำเร็จ แต่ข้อมูลส่วนบุคคลไม่สำเร็จ: ${e2.message}` })
        return
      }
    }

    setStatus('saved')
    logAction?.('create', 'interview_records', record_uid, { hasPii: !!hasPii })
    setTimeout(() => navigate('/intel/interview'), 3000)   // หน่วงให้อ่าน/จดรหัสอ้างอิงทัน แล้วไปหน้าค้นหา
  }

  const unitOptions = UNIT_FALLBACK

  return (
    <IntelPage title="บันทึกแบบซักผู้เสพ"
      sub="แบบเก็บข้อมูลจากผู้เสพ (แบบเก็บข้อมูลบุคคล ๑-๑) · ส่วนวิเคราะห์ข่าวและเฝ้าระวัง ปปส.กทม."
      backTo="/intel/interview">

      <form onSubmit={handleSubmit} className="space-y-5">

        <Card title="ส่วนที่ ๑ ข้อมูลบุคคล" sub="ช่องที่ระบุตัวบุคคลถูกเก็บแยกตาราง เข้าถึงได้เฉพาะผู้ดูแลระบบ">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="เลขที่แบบ"><Input value={p.doc_no} onChange={(e) => setPf({ doc_no: e.target.value })} placeholder="เช่น ๑-๑/๒๕๖๙" /></Field>
            <Field label="ชื่อ"><Input value={p.full_name} onChange={(e) => setPf({ full_name: e.target.value })} placeholder="ชื่อ-สกุล" /></Field>
            <Field label="ชื่ออื่นๆ / ฉายา"><Input value={p.alias} onChange={(e) => setPf({ alias: e.target.value })} /></Field>
            <Field label="อายุ (ปี)"><Input type="number" min="0" max="120" value={p.age} onChange={(e) => setPf({ age: e.target.value })} /></Field>
            <Field label="วัน เดือน ปีเกิด"><Input type="date" value={p.birth_date} onChange={(e) => setPf({ birth_date: e.target.value })} /></Field>
            <Field label="เลขประจำตัวประชาชน"><Input value={p.national_id} onChange={(e) => setPf({ national_id: e.target.value })} inputMode="numeric" maxLength={13} /></Field>
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
              <Field label="สน./สภ."><Input value={p.station} onChange={(e) => setPf({ station: e.target.value })} /></Field>
              <Field label="บก.น."><Input value={p.bkn} onChange={(e) => setPf({ bkn: e.target.value })} /></Field>
              <Field label="อาศัยอยู่ในฐานะ" className="sm:col-span-2">
                <ChipGroup options={RESIDENT_STATUS_OPTIONS} value={p.resident_status} onChange={(v) => setPf({ resident_status: v })} />
              </Field>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 space-y-4">
            <Field label="สถานภาพการสมรส">
              <ChipGroup options={MARITAL_OPTIONS} value={p.marital_status} onChange={(v) => setPf({ marital_status: v })} />
            </Field>
            <Field label="จบการศึกษา">
              <ChipGroup options={EDUCATION_OPTIONS} value={p.education} onChange={(v) => setPf({ education: v })} />
            </Field>
            {p.education === 'อื่นๆ' && (
              <Field label="ระบุระดับการศึกษา">
                <Input value={p.education_other} onChange={(e) => setPf({ education_other: e.target.value })} autoFocus />
              </Field>
            )}
            <Field label="ชื่อสถานศึกษาที่จบ/กำลังศึกษา">
              <Input value={p.education_place} onChange={(e) => setPf({ education_place: e.target.value })} />
            </Field>
            <Field label="อาชีพ">
              <ChipGroup options={OCCUPATION_OPTIONS} value={p.occupation} onChange={(v) => setPf({ occupation: v })} />
            </Field>
            {p.occupation === 'อื่นๆ' && (
              <Field label="ระบุอาชีพ">
                <Input value={p.occupation_other} onChange={(e) => setPf({ occupation_other: e.target.value })} autoFocus />
              </Field>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="สถานที่ทำงาน"><Input value={p.work_place} onChange={(e) => setPf({ work_place: e.target.value })} /></Field>
              <Field label="เขต/อำเภอ (ที่ทำงาน)"><Input value={p.work_district} onChange={(e) => setPf({ work_district: e.target.value })} /></Field>
              <Field label="จังหวัด (ที่ทำงาน)"><Input value={p.work_province} onChange={(e) => setPf({ work_province: e.target.value })} /></Field>
            </div>
            <Field label="รายได้ต่อเดือน" hint="เลือกจากรายการ หรือพิมพ์เองก็ได้">
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

        <Card title="๑. เคยถูกจับคดียาเสพติด" sub="ระบุข้อมูล ๒ ครั้งล่าสุด — จำนวนครั้งนับจากรายการที่กรอก">
          <RepeatList rows={arrests} onChange={setArrests} blank={BLANK_ARREST} cols={4}
            addLabel="เพิ่มครั้งที่ถูกจับ" empty="ไม่เคยถูกจับ"
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
        </Card>

        <Card title="๒. เคยเข้ารับการบำบัด" sub="ระบุข้อมูล ๒ ครั้งล่าสุด">
          <RepeatList rows={rehabs} onChange={setRehabs} blank={BLANK_REHAB} cols={4}
            addLabel="เพิ่มครั้งที่บำบัด" empty="ไม่เคยเข้ารับการบำบัด"
            renderRow={(row, patch) => (
              <>
                <Field label="ครั้งที่"><Input type="number" value={row.seq} onChange={(e) => patch({ seq: e.target.value })} /></Field>
                <Field label="ชนิดยา"><Input list="dl-drug" value={row.drug} onChange={(e) => patch({ drug: e.target.value })} /></Field>
                <Field label="สถานที่บำบัด"><Input value={row.place} onChange={(e) => patch({ place: e.target.value })} /></Field>
                <Field label="เมื่อปี (พ.ศ.)"><Input list="dl-year" inputMode="numeric" value={row.year} onChange={(e) => patch({ year: e.target.value })} /></Field>
              </>
            )} />
        </Card>

        <Card title="๓. การเสพยาครั้งแรก">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="อายุประมาณ (ปี)"><Input type="number" value={fu.age} onChange={(e) => setFuf({ age: e.target.value })} /></Field>
              <Field label="อาศัยอยู่ กทม./ชุมชน"><Input value={fu.live_community} onChange={(e) => setFuf({ live_community: e.target.value })} /></Field>
              <Field label="เขต"><Input value={fu.live_district} onChange={(e) => setFuf({ live_district: e.target.value })} /></Field>
            </div>
            <Field label="ชนิดยาเสพติดที่ใช้เสพครั้งแรก">
              <ChipGroup options={FIRST_DRUG_OPTIONS} value={fu.drug} onChange={(v) => setFuf({ drug: v })} />
            </Field>
            {fu.drug === 'อื่นๆ' && <Field label="ระบุชนิดยา"><Input value={fu.drug_other} onChange={(e) => setFuf({ drug_other: e.target.value })} /></Field>}
            <Field label="ยาเสพติดที่เสพครั้งแรกได้มาจาก">
              <ChipGroup options={FIRST_SOURCE_OPTIONS} value={fu.source} onChange={(v) => setFuf({ source: v })} />
            </Field>
            {fu.source === 'อื่นๆ' && (
              <Field label="ระบุแหล่งที่ได้มา">
                <Input value={fu.source_other} onChange={(e) => setFuf({ source_other: e.target.value })} autoFocus />
              </Field>
            )}
            <Field label="สาเหตุที่ใช้ยาเสพติดครั้งแรก">
              <ChipGroup options={FIRST_REASON_OPTIONS} value={fu.reason} onChange={(v) => setFuf({ reason: v })} />
            </Field>
            {fu.reason === 'อื่นๆ' && <Field label="ระบุสาเหตุ"><Input value={fu.reason_other} onChange={(e) => setFuf({ reason_other: e.target.value })} /></Field>}
            <Field label="เสพครั้งแรกโดยวิธี">
              <ChipGroup options={USE_METHOD_OPTIONS} value={fu.method} onChange={(v) => setFuf({ method: v })} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Field label="ลักษณะการเสพครั้งแรก">
                <ChipGroup options={USE_STYLE_OPTIONS} value={fu.style} onChange={(v) => setFuf({ style: v })} />
              </Field>
              <Field label="เสพเป็นกลุ่ม ครั้งละประมาณ (คน)">
                <Input type="number" value={fu.group_size} disabled={fu.style !== 'เสพเป็นกลุ่ม'}
                  onChange={(e) => setFuf({ group_size: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Field label="หลังจากเสพยาครั้งแรก">
                <ChipGroup options={AFTER_FIRST_OPTIONS} value={fu.after} onChange={(v) => setFuf({ after: v })} />
              </Field>
              <Field label="เสพต่อนาน (ปี/เดือน)">
                <Input value={fu.after_duration} disabled={fu.after !== 'เสพต่อ'}
                  onChange={(e) => setFuf({ after_duration: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="เคยมีช่วงหยุดสารเสพติด นาน (ปี/เดือน)"><Input value={fu.quit_duration} onChange={(e) => setFuf({ quit_duration: e.target.value })} /></Field>
              <Field label="สาเหตุที่หยุดได้"><Input value={fu.quit_reason} onChange={(e) => setFuf({ quit_reason: e.target.value })} /></Field>
            </div>
          </div>
        </Card>

        <Card title="๔. ยาเสพติดหลักที่ใช้เป็นประจำ">
          <div className="space-y-4">
            <Field label="ยาเสพติดหลักที่ใช้เป็นประจำ (เลือกได้หลายชนิด)">
              <ChipGroup multi options={MAIN_DRUG_OPTIONS} value={md.drugs} onChange={(v) => setMdf({ drugs: v })} />
            </Field>
            {md.drugs.includes('อื่นๆ') && <Field label="ระบุชนิดยา"><Input value={md.drug_other} onChange={(e) => setMdf({ drug_other: e.target.value })} /></Field>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Field label="ลักษณะการใช้ยา">
                <ChipGroup options={USAGE_TYPE_OPTIONS} value={md.usage_type} onChange={(v) => setMdf({ usage_type: v })} />
              </Field>
              <Field label="ระบุยาที่ใช้ร่วม/สลับ">
                <Input value={md.usage_with} disabled={md.usage_type === 'ใช้ชนิดเดียว' || !md.usage_type}
                  onChange={(e) => setMdf({ usage_with: e.target.value })} />
              </Field>
            </div>
            <Field label="หากไม่มีตัวยาหลัก จะใช้ยาเสพติดตัวใดแทน (เลือกได้หลายชนิด)">
              <ChipGroup multi options={SUBSTITUTE_OPTIONS} value={md.substitute} onChange={(v) => setMdf({ substitute: v })} />
            </Field>
            {md.substitute.includes('อื่นๆ') && <Field label="ระบุยาที่ใช้แทน"><Input value={md.substitute_other} onChange={(e) => setMdf({ substitute_other: e.target.value })} /></Field>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="ใช้มานาน (ปี)"><Input value={md.years_using} onChange={(e) => setMdf({ years_using: e.target.value })} /></Field>
              <Field label="ปริมาณที่ใช้ต่อครั้ง/วัน (ระบุหน่วย)"><Input value={md.amount_per_time} onChange={(e) => setMdf({ amount_per_time: e.target.value })} /></Field>
              <Field label="ปริมาณที่เคยใช้มากที่สุดต่อครั้ง/วัน"><Input value={md.max_amount} onChange={(e) => setMdf({ max_amount: e.target.value })} /></Field>
            </div>
            <Field label="เสพประจำโดยวิธี">
              <ChipGroup options={USE_METHOD_OPTIONS} value={md.method} onChange={(v) => setMdf({ method: v })} />
            </Field>
            <Field label="ความถี่ในการใช้">
              <ChipGroup options={FREQUENCY_OPTIONS} value={md.frequency} onChange={(v) => setMdf({ frequency: v })} />
            </Field>
            {md.frequency === 'อื่นๆ' && <Field label="ระบุความถี่"><Input value={md.frequency_other} onChange={(e) => setMdf({ frequency_other: e.target.value })} /></Field>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Field label="ลักษณะการเสพส่วนใหญ่">
                <ChipGroup options={USE_STYLE_OPTIONS} value={md.style} onChange={(v) => setMdf({ style: v })} />
              </Field>
              <Field label="เสพเป็นกลุ่ม ครั้งละประมาณ (คน)">
                <Input type="number" value={md.group_size} disabled={md.style !== 'เสพเป็นกลุ่ม'}
                  onChange={(e) => setMdf({ group_size: e.target.value })} />
              </Field>
            </div>
            <Field label="สถานที่ใช้เสพยาเสพติด (เลือกได้หลายที่)">
              <ChipGroup multi options={USE_PLACE_OPTIONS} value={md.places} onChange={(v) => setMdf({ places: v })} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Field label="ระบุสถานที่/บริเวณ">
                <Input value={md.place_other} disabled={!md.places.includes('อื่นๆ')}
                  placeholder={md.places.includes('อื่นๆ') ? '' : 'เลือก "อื่นๆ" ก่อน'}
                  onChange={(e) => setMdf({ place_other: e.target.value })} />
              </Field>
              <Field label="เขต"><Input value={md.place_district} onChange={(e) => setMdf({ place_district: e.target.value })} /></Field>
              <Field label="จังหวัด"><Input value={md.place_province} onChange={(e) => setMdf({ place_province: e.target.value })} /></Field>
              <Field label="สน./สภ."><Input value={md.place_station} onChange={(e) => setMdf({ place_station: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Field label="หาซื้อยาเสพติดชนิดนี้ได้">
                <ChipGroup options={AVAILABILITY_OPTIONS} value={md.availability} onChange={(v) => setMdf({ availability: v })} />
              </Field>
              <Field label="เพราะ"><Input value={md.availability_reason} onChange={(e) => setMdf({ availability_reason: e.target.value })} /></Field>
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
            <Field label="ช่องทางการซื้อ (เลือกได้หลายข้อ)">
              <ChipGroup multi options={BUY_CHANNEL_OPTIONS} value={buy.channels} onChange={(v) => setBuyf({ channels: v })} />
            </Field>

            <div>
              <div className="text-[13px] font-semibold text-slate-700 mb-2">แหล่งที่ซื้อได้ประจำ</div>
              <RepeatList rows={locations} onChange={setLocations} blank={BLANK_LOC} cols={3} addLabel="เพิ่มแหล่งซื้อ"
                renderRow={(row, patch) => (
                  <>
                    <Field label="บริเวณ/สถานที่/จุดสังเกตุ"><Input value={row.area} onChange={(e) => patch({ area: e.target.value })} /></Field>
                    <Field label="เขต/อำเภอ">
                      <Select options={DISTRICTS} value={row.district}
                        onChange={(e) => patch({ district: e.target.value, subdistrict: '', community: '' })} placeholder="— เลือกเขต —" />
                    </Field>
                    <Field label="แขวง/ตำบล">
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
                    <Field label="สน."><Input value={row.station} onChange={(e) => patch({ station: e.target.value })} /></Field>
                    <Field label="บก.น."><Input value={row.bkn} onChange={(e) => patch({ bkn: e.target.value })} /></Field>
                  </>
                )} />
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
              <Field label="ผู้สัมภาษณ์ "><Input value={tail.interviewer} onChange={(e) => setTailf({ interviewer: e.target.value })} /></Field>
              <Field label="สังกัด"><Input value={tail.unit} onChange={(e) => setTailf({ unit: e.target.value })} /></Field>
              <Field label="วันที่สัมภาษณ์" required>
                <Input type="date" value={tail.interviewed_at} required onChange={(e) => setTailf({ interviewed_at: e.target.value })} />
              </Field>
              <Field label="หมายเลขโทรศัพท์ผู้เก็บข้อมูล"><Input value={tail.interviewer_phone} onChange={(e) => setTailf({ interviewer_phone: e.target.value })} inputMode="tel" /></Field>
            </div>
          </div>
        </Card>

        <SaveBar status={status} disabled={!canSave} label="บันทึกข้อมูลผู้เสพ" />
        {savedCode && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
            <div className="text-[12px] font-medium text-emerald-800">บันทึกแล้ว — รหัสอ้างอิงสำหรับค้นหา</div>
            <div className="mt-0.5 text-2xl font-bold tracking-wide text-emerald-900">{savedCode}</div>
            <div className="mt-1 text-[11.5px] text-emerald-700">จดรหัสนี้ไว้บนแบบฟอร์มกระดาษ เพื่ออ้างอิงกันได้ภายหลัง</div>
          </div>
        )}
        {!canSave && <p className="text-[13px] text-slate-400">ต้องระบุวันที่สัมภาษณ์อย่างน้อย</p>}
      </form>

      <datalist id="dl-income">{INCOME_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-year">{YEAR_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-unit">{unitOptions.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-charge">{CHARGE_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-drug">{FIRST_DRUG_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-price-drug">{PRICE_DRUG_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist>
    </IntelPage>
  )
}
