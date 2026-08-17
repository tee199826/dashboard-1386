// usePixelMapState.js — state ศูนย์กลางของ /pixel-map
// selection (multi mode) = tree เดียว (checkedDistricts/checkedSubdistricts/checkedCommunities)
// layers[] = [เขต, แขวง, ...dataLayers] — ชุมชนไม่มี "รูปทรง" ของตัวเอง (มีแต่ตัวเลข) จึงย้ายไปอยู่ใน labelsConfig แทน ไม่นับเป็น layer
// labelsConfig = จุดควบคุมตัวเลขเดียว (on/off + เลือกได้หลาย level) แยกจาก layers[] โดยตั้งใจ — ดู plan "decouple layer visibility from number labels"
// compare mode: หลายเขตต่อ panel ได้ (compareSlots[i].districts) — แขวง/ชุมชนใช้ชุดเดียวกับโหมด multi-select (checkedSubdistricts/checkedCommunities)
//   แล้วกรองเฉพาะที่อยู่ในเขตของ panel นั้นตอนวาด (ดู CompareGrid.jsx)
// key แขวง/ชุมชน composite เสมอ "district|subdistrict"(|community) กันชื่อซ้ำข้ามเขต (พบจริงในข้อมูล 59 กรณี)
import { useState, useCallback } from 'react'

export const subKey = (district, subdistrict) => `${district}|${subdistrict}`
export const communityKey = (district, subdistrict, community) => `${district}|${subdistrict}|${community}`

const makeId = () => `L-${Math.random().toString(36).slice(2, 9)}`
const DATA_PALETTE = ['#10b981', '#7c3aed', '#d97706', '#db2777'] // emerald ก่อนตาม spec Layer 4+ แล้วหมุนสีอื่นถ้าเพิ่มหลายตัว
const COMPARE_PALETTE = ['#8b5cf6', '#f59e0b', '#f43f5e', '#10b981'] // violet/amber/rose/emerald — พอดี panel สูงสุด 4

const ZOOM_IDENTITY = { x: 0, y: 0, k: 1 }
export const ROSE_DEFAULT = '#f43f5e' // สีเริ่มต้นของ "ชุมชน" (ทั้งพื้นที่ระบายและ swatch ในแผง LAYERS)

function makeFixedLayers() {
  return [
    { id: 'district', type: 'district', label: 'เขต', color: '#8b5cf6', opacity: 100, visible: true },
    { id: 'subdistrict', type: 'subdistrict', label: 'แขวง', color: '#f59e0b', opacity: 100, visible: true },
  ]
}
function makeDataLayer(label) {
  return {
    id: makeId(), type: 'data', label,
    source: 'drug_incidents', substance: null, behavior: null, fiscalYear: 'all', bkn: 'all',
    colorFrom: '#d1fae5', colorTo: '#10b981', opacity: 80, visible: true,
  }
}
function makeCompareSlots(n, startAt = 1) {
  return Array.from({ length: n }, (_, i) => ({
    id: `panel-${startAt + i}`, label: `Panel ${startAt + i}`,
    districts: [], color: COMPARE_PALETTE[(startAt - 1 + i) % COMPARE_PALETTE.length], zoom: ZOOM_IDENTITY,
  }))
}

const flip = (set, key) => {
  const next = new Set(set)
  next.has(key) ? next.delete(key) : next.add(key)
  return next
}

