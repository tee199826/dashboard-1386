// AreaCascadeBar — แถว pill กลุ่ม→เขต→แขวง→ชุมชน ใช้ร่วมกับ useAreaCascade()
// แสดงเป็นลำดับชั้นเจาะลึกซ้าย→ขวา (มี › คั่น) ให้เห็นความสัมพันธ์ชัด
import { MapPin, ChevronRight } from 'lucide-react'
import FilterPill from './FilterPill'
import { GROUP_ORDER } from '../hooks/useAreaCascade'

const Sep = () => <ChevronRight size={15} className="text-slate-300 shrink-0" />

export default function AreaCascadeBar({ cascade }) {
  const {
    group, district, subdistrict, community,
    setGroup, setDistrict, setSubdistrict, setCommunity,
    districtOptions, subdistrictOptions, communityOptions,
  } = cascade

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
      <span className="inline-flex items-center gap-1.5 pr-1 text-xs font-semibold text-slate-500">
        <MapPin size={15} className="text-slate-400" /> พื้นที่
      </span>
      <FilterPill label="กลุ่ม" value={group} onChange={setGroup}
        options={[['all', 'ทุกกลุ่ม'], ...GROUP_ORDER.map((g) => [g, g])]} />
      <Sep />
      <FilterPill label="เขต" value={district} onChange={setDistrict}
        options={[['all', 'ทุกเขต'], ...districtOptions.map((d) => [d, d.replace(/^เขต/, '')])]} />
      <Sep />
      <FilterPill label="แขวง" value={subdistrict} onChange={setSubdistrict}
        options={[['all', district === 'all' ? 'เลือกเขตก่อน' : 'ทุกแขวง'], ...subdistrictOptions.map((s) => [s, s])]}
        disabled={district === 'all'} />
      <Sep />
      <FilterPill label="ชุมชน" value={community} onChange={setCommunity}
        options={[['all', subdistrict === 'all' ? 'เลือกแขวงก่อน' : 'ทุกชุมชน'], ...communityOptions.map((c) => [c, c])]}
        disabled={subdistrict === 'all'} />
    </div>
  )
}
