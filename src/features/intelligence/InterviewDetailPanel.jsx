import { Trash2, X } from 'lucide-react'
import { formatThaiDate } from '../../shared/utils/heroMeta.js'
import { displayNationalId } from './intelOptions.js'

// ── แผงรายละเอียดเต็ม ────────────────────────────────────────────────────────
function Row({ label, value }) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return null
  return (
    <div className="flex gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="w-44 shrink-0 text-[12.5px] text-slate-500">{label}</span>
      <span className="text-[13px] text-slate-800 min-w-0">{Array.isArray(value) ? value.join(', ') : String(value)}</span>
    </div>
  )
}

function Group({ title, children }) {
  return (
    <div className="mb-5">
      <h4 className="text-[13px] font-bold text-slate-800 mb-1.5 pb-1 border-b border-slate-200">{title}</h4>
      {children}
    </div>
  )
}

export function DetailPanel({ row: r, pii: P, onClose, onDelete, busy }) {
  const res = r.residence || {}, work = r.work_info || {}, fu = r.first_use || {}
  const md = r.main_drug || {}, buy = r.purchase || {}, addr = P?.address || {}
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-slate-400">แบบเก็บข้อมูลบุคคล ๑-๑</div>
            <h3 className="text-lg font-bold text-slate-900 truncate">{P?.full_name || '(ไม่ระบุชื่อ)'}</h3>
            <p className="text-xs text-slate-500 tabular-nums">
              <span className="font-semibold text-[#243aa8]">{r.code || '—'}</span>
              {' · '}สำรวจ {formatThaiDate(r.surveyed_at) || '—'}{r.doc_no ? ` · เลขที่ ${r.doc_no}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={onDelete} disabled={busy} title="ลบรายการนี้"
              className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"><Trash2 size={16} /></button>
            <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>

        <div className="px-6 py-5">
          <Group title="ส่วนที่ ๑ ข้อมูลบุคคล">
            <Row label="ชื่อ-สกุล" value={P?.full_name} />
            <Row label="เลขที่แบบเดิม (กรอกเอง)" value={r.doc_no_legacy} />
            <Row label="ชื่ออื่นๆ" value={P?.alias} />
            <Row label="สัญชาติ" value={r.nationality} />
            <Row label="เลขประจำตัวประชาชน" value={displayNationalId(P?.national_id)} />
            <Row label="วันเกิด" value={P?.birth_date && formatThaiDate(P.birth_date)} />
            <Row label="อายุ" value={r.age && `${r.age} ปี`} />
            <Row label="ศาสนา" value={r.religion} />
            <Row label="โทรศัพท์มือถือ" value={P?.phone} />
            <Row label="โทรศัพท์ติดต่อได้" value={P?.contact_phone} />
            <Row label="สถานภาพสมรส" value={r.marital_status} />
            <Row label="การศึกษา" value={r.education} />
            <Row label="สถานศึกษา" value={r.education_place} />
            <Row label="อาชีพ" value={r.occupation} />
            <Row label="รายได้ต่อเดือน" value={r.income_range} />
          </Group>

          <Group title="ที่อยู่อาศัยปัจจุบัน">
            <Row label="บริเวณ/สถานที่ใกล้เคียง" value={addr.area} />
            <Row label="เลขที่ / หมู่" value={[addr.no, addr.moo].filter(Boolean).join(' หมู่ ')} />
            <Row label="อาคาร/ชั้น/ห้อง" value={[addr.building, addr.floor && `ชั้น ${addr.floor}`, addr.room && `ห้อง ${addr.room}`].filter(Boolean).join(' · ')} />
            <Row label="ซอย / ถนน" value={[addr.soi, addr.road].filter(Boolean).join(' · ')} />
            <Row label="ชุมชน/อาคาร" value={res.community} />
            <Row label="แขวง / เขต" value={[res.subdistrict, res.district].filter(Boolean).join(' · ')} />
            <Row label="จังหวัด" value={res.province} />
            <Row label="สน. / บก.น." value={[res.station, res.bkn].filter(Boolean).join(' · ')} />
            <Row label="อาศัยอยู่ในฐานะ" value={r.resident_status} />
          </Group>

          <Group title="การทำงาน">
            <Row label="สถานที่ทำงาน" value={work.place} />
            <Row label="เขต / จังหวัด" value={[work.district, work.province].filter(Boolean).join(' · ')} />
            <Row label="ลักษณะงาน" value={work.nature} />
            <Row label="การแพร่ระบาดในที่ทำงาน" value={[work.outbreak, work.outbreak_detail].filter(Boolean).join(' — ')} />
          </Group>

          {/* ฟอร์มบังคับเลือกเคย/ไม่เคย — ไม่มีรายการ = ตอบว่า "ไม่เคย" จึงแสดงคำนั้นแทนการซ่อนทั้งหมวด */}
          <Group title={`๑. ประวัติถูกจับ${(r.arrests || []).length ? ` (${r.arrest_count ?? r.arrests.length} ครั้ง)` : ''}`}>
            {(r.arrests || []).length ? r.arrests.map((a, i) => (
              <Row key={i} label={`ครั้งที่ ${a.seq ?? i + 1}`}
                value={[a.charge, a.drug, a.amount && `${a.amount} ${a.unit || ''}`, a.station, a.year && `ปี ${a.year}`].filter(Boolean).join(' · ')} />
            )) : <Row label="เคยถูกจับคดียาเสพติด" value="ไม่เคย" />}
          </Group>

          <Group title={`๒. ประวัติบำบัด${(r.rehabs || []).length ? ` (${r.rehab_count ?? r.rehabs.length} ครั้ง)` : ''}`}>
            {(r.rehabs || []).length ? r.rehabs.map((x, i) => (
              <Row key={i} label={`ครั้งที่ ${x.seq ?? i + 1}`}
                value={[x.drug, x.place, x.year && `ปี ${x.year}`].filter(Boolean).join(' · ')} />
            )) : <Row label="เคยเข้ารับการบำบัด" value="ไม่เคย" />}
          </Group>

          <Group title="๓. การเสพยาครั้งแรก">
            <Row label="อายุที่เริ่มเสพ" value={r.first_use_age && `${r.first_use_age} ปี`} />
            <Row label="ชนิดยา" value={r.first_drug} />
            <Row label="สาเหตุ" value={r.first_reason} />
            <Row label="ได้มาจาก" value={fu.source} />
            <Row label="วิธีเสพ" value={fu.method} />
            <Row label="ลักษณะการเสพ" value={[fu.style, fu.group_size && `${fu.group_size} คน`].filter(Boolean).join(' · ')} />
            <Row label="อาศัยอยู่ (ตอนนั้น)" value={[fu.community, fu.district, fu.province].filter(Boolean).join(' · ')} />
            <Row label="หลังเสพครั้งแรก" value={[fu.after, fu.after_duration].filter(Boolean).join(' · ')} />
            <Row label="ช่วงหยุดเสพ" value={[fu.quit_duration, fu.quit_reason].filter(Boolean).join(' — ')} />
          </Group>

          <Group title="๔. ยาเสพติดหลักที่ใช้ประจำ">
            <Row label="ชนิดยา" value={md.drugs} />
            <Row label="ระบุเพิ่ม" value={md.drug_other} />
            <Row label="ลักษณะการใช้" value={[md.usage_type, md.usage_with].filter(Boolean).join(' — ')} />
            <Row label="ยาที่ใช้แทน" value={md.substitute} />
            <Row label="ใช้มานาน" value={md.years_using} />
            <Row label="ปริมาณต่อครั้ง/วัน" value={md.amount_per_time} />
            <Row label="ปริมาณสูงสุด" value={md.max_amount} />
            <Row label="วิธีเสพ" value={md.method} />
            <Row label="ความถี่" value={md.frequency} />
            <Row label="ลักษณะการเสพ" value={[md.style, md.group_size && `${md.group_size} คน`].filter(Boolean).join(' · ')} />
            <Row label="สถานที่เสพ" value={[...(md.places || []), md.place_other].filter(Boolean).join(', ')} />
            <Row label="หาซื้อได้" value={[md.availability, md.availability_reason].filter(Boolean).join(' — ')} />
          </Group>

          {!!(r.regular_drugs || []).length && (
            <Group title="๕. ราคายาเสพติด">
              {r.regular_drugs.map((d, i) => (
                <Row key={i} label={d.drug} value={[`${d.price?.toLocaleString?.() ?? d.price} บาท/${d.unit}`, d.period].filter(Boolean).join(' · ')} />
              ))}
              {r.drug_slang && Object.entries(r.drug_slang).map(([k, v]) => <Row key={k} label={`คำเรียก ${k}`} value={v} />)}
            </Group>
          )}

          <Group title="๖. แหล่งที่เคยซื้อ">
            <Row label="ช่องทางซื้อ" value={buy.channel ?? buy.channels} />
            {(r.dealer_locations || []).map((l, i) => (
              <Row key={i} label={`แหล่งที่ ${i + 1}`}
                value={[l.area, l.community, l.subdistrict, l.district, l.province, l.station, l.bkn].filter(Boolean).join(' · ')} />
            ))}
            <Row label="ที่อยู่เพื่อนที่ฝากซื้อ" value={P?.friend_address} />
            <Row label="วิธีการซื้อ" value={buy.method} />
            <Row label="รู้แหล่งมาจาก" value={buy.known_from} />
            <Row label="สาเหตุที่ซื้อจากแหล่งนี้" value={buy.why_here} />
            <Row label="จำนวนผู้ขาย" value={buy.seller_count} />
          </Group>

          {!!(P?.sellers || []).length && (
            <Group title="ข้อมูลผู้ขาย">
              {P.sellers.map((s, i) => (
                <Row key={i} label={s.full_name || s.alias || `ผู้ขายที่ ${i + 1}`}
                  value={[s.alias && `(${s.alias})`, s.sex, s.age && `${s.age} ปี`, s.type, s.zone,
                    s.appearance, s.phone,
                    ...(s.contacts || []).map((c) => (c.id ? `${c.channel}: ${c.id}` : c.channel)),
                    s.weapon === 'มี' && `อาวุธ: ${s.weapon_type || 'มี'}`, s.vehicle]
                    .filter(Boolean).join(' · ')} />
              ))}
            </Group>
          )}

          <Group title="ผู้สัมภาษณ์">
            <Row label="ผู้สัมภาษณ์" value={P?.interviewer?.name} />
            <Row label="สังกัด" value={P?.interviewer?.unit || r.interview_info?.unit} />
            <Row label="โทรศัพท์" value={P?.interviewer?.phone} />
            <Row label="ข้อสังเกต/บันทึกเพิ่มเติม" value={r.note} />
          </Group>
        </div>
      </div>
    </div>
  )
}
