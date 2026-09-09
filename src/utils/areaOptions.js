// areaOptions — รายชื่อ แขวง/ชุมชน ตามเขต สำหรับฟอร์มกรอกพื้นที่
// แหล่งข้อมูล: GeoJSON ทางการที่ระบบใช้วาดแผนที่อยู่แล้ว → ชื่อที่กรอกจึง join กับแผนที่/สถิติได้ตรง
//   bangkok-subdistricts.geojson : แขวงครบ 169 แขวง / 50 เขต (properties.district, properties.name)
//   bangkok-communities.geojson  : ชุมชน 201 แห่ง (properties.district, subdistrict, name)
//     — ไฟล์ชุมชนครอบคลุมแค่ 80 แขวง จึงใช้เสริมเฉพาะ "ชุมชน" ไม่ใช้เป็นแหล่งของแขวง
// โหลดครั้งเดียวแล้ว cache ไว้ระดับ module (promise เดียว ใช้ซ้ำทุก component)

let _promise = null

export function loadAreaOptions() {
  if (_promise) return _promise
  const sortTh = (a, b) => a.localeCompare(b, 'th')
  const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))

  _promise = Promise.all([
    getJson('/bangkok-subdistricts.geojson'),
    getJson('/bangkok-communities.geojson').catch(() => ({ features: [] })),
  ]).then(([sub, com]) => {
    const subSet = {}
    for (const f of sub.features || []) {
      const d = f.properties?.district
      const n = String(f.properties?.name || '').trim()
      if (d && n) (subSet[d] ||= new Set()).add(n)
    }
    const comSet = {}
    for (const f of com.features || []) {
      const d = f.properties?.district
      const s = String(f.properties?.subdistrict || '').trim()
      const n = String(f.properties?.name || '').trim()
      if (!d || !n) continue
      ;(comSet[`${d}|${s}`] ||= new Set()).add(n)   // ระบุแขวง
      ;(comSet[`${d}|`] ||= new Set()).add(n)        // สำรอง: ทั้งเขต (ยังไม่เลือกแขวง)
    }
    const toSorted = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, [...v].sort(sortTh)]))
    return { subdistricts: toSorted(subSet), communities: toSorted(comSet) }
  }).catch((err) => {
    console.error('[areaOptions] load failed:', err)
    _promise = null                                  // ล้มเหลว → ให้ลองใหม่ได้ครั้งหน้า
    return { subdistricts: {}, communities: {} }
  })

  return _promise
}

// รายชื่อชุมชนจาก "ข้อมูลจริง" ในตาราง drug_incidents — เสริมไฟล์ GeoJSON ที่ครอบคลุมแค่ 43 เขต
// โหลดแยกและช้ากว่า (ยิง drug_incidents) จึงให้ฟอร์มใช้งานได้ก่อน แล้วค่อยเติมรายการเมื่อพร้อม
// ใช้ hierarchy ตัวเดียวกับหน้า pixel-map ซึ่ง cache ไว้ระดับ module อยู่แล้ว
let _dbPromise = null

export function loadCommunitiesFromData() {
  if (_dbPromise) return _dbPromise
  _dbPromise = import('./pixelMapData')
    .then((m) => m.getCommunityHierarchy('all'))
    .then((tree) => {
      const out = {}
      const add = (key, name) => { (out[key] ||= new Set()).add(name) }
      for (const [district, d] of Object.entries(tree || {})) {
        for (const [subdistrict, sub] of Object.entries(d.subdistricts || {})) {
          for (const name of Object.keys(sub.communities || {})) {
            const n = String(name).trim()
            if (!n) continue
            add(`${district}|${subdistrict}`, n)
            add(`${district}|`, n)              // สำรอง: ทั้งเขต (ยังไม่เลือกแขวง)
          }
        }
      }
      const sortTh = (a, b) => a.localeCompare(b, 'th')
      return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort(sortTh)]))
    })
    .catch((err) => {
      console.error('[areaOptions] load communities from data failed:', err)
      _dbPromise = null
      return {}
    })
  return _dbPromise
}

// รวมรายการชุมชนจาก 2 แหล่ง (ไฟล์ทางการ + ข้อมูลจริง) ไม่ให้ซ้ำ
export function mergeCommunities(a = {}, b = {}) {
  const out = {}
  for (const src of [a, b]) {
    for (const [k, list] of Object.entries(src)) {
      (out[k] ||= new Set())
      for (const n of list) out[k].add(n)
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort((x, y) => x.localeCompare(y, 'th'))]))
}
