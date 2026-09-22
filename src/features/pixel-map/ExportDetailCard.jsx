// ExportDetailCard — การ์ด "รายละเอียดพื้นที่" ที่วาดลงในภาพตอน export
// วาดเป็น SVG ในตัว <svg> ของแผนที่ (ไม่ใช่ HTML overlay) เพื่อให้ติดไปทั้งใน PNG และไฟล์ .svg
// เนื้อหาชุดเดียวกับแผงข้างแผนที่ แต่ย่อเหลือเฉพาะที่จำเป็นสำหรับงานนำเสนอ (ชุมชนเอา 3 อันดับแรก)
import { useId } from 'react'
import { nodeDetail, communityList, resolveAreaNode } from "../../shared/geo/pixelMapData.js"
import { BEHAVIOR_COLORS } from "../../shared/utils/constants.js"

const FONT = "Inter, 'Noto Sans Thai', sans-serif"
const W = 262        // ความกว้างการ์ด (หน่วยเดียวกับ viewBox ของแผนที่)
const PAD = 14
const ROW = 18       // ความสูงต่อบรรทัดของรายการ
const IN_COLOR = '#f43f5e'
const OUT_COLOR = '#94a3b8'
const TOP_N = 3
const LEVEL_LABEL = { district: 'เขต', subdistrict: 'แขวง', community: 'ชุมชน' }

// สระบน-ล่าง/วรรณยุกต์ไทยไม่กินความกว้าง — ตัดออกก่อนประมาณความกว้างข้อความ (เหมือน MapCanvas)
const THAI_COMBINING = /[ัิ-ฺ็-๎]/g
const visualLen = (s) => String(s).replace(THAI_COMBINING, '').length

// SVG ไม่มี text-overflow: ellipsis — ต้องตัดเองตามความกว้างที่ประมาณได้
function truncate(text, fontSize, maxWidth) {
  const t = String(text ?? '')
  const per = fontSize * 0.58
  if (visualLen(t) * per <= maxWidth) return t
  let out = ''
  for (const ch of t) {
    if ((visualLen(out + ch) + 1) * per > maxWidth) break
    out += ch
  }
  return `${out.trimEnd()}…`
}

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0)

