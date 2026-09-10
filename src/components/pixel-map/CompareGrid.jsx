import { useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import MapCanvas from './MapCanvas'
import ColorSwatch from './ColorSwatch'
import DistrictPicker from './DistrictPicker'

const PANEL_ASPECT = 1.29
const PANEL_GAP = 16
const PANEL_MIN_W = 220 // ต่ำกว่านี้ header (สี+dropdown) เริ่มอึดอัด → ยุบเหลือ 1 คอลัมน์แทน

// แขวง/ชุมชนที่ติ๊ก กรองเฉพาะที่อยู่ในเขตของ panel นี้ (pure — อยู่นอก component ให้ reference คงที่)
const inDistricts = (keys, names) => new Set(names.length ? [...keys].filter(k => names.includes(k.split('|')[0])) : [])

// layers (สี/opacity ของ เขต/แขวง/data) แชร์ทุก panel — ยกเว้นสี fill ของเขตที่ override เป็น slot.color ต่อ panel (แยกแยะ panel ด้วยตา)
// zoom: ปกติแต่ละ panel อิสระ (slot.zoom ของตัวเอง) — ถ้า syncZoom เปิด ทุก panel ใช้ sharedCompareZoom ตัวเดียวกันแทน
// selection: เขตของ panel ติ๊กได้หลายเขตจาก dropdown บน header (แบบเดียวกับรายการในโหมด multi-select)
// ส่วนแขวง/ชุมชนใช้ชุดเดียวกับโหมด multi-select แต่กรองเฉพาะที่อยู่ในเขตของ panel นั้น จึง fill ได้เหมือนกันทุกประการ
export default function CompareGrid({
  compareSlots, layers, layerCounts, labelsConfig, geojson, hierarchy, subdistrictIndex, communityIndex, style, svgRef,
  districtOptions, availableWidth = 900, checkedSubdistricts, checkedCommunities, toggleSubdistrict, toggleCommunity,
  syncZoom, setSyncZoom, sharedCompareZoom, setSharedCompareZoom, setCompareSlotZoom,
  toggleCompareSlotDistrict, setCompareSlotDistricts, setCompareSlotColor, addComparePanel, removeComparePanel,
  exporting = false, showExportNumbers = true,
}) {
  const slotLabel = (districts) => (districts.length === 1 ? districts[0] : districts.length > 1 ? `${districts.length} เขต` : null)
  // ขนาด panel + จำนวนคอลัมน์คิดจากพื้นที่จริง — ถ้ากว้างไม่พอสำหรับ 2 คอลัมน์ที่ความกว้างขั้นต่ำ ให้ยุบเหลือ 1 คอลัมน์ (ไม่ล้น/ไม่ต้องเลื่อน)
  const desiredCols = compareSlots.length <= 2 ? compareSlots.length : 2
  const cols = availableWidth >= desiredCols * PANEL_MIN_W + (desiredCols - 1) * PANEL_GAP ? desiredCols : 1
  const panelW = Math.max(200, Math.floor((availableWidth - PANEL_GAP * (cols - 1)) / cols))
  const panelH = Math.round(panelW / PANEL_ASPECT)

  // per-slot: Set เขต/แขวง/ชุมชน + panelLayers — memo คีย์ด้วย "เนื้อหา" (เขต+สี) ไม่ใช่ทั้ง slot
  // slot.zoom เปลี่ยนทุกครั้งที่ซูม → ถ้าสร้าง Set ใหม่ทุก render จะทำให้ memo ใน MapCanvas (path layers) พังตอนซูม
  // คีย์ด้วย signature ของ districts/สีเท่านั้น → Set/panelLayers reference คงที่ระหว่างซูม เลเยอร์รูปทรงจึงข้าม re-render ได้
  const districtsSig = compareSlots.map(s => (s.districts ?? []).join('|')).join('~')
  const colorsSig = compareSlots.map(s => s.color).join('~')
  const slotSelections = useMemo(() => compareSlots.map(slot => {
    const districts = slot.districts ?? []
    return {
      checkedDistricts: new Set(districts),
      panelSubs: inDistricts(checkedSubdistricts, districts),
      panelCommunities: inDistricts(checkedCommunities, districts),
      panelLayers: [{ ...layers[0], color: slot.color }, ...layers.slice(1)],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [districtsSig, colorsSig, checkedSubdistricts, checkedCommunities, layers])

  return (
    <div className="space-y-3">
      {/* toolbar — เครื่องมือแก้ไข ไม่ต้องติดไปกับภาพ export */}
      {!exporting && (
        <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={syncZoom} onChange={e => setSyncZoom(e.target.checked)} className="accent-violet-600" />
            Sync zoom ทุก panel
          </label>
          <button type="button" onClick={addComparePanel} disabled={compareSlots.length >= 4}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-lg ring-1 ring-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <Plus size={13} />Add panel {compareSlots.length >= 4 ? '(สูงสุด 4)' : ''}
          </button>
        </div>
      )}

      {/* หัวข้อรวม — โชว์ครั้งเดียวเหนือกริดตอน export ให้รู้ว่าภาพนี้เปรียบเทียบอะไร */}
      {exporting && style.title && (
        <h2 className="text-center text-lg font-bold text-slate-900">{style.title}</h2>
      )}

      <div className="grid justify-center" style={{ gap: PANEL_GAP, gridTemplateColumns: `repeat(${cols}, max-content)` }}>
        {compareSlots.map((slot, i) => {
          const districts = slot.districts ?? []
          const { checkedDistricts, panelSubs, panelCommunities, panelLayers } = slotSelections[i]
          const label = slotLabel(districts) ?? slot.label
          const subCount = panelSubs.size
          const comCount = panelCommunities.size
          return (
            <div key={slot.id}
              className={`relative bg-white rounded-lg ring-1 ring-slate-200 focus-within:z-20 ${exporting ? 'overflow-hidden' : ''}`}>
              {exporting ? (
                // หัว panel แบบสะอาด: แถบสีประจำ panel + ชื่อเขต + จำนวนแขวง/ชุมชน — ผูกสี fill เข้ากับชื่อ อ่านเทียบง่าย
                <div className="flex items-center gap-2 px-2.5 py-1.5 border-b" style={{ borderColor: slot.color }}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: slot.color }} />
                  <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">{label}</span>
                  {(subCount > 0 || comCount > 0) && (
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {subCount > 0 && `${subCount} แขวง`}{subCount > 0 && comCount > 0 && ' · '}{comCount > 0 && `${comCount} ชุมชน`}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-100">
                  <ColorSwatch value={slot.color} onChange={v => setCompareSlotColor(slot.id, v)} title={slot.label} align="left" />
                  <DistrictPicker districtOptions={districtOptions} hierarchy={hierarchy} selected={districts}
                    checkedSubdistricts={checkedSubdistricts} checkedCommunities={checkedCommunities}
                    toggleSubdistrict={toggleSubdistrict} toggleCommunity={toggleCommunity}
                    onToggle={d => toggleCompareSlotDistrict(slot.id, d)}
                    onSet={names => setCompareSlotDistricts(slot.id, names)} />
                  {compareSlots.length > 1 && (
                    <button type="button" onClick={() => removeComparePanel(slot.id)} className="text-slate-400 hover:text-rose-600 shrink-0">
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
              <MapCanvas
                ref={i === 0 ? svgRef : undefined}
                width={panelW} height={panelH}
                geojson={geojson} hierarchy={hierarchy} subdistrictIndex={subdistrictIndex} communityIndex={communityIndex}
                checkedDistricts={checkedDistricts} checkedSubdistricts={panelSubs} checkedCommunities={panelCommunities}
                layers={panelLayers} layerCounts={layerCounts} labelsConfig={labelsConfig} style={style} exporting={exporting}
                showExportNumbers={showExportNumbers}
                panelLabel={exporting ? '' : label}
                zoomTransform={syncZoom ? sharedCompareZoom : slot.zoom}
                onZoomChange={syncZoom ? setSharedCompareZoom : (t) => setCompareSlotZoom(slot.id, t)}
              />
            </div>
          )
        })}
      </div>

      {exporting && style.caption && (
        <p className="text-center text-xs text-slate-500">{style.caption}</p>
      )}
    </div>
  )
}
