import { useState, useMemo, useRef } from 'react'
import { Search, X, ChevronDown, ChevronRight } from 'lucide-react'
import { subKey, communityKey } from "./usePixelMapState.js"
import { buildAreaRows } from "../../shared/geo/pixelMapAreas.js"

function Chip({ label, tone = 'violet', onRemove }) {
  const tones = {
    violet: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium ${tones[tone]}`}>
      <span className="truncate max-w-[180px]">{label}</span>
      <button type="button" onClick={onRemove} className="opacity-60 hover:opacity-100 shrink-0"><X size={12} /></button>
    </span>
  )
}

export default function SelectionTree({
  districtOptions, hierarchy,
  checkedDistricts, checkedSubdistricts, checkedCommunities,
  toggleDistrict, toggleSubdistrict, toggleCommunity,
  expandedDistricts, toggleExpanded, expandedSubdistricts, toggleSubExpanded,
  expandDistrict, expandSubdistrict, collapseDistrict, collapseSubdistrict, collapseAll,
  selectDistricts, clearSelection,
}) {
  const [q, setQ] = useState('')

  // ติ๊ก = กางรายการข้างใน / เอาติ๊กออก = หุบ — ใช้ทุกทางที่เอาติ๊กออก (ช่องติ๊ก, ปุ่ม x ของชิป, ปุ่มล้าง)
  // ("เลือกทั้งหมด" ติ๊กอย่างเดียว ไม่กาง ไม่งั้นรายการยาวเป็นร้อยแถวทันที)
  const tickDistrict = (dname, hasChildren) => {
    if (checkedDistricts.has(dname)) collapseDistrict?.(dname)
    else if (hasChildren) expandDistrict?.(dname)
    toggleDistrict(dname)
  }
  const tickSubdistrict = (district, sub, hasChildren) => {
    if (checkedSubdistricts.has(subKey(district, sub))) collapseSubdistrict?.(district, sub)
    else if (hasChildren) expandSubdistrict?.(district, sub)
    toggleSubdistrict(district, sub)
  }
  const clearAll = () => {
    collapseAll?.()
    clearSelection()
  }
  const stop = (e) => e.stopPropagation()
  const searchRef = useRef(null)

  const rows = useMemo(() => buildAreaRows(hierarchy, districtOptions, q), [hierarchy, districtOptions, q])
  const allVisibleChecked = rows.length > 0 && rows.every(r => checkedDistricts.has(r.dname))
  const totalChecked = checkedDistricts.size + checkedSubdistricts.size + checkedCommunities.size

  return (
    <div className="w-full shrink-0 bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-4 space-y-3 @[1240px]:sticky @[1240px]:top-4 @[1240px]:w-[270px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-slate-700">พื้นที่บนแผนที่</span>
        {totalChecked > 0 && (
          <span className="text-[11px] font-medium text-violet-700 bg-violet-50 rounded-full px-2 py-0.5">เลือก {totalChecked}</span>
        )}
      </div>

      <>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาเขต/แขวง/ชุมชน..."
              className="w-full h-9 pl-8 pr-8 rounded-lg ring-1 ring-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-500" />
            {q && (
              <button type="button" onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-medium text-slate-500">{rows.length} เขต</span>
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => selectDistricts(rows.map(r => r.dname))} disabled={allVisibleChecked}
                  className="h-6 px-2 rounded-md ring-1 ring-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  เลือกทั้งหมด
                </button>
                <button type="button" onClick={clearAll} disabled={totalChecked === 0}
                  className="h-6 px-2 rounded-md ring-1 ring-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  ล้าง
                </button>
              </span>
            </div>

            <div className="max-h-[340px] overflow-y-auto rounded-lg ring-1 ring-slate-200 divide-y divide-slate-100">
              {rows.length === 0 && <p className="px-3 py-4 text-xs text-slate-400 text-center">ไม่พบพื้นที่ที่ตรงกับคำค้น</p>}
              {rows.map(({ dname, subs, autoExpand }) => {
                const open = autoExpand || expandedDistricts.has(dname)
                const districtOn = checkedDistricts.has(dname) // ต้องติ๊กเขตก่อน ถึงจะติ๊กแขวง/ชุมชนได้
                const subCount = subs.filter(s => checkedSubdistricts.has(subKey(dname, s.sub))).length
                return (
                  <div key={dname}>
                    {/* กดที่แถวไหนก็ติ๊กแถวนั้น ไม่ต้องเล็งช่องติ๊ก — ลูกศรกาง/ย่อกดแยก (stop ไม่ให้ไปติ๊กด้วย) */}
                    <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 cursor-pointer"
                      onClick={() => tickDistrict(dname, subs.length > 0)}>
                      <input type="checkbox" checked={checkedDistricts.has(dname)}
                        onChange={() => tickDistrict(dname, subs.length > 0)} onClick={stop}
                        className="accent-violet-600 shrink-0" />
                      <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{dname}</span>
                      {subCount > 0 && (
                        <span className="shrink-0 text-[10px] font-medium text-amber-600 bg-amber-50 rounded-full px-1.5 py-0.5">{subCount} แขวง</span>
                      )}
                      {subs.length > 0 && (
                        <button type="button" onClick={(e) => { stop(e); toggleExpanded(dname) }} className="text-slate-400 hover:text-slate-600 shrink-0"
                          title={open ? 'ย่อแขวง' : 'กางแขวง'}>
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </div>

                    {open && subs.map(({ sub, communities, autoExpand: subAuto }) => {
                      const sKey = subKey(dname, sub)
                      const subOpen = subAuto || expandedSubdistricts.has(sKey)
                      const comCount = communities.filter(c => checkedCommunities.has(communityKey(dname, sub, c))).length
                      return (
                        <div key={sKey}>
                          <div className={`flex items-center gap-2 pl-7 pr-2 py-1 ${districtOn ? 'hover:bg-slate-50 cursor-pointer' : 'opacity-45'}`}
                            title={districtOn ? undefined : 'ติ๊กเขตก่อนจึงจะเลือกแขวงได้'}
                            onClick={districtOn ? () => tickSubdistrict(dname, sub, communities.length > 0) : undefined}>
                            <input type="checkbox" disabled={!districtOn} checked={checkedSubdistricts.has(sKey)}
                              onChange={() => tickSubdistrict(dname, sub, communities.length > 0)} onClick={stop}
                              className="accent-amber-500 shrink-0 disabled:cursor-not-allowed" />
                            <span className="flex-1 min-w-0 text-xs text-slate-600 truncate">{sub}</span>
                            {comCount > 0 && (
                              <span className="shrink-0 text-[10px] font-medium text-rose-600 bg-rose-50 rounded-full px-1.5 py-0.5">{comCount}</span>
                            )}
                            {communities.length > 0 && (
                              <button type="button" onClick={(e) => { stop(e); toggleSubExpanded(dname, sub) }} className="text-slate-400 hover:text-slate-600 shrink-0"
                                title={subOpen ? 'ย่อชุมชน' : `กางชุมชน (${communities.length})`}>
                                {subOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              </button>
                            )}
                          </div>
                          {subOpen && communities.map(c => (
                            <label key={c} className={`flex items-center gap-2 pl-12 pr-2 py-1 text-[11px] text-slate-500 ${districtOn ? 'hover:bg-slate-50 cursor-pointer' : 'opacity-45 cursor-not-allowed'}`}
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
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Selected ({totalChecked})</div>
            {totalChecked === 0 ? (
              <p className="text-xs text-slate-400">ยังไม่ได้เลือกพื้นที่ — ติ๊กจากรายการด้านบนได้หลายอัน (เขต/แขวง/ชุมชน)</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {[...checkedDistricts].sort().map(d => (
                  <Chip key={d} label={d} onRemove={() => tickDistrict(d, false)} />
                ))}
                {[...checkedSubdistricts].sort().map(key => {
                  const [district, sub] = key.split('|')
                  return <Chip key={key} tone="amber" label={`${sub} (แขวง)`} onRemove={() => tickSubdistrict(district, sub, false)} />
                })}
                {[...checkedCommunities].sort().map(key => {
                  const [district, sub, community] = key.split('|')
                  return <Chip key={key} tone="rose" label={community} onRemove={() => toggleCommunity(district, sub, community)} />
                })}
              </div>
            )}
          </div>
      </>
    </div>
  )
}