// centerInHeight: ให้การ์ดอยู่กึ่งกลางแนวตั้งของแผงที่สูงเท่านี้ (ไม่ส่ง = วางที่ y)
export default function ExportDetailCard({ area, hierarchy, periodLabel, x = 16, y = 16, centerInHeight }) {
  // id ต้องเป็น ASCII ล้วน — ไฟล์ .svg ที่ export อาจถูกเปิดด้วยโปรแกรมอื่น (Illustrator/Inkscape) ที่ไม่ชอบ id ภาษาไทย
  const clipId = `xd-bar-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const detail = nodeDetail(resolveAreaNode(hierarchy, area))
  if (!area || !detail || detail.count === 0) return null

  const showAreaSplit = area.level !== 'community'
  const communities = showAreaSplit
    ? communityList(hierarchy, area.dname, area.level === 'subdistrict' ? area.label : null)
    : []
  const { count, inCommunity, outCommunity, behaviors } = detail
  const maxBehavior = behaviors.length ? Math.max(...behaviors.map(b => b.n)) : 0
  const innerW = W - PAD * 2
  const topCommunities = communities.slice(0, TOP_N)
  const restCommunities = Math.max(0, communities.length - TOP_N)

  const body = []
  let cy = PAD + 6 // เคอร์เซอร์แนวตั้ง — ต่อบล็อกลงมาเรื่อย ๆ แล้วค่อยรู้ความสูงรวมตอนจบ

  // ── หัวการ์ด: ระดับ + ชื่อพื้นที่ (ซ้าย) / ยอดรวม (ขวา) ──
  body.push(
    <text key="lvl" x={PAD} y={cy + 10} fontFamily={FONT} fontSize={11.5} fontWeight={600} fill="#7c3aed">
      {LEVEL_LABEL[area.level] ?? ''}
    </text>,
    <text key="name" x={PAD} y={cy + 30} fontFamily={FONT} fontSize={17} fontWeight={700} fill="#0f172a">
      {truncate(String(area.label).replace(/^(เขต|แขวง|ชุมชน)\s*/, ''), 17, innerW - 84)}
    </text>,
    <text key="total" x={W - PAD} y={cy + 26} textAnchor="end" fontFamily={FONT} fontSize={26} fontWeight={700}
      fill="#0f172a" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {count.toLocaleString()}
    </text>,
    <text key="unit" x={W - PAD} y={cy + 39} textAnchor="end" fontFamily={FONT} fontSize={10.5} fill="#94a3b8">เรื่อง</text>,
  )
  cy += 50

  const sectionLabel = (key, label, right) => {
    const el = [
      <text key={`${key}-l`} x={PAD} y={cy + 10} fontFamily={FONT} fontSize={11.5} fontWeight={600} fill="#64748b">{label}</text>,
    ]
    if (right) {
      el.push(
        <text key={`${key}-r`} x={W - PAD} y={cy + 10} textAnchor="end" fontFamily={FONT} fontSize={11.5} fill="#94a3b8">{right}</text>,
      )
    }
    body.push(...el)
    cy += 18
  }

  // ── ในชุมชน / นอกชุมชน ──
  if (showAreaSplit) {
    sectionLabel('split', 'ในชุมชน / นอกชุมชน')
    const inW = (innerW * pct(inCommunity, count)) / 100
    body.push(
      <g key="bar">
        <defs>
          <clipPath id={clipId}><rect x={PAD} y={cy} width={innerW} height={9} rx={4.5} /></clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect x={PAD} y={cy} width={innerW} height={9} fill="#f1f5f9" />
          <rect x={PAD} y={cy} width={inW} height={9} fill={IN_COLOR} />
          <rect x={PAD + inW} y={cy} width={innerW - inW} height={9} fill={OUT_COLOR} />
        </g>
      </g>,
    )
    cy += 17
    for (const [label, value, color] of [['ในชุมชน', inCommunity, IN_COLOR], ['นอกชุมชน', outCommunity, OUT_COLOR]]) {
      body.push(
        <g key={`lg-${label}`}>
          <circle cx={PAD + 4} cy={cy + 6} r={4} fill={color} />
          <text x={PAD + 14} y={cy + 10} fontFamily={FONT} fontSize={12.5} fill="#475569">{label}</text>
          <text x={W - PAD - 34} y={cy + 10} textAnchor="end" fontFamily={FONT} fontSize={12.5} fontWeight={700} fill="#0f172a"
            style={{ fontVariantNumeric: 'tabular-nums' }}>{value.toLocaleString()}</text>
          <text x={W - PAD} y={cy + 10} textAnchor="end" fontFamily={FONT} fontSize={12.5} fill="#94a3b8">{pct(value, count)}%</text>
        </g>,
      )
      cy += ROW
    }
    cy += 4
  }

  // ── พฤติการณ์ ──
  sectionLabel('beh', 'พฤติการณ์')
  if (behaviors.length === 0) {
    body.push(<text key="beh-none" x={PAD} y={cy + 10} fontFamily={FONT} fontSize={12.5} fill="#94a3b8">ไม่ระบุพฤติการณ์</text>)
    cy += ROW
  }
  const barX = PAD + 56
  const barMaxW = W - PAD - 40 - barX
  for (const b of behaviors) {
    const w = maxBehavior > 0 ? (b.n / maxBehavior) * barMaxW : 0
    body.push(
      <g key={`beh-${b.label}`}>
        <text x={PAD} y={cy + 10} fontFamily={FONT} fontSize={12.5} fill="#475569">{truncate(b.label, 12.5, 52)}</text>
        <rect x={barX} y={cy + 3} width={barMaxW} height={8} rx={4} fill="#f1f5f9" />
        <rect x={barX} y={cy + 3} width={w} height={8} rx={4} fill={BEHAVIOR_COLORS[b.label] ?? '#8b5cf6'} />
        <text x={W - PAD} y={cy + 10} textAnchor="end" fontFamily={FONT} fontSize={12.5} fontWeight={700} fill="#0f172a"
          style={{ fontVariantNumeric: 'tabular-nums' }}>{b.n.toLocaleString()}</text>
      </g>,
    )
    cy += ROW
  }
  cy += 4

  // ── ชุมชนที่พบเหตุการณ์ (3 อันดับแรก) ──
  if (showAreaSplit) {
    sectionLabel('com', 'ชุมชนที่พบเหตุการณ์', communities.length > 0 ? `${communities.length} แห่ง` : null)
    if (topCommunities.length === 0) {
      body.push(<text key="com-none" x={PAD} y={cy + 10} fontFamily={FONT} fontSize={12.5} fill="#94a3b8">ไม่มีชุมชนที่ระบุพิกัด</text>)
      cy += ROW
    }
    topCommunities.forEach((c, i) => {
      body.push(
        <g key={`com-${c.subdistrict}-${c.name}`}>
          <text x={PAD} y={cy + 10} fontFamily={FONT} fontSize={12.5} fill="#cbd5e1">{i + 1}</text>
          <text x={PAD + 14} y={cy + 10} fontFamily={FONT} fontSize={12.5} fill="#475569">
            {truncate(c.name, 12.5, innerW - 60)}
          </text>
          <text x={W - PAD} y={cy + 10} textAnchor="end" fontFamily={FONT} fontSize={12.5} fontWeight={700} fill="#0f172a"
            style={{ fontVariantNumeric: 'tabular-nums' }}>{c.count.toLocaleString()}</text>
        </g>,
      )
      cy += ROW
    })
    if (restCommunities > 0) {
      body.push(
        <text key="com-rest" x={PAD} y={cy + 9} fontFamily={FONT} fontSize={10.5} fill="#94a3b8">
          และอีก {restCommunities} ชุมชน
        </text>,
      )
      cy += 15
    }
  }

  // ── ท้ายการ์ด ──
  cy += 4
  body.push(
    <line key="foot-line" x1={PAD} y1={cy} x2={W - PAD} y2={cy} stroke="#e2e8f0" strokeWidth={1} />,
    <text key="foot" x={PAD} y={cy + 14} fontFamily={FONT} fontSize={10.5} fill="#94a3b8">ข้อมูลเหตุการณ์ยาเสพติด</text>,
    // ช่วงเวลาแยกบรรทัดของตัวเอง — กรองรายเดือน/รายวันได้แล้ว คนอ่านรูปต้องรู้ว่าตัวเลขเป็นของช่วงไหน
    // (ต่อท้ายบรรทัดเดียวกับข้อความข้างบน วันที่แบบข้ามปีจะยาวจนถูกตัดเหลือ "…" พอดีตรงส่วนที่สำคัญที่สุด)
    <text key="period" x={PAD} y={cy + 30} fontFamily={FONT} fontSize={11} fontWeight={600} fill="#64748b">
      {truncate(`ช่วงเวลา: ${periodLabel || 'ทุกปี'}`, 11, innerW)}
    </text>,
  )
  cy += 38

  const H = cy + PAD - 6
  const top = centerInHeight ? Math.max(16, (centerInHeight - H) / 2) : y

  return (
    <g transform={`translate(${x} ${top})`} pointerEvents="none">
      <rect x={0} y={0} width={W} height={H} rx={14} fill="#ffffff" fillOpacity={0.97} stroke="#e2e8f0" strokeWidth={1} />
      {body}
    </g>
  )
}
