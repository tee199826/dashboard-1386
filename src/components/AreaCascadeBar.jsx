// AreaCascadeBar — แถว pill กลุ่ม→เขต→แขวง→ชุมชน ใช้ร่วมกับ useAreaCascade()
import FilterPill from './FilterPill'
import { GROUP_ORDER } from '../hooks/useAreaCascade'

// disableSub: บังคับ disable แขวง/ชุมชน เสมอ (ใช้เมื่อ section ปัจจุบันมีข้อมูลแค่ระดับเขต เช่น จับกุม) + tooltip เหตุผล
export default function AreaCascadeBar({ cascade, disableSub = false, disableSubReason }) {
  const {
    group, district, subdistrict, community,
    setGroup, setDistrict, setSubdistrict, setCommunity,
    districtOptions, subdistrictOptions, communityOptions,
    communityCoverage,
  } = cascade

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill label="กลุ่ม" value={group} onChange={setGroup}
          options={[['all', 'ทุกกลุ่ม'], ...GROUP_ORDER.map((g) => [g, g])]} />
        <FilterPill label="เขต" value={district} onChange={setDistrict}
          options={[['all', 'ทุกเขต'], ...districtOptions.map((d) => [d, d.replace(/^เขต/, '')])]} />
        <FilterPill label="แขวง" value={subdistrict} onChange={setSubdistrict}
          options={[['all', disableSub ? 'ระดับเขต' : (district === 'all' ? 'เลือกเขตก่อน' : 'ทุกแขวง')], ...subdistrictOptions.map((s) => [s, s])]}
          disabled={disableSub || district === 'all'} title={disableSub ? disableSubReason : undefined} />
        <FilterPill label="ชุมชน" value={community} onChange={setCommunity}
          options={[['all', disableSub ? 'ระดับเขต' : (subdistrict === 'all' ? 'เลือกแขวงก่อน' : 'ทุกชุมชน')], ...communityOptions.map((c) => [c, c])]}
          disabled={disableSub || subdistrict === 'all'} title={disableSub ? disableSubReason : undefined} />
      </div>
      {/* บรรทัดแยกจากแถว pill เสมอ (ไม่ใช่ flex item ร่วมแถว) — ข้อความไทยยาวไม่มีช่องว่างให้ตัดคำ
          ถ้าอยู่ร่วมแถวกับ pill จะดันแถวกว้างเกิน viewport (บั๊ก layout ทะลุจอซ้าย) */}
      {communityCoverage && (
        <p className="mt-1.5 text-xs text-slate-400 break-words">
          ระบุชุมชน {communityCoverage.pct.toFixed(0)}% — เลือกชุมชนจะเห็นเฉพาะเคสที่ระบุ
        </p>
      )}
    </div>
  )
}
