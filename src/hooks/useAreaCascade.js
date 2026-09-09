// useAreaCascade — dropdown ซ้อน กลุ่ม→เขต→แขวง→ชุมชน ใช้ร่วมทุก section ของ /situation
// รับ rows ที่ date-filter แล้ว, คืน rows ที่กรองพื้นที่ครบ + state/options สำหรับ AreaCascadeBar
// ⚠️ ตัดอำเภอนอก กทม.ด้วย startsWith('เขต') ตอน build district options (memory: bkn-district-filter)
import { useState, useMemo } from 'react'
import { DNAME_TO_GROUP } from '../utils/constants'

export const GROUP_ORDER = ['กรุงเทพกลาง', 'กรุงเทพเหนือ', 'กรุงเทพใต้', 'กรุงเทพตะวันออก', 'กรุงธนเหนือ', 'กรุงธนใต้']

// DB สะกด "ราษฎร์บูรณะ" ด้วย ฎ ชฎา (ถูกต้อง) แต่ DNAME_TO_GROUP ใช้ ฏ ปฏัก ตาม GeoJSON เดิม
const DISTRICT_ALIAS = { 'เขตราษฎร์บูรณะ': 'เขตราษฏร์บูรณะ' }
export const groupOf = (district) => DNAME_TO_GROUP[DISTRICT_ALIAS[district] || district] || null

// initial — ค่าพื้นที่เริ่มต้น (เช่น อ่านจาก query params ตอนข้ามหน้ามา) ; ไม่ส่ง = 'all' ทุกระดับ
export function useAreaCascade(dateFiltered, initial) {
  const [group, setGroup] = useState(initial?.group ?? 'all')
  const [district, setDistrict] = useState(initial?.district ?? 'all')
  const [subdistrict, setSubdistrict] = useState(initial?.subdistrict ?? 'all')
  const [community, setCommunity] = useState(initial?.community ?? 'all')

  const districtOptions = useMemo(() => {
    const s = new Set()
    dateFiltered.forEach((r) => {
      if (!r.district || !r.district.startsWith('เขต')) return // ตัดอำเภอนอก กทม.
      if (group !== 'all' && groupOf(r.district) !== group) return
      s.add(r.district)
    })
    return [...s].sort((a, b) => a.localeCompare(b, 'th'))
  }, [dateFiltered, group])

  const subdistrictOptions = useMemo(() => {
    if (district === 'all') return []
    const s = new Set()
    dateFiltered.forEach((r) => { if (r.district === district && r.subdistrict) s.add(r.subdistrict) })
    return [...s].sort((a, b) => a.localeCompare(b, 'th'))
  }, [dateFiltered, district])

  const communityOptions = useMemo(() => {
    if (subdistrict === 'all') return []
    const s = new Set()
    dateFiltered.forEach((r) => { if (r.subdistrict === subdistrict && r.community) s.add(r.community) })
    return [...s].sort((a, b) => a.localeCompare(b, 'th'))
  }, [dateFiltered, subdistrict])

  const rows = useMemo(() => dateFiltered.filter((r) => {
    if (group !== 'all' && groupOf(r.district) !== group) return false
    if (district !== 'all' && r.district !== district) return false
    if (subdistrict !== 'all' && r.subdistrict !== subdistrict) return false
    if (community !== 'all' && r.community !== community) return false
    return true
  }), [dateFiltered, group, district, subdistrict, community])

  const onGroupChange = (v) => { setGroup(v); setDistrict('all'); setSubdistrict('all'); setCommunity('all') }
  const onDistrictChange = (v) => { setDistrict(v); setSubdistrict('all'); setCommunity('all') }
  const onSubdistrictChange = (v) => { setSubdistrict(v); setCommunity('all') }

  const areaLabel = useMemo(() => [
    group !== 'all' ? group : null,
    district !== 'all' ? district : null,
    subdistrict !== 'all' ? subdistrict : null,
    community !== 'all' ? community : null,
  ].filter(Boolean).join(' · ') || 'ทุกพื้นที่', [group, district, subdistrict, community])

  return {
    rows,
    group, district, subdistrict, community,
    setGroup: onGroupChange, setDistrict: onDistrictChange, setSubdistrict: onSubdistrictChange, setCommunity,
    districtOptions, subdistrictOptions, communityOptions,
    areaLabel,
  }
}
