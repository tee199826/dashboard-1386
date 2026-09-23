import { useMemo } from 'react'
import { X } from 'lucide-react'
import { sumDistrictMeta, nodeDetail, communityList, resolveAreaNode, BEHAVIOR_FLAGS } from '../../shared/geo/pixelMapData.js'

// CompareSummary — ตารางเทียบตัวเลขของแต่ละแผนที่ในโหมด Compare (อยู่ใต้แผนที่ เปิดเป็นค่าเริ่มต้น ซ่อนได้จาก toolbar)
// ที่เดียวที่เทียบตัวเลขข้ามแผนที่ — แผงด้านขวาแสดงรายละเอียดของพื้นที่เดียว (แคบเกินกว่าจะวางตารางเทียบให้อ่านสบาย)
// ตัวเลขมาจาก hierarchy ชุดเดียวกับแผนที่ (ตามช่วงเวลาที่เลือก)
// แต่ละแผนที่เอาพื้นที่มาจาก 2 ทางที่ผู้ใช้เลือกได้จริง — เลือกทางไหนก็เทียบได้ ไม่ต้องรู้ว่าปุ่มไหนคู่กับตารางไหน:
//   1) คลิกพื้นที่บนแผนที่ (เขต/แขวง/ชุมชน) — มาก่อน เพราะเป็นการเจาะจงล่าสุดและมีกรอบไฮไลต์บนแผนที่ให้เห็น (คลิกซ้ำ = ยกเลิก)
//   2) ไม่ได้คลิกไว้ → ใช้เขตที่ติ๊กจากช่องด้านบนของแผนที่ (ได้หลายเขต → รวมกัน)
// หัวคอลัมน์บอกทุกครั้งว่าตัวเลขมาจากทางไหน จะได้ไม่งงว่าทำไมไม่ตรงกับที่นึกไว้
// 2 แผนที่: มีคอลัมน์ "ต่าง" (ซ้าย − ขวา) ให้เห็นส่วนต่างทันที ; 3-4 แผนที่: เทียบกันเป็นคอลัมน์ (ไม่มีคอลัมน์ต่าง เพราะเทียบคู่ไหนก็ไม่ชัด)

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0)
const fmt = (n) => n.toLocaleString()
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`
const LEVEL_LABEL = { district: 'เขต', subdistrict: 'แขวง', community: 'ชุมชน' }
const EMPTY_DETAIL = { count: 0, inCommunity: 0, outCommunity: 0, behaviors: [] }
const areaTitle = (a) => (a.level === 'subdistrict' && !a.label.startsWith('แขวง') ? `แขวง${a.label}` : a.label)

// ต่าง = ซ้าย − ขวา ; เปอร์เซ็นต์คิดเทียบกับ "ขวา" (ตัวตั้งต้น) ตามความหมายปกติของ "มากกว่า/น้อยกว่ากี่ %"
function diffText(a, b) {
  const d = a - b
  if (d === 0) return 'เท่ากัน'
  const pctText = b > 0 ? ` (${d > 0 ? '+' : '−'}${Math.round((Math.abs(d) / b) * 100)}%)` : ''
  return `${signed(d)}${pctText}`
}

// พื้นที่ของแผนที่หนึ่ง → คอลัมน์เดียวในตาราง (พื้นที่ที่คลิกไว้มาก่อน ไม่มีค่อยใช้เขตที่ติ๊ก)
function buildColumn(slot, index, hierarchy, pinnedArea) {
  const base = { id: slot.id, color: slot.color, panelName: `แผนที่ ${index + 1}` }
  const districts = slot.districts ?? []

  if (pinnedArea) {
    const meta = resolveAreaNode(hierarchy, pinnedArea)
    return {
      ...base,
      label: areaTitle(pinnedArea),
      sub: pinnedArea.level === 'community' ? `${pinnedArea.dname} · ${pinnedArea.sub ?? ''}` : pinnedArea.dname,
      source: `คลิกบนแผนที่ (${LEVEL_LABEL[pinnedArea.level] ?? ''})`,
      pinned: true,
      level: pinnedArea.level,
      meta: meta ?? {},
      detail: nodeDetail(meta) ?? EMPTY_DETAIL,
      // ระดับชุมชนไม่มี "จำนวนชุมชนที่พบ" ในตัวมันเอง
      communities: pinnedArea.level === 'community'
        ? null
        : communityList(hierarchy, pinnedArea.dname, pinnedArea.level === 'subdistrict' ? pinnedArea.label : null).length,
      empty: false,
    }
  }

  if (districts.length > 0) {
    const meta = sumDistrictMeta(hierarchy, districts)
    return {
      ...base,
      label: districts.length === 1 ? districts[0] : `${districts.length} เขต`,
      sub: districts.length > 1 ? districts.join(', ') : null,
      source: districts.length === 1 ? 'เลือกจากช่องด้านบน' : `รวม ${districts.length} เขต`,
      meta, detail: nodeDetail(meta) ?? EMPTY_DETAIL, communities: meta.communities, empty: false,
    }
  }

  return { ...base, label: slot.label, meta: {}, detail: EMPTY_DETAIL, communities: null, empty: true }
}

export default function CompareSummary({
  slots = [], hierarchy, periodLabel, pinnedByMap = {}, exporting = false, onRemovePin, onClearPins,
}) {
  const cols = useMemo(
    () => slots.map((slot, i) => buildColumn(slot, i, hierarchy, pinnedByMap[slot.id] ?? null)),
    [slots, hierarchy, pinnedByMap],
  )

  const filled = cols.filter(c => !c.empty)
  // ภาพ export ไม่ต้องมีกล่องคำแนะนำวิธีเลือกพื้นที่ — ยังไม่ได้เลือกอะไรก็ไม่ใส่ตารางลงภาพเลย
  if (exporting && filled.length === 0) return null
  const anyPinned = !exporting && cols.some(c => c.pinned)
  const showDiff = cols.length === 2 && filled.length === 2
  const showAreaSplit = filled.every(c => c.level !== 'community')    // ระดับชุมชนไม่มีในชุมชน/นอกชุมชน (อยู่ในชุมชนทั้งหมดอยู่แล้ว)
  const rows = [
    { key: 'count', label: 'จำนวนเรื่อง', value: (c) => c.detail.count, strong: true },
    ...(showAreaSplit ? [
      { key: 'in', label: 'ในชุมชน', value: (c) => c.detail.inCommunity, pctOfTotal: true },
      { key: 'out', label: 'นอกชุมชน', value: (c) => c.detail.outCommunity, pctOfTotal: true },
    ] : []),
    ...BEHAVIOR_FLAGS.map(([col, label]) => ({ key: col, label, value: (c) => c.meta.byBehavior?.[col] ?? 0 })),
    { key: 'communities', label: 'ชุมชนที่พบ', value: (c) => c.communities, unit: ' แห่ง' },
  ]

  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
        <span className="text-[12.5px] font-semibold text-slate-700">เปรียบเทียบตัวเลขระหว่างแผนที่</span>
        <span className="flex items-baseline gap-3">
          <span className="text-[11.5px] text-slate-400">ช่วงเวลา: {periodLabel}</span>
          {/* เอาพื้นที่ที่คลิกเลือกไว้ออกทุกแผนที่ (เขตที่ติ๊กจากช่องด้านบนยังอยู่) */}
          {anyPinned && onClearPins && (
            <button type="button" onClick={onClearPins} className="text-[11.5px] font-medium text-slate-500 hover:text-rose-600">
              ล้างที่คลิกเลือก
            </button>
          )}
        </span>
      </div>

      {/* ยังไม่ได้เลือกพื้นที่สักแผนที่ → บอกวิธีเลือก ดีกว่าโชว์ตารางขีดกลางทั้งใบจนดูเหมือนปุ่มเสีย */}
      {filled.length === 0 ? (
        <div className="px-3 py-4 text-[12.5px] leading-relaxed text-slate-500">
          เลือกพื้นที่ที่จะเทียบก่อน แล้วตัวเลขจะขึ้นที่นี่ — ทำได้ 2 วิธี
          <ol className="mt-1.5 space-y-1 list-decimal list-inside text-slate-600">
            <li>คลิกที่ <span className="font-medium">เขต / แขวง / ชุมชน</span> บนแผนที่แต่ละอันโดยตรง (คลิกซ้ำ = ยกเลิก)</li>
            <li>หรือติ๊กเขตจากช่อง <span className="font-medium">“— เลือกเขต —”</span> ด้านบนของแผนที่ (เลือกหลายเขตได้ ระบบรวมให้)</li>
          </ol>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left font-medium px-3 py-2 w-28">หัวข้อ</th>
                {cols.map((c) => (
                  <th key={c.id} className="text-right font-medium px-3 py-2 min-w-[96px]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                      <span className="truncate max-w-[140px] text-slate-700" title={c.sub ?? c.label}>{c.label}</span>
                      {/* ✕ = เอาพื้นที่ที่คลิกเลือกไว้ของแผนที่นี้ออก (เหมือนคลิกซ้ำที่เดิมบนแผนที่) */}
                      {c.pinned && !exporting && onRemovePin && (
                        <button type="button" onClick={() => onRemovePin(c.id)} title="เอาพื้นที่นี้ออก"
                          className="shrink-0 text-slate-300 hover:text-rose-600"><X size={13} /></button>
                      )}
                    </span>
                    {/* บอกว่าตัวเลขคอลัมน์นี้มาจากการเลือกแบบไหน — กันสับสนว่าทำไมเลขไม่ตรงกับที่นึกไว้ */}
                    <div className="text-[11px] font-normal text-slate-400">
                      {c.empty ? 'ยังไม่เลือกพื้นที่' : `${c.panelName} · ${c.source}`}
                    </div>
                  </th>
                ))}
                {showDiff && <th className="text-right font-medium px-3 py-2 min-w-[110px] text-slate-700">ต่าง</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const values = cols.map(c => (c.empty ? null : row.value(c)))
                const max = Math.max(...values.map(v => v ?? 0))
                return (
                  <tr key={row.key} className={row.strong ? 'bg-slate-50/60' : undefined}>
                    <td className="px-3 py-1.5 text-left text-slate-600">{row.label}</td>
                    {cols.map((c, i) => (
                      <td key={c.id} className="px-3 py-1.5 text-right">
                        {values[i] == null ? <span className="text-slate-300">—</span> : (
                          <>
                            {/* ตัวหนา = ค่ามากที่สุดของแถวนั้น ให้กวาดตาเทียบได้เร็ว */}
                            <span className={values[i] === max && max > 0 ? 'font-bold text-slate-900' : 'text-slate-700'}>
                              {fmt(values[i])}{row.unit ?? ''}
                            </span>
                            {row.pctOfTotal && c.detail.count > 0 && (
                              <span className="text-slate-400"> ({pct(values[i], c.detail.count)}%)</span>
                            )}
                          </>
                        )}
                      </td>
                    ))}
                    {showDiff && (
                      <td className="px-3 py-1.5 text-right font-semibold text-slate-800">
                        {values[0] == null || values[1] == null
                          ? <span className="text-slate-300 font-normal">—</span>
                          : diffText(values[0], values[1])}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {filled.length > 0 && (
        <p className="px-3 py-2 text-[11.5px] leading-relaxed text-slate-400 border-t border-slate-100">
          ข้อมูลเหตุการณ์ยาเสพติดตามพื้นที่ที่เลือกไว้ของแต่ละแผนที่
          {showDiff && ` · คอลัมน์ "ต่าง" = ${cols[0].label} − ${cols[1].label} (% เทียบกับ ${cols[1].label})`}
          {' · หนึ่งเรื่องมีได้หลายพฤติการณ์'}
        </p>
      )}
    </div>
  )
}
