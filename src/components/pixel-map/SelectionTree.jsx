import { useState, useMemo, useRef } from 'react'
import { Search, X, Plus } from 'lucide-react'
import { subKey } from '../../hooks/usePixelMapState'

function Seg({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden">
      {options.map(([val, lbl]) => (
        <button key={val} type="button" onClick={() => onChange(val)}
          className={`px-3 h-8 text-xs font-medium transition ${
            value === val ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}>
          {lbl}
        </button>
      ))}
    </div>
  )
}

function Chip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-violet-50 text-violet-700 text-xs font-medium">
      <span className="truncate max-w-[180px]">{label}</span>
      <button type="button" onClick={onRemove} className="text-violet-400 hover:text-violet-700 shrink-0"><X size={12} /></button>
    </span>
  )
}

// suggestion เมื่อพิมพ์ค้นหา — ไม่ expand ทั้ง tree อีกต่อไป (Issue 5) แค่ผลลัพธ์สั้นๆ ที่ตรงกับคำค้น
function buildSuggestions(hierarchy, districtOptions, query, max = 8) {
  const needle = query.trim()
  if (!needle) return []
  const out = []
  for (const d of districtOptions) {
    if (out.length >= max) break
    if (d.includes(needle)) out.push({ type: 'district', label: d, district: d })
  }
  outer:
  for (const [district, node] of Object.entries(hierarchy)) {
    for (const [sub, subNode] of Object.entries(node.subdistricts || {})) {
      if (out.length >= max) break outer
      if (sub.includes(needle)) out.push({ type: 'subdistrict', label: `${sub} (${district})`, district, sub })
      for (const community of Object.keys(subNode.communities || {})) {
        if (out.length >= max) break outer
        if (community.includes(needle)) out.push({ type: 'community', label: `${community} — ${sub}`, district, sub })
      }
    }
  }
  return out
}

export default function SelectionTree({
  districtOptions, hierarchy,
  mode, setMode,
  checkedDistricts, checkedSubdistricts, toggleDistrict, toggleSubdistrict,
}) {
  const [q, setQ] = useState('')
  const searchRef = useRef(null)

  const suggestions = useMemo(() => buildSuggestions(hierarchy, districtOptions, q), [hierarchy, districtOptions, q])

  const pickSuggestion = (s) => {
    if (s.type === 'district') { if (!checkedDistricts.has(s.district)) toggleDistrict(s.district) }
    else { if (!checkedSubdistricts.has(subKey(s.district, s.sub))) toggleSubdistrict(s.district, s.sub) }
    setQ('')
  }

  return (
    <div className="w-full lg:w-[300px] shrink-0 bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-5 space-y-4">
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Mode</div>
        <Seg options={[['multi', 'Multi-select'], ['compare', 'Compare']]} value={mode} onChange={setMode} />
      </div>

      {mode === 'compare' ? (
        <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 rounded-lg p-3">
          เลือกเขตของแต่ละ panel ได้โดยตรงที่ dropdown บน panel นั้นๆ (ด้านขวา) —
          ตัวเลข/สี/ข้อมูลใช้ค่าเดียวกับโหมด Multi-select ที่ตั้งไว้ในแผงขวา
        </p>
      ) : (
        <>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาเขต/แขวง/ชุมชน..."
              className="w-full h-9 pl-8 pr-2.5 rounded-lg ring-1 ring-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-500" />
            {suggestions.length > 0 && (
              <div className="absolute z-10 top-10 left-0 right-0 bg-white rounded-lg ring-1 ring-slate-200 shadow-lg py-1 max-h-64 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <button key={i} type="button" onClick={() => pickSuggestion(s)}
                    className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-violet-50 flex items-center justify-between gap-2">
                    <span className="truncate">{s.label}</span>
                    <span className="text-[10px] text-slate-400 uppercase shrink-0">{s.type === 'district' ? 'เขต' : s.type === 'subdistrict' ? 'แขวง' : 'ชุมชน'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Selected ({checkedDistricts.size + checkedSubdistricts.size})
            </div>
            {checkedDistricts.size === 0 && checkedSubdistricts.size === 0 ? (
              <p className="text-xs text-slate-400">ยังไม่ได้เลือกพื้นที่</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {[...checkedDistricts].sort().map(d => (
                  <Chip key={d} label={d} onRemove={() => toggleDistrict(d)} />
                ))}
                {[...checkedSubdistricts].sort().map(key => {
                  const [district, sub] = key.split('|')
                  return <Chip key={key} label={`${sub} (แขวง)`} onRemove={() => toggleSubdistrict(district, sub)} />
                })}
              </div>
            )}
            <button type="button" onClick={() => searchRef.current?.focus()}
              className="w-full h-8 rounded-lg ring-1 ring-dashed ring-slate-300 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-violet-600 flex items-center justify-center gap-1">
              <Plus size={13} />เพิ่มเขต/แขวง
            </button>
          </div>
        </>
      )}
    </div>
  )
}
