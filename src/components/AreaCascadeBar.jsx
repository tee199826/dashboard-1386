// AreaCascadeBar — แถว pill กลุ่ม→เขต→แขวง→ชุมชน ใช้ร่วมกับ useAreaCascade()
import FilterPill from './FilterPill'
import { GROUP_ORDER } from '../hooks/useAreaCascade'

export default function AreaCascadeBar({ cascade }) {
  const {
    group, district, subdistrict, community,
    setGroup, setDistrict, setSubdistrict, setCommunity,
    districtOptions, subdistrictOptions, communityOptions,
  } = cascade

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterPill label="กลุ่ม" value={group} onChange={setGroup}
        options={[['all', 'ทุกกลุ่ม'], ...GROUP_ORDER.map((g) => [g, g])]} />
      <FilterPill label="เขต" value={district} onChange={setDistrict}
        options={[['all', 'ทุกเขต'], ...districtOptions.map((d) => [d, d.replace(/^เขต/, '')])]} />
      <FilterPill label="แขวง" value={subdistrict} onChange={setSubdistrict}
        options={[['all', district === 'all' ? 'เลือกเขตก่อน' : 'ทุกแขวง'], ...subdistrictOptions.map((s) => [s, s])]}
        disabled={district === 'all'} />
      <FilterPill label="ชุมชน" value={community} onChange={setCommunity}
        options={[['all', subdistrict === 'all' ? 'เลือกแขวงก่อน' : 'ทุกชุมชน'], ...communityOptions.map((c) => [c, c])]}
        disabled={subdistrict === 'all'} />
    </div>
  )
}
