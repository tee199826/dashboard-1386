// บันทึกแบบซักผู้เสพ → เขียนลงตาราง substance_users (ตารางเดียวกับที่หน้า /substance-users อ่าน)
// ตัวเลือก อาชีพ/สาเหตุ/หน่วยยา ดึงจากค่าที่มีอยู่จริงในฐานข้อมูล ; รายได้ใช้ช่วงคงที่ (ช่วงละ 5,000)
// เพื่อไม่ให้เกิดค่าสะกดต่างกันจนรวมสถิติกับข้อมูลเดิมไม่ติด
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { dateToFiscalYear } from '../../utils/fiscalYear'
import { IntelPage, Card, Field, Input, Select, RepeatList, SaveBar } from '../../components/intel/FormUI'
import { DISTRICTS, DRUG_OPTIONS, INCOME_OPTIONS, UNIT_FALLBACK, YEAR_OPTIONS, simpleHash } from '../../utils/intelOptions'
import { loadAreaOptions, loadCommunitiesFromData, mergeCommunities } from '../../utils/areaOptions'

const todayISO = () => new Date().toISOString().slice(0, 10)
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? null : n }
const clean = (v) => { const s = String(v ?? '').trim(); return s || null }

const BLANK_DRUG = { drug: '', price: '', unit: '', period: '' }
const BLANK_LOC = { district: '', subdistrict: '', community: '', area: '' }
const BLANK_ARREST = { drug: '', charge: '', year: '' }
const BLANK_REHAB = { drug: '', place: '', year: '' }

