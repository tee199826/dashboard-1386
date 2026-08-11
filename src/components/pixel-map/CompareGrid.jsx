import { Plus, X } from 'lucide-react'
import MapCanvas from './MapCanvas'
import ColorSwatch from './ColorSwatch'

const PANEL_SIZE = { w: 420, h: 340 }

// layers (สี/opacity ของ เขต/แขวง/data) แชร์ทุก panel — ยกเว้นสี fill ของเขตที่ override เป็น slot.color ต่อ panel (แยกแยะ panel ด้วยตา)
// zoom: ปกติแต่ละ panel อิสระ (slot.zoom ของตัวเอง) — ถ้า syncZoom เปิด ทุก panel ใช้ sharedCompareZoom ตัวเดียวกันแทน
// selection: 1 เขตต่อ panel เท่านั้น (ไม่ใช่ tree แบบ multi-select) — เลือกตรงที่ dropdown บน header ของแต่ละ panel
export default function CompareGrid({
  compareSlots, layers, layerCounts, levelMaxes, labelsConfig, geojson, hierarchy, style, svgRef,
  districtOptions,
  syncZoom, setSyncZoom, sharedCompareZoom, setSharedCompareZoom, setCompareSlotZoom,
  setCompareSlotDistrict, setCompareSlotColor, addComparePanel, removeComparePanel,
}) {
  const cols = compareSlots.length <= 2 ? compareSlots.length : 2

  return (
    <div className="space-y-3">
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

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {compareSlots.map((slot, i) => {
          const checkedDistricts = new Set(slot.selectedDistrict ? [slot.selectedDistrict] : [])
          const panelLayers = [{ ...layers[0], color: slot.color }, ...layers.slice(1)]
          return (
            <div key={slot.id} className="bg-white rounded-lg overflow-hidden ring-1 ring-slate-200">
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-100">
                <ColorSwatch value={slot.color} onChange={v => setCompareSlotColor(slot.id, v)} title={slot.label} />
                <select value={slot.selectedDistrict ?? ''} onChange={e => setCompareSlotDistrict(slot.id, e.target.value || null)}
                  className="flex-1 min-w-0 h-8 px-2 rounded-lg ring-1 ring-slate-200 text-xs outline-none focus:ring-2 focus:ring-violet-500">
                  <option value="">— เลือกเขต —</option>
                  {districtOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {compareSlots.length > 1 && (
                  <button type="button" onClick={() => removeComparePanel(slot.id)} className="text-slate-400 hover:text-rose-600 shrink-0">
                    <X size={14} />
                  </button>
                )}
              </div>
              <MapCanvas
                ref={i === 0 ? svgRef : undefined}
                width={PANEL_SIZE.w} height={PANEL_SIZE.h}
                geojson={geojson} hierarchy={hierarchy}
                checkedDistricts={checkedDistricts} checkedSubdistricts={new Set()}
                layers={panelLayers} layerCounts={layerCounts} levelMaxes={levelMaxes} labelsConfig={labelsConfig} style={style}
                panelLabel={slot.selectedDistrict || slot.label}
                zoomTransform={syncZoom ? sharedCompareZoom : slot.zoom}
                onZoomChange={syncZoom ? setSharedCompareZoom : (t) => setCompareSlotZoom(slot.id, t)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
