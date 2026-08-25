// useAreaCascade — dropdown ซ้อน กลุ่ม→เขต→แขวง→ชุมชน ใช้ร่วมทุก section ของ /situation
// รับ rows ที่ date-filter แล้ว, คืน rows ที่กรองพื้นที่ครบ + state/options สำหรับ AreaCascadeBar
// ⚠️ กรอง district ด้วย whitelist 50 เขต กทม. (groupOf) ไม่ใช่แค่ startsWith('เขต') —
// พบ 6 แถวขยะจากการ import ที่มี prefix "เขต" ติดหน้าชื่ออำเภอต่างจังหวัด (เช่น "เขตอำเภอสนม")
// ซึ่งผ่าน startsWith('เขต') ได้ ต้องตัดตั้งแต่ก่อนสร้าง options/rows ไม่ใช่แค่ตอน build dropdown
// (memory: bkn-district-filter)
import { useState, useMemo } from 'react'
import { DNAME_TO_GROUP } from '../utils/constants'

export const GROUP_ORDER = ['กรุงเทพกลาง', 'กรุงเทพเหนือ', 'กรุงเทพใต้', 'กรุงเทพตะวันออก', 'กรุงธนเหนือ', 'กรุงธนใต้']

// DB สะกด "ราษฎร์บูรณะ" ด้วย ฎ ชฎา (ถูกต้อง) แต่ DNAME_TO_GROUP ใช้ ฏ ปฏัก ตาม GeoJSON เดิม
const DISTRICT_ALIAS = { 'เขตราษฎร์บูรณะ': 'เขตราษฏร์บูรณะ' }
export const groupOf = (district) => DNAME_TO_GROUP[DISTRICT_ALIAS[district] || district] || null

export function useAreaCascade(dateFiltered) {
  const [group, setGroup] = useState('all')
  const [district, setDistrict] = useState('all')
  const [subdistrict, setSubdistrict] = useState('all')
  const [community, setCommunity] = useState('all')

  // ตัดแถวที่ district ไม่อยู่ใน whitelist 50 เขต กทม. ออกตั้งแต่ต้นทาง — ทุกอย่างด้านล่าง
  // (options, rows, KPI) จึงเห็นเฉพาะข้อมูล กทม.จริงเสมอ
  const bkkRows = useMemo(() => dateFiltered.filter((r) => !!groupOf(r.district)), [dateFiltered])

  const districtOptions = useMemo(() => {
    const s = new Set()
    bkkRows.forEach((r) => {
      if (group !== 'all' && groupOf(r.district) !== group) return
      s.add(r.district)
    })
    return [...s].sort((a, b) => a.localeCompare(b, 'th'))
  }, [bkkRows, group])

  const subdistrictOptions = useMemo(() => {
    if (district === 'all') return []
    const s = new Set()
    bkkRows.forEach((r) => { if (r.district === district && r.subdistrict) s.add(r.subdistrict) })
    return [...s].sort((a, b) => a.localeCompare(b, 'th'))
  }, [bkkRows, district])

  const communityOptions = useMemo(() => {
    if (subdistrict === 'all') return []
    const s = new Set()
    bkkRows.forEach((r) => { if (r.subdistrict === subdistrict && r.community) s.add(r.community) })
    return [...s].sort((a, b) => a.localeCompare(b, 'th'))
  }, [bkkRows, subdistrict])

  const rows = useMemo(() => bkkRows.filter((r) => {
    if (group !== 'all' && groupOf(r.district) !== group) return false
    if (district !== 'all' && r.district !== district) return false
    if (subdistrict !== 'all' && r.subdistrict !== subdistrict) return false
    if (community !== 'all' && r.community !== community) return false
    return true
  }), [bkkRows, group, district, subdistrict, community])

  // % ของแถว (กทม., ตาม date filter) ที่ระบุชุมชัน — ใช้เตือนก่อนกดกรองชุมชน (ข้อมูลจริงมีแค่ ~28%)
  const communityCoverage = useMemo(() => {
    const total = bkkRows.length
    const withCommunity = bkkRows.filter((r) => r.community).length
    return { total, withCommunity, pct: total ? (withCommunity / total) * 100 : 0 }
  }, [bkkRows])

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
    areaLabel, communityCoverage,
  }
}
