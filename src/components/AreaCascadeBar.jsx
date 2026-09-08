// AreaCascadeBar — การ์ดตัวกรองพื้นที่ กลุ่ม→เขต→แขวง→ชุมชน ใช้ร่วมกับ useAreaCascade() (เฉพาะ /situation เท่านั้น — ปลอดภัยที่จะปรับ style ที่นี่)
import { ChevronDown, Info } from 'lucide-react'
import { GROUP_ORDER } from '../hooks/useAreaCascade'

const FIELD_CLASS = 'w-full appearance-none text-xs font-medium text-slate-700 bg-slate-50/70 border border-slate-200 rounded-lg py-2 pl-3 pr-8 focus:border-slate-400 focus:bg-white focus:ring-0 disabled:text-slate-400 disabled:bg-slate-100/60 disabled:cursor-not-allowed transition-colors'

function Field({ label, value, onChange, options, disabled, title }) {
  return (
    <div className="relative" title={title}>
      <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1 tracking-wider">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={FIELD_CLASS}>
        {options.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
      </select>
      <ChevronDown size={14} className={`absolute right-2.5 bottom-2.5 pointer-events-none ${disabled ? 'text-slate-300' : 'text-slate-400'}`} />
    </div>
  )
}

// disableSub: บังคับ disable แขวง (และชุมชนตามไปด้วยเสมอ) — section มีข้อมูลแค่ระดับเขต (เช่น บำบัด) + เหตุผลโชว์เป็น notice
// disableCommunity: disable เฉพาะชุมชน โดยแขวงยังกรองได้ปกติ — section มีข้อมูลระดับแขวงแต่ไม่มีระดับชุมชน (เช่น จับกุม)
// subdistrictOptions: override รายการแขวงจาก cascade เดิม — ใช้ตอน section มีชุดข้อมูล subdistrict ของตัวเอง
// ต่างจาก drug_incidents ที่ cascade คำนวณมาให้เฉยๆ (เช่น จับกุม จาก arrest_case.subdistrict)
export default function AreaCascadeBar({
  cascade, disableSub = false, disableSubReason, disableCommunity = false, disableCommunityReason,
  subdistrictOptions,
}) {
  const {
    group, district, subdistrict, community,
    setGroup, setDistrict, setSubdistrict, setCommunity,
    districtOptions, subdistrictOptions: cascadeSubdistrictOptions, communityOptions,
    communityCoverage,
  } = cascade
  const subOptions = subdistrictOptions ?? cascadeSubdistrictOptions
  const communityDisabled = disableSub || disableCommunity
  const communityReason = disableSub ? disableSubReason : disableCommunityReason
  const noticeReason = disableSub ? disableSubReason : (disableCommunity ? disableCommunityReason : null)
  const showCoverage = communityCoverage && !communityDisabled

  return (
    <div className="bg-white p-3.5 rounded-xl ring-1 ring-slate-900/[0.06] shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Field label="กลุ่ม" value={group} onChange={setGroup}
          options={[['all', 'ทุกกลุ่ม'], ...GROUP_ORDER.map((g) => [g, g])]} />
        <Field label="เขต" value={district} onChange={setDistrict}
          options={[['all', 'ทุกเขต'], ...districtOptions.map((d) => [d, d.replace(/^เขต/, '')])]} />
        <Field label="แขวง" value={subdistrict} onChange={setSubdistrict}
          options={[['all', disableSub ? 'ระดับเขต' : (district === 'all' ? 'เลือกเขตก่อน' : 'ทุกแขวง')], ...subOptions.map((s) => [s, s])]}
          disabled={disableSub || district === 'all'} title={disableSub ? disableSubReason : undefined} />
        <Field label="ชุมชน" value={community} onChange={setCommunity}
          options={[['all', disableSub ? 'ระดับเขต' : disableCommunity ? 'ระดับแขวง' : (subdistrict === 'all' ? 'เลือกแขวงก่อน' : 'ทุกชุมชน')], ...communityOptions.map((c) => [c, c])]}
          disabled={communityDisabled || subdistrict === 'all'} title={communityDisabled ? communityReason : undefined} />
      </div>
      {(showCoverage || noticeReason) && (
        <div className="pt-2 border-t border-slate-100 flex items-center flex-wrap gap-2 text-xs">
          {noticeReason ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
              <Info size={11} className="mr-1" />{noticeReason}
            </span>
          ) : (
            <>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200/70">
                <Info size={11} className="mr-1" />ระบุชุมชน {communityCoverage.pct.toFixed(0)}%
              </span>
              <span className="text-slate-500">เลือกชุมชนจะเห็นเฉพาะเคสที่ระบุชุมชนชัดเจน</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
