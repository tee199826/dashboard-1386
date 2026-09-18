// AreaComparePanel — เทียบพื้นที่ที่คลิกเลือกไว้ของแต่ละแผนที่ (โหมดเทียบหลายแผนที่เท่านั้น)
// A = พื้นที่ที่คลิกก่อน, B = คลิกทีหลัง ; สีจุดตรงกับสีกรอบที่วาดบนแผนที่ (PINNED_STROKES)
// ตัวเลขชุดเดียวกับแผงรายละเอียด (ตามช่วงเวลาที่เลือก) — คนละชุดกับตารางเทียบใต้แผนที่ ซึ่งเทียบ "ทั้ง panel"
import { useMemo } from 'react'
import { X } from 'lucide-react'
import { nodeDetail, communityList, resolveAreaNode, BEHAVIOR_FLAGS } from '../../utils/pixelMapData'
import { PINNED_STROKES } from '../../utils/pixelMapStyle'

const LEVEL_LABEL = { district: 'เขต', subdistrict: 'แขวง', community: 'ชุมชน' }
const LETTERS = ['A', 'B', 'C', 'D']
const fmt = (n) => n.toLocaleString()
const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0)

// ต่าง = A − B ; % เทียบกับ B (ตัวตั้งต้น) แบบเดียวกับตารางเทียบใต้แผนที่
function diffText(a, b) {
  const d = a - b
  if (d === 0) return 'เท่ากัน'
  const p = b > 0 ? ` (${d > 0 ? '+' : '−'}${Math.round((Math.abs(d) / b) * 100)}%)` : ''
  return `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}${p}`
}

const areaTitle = (a) => (a.level === 'subdistrict' && !a.label.startsWith('แขวง') ? `แขวง${a.label}` : a.label)

// columns: [{ key, index, area, panelName }] — 1 คอลัมน์ต่อ 1 แผนที่ที่คลิกเลือกพื้นที่ไว้ (เรียงซ้าย→ขวาตาม panel)
export default function AreaComparePanel({ columns = [], hierarchy, periodLabel = 'ทุกปี', onRemove, onClear }) {
  const cols = useMemo(() => columns.map(({ key, index, area, panelName, panelHint }) => {
    const meta = resolveAreaNode(hierarchy, area)
    return {
      key,
      area,
      panelName,
      panelHint,
      color: PINNED_STROKES[index % PINNED_STROKES.length],
      title: areaTitle(area),
      level: LEVEL_LABEL[area.level] ?? '',
      detail: nodeDetail(meta) ?? { count: 0, inCommunity: 0, outCommunity: 0, behaviors: [] },
      byBehavior: meta?.byBehavior ?? {},
      communities: area.level === 'community'
        ? null
        : communityList(hierarchy, area.dname, area.level === 'subdistrict' ? area.label : null).length,
    }
  }), [columns, hierarchy])

  if (cols.length < 2) return null
  const showDiff = cols.length === 2                                   // 3-4 แผนที่: เทียบเป็นคอลัมน์ ไม่มีช่อง "ต่าง" (ไม่ชัดว่าเทียบคู่ไหน)
  const showAreaSplit = cols.every(c => c.area.level !== 'community')  // ระดับชุมชนไม่มีในชุมชน/นอกชุมชน
  const showCommunities = cols.every(c => c.communities != null)

  const rows = [
    { label: 'จำนวนเรื่อง', get: (c) => c.detail.count, strong: true },
    ...(showAreaSplit ? [
      { label: 'ในชุมชน', get: (c) => c.detail.inCommunity, share: true },
      { label: 'นอกชุมชน', get: (c) => c.detail.outCommunity, share: true },
    ] : []),
    ...BEHAVIOR_FLAGS.map(([col, label]) => ({ label, get: (c) => c.byBehavior[col] ?? 0 })),
    ...(showCommunities ? [{ label: 'ชุมชนที่พบ', get: (c) => c.communities }] : []),
  ]

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-slate-700">เทียบ {cols.length} แผนที่</span>
        <button type="button" onClick={onClear} className="text-[11.5px] font-medium text-slate-500 hover:text-slate-700">ล้างทั้งหมด</button>
      </div>

      {/* หัวการ์ด: พื้นที่ที่เลือกไว้ของแต่ละแผนที่ + ยอดรวม ; ปุ่ม ✕ เอาออกเฉพาะของแผนที่นั้น */}
      <div className="space-y-1.5">
        {cols.map((c, i) => (
          <div key={c.key} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
            <span className="shrink-0 text-[11px] font-semibold text-slate-400">{LETTERS[i]}</span>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-[13px] text-slate-700" title={`${c.level} ${c.title}`}>{c.title}</span>
              <span className="block truncate text-[11px] text-slate-400" title={c.panelHint ?? c.panelName}>{c.panelName}</span>
            </span>
            <span className="shrink-0 text-[15px] font-bold text-slate-900 tabular-nums">{fmt(c.detail.count)}</span>
            <button type="button" onClick={() => onRemove?.(c.key)} title="เอาออก"
              className="shrink-0 text-slate-300 hover:text-rose-600"><X size={13} /></button>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px] tabular-nums">
          <thead>
            <tr className="text-slate-400">
              <th className="text-left font-medium py-1"> </th>
              {cols.map((c, i) => <th key={c.key} className="text-right font-medium py-1 w-12">{LETTERS[i]}</th>)}
              {showDiff && <th className="text-right font-medium py-1 w-[70px]">ต่าง</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const values = cols.map(r.get)
              const max = Math.max(...values)
              return (
                <tr key={r.label} className={r.strong ? 'bg-slate-50/70' : undefined}>
                  <td className="py-1 pr-1 text-left text-slate-600 truncate">{r.label}</td>
                  {cols.map((c, i) => (
                    <td key={c.key} className={`py-1 text-right ${values[i] === max && max > 0 ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                      {fmt(values[i])}
                      {r.share && c.detail.count > 0 ? <span className="text-slate-400 font-normal"> {pct(values[i], c.detail.count)}%</span> : null}
                    </td>
                  ))}
                  {showDiff && <td className="py-1 text-right font-semibold text-slate-700">{diffText(values[0], values[1])}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] leading-relaxed text-slate-400 pt-1.5 border-t border-slate-100">
        {showDiff && 'ต่าง = A − B (% เทียบกับ B) · '}ตัวหนาคือค่ามากที่สุดของแถว · หนึ่งเรื่องมีได้หลายพฤติการณ์
        {' · ช่วงเวลา: '}<span className="font-medium text-slate-500">{periodLabel}</span>
      </p>
    </div>
  )
}