export default function InterviewForm() {
  const navigate = useNavigate()
  const { logAction } = useAuth()
  const [status, setStatus] = useState(null)

  const [f, setF] = useState({
    surveyed_at: todayISO(), age: '', occupation: '', income_range: '',
    first_use_age: '', first_drug: '', first_reason: '',
  })
  const set = (patch) => setF((s) => ({ ...s, ...patch }))

  const [regularDrugs, setRegularDrugs] = useState([{ ...BLANK_DRUG }])
  const [locations, setLocations] = useState([{ ...BLANK_LOC }])
  const [arrests, setArrests] = useState([])
  const [rehabs, setRehabs] = useState([])

  // ── ตัวเลือกจากข้อมูลจริง ──
  const [suggest, setSuggest] = useState({ occupation: [], first_reason: [], drug: [], unit: [] })
  useEffect(() => {
    let cancelled = false
    supabase.from('substance_users')
      .select('occupation,first_reason,first_drug,regular_drugs')
      .limit(3000)
      .then(({ data, error }) => {
        if (error || cancelled || !data) return
        const pick = (key) => [...new Set(data.map((r) => r[key]).filter(Boolean).map((s) => String(s).trim()))]
          .sort((a, b) => a.localeCompare(b, 'th'))
        const drugs = new Set(DRUG_OPTIONS)
        const units = new Set()
        data.forEach((r) => {
          if (r.first_drug) drugs.add(String(r.first_drug).trim())
          ;(r.regular_drugs || []).forEach((d) => {
            if (d?.drug) drugs.add(String(d.drug).trim())
            if (d?.unit) units.add(String(d.unit).trim())
          })
        })
        setSuggest({
          occupation: pick('occupation'), first_reason: pick('first_reason'),
          drug: [...drugs].sort((a, b) => a.localeCompare(b, 'th')),
          unit: [...units].sort((a, b) => a.localeCompare(b, 'th')),
        })
      })
    return () => { cancelled = true }
  }, [])

  // รายชื่อแขวง/ชุมชนตามเขต (จาก GeoJSON ทางการ) — โหลดครั้งเดียว cache ไว้
  const [area, setArea] = useState({ subdistricts: {}, communities: {} })
  useEffect(() => {
    let cancelled = false
    // ไฟล์ทางการมาก่อน (เร็ว) → แล้วเติมชุมชนจากข้อมูลจริงทีหลัง (ช้ากว่า) โดยไม่บล็อกการกรอก
    loadAreaOptions().then((a) => {
      if (cancelled) return
      setArea(a)
      loadCommunitiesFromData().then((fromDb) => {
        if (cancelled) return
        setArea({ subdistricts: a.subdistricts, communities: mergeCommunities(a.communities, fromDb) })
      })
    })
    return () => { cancelled = true }
  }, [])

  const drugOptions = suggest.drug.length ? suggest.drug : DRUG_OPTIONS
  const unitOptions = suggest.unit.length ? suggest.unit : UNIT_FALLBACK

  const priceRows = useMemo(
    () => regularDrugs.filter((d) => d.drug.trim() && num(d.price) != null && d.unit.trim()),
    [regularDrugs],
  )
  const canSave = !!f.surveyed_at

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSave) return
    setStatus('saving')

    const regular_drugs = priceRows.map((d) => ({
      drug: d.drug.trim(), price: num(d.price), unit: d.unit.trim(),
      period: clean(d.period), rawPrice: `${d.price} บาท/${d.unit.trim()}`, amount: 1,
    }))
    const dealer_locations = locations
      .filter((l) => l.district.trim() || l.subdistrict.trim() || l.community.trim() || l.area.trim())
      .map((l) => ({
        district: clean(l.district), subdistrict: clean(l.subdistrict),
        community: clean(l.community), area: clean(l.area), province: 'กรุงเทพมหานคร',
      }))
    const arrestList = arrests.filter((a) => a.drug.trim())
      .map((a) => ({ drug: a.drug.trim(), charge: clean(a.charge), year: num(a.year) }))
    const rehabList = rehabs.filter((r) => r.drug.trim())
      .map((r) => ({ drug: r.drug.trim(), place: clean(r.place), year: num(r.year) }))

    // record_uid — รูปแบบเดียวกับ importEngine ('h:' + hash ของเนื้อหา) ; ใส่เวลาบันทึกกันชนกันเองโดยไม่ตั้งใจ
    const hash = simpleHash([
      f.surveyed_at, f.age, f.occupation, f.income_range, f.first_drug, f.first_use_age, f.first_reason,
      dealer_locations[0]?.district, regular_drugs.map((d) => `${d.drug}:${d.price}`).join(','), Date.now(),
    ].map((v) => v ?? '').join('|'))

    const row = {
      record_uid: 'h:' + hash,
      fiscal_year: dateToFiscalYear(f.surveyed_at),
      surveyed_at: f.surveyed_at,
      age: num(f.age),
      occupation: clean(f.occupation),
      income_range: clean(f.income_range),
      arrest_count: arrestList.length,
      arrests: arrestList,
      rehab_count: rehabList.length,
      rehabs: rehabList,
      first_use_age: num(f.first_use_age),
      first_drug: clean(f.first_drug),
      first_reason: clean(f.first_reason),
      regular_drugs,
      dealer_locations,
    }

    const { error } = await supabase.from('substance_users').insert([row])
    if (error) {
      setStatus({ error: `บันทึกไม่สำเร็จ: ${error.message}` })
      return
    }
    setStatus('saved')
    logAction?.('create', 'substance_users', row.record_uid, null)
    setTimeout(() => navigate('/substance-users'), 900)
  }

  return (
    <IntelPage title="บันทึกแบบซักผู้เสพ"
      sub="แบบสอบถามผู้เสพ — บันทึกลงตาราง substance_users ใช้ร่วมกับหน้าสรุปผลเก็บข้อมูลผู้เสพ"
      backTo="/substance-users">

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card title="ข้อมูลผู้เสพ">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="วันที่สำรวจ" required>
              <Input type="date" value={f.surveyed_at} onChange={(e) => set({ surveyed_at: e.target.value })} required />
            </Field>
            <Field label="อายุ (ปี)">
              <Input type="number" min="0" max="120" value={f.age} onChange={(e) => set({ age: e.target.value })} />
            </Field>
            <Field label="อาชีพ" hint="พิมพ์ได้เอง หรือเลือกจากที่เคยบันทึก">
              <Input list="dl-occupation" value={f.occupation} onChange={(e) => set({ occupation: e.target.value })} />
            </Field>
            <Field label="รายได้ต่อเดือน" hint="เลือกจากช่วงที่มี หรือพิมพ์เองก็ได้">
              <Input list="dl-income" value={f.income_range} placeholder="เลือกหรือพิมพ์ช่วงรายได้"
                onChange={(e) => set({ income_range: e.target.value })} />
            </Field>
            <Field label="อายุที่เริ่มเสพ">
              <Input type="number" min="0" max="120" value={f.first_use_age} onChange={(e) => set({ first_use_age: e.target.value })} />
            </Field>
            <Field label="ยาที่ใช้ครั้งแรก">
              <Input list="dl-drug" value={f.first_drug} onChange={(e) => set({ first_drug: e.target.value })} />
            </Field>
            <Field label="สาเหตุการเสพครั้งแรก" className="sm:col-span-3">
              <Input list="dl-reason" value={f.first_reason} onChange={(e) => set({ first_reason: e.target.value })} />
            </Field>
          </div>
        </Card>

        <Card title="ยาที่ใช้ประจำ และราคา" sub="กรอกครบทั้ง 3 ช่อง (ชื่อยา + ราคา + หน่วย) จึงจะถูกบันทึก">
          <RepeatList rows={regularDrugs} onChange={setRegularDrugs} blank={BLANK_DRUG} addLabel="เพิ่มยา"
            renderRow={(row, patch) => (
              <>
                <Field label="ชื่อยา"><Input list="dl-drug" value={row.drug} onChange={(e) => patch({ drug: e.target.value })} /></Field>
                <Field label="ราคา (บาท)"><Input type="number" min="0" step="any" value={row.price} onChange={(e) => patch({ price: e.target.value })} /></Field>
                <Field label="ต่อหน่วย">
                  <Select options={unitOptions} value={row.unit} onChange={(e) => patch({ unit: e.target.value })} placeholder="— หน่วย —" />
                </Field>
              </>
            )} />
        </Card>

        <Card title="พื้นที่แหล่งซื้อ" sub="ใช้สร้างแผนที่การกระจายตัวของแหล่งซื้อรายเขต">
          <RepeatList rows={locations} onChange={setLocations} blank={BLANK_LOC} addLabel="เพิ่มพื้นที่" cols={4}
            renderRow={(row, patch, i) => {
              const subs = area.subdistricts[row.district] || []
              const coms = area.communities[`${row.district}|${row.subdistrict}`]
                || area.communities[`${row.district}|`] || []
              return (
                <>
                  <Field label="เขต">
                    {/* เปลี่ยนเขต → ล้างแขวง/ชุมชนที่เลือกไว้ เพราะไม่อยู่ในเขตใหม่แล้ว */}
                    <Select options={DISTRICTS} value={row.district} placeholder="— เลือกเขต —"
                      onChange={(e) => patch({ district: e.target.value, subdistrict: '', community: '' })} />
                  </Field>
                  <Field label="แขวง">
                    <Select options={subs} value={row.subdistrict} disabled={!row.district}
                      placeholder={row.district ? (subs.length ? '— เลือกแขวง —' : 'ไม่พบแขวง') : 'เลือกเขตก่อน'}
                      onChange={(e) => patch({ subdistrict: e.target.value, community: '' })} />
                  </Field>
                  <Field label="ชุมชน">
                    <Input list={`dl-com-${i}`} value={row.community} disabled={!row.district}
                      placeholder={row.district ? (coms.length ? `เลือกหรือพิมพ์ (${coms.length} ชุมชน)` : 'พิมพ์ชื่อชุมชน') : 'เลือกเขตก่อน'}
                      onChange={(e) => patch({ community: e.target.value })} />
                    <datalist id={`dl-com-${i}`}>{coms.map((c) => <option key={c} value={c} />)}</datalist>
                  </Field>
                  <Field label="จุดสังเกต"><Input value={row.area} placeholder="เช่น ปากซอย, ใต้สะพาน"
                    onChange={(e) => patch({ area: e.target.value })} /></Field>
                </>
              )
            }} />
        </Card>

        <Card title="ประวัติการถูกจับกุม" sub="เว้นว่างได้ถ้าไม่มี — จำนวนครั้งนับจากรายการที่กรอก">
          <RepeatList rows={arrests} onChange={setArrests} blank={BLANK_ARREST} addLabel="เพิ่มประวัติจับกุม" empty="ไม่มีประวัติการถูกจับกุม"
            renderRow={(row, patch) => (
              <>
                <Field label="ยา"><Input list="dl-drug" value={row.drug} onChange={(e) => patch({ drug: e.target.value })} /></Field>
                <Field label="ข้อหา"><Input value={row.charge} onChange={(e) => patch({ charge: e.target.value })} /></Field>
                <Field label="ปี (พ.ศ.)"><Input list="dl-year" inputMode="numeric" value={row.year} placeholder="เลือกหรือพิมพ์" onChange={(e) => patch({ year: e.target.value })} /></Field>
              </>
            )} />
        </Card>

        <Card title="ประวัติการบำบัด" sub="เว้นว่างได้ถ้าไม่มี — จำนวนครั้งนับจากรายการที่กรอก">
          <RepeatList rows={rehabs} onChange={setRehabs} blank={BLANK_REHAB} addLabel="เพิ่มประวัติบำบัด" empty="ไม่มีประวัติการบำบัด"
            renderRow={(row, patch) => (
              <>
                <Field label="ยา"><Input list="dl-drug" value={row.drug} onChange={(e) => patch({ drug: e.target.value })} /></Field>
                <Field label="สถานที่บำบัด"><Input value={row.place} onChange={(e) => patch({ place: e.target.value })} /></Field>
                <Field label="ปี (พ.ศ.)"><Input list="dl-year" inputMode="numeric" value={row.year} placeholder="เลือกหรือพิมพ์" onChange={(e) => patch({ year: e.target.value })} /></Field>
              </>
            )} />
        </Card>

        <SaveBar status={status} disabled={!canSave} />
        {!canSave && <p className="text-[13px] text-slate-400">ต้องระบุวันที่สำรวจอย่างน้อย</p>}
      </form>

      {/* ตัวเลือกอัตโนมัติจากข้อมูลเดิมในฐานข้อมูล */}
      <datalist id="dl-occupation">{suggest.occupation.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-year">{YEAR_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-income">{INCOME_OPTIONS.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-reason">{suggest.first_reason.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-drug">{drugOptions.map((v) => <option key={v} value={v} />)}</datalist>
    </IntelPage>
  )
}
