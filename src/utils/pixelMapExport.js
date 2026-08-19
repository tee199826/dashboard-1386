// pixelMapExport.js — export PNG/SVG/embed จาก /pixel-map
// PNG ใช้ html-to-image (capture DOM node ตรงๆ) เพราะต้อง flatten compare-grid (2-4 <svg> เรียงกัน)
// เป็นภาพเดียว ซึ่ง canvas.drawImage บน <svg> ที่ serialize เดี่ยวๆ ทำไม่ได้
import { toPng } from 'html-to-image'

function serializeSvg(svgEl) {
  const clone = svgEl.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return new XMLSerializer().serializeToString(clone)
}

function downloadUrl(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// exportSvg: ใช้ export panel เดียว (focused/first panel) — compare mode หลาย <svg> พร้อมกัน export ไม่ได้เป็นไฟล์ .svg เดียว
export function exportSvg(svgEl, filename = 'pixel-map.svg') {
  const blob = new Blob([serializeSvg(svgEl)], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  downloadUrl(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// โหลด tile ที่มีอยู่แล้ว (crossOrigin=anonymous + CORS) → วาดลง canvas → data URL โดยไม่ต้อง fetch ใหม่
function urlToDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth || 256
        c.height = img.naturalHeight || 256
        c.getContext('2d').drawImage(img, 0, 0)
        resolve(c.toDataURL('image/png'))
      } catch (e) { reject(e) }
    }
    img.onerror = reject
    img.src = url
  })
}

// แปลง <image> tile ข้ามโดเมนทั้งหมดในโหนดเป็น data URI ชั่วคราวก่อน capture — html-to-image จะได้ไม่ต้อง fetch ข้ามโดเมน
// (ตัวเดิม cacheBust=true ทำให้ดึง tile ใหม่ทุกครั้ง ช้า+CORS พลาด ภาพเลยไม่มี basemap) — คืน href เดิมหลังเสร็จ
async function inlineTileImages(node) {
  const imgs = [...node.querySelectorAll('image')]
  const restore = []
  await Promise.all(imgs.map(async (im) => {
    const href = im.getAttribute('href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    if (!href || href.startsWith('data:')) return
    try {
      const dataUrl = await urlToDataUrl(href)
      restore.push([im, href])
      im.setAttribute('href', dataUrl)
    } catch { /* ดึง tile นี้ไม่ได้ — ข้ามไป (ยังได้ shapes/labels อยู่) */ }
  }))
  return () => restore.forEach(([im, href]) => im.setAttribute('href', href))
}

// exportPng: capture DOM node ทั้งก้อน (canvas เดี่ยวหรือ compare grid ก็ได้) — scale = 1x/2x/4x
// มี timeout กัน toPng ค้าง เพื่อให้ finally ฝั่งผู้เรียกรีเซ็ตสถานะ export กลับได้
const EXPORT_TIMEOUT_MS = 25000
export async function exportPng(node, scale = 1, filename = 'pixel-map.png') {
  const restore = await inlineTileImages(node)
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('export timeout')), EXPORT_TIMEOUT_MS) })
  try {
    const dataUrl = await Promise.race([toPng(node, { pixelRatio: scale, cacheBust: false }), timeout])
    downloadUrl(dataUrl, filename)
  } finally {
    clearTimeout(timer)
    restore()
  }
}

export async function copyEmbedHtml(svgEl) {
  await navigator.clipboard.writeText(serializeSvg(svgEl))
}
