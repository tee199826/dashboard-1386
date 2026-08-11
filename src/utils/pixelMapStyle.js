// pixelMapStyle.js — ค่าคงที่/helper style ของ /pixel-map
export const SHAPES = ['circle', 'square', 'diamond', 'triangle']

const hexToRgb = (hex) => {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const int = parseInt(n, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}
const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')

// ไล่โทนเชิงเส้นระหว่าง 2 สี hex อิสระ (t: 0..1) — ใช้กับ data layer gradient (colorFrom → colorTo)
export function interpolateHex(hexA, hexB, t) {
  const clamped = Math.max(0, Math.min(1, t))
  const [r1, g1, b1] = hexToRgb(hexA)
  const [r2, g2, b2] = hexToRgb(hexB)
  return rgbToHex(r1 + (r2 - r1) * clamped, g1 + (g2 - g1) * clamped, b1 + (b2 - b1) * clamped)
}

// สีตัวอักษร (ดำ/ขาว) ที่อ่านง่ายที่สุดบนพื้น hex ที่กำหนด — relative luminance (WCAG-ish), ไม่ hardcode
export function getContrastText(hex) {
  const [r, g, b] = hexToRgb(hex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.55 ? '#0f172a' : '#ffffff'
}
