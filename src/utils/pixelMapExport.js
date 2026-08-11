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

// exportPng: capture DOM node ทั้งก้อน (canvas เดี่ยวหรือ compare grid ก็ได้) — scale = 1x/2x/4x
export async function exportPng(node, scale = 1, filename = 'pixel-map.png') {
  const dataUrl = await toPng(node, { pixelRatio: scale, cacheBust: true })
  downloadUrl(dataUrl, filename)
}

export async function copyEmbedHtml(svgEl) {
  await navigator.clipboard.writeText(serializeSvg(svgEl))
}
