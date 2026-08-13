import { useState } from 'react'
import { GripVertical, Eye, EyeOff, Trash2 } from 'lucide-react'
import { DATA_SOURCES } from '../../utils/pixelMapData'
import { ROSE_DEFAULT } from '../../hooks/usePixelMapState'
import ColorSwatch from './ColorSwatch'

function LayerRow({ layer, draggable, dragOver, onDragStart, onDragOver, onDrop, onDragEnd, onToggleVisible, onUpdate, onRemove }) {
  const label = layer.type === 'data'
    ? `${layer.label} (${DATA_SOURCES.find(s => s.id === layer.source)?.label ?? layer.source})`
    : layer.label
  const gradient = layer.type === 'data'

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart(e, layer.id) : undefined}
      onDragOver={draggable ? (e) => onDragOver(e, layer.id) : undefined}
      onDrop={draggable ? (e) => onDrop(e, layer.id) : undefined}
      onDragEnd={onDragEnd}
      className={`rounded-lg p-2.5 space-y-2 ring-1 ring-slate-200 ${dragOver ? 'border-t-2 border-t-violet-500' : ''}`}>
      <div className="flex items-center gap-2">
        {draggable && <GripVertical size={14} className="text-slate-400 shrink-0 cursor-grab" />}
        <button type="button" onClick={() => onToggleVisible(layer.id)} className="text-slate-500 shrink-0">
          {layer.visible ? <Eye size={14} /> : <EyeOff size={14} className="text-slate-300" />}
        </button>
        <span className="flex-1 text-xs font-medium text-slate-700 truncate">{label}</span>
        {gradient ? (
          <span className="flex items-center gap-1 shrink-0">
            <ColorSwatch value={layer.colorFrom} onChange={v => onUpdate(layer.id, { colorFrom: v })} title="สีเริ่มต้น (ค่าน้อย)" />
            <ColorSwatch value={layer.colorTo} onChange={v => onUpdate(layer.id, { colorTo: v })} title="สีปลาย (ค่ามาก)" />
          </span>
        ) : (
          <ColorSwatch value={layer.color} onChange={v => onUpdate(layer.id, { color: v })} title={label} />
        )}
        {onRemove && (
          <button type="button" onClick={() => onRemove(layer.id)} className="text-slate-400 hover:text-rose-600 shrink-0">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 pl-5">
        <input type="range" min={0} max={100} value={layer.opacity}
          onChange={e => onUpdate(layer.id, { opacity: Number(e.target.value) })} className="flex-1 h-1 accent-violet-600" />
        <span className="text-[10px] text-slate-400 tabular-nums w-8 text-right">{layer.opacity}%</span>
      </div>
    </div>
  )
}

// ชุมชนไม่มีรูปทรงของตัวเอง (มีแต่หมุด+ชื่อ) — แถวนี้จึงเป็น "หน้าต่างมองเข้าไปใน labelsConfig" ไม่ใช่ layer จริงใน layers[]
// eye = toggle 'community' ใน labelsConfig.levels, swatch = labelsConfig.textColor (แสดง rose-500 เมื่อยังเป็น auto), opacity = labelsConfig.opacity
function CommunityLabelsRow({ labelsConfig, toggleLabelsLevel, updateLabelsConfig }) {
  const isOn = labelsConfig.levels.has('community')
  const color = labelsConfig.textColor === 'auto' ? ROSE_DEFAULT : labelsConfig.textColor
  return (
    <div className="rounded-lg p-2.5 space-y-2 ring-1 ring-slate-200">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => toggleLabelsLevel('community')} className="text-slate-500 shrink-0">
          {isOn ? <Eye size={14} /> : <EyeOff size={14} className="text-slate-300" />}
        </button>
        <span className="flex-1 text-xs font-medium text-slate-700 truncate">ชุมชน (ชื่อ)</span>
        <ColorSwatch value={color} onChange={v => updateLabelsConfig({ textColor: v })} title="สีชื่อพื้นที่" />
      </div>
      <div className="flex items-center gap-2 pl-5">
        <input type="range" min={0} max={100} value={labelsConfig.opacity}
          onChange={e => updateLabelsConfig({ opacity: Number(e.target.value) })} className="flex-1 h-1 accent-violet-600" />
        <span className="text-[10px] text-slate-400 tabular-nums w-8 text-right">{labelsConfig.opacity}%</span>
      </div>
      <p className="text-[10px] text-slate-400 pl-5">เปิด/ปิดชื่อพื้นที่ทุกระดับพร้อมกันได้ที่ส่วน LABELS ด้านล่าง</p>
    </div>
  )
}

export default function LayerPanel({
  layers, updateLayer, toggleLayerVisible, addDataLayer, removeDataLayer, reorderDataLayers,
  labelsConfig, toggleLabelsLevel, updateLabelsConfig,
}) {
  const [dragOverId, setDragOverId] = useState(null)
  const fixedLayers = layers.slice(0, 2) // เขต, แขวง — ชุมชนแยกไปเป็น CommunityLabelsRow ข้างล่าง (ดู labelsConfig)
  const dataLayers = layers.slice(2)

  const handleDragStart = (e, id) => e.dataTransfer.setData('text/plain', id)
  const handleDragOver = (e, id) => { e.preventDefault(); setDragOverId(id) }
  const handleDrop = (e, id) => {
    e.preventDefault()
    reorderDataLayers(e.dataTransfer.getData('text/plain'), id)
    setDragOverId(null)
  }

  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5">
        {fixedLayers.map(layer => (
          <LayerRow key={layer.id} layer={layer} draggable={false}
            onToggleVisible={toggleLayerVisible} onUpdate={updateLayer} />
        ))}
        <CommunityLabelsRow labelsConfig={labelsConfig} toggleLabelsLevel={toggleLabelsLevel} updateLabelsConfig={updateLabelsConfig} />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">ข้อมูล</div>
        <button type="button" onClick={addDataLayer}
          className="h-7 px-2 rounded-md ring-1 ring-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-50">+ ข้อมูล</button>
      </div>

      <div className="space-y-1.5">
        {dataLayers.map(layer => (
          <LayerRow key={layer.id} layer={layer} draggable dragOver={dragOverId === layer.id}
            onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop} onDragEnd={() => setDragOverId(null)}
            onToggleVisible={toggleLayerVisible} onUpdate={updateLayer} onRemove={removeDataLayer} />
        ))}
        {dataLayers.length === 0 && <p className="text-[11px] text-slate-400">ว่าง — ยังไม่เพิ่ม data overlay</p>}
      </div>
    </div>
  )
}
