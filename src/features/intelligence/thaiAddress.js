

// thaiAddress — รายชื่อ จังหวัด → อำเภอ → ตำบล ทั่วประเทศ (ไม่รวมกรุงเทพฯ)
// ใช้กับแหล่งซื้อที่เลือก "จังหวัดอื่น" ในแบบซักผู้เสพ (กรุงเทพฯ ใช้ areaOptions.js ซึ่งมีแขวง/ชุมชนละเอียดกว่า)
//
// ไฟล์: public/thai-address.json แปลงจาก github.com/kongvut/thai-province-data (api/latest) — MIT License
//   รูปแบบ { provinces: [[จังหวัด, [[อำเภอ, [ตำบล, ...]], ...]], ...] } เรียงตามอักษรไทยแล้ว
//   เก็บแค่ชื่อภาษาไทย (ตัดชื่ออังกฤษ/รหัส/พิกัดทิ้ง) ให้ไฟล์เล็ก
//
// โหลดเฉพาะตอนมีคนเลือก "จังหวัดอื่น" ครั้งแรก แล้ว cache ไว้ระดับ module
// โหลดไม่สำเร็จ → คืน null ให้ฟอร์มถอยไปใช้ช่องพิมพ์เอง

let _promise = null

export function loadThaiAddress() {
  if (_promise) return _promise
  _promise = fetch('/thai-address.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((j) => {
      const amphoes = new Map()   // จังหวัด → [อำเภอ]
      const tambons = new Map()   // `จังหวัด|อำเภอ` → [ตำบล]
      for (const [province, list] of j.provinces || []) {
        amphoes.set(province, list.map(([amphoe]) => amphoe))
        for (const [amphoe, ts] of list) tambons.set(`${province}|${amphoe}`, ts)
      }
      return {
        provinces: [...amphoes.keys()],
        amphoesOf: (province) => amphoes.get(province) || [],
        tambonsOf: (province, amphoe) => tambons.get(`${province}|${amphoe}`) || [],
      }
    })
    .catch((err) => {
      console.error('[thaiAddress] load failed:', err)
      _promise = null   // ให้ลองใหม่ได้เมื่อเปิดฟอร์มครั้งหน้า
      return null
    })
  return _promise
}
