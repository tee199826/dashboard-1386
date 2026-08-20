// shapefile.mjs — ตัวอ่าน shapefile (.shp + .dbf) แบบ dependency-free สำหรับสคริปต์แปลงข้อมูลใน repo นี้
// รองรับเท่าที่ข้อมูล BMA ใช้จริง: shape type 5 (Polygon) / 15 (PolygonZ) / 3,13 (PolyLine) และ dBase III+ (C/N/F/D/L)
// สเปก: ESRI Shapefile — header 100 byte, record header big-endian, ตัวเลข geometry little-endian
import fs from 'node:fs'

const POLYGON_TYPES = new Set([5, 15, 25])
const POLYLINE_TYPES = new Set([3, 13, 23])

// พื้นที่ ring แบบ signed (shoelace) — ESRI ใช้ทิศทางบอก outer (ตามเข็ม, พื้นที่ติดลบในระบบแกน y ขึ้น) vs hole (ทวนเข็ม)
const signedArea = (ring) => {
  let sum = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % n]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

function readParts(buf, offset, numParts, numPoints, precision) {
  const partStarts = []
  for (let i = 0; i < numParts; i++) partStarts.push(buf.readInt32LE(offset + i * 4))
  const pointsAt = offset + numParts * 4
  const rings = []
  for (let p = 0; p < numParts; p++) {
    const start = partStarts[p]
    const end = p + 1 < numParts ? partStarts[p + 1] : numPoints
    const ring = []
    for (let i = start; i < end; i++) {
      const x = buf.readDoubleLE(pointsAt + i * 16)
      const y = buf.readDoubleLE(pointsAt + i * 16 + 8)
      ring.push(precision == null ? [x, y] : [Number(x.toFixed(precision)), Number(y.toFixed(precision))])
    }
    rings.push(ring)
  }
  return rings
}

// .shp → geometry ต่อ record (index ตรงกับลำดับใน .dbf)
export function readShp(file, { precision = null } = {}) {
  const buf = fs.readFileSync(file)
  const fileLength = buf.readInt32BE(24) * 2 // header เก็บเป็นจำนวน 16-bit word
  const out = []
  let pos = 100

  while (pos + 8 <= fileLength) {
    const contentLength = buf.readInt32BE(pos + 4) * 2
    const body = pos + 8
    const type = buf.readInt32LE(body)
    pos = body + contentLength

    if (type === 0) { out.push(null); continue } // null shape
    if (!POLYGON_TYPES.has(type) && !POLYLINE_TYPES.has(type)) { out.push(null); continue }

    const numParts = buf.readInt32LE(body + 36)
    const numPoints = buf.readInt32LE(body + 40)
    const rings = readParts(buf, body + 44, numParts, numPoints, precision)

    if (POLYLINE_TYPES.has(type)) {
      out.push(rings.length === 1 ? { type: 'LineString', coordinates: rings[0] } : { type: 'MultiLineString', coordinates: rings })
      continue
    }
    // จัดกลุ่ม ring: ring ที่พื้นที่ติดลบ (ตามเข็ม) = วงนอกวงใหม่, ที่เหลือ = รูของวงนอกล่าสุด
    const polygons = []
    for (const ring of rings) {
      if (signedArea(ring) < 0 || polygons.length === 0) polygons.push([ring])
      else polygons[polygons.length - 1].push(ring)
    }
    out.push(polygons.length === 1
      ? { type: 'Polygon', coordinates: polygons[0] }
      : { type: 'MultiPolygon', coordinates: polygons })
  }
  return out
}

// .dbf → array ของ object (ค่าทั้งหมด trim แล้ว) — encoding ค่าเริ่มต้น windows-874 (ไทย) ตามที่ข้อมูลราชการไทยใช้
export function readDbf(file, { encoding = 'windows-874' } = {}) {
  const buf = fs.readFileSync(file)
  const decoder = new TextDecoder(encoding)
  const numRecords = buf.readInt32LE(4)
  const headerLength = buf.readInt16LE(8)
  const recordLength = buf.readInt16LE(10)

  const fields = []
  for (let pos = 32; buf[pos] !== 0x0d && pos < headerLength; pos += 32) {
    fields.push({
      name: decoder.decode(buf.subarray(pos, pos + 11)).replace(/\0.*$/, '').trim(),
      type: String.fromCharCode(buf[pos + 11]),
      length: buf[pos + 16],
    })
  }

  const rows = []
  for (let r = 0; r < numRecords; r++) {
    const base = headerLength + r * recordLength
    if (buf[base] === 0x2a) { rows.push(null); continue } // 0x2A = ถูกลบ
    let offset = base + 1
    const row = {}
    for (const f of fields) {
      const raw = decoder.decode(buf.subarray(offset, offset + f.length)).trim()
      offset += f.length
      row[f.name] = (f.type === 'N' || f.type === 'F') ? (raw === '' ? null : Number(raw))
        : f.type === 'L' ? /^[YyTt]$/.test(raw)
        : raw
    }
    rows.push(row)
  }
  return { fields, rows }
}

// .shp + .dbf → GeoJSON FeatureCollection (ไฟล์ BMA ชุดนี้เป็น WGS84 อยู่แล้ว ไม่ต้องแปลงพิกัด)
export function shapefileToGeoJSON(basePath, { encoding, precision = 5, mapProperties = (p) => p } = {}) {
  const geometries = readShp(`${basePath}.shp`, { precision })
  const { rows } = readDbf(`${basePath}.dbf`, { encoding })
  const features = []
  for (let i = 0; i < geometries.length; i++) {
    if (!geometries[i] || !rows[i]) continue
    const properties = mapProperties(rows[i], i)
    if (!properties) continue
    features.push({ type: 'Feature', properties, geometry: geometries[i] })
  }
  return { type: 'FeatureCollection', features }
}
