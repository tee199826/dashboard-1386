// สร้างแถวของ tree เขต → แขวง → ชุมชน ให้ SelectionTree/DistrictPicker ใช้ render ร่วมกัน
// ไม่มี query: คืนทุกเขตใน districtOptions ตามลำดับเดิม พร้อมแขวง/ชุมชนทั้งหมดจาก hierarchy, ไม่ auto-expand
// มี query: กรองเฉพาะเขต/แขวง/ชุมชนที่ชื่อมีคำค้น — auto-expand เฉพาะกิ่งที่ match อยู่ลึกกว่าตัวเอง เพื่อให้เห็นผลลัพธ์โดยไม่ต้องกดกางเอง
export function buildAreaRows(hierarchy, districtOptions, query) {
  const needle = query.trim()

  const rows = []
  for (const dname of districtOptions) {
    const distMatch = needle ? dname.includes(needle) : true
    const subdistricts = hierarchy[dname]?.subdistricts || {}

    const subs = []
    for (const [sub, subNode] of Object.entries(subdistricts)) {
      const communities = Object.keys(subNode.communities || {})
      const subMatch = needle ? sub.includes(needle) : true
      const communityMatches = needle ? communities.filter(c => c.includes(needle)) : communities

      if (!needle) {
        subs.push({ sub, communities, autoExpand: false })
        continue
      }
      if (distMatch || subMatch) {
        subs.push({ sub, communities, autoExpand: false })
      } else if (communityMatches.length > 0) {
        subs.push({ sub, communities: communityMatches, autoExpand: true })
      }
    }

    if (!needle) {
      rows.push({ dname, subs, autoExpand: false })
      continue
    }
    if (distMatch || subs.length > 0) {
      rows.push({ dname, subs, autoExpand: !distMatch && subs.length > 0 })
    }
  }
  return rows
}
