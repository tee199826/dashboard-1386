// exportMapImage.js — capture DOM node (leaflet map + overlay) เป็นภาพ JPG/PNG ใช้กับ /radar
// tile basemap เป็น cross-origin (CARTO CDN) — ต้องเปิด crossOrigin="anonymous" บน TileLayer (ดู IncidentMap.jsx)
// ไม่งั้น canvas จะ tainted แล้ว toJpeg/toPng error
import { toJpeg, toPng } from 'html-to-image'

export async function exportMapImage(node, { format = 'jpg', scale = 2, filename = 'map.jpg' } = {}) {
  const options = { pixelRatio: scale, cacheBust: true, backgroundColor: '#ffffff' }
  const dataUrl = format === 'png'
    ? await toPng(node, options)
    : await toJpeg(node, { ...options, quality: 0.92 })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