export function usePixelMapState() {
  const [mode, setMode] = useState('multi') // 'multi' | 'compare'

  const [checkedDistricts, setCheckedDistricts] = useState(() => new Set())
  const [checkedSubdistricts, setCheckedSubdistricts] = useState(() => new Set())
  const [checkedCommunities, setCheckedCommunities] = useState(() => new Set())
  const [expandedDistricts, setExpandedDistricts] = useState(() => new Set())
  const [expandedSubdistricts, setExpandedSubdistricts] = useState(() => new Set())

  const [layers, setLayers] = useState(() => makeFixedLayers())

  const [compareSlots, setCompareSlots] = useState(() => makeCompareSlots(2))

  const [style, setStyleState] = useState({
    showBorders: true,
    background: 'map',   // 'map' (ขาว/ขอบน้ำเงิน บนพื้นนอกเขตเทาเข้ม เหมือนหน้าแผนที่ยาเสพติด) | 'light' | 'dark'
    title: '',
    caption: '',
    displayMode: 'dot',  // ใช้กับ data overlay layer (2+) เท่านั้น — 'dot' | 'fill'
    dotSize: 8,
    spacing: 12,
    shape: 'circle',
    autoFitOnSelection: true,
    showZoomControls: true,
    tileSource: 'carto', // ภาพแผนที่พื้นหลัง — carto light_all = ชุดเดียวกับหน้าแผนที่ยาเสพติด (IncidentMap) | 'osm' | '' (ไม่ใช้)
    focusSelection: false,
  })
  const updateStyle = useCallback((patch) => setStyleState(s => ({ ...s, ...patch })), [])

  // ── ตัวเลข/ชื่อพื้นที่ — จุดควบคุมเดียว แยกจาก layers[] โดยตั้งใจ (default ปิด — Issue 2) ──
  // ชื่อเขต (districtNames) แยกออกจาก levels เพราะเขตมีตัวเลือก "ทุกเขต" ที่แขวง/ชุมชนไม่มี (ต้องติ๊กทีละอันเท่านั้น)
  const [labelsConfig, setLabelsConfig] = useState({
    visible: false,
    levels: new Set(),       // 'subdistrict' | 'community'
    districtNames: 'off',    // 'off' | 'selected' | 'all'
    districtNameSize: 'md',  // 'sm' | 'md' | 'lg'
    metric: 'count',
    showPill: false,
    textColor: 'auto',       // 'auto' | hex — สีตัวอักษรชื่อพื้นที่
    communityColor: ROSE_DEFAULT, // สีพื้นที่ระบายของ "ชุมชน" (แก้ที่ swatch แถวชุมชนในแผง LAYERS)
    counterScaleLabels: false,
    opacity: 100,
  })
  const updateLabelsConfig = useCallback((patch) => setLabelsConfig(c => ({ ...c, ...patch })), [])
  const toggleLabelsVisible = useCallback(() => setLabelsConfig(c => ({ ...c, visible: !c.visible })), [])
  const toggleLabelsLevel = useCallback((level) => setLabelsConfig(c => ({ ...c, levels: flip(c.levels, level) })), [])

  // ── zoom/pan: multi mode ใช้ zoomTransform เดียว, compare mode แต่ละ panel มี compareSlots[i].zoom ของตัวเอง
  // เว้นแต่ syncZoom เปิด — ตอนนั้นทุก panel ใช้ sharedCompareZoom ตัวเดียวกันแทน (ดู CompareGrid.jsx)
  const [zoomTransform, setZoomTransform] = useState(ZOOM_IDENTITY)
  const [syncZoom, setSyncZoom] = useState(false)
  const [sharedCompareZoom, setSharedCompareZoom] = useState(ZOOM_IDENTITY)
  const setCompareSlotZoom = useCallback((slotId, transform) => {
    setCompareSlots(slots => slots.map(s => (s.id === slotId ? { ...s, zoom: transform } : s)))
  }, [])

  // ติ๊กเขตออก → ล้างแขวง/ชุมชนในเขตนั้นตามไปด้วย (สอดคล้องกับกติกาที่ต้องติ๊กเขตก่อน)
  const toggleDistrict = useCallback((dname) => {
    setCheckedDistricts(s => {
      if (s.has(dname)) {
        setCheckedSubdistricts(subs => new Set([...subs].filter(k => k.split('|')[0] !== dname)))
        setCheckedCommunities(coms => new Set([...coms].filter(k => k.split('|')[0] !== dname)))
      }
      return flip(s, dname)
    })
  }, [])
  const toggleSubdistrict = useCallback((district, subdistrict) => setCheckedSubdistricts(s => flip(s, subKey(district, subdistrict))), [])
  const toggleCommunity = useCallback((district, subdistrict, community) => setCheckedCommunities(s => flip(s, communityKey(district, subdistrict, community))), [])
  const toggleExpanded = useCallback((dname) => setExpandedDistricts(s => flip(s, dname)), [])
  const toggleSubExpanded = useCallback((district, subdistrict) => setExpandedSubdistricts(s => flip(s, subKey(district, subdistrict))), [])
  const selectDistricts = useCallback((names) => setCheckedDistricts(new Set(names)), [])
  const clearSelection = useCallback(() => {
    setCheckedDistricts(new Set())
    setCheckedSubdistricts(new Set())
    setCheckedCommunities(new Set())
  }, [])

  // ── layers: 2 ตัวแรก fixed (เขต/แขวง — แก้ผ่าน updateLayer/toggleLayerVisible) data layer (index 2+) เพิ่ม/ลบ/ลากได้ ──
  const updateLayer = useCallback((id, patch) => {
    setLayers(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)))
  }, [])
  const toggleLayerVisible = useCallback((id) => {
    setLayers(ls => ls.map(l => (l.id === id ? { ...l, visible: !l.visible } : l)))
  }, [])

  const addDataLayer = useCallback(() => {
    setLayers(ls => {
      const dataCount = ls.filter(l => l.type === 'data').length
      const layer = makeDataLayer(`Data ${dataCount + 1}`)
      layer.colorTo = DATA_PALETTE[dataCount % DATA_PALETTE.length]
      return [...ls, layer]
    })
  }, [])
  const removeDataLayer = useCallback((id) => {
    setLayers(ls => ls.filter(l => l.id !== id))
  }, [])
  // ลาก reorder เฉพาะในกลุ่ม data layer (index 2+) — เขต/แขวงไม่ร่วมลำดับนี้
  const reorderDataLayers = useCallback((draggedId, targetId) => {
    if (draggedId === targetId) return
    setLayers(ls => {
      const fixed = ls.slice(0, 2)
      const data = ls.slice(2)
      const from = data.findIndex(l => l.id === draggedId)
      const to = data.findIndex(l => l.id === targetId)
      if (from === -1 || to === -1) return ls
      const arr = [...data]
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      return [...fixed, ...arr]
    })
  }, [])

  // ── compare panels: สูงสุด 4, หลายเขตต่อ panel ได้ ──
  const addComparePanel = useCallback(() => {
    setCompareSlots(slots => (slots.length >= 4 ? slots : [...slots, ...makeCompareSlots(1, slots.length + 1)]))
  }, [])
  const removeComparePanel = useCallback((id) => {
    setCompareSlots(slots => (slots.length <= 1 ? slots : slots.filter(s => s.id !== id)))
  }, [])
  const toggleCompareSlotDistrict = useCallback((id, dname) => {
    setCompareSlots(slots => slots.map(s => (s.id === id ? { ...s, districts: [...flip(new Set(s.districts), dname)] } : s)))
  }, [])
  const setCompareSlotDistricts = useCallback((id, names) => {
    setCompareSlots(slots => slots.map(s => (s.id === id ? { ...s, districts: names } : s)))
  }, [])
  const setCompareSlotColor = useCallback((id, color) => {
    setCompareSlots(slots => slots.map(s => (s.id === id ? { ...s, color } : s)))
  }, [])

  return {
    mode, setMode,
    checkedDistricts, checkedSubdistricts, checkedCommunities,
    toggleDistrict, toggleSubdistrict, toggleCommunity,
    selectDistricts, clearSelection,
    expandedDistricts, toggleExpanded, expandedSubdistricts, toggleSubExpanded,
    layers, updateLayer, toggleLayerVisible, addDataLayer, removeDataLayer, reorderDataLayers,
    compareSlots, addComparePanel, removeComparePanel, toggleCompareSlotDistrict, setCompareSlotDistricts, setCompareSlotColor,
    style, updateStyle,
    labelsConfig, updateLabelsConfig, toggleLabelsVisible, toggleLabelsLevel,
    zoomTransform, setZoomTransform, syncZoom, setSyncZoom, sharedCompareZoom, setSharedCompareZoom, setCompareSlotZoom,
  }
}
