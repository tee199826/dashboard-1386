import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { subKey, communityKey } from '../../hooks/usePixelMapState'
import { buildAreaRows } from '../../utils/pixelMapAreas'

const flip = (set, key) => {
  const next = new Set(set)
  next.has(key) ? next.delete(key) : next.add(key)
  return next
}

// ตัวเลือกพื้นที่ของ panel ในโหมด compare — โครงเดียวกับแผง multi-select: เขต → แขวง → ชุมชน ติ๊กได้หลายอันทุกระดับ
// เขต = ของ panel นั้นโดยเฉพาะ (slot.districts) — แขวง/ชุมชน = ชุดร่วมกับโหมด multi-select แล้วค่อยกรองตามเขตของ panel ตอนวาด
export default function DistrictPicker({
  districtOptions, hierarchy, selected,
  checkedSubdistricts, checkedCommunities, toggleSubdistrict, toggleCommunity,
  onToggle, onSet,
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [subExpanded, setSubExpanded] = useState(() => new Set())
  const boxRef = useRef(null)

  // ปิดเมื่อคลิกนอกกล่อง — panel มีหลายอัน จึงต้องปิดของตัวเองเวลาไปคลิก panel อื่น
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const rows = useMemo(() => buildAreaRows(hierarchy, districtOptions, q), [hierarchy, districtOptions, q])

  const subCount = selected.reduce((n, d) => n + [...checkedSubdistricts].filter(k => k.split('|')[0] === d).length, 0)
  const comCount = selected.reduce((n, d) => n + [...checkedCommunities].filter(k => k.split('|')[0] === d).length, 0)
  const label = selected.length === 0 ? '— เลือกเขต —' : selected.length === 1 ? selected[0] : `${selected.length} เขต`

  return (
    <div ref={boxRef} className="relative flex-1 min-w-0">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full h-8 px-2 rounded-lg ring-1 ring-slate-200 text-xs text-left text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-1">
        <span className={`flex-1 truncate ${selected.length === 0 ? 'text-slate-400' : ''}`}>{label}</span>
        {(subCount > 0 || comCount > 0) && (
          <span className="shrink-0 text-[10px] text-slate-400">{subCount > 0 && `${subCount} แขวง`}{subCount > 0 && comCount > 0 && ' · '}{comCount > 0 && `${comCount} ชุมชน`}</span>
        )}
        <ChevronDown size={13} className="text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 top-9 left-0 right-0 min-w-57.5 bg-white rounded-lg ring-1 ring-slate-200 shadow-xl">
          <div className="relative p-1.5 border-b border-slate-100">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาเขต/แขวง/ชุมชน..."
              className="w-full h-7 pl-7 pr-2 rounded-md ring-1 ring-slate-200 text-xs outline-none focus:ring-2 focus:ring-violet-500" />
          </div>

          <div className="max-h-64 overflow-y-auto py-0.5 divide-y divide-slate-50">
            {rows.length === 0 && <p className="px-3 py-3 text-[11px] text-slate-400 text-center">ไม่พบพื้นที่ที่ตรงกับคำค้น</p>}
            {rows.map(({ dname, subs, autoExpand }) => {
              const isOpen = autoExpand || expanded.has(dname)
              const districtOn = selected.includes(dname) 
              return (
                <div key={dname}>
                  <div className="flex items-center gap-2 px-2.5 py-1 hover:bg-violet-50">
                    <input type="checkbox" checked={selected.includes(dname)} onChange={() => onToggle(dname)}
                      className="accent-violet-600 shrink-0" />
                    <span className="flex-1 min-w-0 text-xs text-slate-700 truncate">{dname}</span>
                    {subs.length > 0 && (
                      <button type="button" onClick={() => setExpanded(s => flip(s, dname))}
                        className="text-slate-400 hover:text-slate-600 shrink-0" title={isOpen ? 'ย่อแขวง' : 'กางแขวง'}>
                        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                    )}
                  </div>

                  {isOpen && subs.map(({ sub, communities, autoExpand: subAuto }) => {
                    const sKey = subKey(dname, sub)
                    const subOpen = subAuto || subExpanded.has(sKey)
                    return (
                      <div key={sKey}>
                        <div className={`flex items-center gap-2 pl-6 pr-2.5 py-0.5 ${districtOn ? 'hover:bg-amber-50' : 'opacity-45'}`}
                          title={districtOn ? undefined : 'ติ๊กเขตก่อนจึงจะเลือกแขวงได้'}>
                          <input type="checkbox" disabled={!districtOn} checked={checkedSubdistricts.has(sKey)}
                            onChange={() => toggleSubdistrict(dname, sub)}
                            className="accent-amber-500 shrink-0 disabled:cursor-not-allowed" />
                          <span className="flex-1 min-w-0 text-[11px] text-slate-600 truncate">{sub}</span>
                          {communities.length > 0 && (
                            <button type="button" onClick={() => setSubExpanded(s => flip(s, sKey))}
                              className="text-slate-400 hover:text-slate-600 shrink-0" title={subOpen ? 'ย่อชุมชน' : `กางชุมชน (${communities.length})`}>
                              {subOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </button>
                          )}
                        </div>
                        {subOpen && communities.map(c => (
                          <label key={c} className={`flex items-center gap-2 pl-10 pr-2.5 py-0.5 text-[11px] text-slate-500 ${districtOn ? 'hover:bg-rose-50 cursor-pointer' : 'opacity-45 cursor-not-allowed'}`}
                            title={districtOn ? undefined : 'ติ๊กเขตก่อนจึงจะเลือกชุมชนได้'}>
                            <input type="checkbox" disabled={!districtOn} checked={checkedCommunities.has(communityKey(dname, sub, c))}
                              onChange={() => toggleCommunity(dname, sub, c)} className="accent-rose-500 shrink-0 disabled:cursor-not-allowed" />
                            <span className="truncate">{c}</span>
                          </label>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-1 p-1.5 border-t border-slate-100">
            <button type="button" onClick={() => onSet(rows.map(r => r.dname))} disabled={rows.every(r => selected.includes(r.dname))}
              className="h-6 px-2 rounded-md ring-1 ring-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
              เลือกทุกเขต
            </button>
            <button type="button" onClick={() => onSet([])} disabled={selected.length === 0}
              className="h-6 px-2 rounded-md ring-1 ring-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
              ล้างเขต
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
