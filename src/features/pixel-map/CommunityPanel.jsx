// CommunityPanel — รายชื่อชุมชนทั้งหมดในพื้นที่ที่ติ๊กไว้ (tooltip บนแผนที่โชว์ได้แค่ 5 อันดับแรก)
// เรียงตามจำนวนเรื่องมาก→น้อย ติ๊กในรายการนี้ = ติ๊กชุมชนบนแผนที่ (ชุด checkedCommunities เดียวกับ SelectionTree)
import { useMemo, useState } from 'react'
import { communityList } from "../../shared/geo/pixelMapData.js"
import { subKey, communityKey } from "./usePixelMapState.js"

export default function CommunityPanel({ hierarchy, checkedDistricts, checkedSubdistricts, checkedCommunities, toggleCommunity }) {
  const [q, setQ] = useState('')

  // ขอบเขต: ติ๊กแขวงไว้ → เฉพาะแขวงนั้น ; ติ๊กแค่เขต → ทุกแขวงในเขต (กติกาเดียวกับชุมชนบนแผนที่)
  const rows = useMemo(() => {
    const keys = new Set(checkedSubdistricts)
    const drilled = new Set([...checkedSubdistricts].map(k => k.split('|')[0]))
    for (const d of checkedDistricts) {
      if (drilled.has(d)) continue
      for (const sub of Object.keys(hierarchy[d]?.subdistricts ?? {})) keys.add(subKey(d, sub))
    }
    const out = []
    for (const key of keys) {
      const [district, sub] = key.split('|')
      for (const c of communityList(hierarchy, district, sub)) out.push({ ...c, district })
    }
    return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'th'))
  }, [hierarchy, checkedDistricts, checkedSubdistricts])

  const needle = q.trim()
  const shown = needle ? rows.filter(r => r.name.includes(needle) || r.subdistrict.includes(needle)) : rows
  const total = rows.reduce((s, r) => s + r.count, 0)

  if (rows.length === 0) {
    return <p className="text-[13px] leading-relaxed text-slate-400">ติ๊กเขตหรือแขวงในแผงด้านซ้ายก่อน แล้วรายชื่อชุมชนจะขึ้นที่นี่</p>
  }

  return (
    <div className="space-y-2">
      <div className="text-[13px] text-slate-500 tabular-nums">
        {rows.length.toLocaleString()} ชุมชน · รวม {total.toLocaleString()} เรื่อง
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชุมชน/แขวง…"
        className="w-full h-9 px-2.5 rounded-lg ring-1 ring-slate-200 text-[13px] outline-none focus:ring-2 focus:ring-violet-500" />
      <div className="max-h-[300px] overflow-y-auto rounded-lg ring-1 ring-slate-200 divide-y divide-slate-100">
        {shown.length === 0 && <p className="px-2.5 py-3 text-[13px] text-slate-400 text-center">ไม่พบชุมชนที่ตรงกับคำค้น</p>}
        {shown.map(r => {
          const key = communityKey(r.district, r.subdistrict, r.name)
          return (
            <label key={key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={checkedCommunities.has(key)}
                onChange={() => toggleCommunity(r.district, r.subdistrict, r.name)}
                className="accent-rose-500 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] text-slate-700 truncate">{r.name}</span>
                <span className="block text-[11.5px] text-slate-400 truncate">แขวง{r.subdistrict} · {r.district}</span>
              </span>
              <span className="shrink-0 text-[13px] font-bold text-slate-900 tabular-nums">{r.count.toLocaleString()}</span>
            </label>
          )
        })}
      </div>
      <p className="text-[11.5px] leading-relaxed text-slate-400">นับเฉพาะชุมชนที่มีพิกัดในข้อมูล — ติ๊กเพื่อระบายพื้นที่ชุมชนบนแผนที่</p>
    </div>
  )
}
