import { Palette, Download, Hash, Database } from 'lucide-react'
import FilterPill from '../FilterPill'
import { DATA_SOURCES, DRUG_SUBSTANCES, BEHAVIOR_FLAGS, BKN_FILTER_OPTIONS, METRIC_OPTIONS } from '../../utils/pixelMapData'
import { SHAPES } from '../../utils/pixelMapStyle'
import AccordionSection from './AccordionSection'

const SHAPE_GLYPH = { circle: '●', square: '■', diamond: '◆', triangle: '▲' }
const LEVEL_OPTIONS = [['subdistrict', 'แขวง'], ['community', 'ชุมชน']] // ระดับเขตคุมแยกที่ "ชื่อเขตบนแผนที่"

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

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </label>
  )
}

export default function StylePanel({
  style, updateStyle,
  labelsConfig, updateLabelsConfig, toggleLabelsVisible, toggleLabelsLevel,
  dataLayers, updateLayer, fiscalYearsBySource,
  onExportSvg, onExportPng, onCopyEmbed, compareActive,
  zoomTransform, onZoomChange,
  exportFullMap, setExportFullMap,
}) {
  return (
    <>
      <AccordionSection title="Style" icon={<Palette size={14} className="text-slate-400" />}>
        <Field label="การแสดงผล data overlay">
          <Seg options={[['dot', 'จุด'], ['fill', 'เต็มพื้นที่']]} value={style.displayMode} onChange={v => updateStyle({ displayMode: v })} />
        </Field>
        {style.displayMode === 'dot' && (
          <>
            <Field label="รูปทรงจุด">
              <div className="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden">
                {SHAPES.map(s => (
                  <button key={s} type="button" onClick={() => updateStyle({ shape: s })}
                    className={`w-9 h-8 text-sm transition ${
                      style.shape === s ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}>{SHAPE_GLYPH[s]}</button>
                ))}
              </div>
            </Field>
            <Field label={`ขนาดจุด ${style.dotSize}px`}>
              <input type="range" min={4} max={16} value={style.dotSize} onChange={e => updateStyle({ dotSize: Number(e.target.value) })}
                className="w-full h-1 accent-violet-600" />
            </Field>
            <Field label={`ระยะห่าง ${style.spacing}px`}>
              <input type="range" min={4} max={16} value={style.spacing} onChange={e => updateStyle({ spacing: Number(e.target.value) })}
                className="w-full h-1 accent-violet-600" />
            </Field>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={style.showBorders} onChange={e => updateStyle({ showBorders: e.target.checked })} className="accent-violet-600" />
          แสดงเส้นขอบเขต
        </label>
        <Field label="ภาพแผนที่พื้นหลัง">
          <Seg options={[['carto', 'ยาเสพติด'], ['osm', 'OSM'], ['', 'ไม่ใช้']]}
            value={style.tileSource} onChange={v => updateStyle({ tileSource: v })} />
        </Field>
        <Field label="พื้นหลัง">
          <Seg options={[['map', 'แผนที่'], ['light', 'Light'], ['dark', 'Dark'], ['clear', 'ใส']]}
            value={style.background} onChange={v => updateStyle({ background: v })} />
        </Field>

        {!compareActive && zoomTransform && (
          <Field label={`Zoom level ${Math.round(zoomTransform.k * 100)}%`}>
            <input type="range" min={1} max={24} step={0.1} value={zoomTransform.k}
              onChange={e => onZoomChange?.({ ...zoomTransform, k: Number(e.target.value) })}
              className="w-full h-1 accent-violet-600" />
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={style.focusSelection} onChange={e => updateStyle({ focusSelection: e.target.checked })} className="accent-violet-600" />
          โฟกัสเฉพาะเขตที่เลือก (ตัดพื้นที่อื่นออก)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={style.autoFitOnSelection} onChange={e => updateStyle({ autoFitOnSelection: e.target.checked })} className="accent-violet-600" />
          Auto-fit เมื่อเลือกพื้นที่
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={style.showZoomControls} onChange={e => updateStyle({ showZoomControls: e.target.checked })} className="accent-violet-600" />
          แสดงปุ่มซูมบน canvas
        </label>

        <Field label="หัวข้อ">
          <input value={style.title} onChange={e => updateStyle({ title: e.target.value })} placeholder="ชื่อ infographic"
            className="w-full h-9 px-2.5 rounded-lg ring-1 ring-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-500" />
        </Field>
        <Field label="คำอธิบายท้ายภาพ">
          <input value={style.caption} onChange={e => updateStyle({ caption: e.target.value })} placeholder="แหล่งข้อมูล / วันที่"
            className="w-full h-9 px-2.5 rounded-lg ring-1 ring-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-500" />
        </Field>
      </AccordionSection>

      <AccordionSection title="Data" icon={<Database size={14} className="text-slate-400" />}>
        {dataLayers.length === 0 && (
          <p className="text-xs text-slate-400">ยังไม่มี data overlay — กด "+ ข้อมูล" ในส่วน Layers ด้านบนก่อน</p>
        )}
        {dataLayers.map(layer => (
          <div key={layer.id} className="space-y-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
            <div className="text-xs font-semibold text-slate-600">{layer.label}</div>
            <Field label="แหล่งข้อมูล">
              <FilterPill value={layer.source} onChange={v => updateLayer(layer.id, { source: v, substance: null, behavior: null, fiscalYear: 'all' })}
                options={DATA_SOURCES.map(s => [s.id, s.label])} />
            </Field>
            {layer.source === 'drug_incidents' && (
              <>
                <Field label="ชนิดยา">
                  <FilterPill value={layer.substance ?? 'all'} onChange={v => updateLayer(layer.id, { substance: v === 'all' ? null : v })}
                    options={[['all', 'ทั้งหมด'], ...DRUG_SUBSTANCES.map(([col, lbl]) => [col, lbl])]} />
                </Field>
                <Field label="พฤติการณ์">
                  <FilterPill value={layer.behavior ?? 'all'} onChange={v => updateLayer(layer.id, { behavior: v === 'all' ? null : v })}
                    options={[['all', 'ทั้งหมด'], ...BEHAVIOR_FLAGS.map(([col, lbl]) => [col, lbl])]} />
                </Field>
              </>
            )}
            {layer.source !== 'bkn_summary' && (
              <Field label="ปีงบประมาณ">
                <FilterPill value={String(layer.fiscalYear)} onChange={v => updateLayer(layer.id, { fiscalYear: v })}
                  options={[['all', 'ทุกปี'], ...(fiscalYearsBySource[layer.source] ?? []).map(y => [String(y), String(y)])]} />
              </Field>
            )}
            <Field label="บก.น.">
              <FilterPill value={layer.bkn} onChange={v => updateLayer(layer.id, { bkn: v })}
                options={[['all', 'ทั้งหมด'], ...BKN_FILTER_OPTIONS.map(b => [b, b])]} />
            </Field>
            <p className="text-[11px] text-slate-400">ปรับสีไล่โทน (min → max) ได้ที่แถว layer นี้ใน Layers</p>
          </div>
        ))}
      </AccordionSection>

      <AccordionSection title="Labels" icon={<Hash size={14} className="text-slate-400" />}>
        <Field label="ชื่อเขตบนแผนที่">
          <Seg options={[['off', 'ปิด'], ['selected', 'ที่เลือก'], ['all', 'ทุกเขต']]}
            value={labelsConfig.districtNames} onChange={v => updateLabelsConfig({ districtNames: v })} />
        </Field>
        {labelsConfig.districtNames !== 'off' && (
          <Field label="ขนาดชื่อพื้นที่">
            <Seg options={[['sm', 'เล็ก'], ['md', 'กลาง'], ['lg', 'ใหญ่']]}
              value={labelsConfig.districtNameSize} onChange={v => updateLabelsConfig({ districtNameSize: v })} />
          </Field>
        )}
        <Field label="สีตัวอักษร">
          <Seg options={[['#000000', 'ดำ'], ['auto', 'Auto contrast']]}
            value={labelsConfig.textColor === 'auto' ? 'auto' : '#000000'}
            onChange={v => updateLabelsConfig({ textColor: v })} />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700 font-medium">
          <input type="checkbox" checked={labelsConfig.visible} onChange={toggleLabelsVisible} className="accent-violet-600" />
          แสดงชื่อแขวง/ชุมชน
        </label>
        {labelsConfig.visible && (
          <>
            <Field label="ระดับ (เลือกได้หลาย)">
              <div className="flex gap-1.5">
                {LEVEL_OPTIONS.map(([val, lbl]) => (
                  <button key={val} type="button" onClick={() => toggleLabelsLevel(val)}
                    className={`px-3 h-8 rounded-lg text-xs font-medium ring-1 transition ${
                      labelsConfig.levels.has(val) ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                    }`}>{lbl}</button>
                ))}
              </div>
            </Field>
            <Field label="จัดลำดับความสำคัญตาม (ตอนชื่อชนกัน)">
              <FilterPill value={labelsConfig.metric} onChange={v => updateLabelsConfig({ metric: v })}
                options={METRIC_OPTIONS.map(([col, lbl]) => [col, lbl])} />
            </Field>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={labelsConfig.showPill} onChange={e => updateLabelsConfig({ showPill: e.target.checked })} className="accent-violet-600" />
          พื้นหลัง pill ใต้ชื่อ
        </label>
      </AccordionSection>

      <AccordionSection title="Export" icon={<Download size={14} className="text-slate-400" />}>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={exportFullMap} onChange={e => setExportFullMap(e.target.checked)} className="accent-violet-600" />
          ส่งออกเต็มแผนที่ (รีเซ็ตซูมก่อน) — ปิด = ตามมุมมองที่เห็น
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" onClick={() => onExportPng(1)} className="h-9 rounded-lg ring-1 ring-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">PNG 1x</button>
          <button type="button" onClick={() => onExportPng(2)} className="h-9 rounded-lg ring-1 ring-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">PNG 2x</button>
          <button type="button" onClick={() => onExportPng(4)} className="h-9 rounded-lg ring-1 ring-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">PNG 4x</button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={onExportSvg} className="h-9 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">Export SVG</button>
          <button type="button" onClick={onCopyEmbed} className="h-9 rounded-lg ring-1 ring-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">คัดลอก HTML</button>
        </div>
        {compareActive && <p className="text-[11px] text-slate-400">โหมด Compare: SVG export ได้เฉพาะ panel แรก — PNG export ได้ทั้ง grid</p>}
      </AccordionSection>
    </>
  )
}
