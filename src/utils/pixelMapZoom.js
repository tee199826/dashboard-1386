// pixelMapZoom.js — helper geometry สำหรับ zoom/pan ของ /pixel-map (ไม่ใช้ d3-force — greedy AABB พอสำหรับ label ตัวเลข)

// คำนวณ transform {x,y,k} ที่ fit bbox (data-space) ให้พอดี viewport พร้อม padding — สูตรมาตรฐานของ d3-zoom transform
// (point บนจอ = [x + k*px, y + k*py]) จึงได้ x/y จาก "จุดกึ่งกลาง viewport ลบ k คูณจุดกึ่งกลาง bbox"
export function fitToBoundsTransform(bbox, width, height, { padding = 40, scaleExtent = [1, 8] } = {}) {
  const bw = Math.max(1e-6, bbox.maxX - bbox.minX)
  const bh = Math.max(1e-6, bbox.maxY - bbox.minY)
  const kRaw = Math.min((width - padding * 2) / bw, (height - padding * 2) / bh)
  const k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], kRaw))
  const cx = (bbox.minX + bbox.maxX) / 2
  const cy = (bbox.minY + bbox.maxY) / 2
  return { x: width / 2 - k * cx, y: height / 2 - k * cy, k }
}

// ประมาณกล่องข้อความแบบหยาบ (พอสำหรับ collision, ไม่ต้อง render จริงเพื่อวัด) — tabular-nums เลยประมาณด้วยความกว้างตัวอักษรคงที่
export function estimateLabelBox(text, fontSize) {
  return { width: String(text).length * fontSize * 0.6, height: fontSize * 1.2 }
}

// screen-space box ของ label ที่ถูกวางแล้ว (จาก item ที่ layoutLabels คืนมา, มี sx/sy/text/fontSize ติดมาด้วย)
// ใช้ seed ให้ layoutLabels รอบถัดไปกันชนข้าม level (เขต/แขวง/ชุมชน คือ 3 pass แยกกัน แต่ต้องไม่ทับกันเอง)
export function boxOf(item) {
  const { width: bw, height: bh } = estimateLabelBox(item.text, item.fontSize)
  return { left: item.sx - bw / 2, right: item.sx + bw / 2, top: item.sy - bh / 2, bottom: item.sy + bh / 2 }
}

// คัดเฉพาะ label ที่อยู่ในจอ (data-space x,y → screen-space ผ่าน transform) + จัดวางแบบ greedy ตาม priority (value สูงก่อน)
// candidates: [{ key, x, y, value, text, fontSize }]  → คืนเฉพาะตัวที่ "ไม่ชนกัน" ตามลำดับความสำคัญ, สูงสุด maxCount ตัว
// existingBoxes: กล่องจาก level อื่นที่วางไปแล้ว (เช่น เขต) — กันไม่ให้ level นี้ (เช่น ชุมชน) ทับ
export function layoutLabels(candidates, { transform, width, height, maxCount = Infinity, margin = 24, existingBoxes = [] }) {
  const { x: tx, y: ty, k } = transform
  const onScreen = []
  for (const c of candidates) {
    const sx = c.x * k + tx
    const sy = c.y * k + ty
    if (sx < -margin || sx > width + margin || sy < -margin || sy > height + margin) continue
    onScreen.push({ ...c, sx, sy })
  }
  onScreen.sort((a, b) => b.value - a.value)

  const placedBoxes = [...existingBoxes]
  const result = []
  for (const c of onScreen) {
    if (result.length >= maxCount) break
    const { width: bw, height: bh } = estimateLabelBox(c.text, c.fontSize)
    const box = { left: c.sx - bw / 2, right: c.sx + bw / 2, top: c.sy - bh / 2, bottom: c.sy + bh / 2 }
    const overlaps = placedBoxes.some(p => !(box.right < p.left || box.left > p.right || box.bottom < p.top || box.top > p.bottom))
    if (overlaps) continue
    placedBoxes.push(box)
    result.push(c)
  }
  return result
}
