import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Layers as LayersIcon, Users, Info, SlidersHorizontal, Download, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { loadDistrictGeoJSON, loadSubdistrictIndex, loadCommunityIndex } from './pixelMapGeometry.js'
import { getDistrictCounts, getCommunityHierarchy, getAvailableFiscalYears, getLevelMaxes, sameArea } from '../../shared/geo/pixelMapData.js'
import { exportSvg, exportPng, copyEmbedHtml } from './pixelMapExport.js'
import { exportPixelMapExcel } from './pixelMapExcel.js'
import { usePixelMapState } from './usePixelMapState.js'
import SelectionTree from './SelectionTree.jsx'
import LayerPanel from './LayerPanel.jsx'
import StylePanel from './StylePanel.jsx'
import MapCanvas from './MapCanvas.jsx'
import CompareGrid from './CompareGrid.jsx'
import ImportDataModal from './ImportDataModal.jsx'
import CommunityPanel from './CommunityPanel.jsx'
import AreaDetailPanel from './AreaDetailPanel.jsx'
import AccordionSection from './AccordionSection.jsx'
import DateFilter from '../../shared/filters/DateFilter.jsx'
import { useFilter } from '../../shared/state/contexts.js'
import { describeDateFilterLong } from '../../shared/filters/dateFilterLabel.js'

const CANVAS_W = 900
const CANVAS_H = 700
const CANVAS_RATIO = CANVAS_W / CANVAS_H
const CANVAS_MIN_W = 520   // แคบกว่านี้แผนที่เล็กจนอ่านชื่อพื้นที่ไม่ออก
const CANVAS_MAX_W = 1120
const IDENTITY = { x: 0, y: 0, k: 1 }

const PANEL_TABS = [
  ['detail', 'รายละเอียด', Info],
  ['design', 'ปรับแต่ง', SlidersHorizontal],
  ['export', 'ส่งออก', Download],
]

// ปุ่มสลับโหมดบนหัวเรื่อง (เลือกพื้นที่ / เทียบหลายแผนที่ — สูงสุด 4 แผนที่)
function Seg({ options, value, onChange }) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-slate-100 ring-1 ring-slate-200">
      {options.map(([val, label]) => (
        <button key={val} type="button" onClick={() => onChange(val)}
          className={`h-8 px-3.5 rounded-lg text-[13px] font-semibold transition ${
            value === val ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          {label}
        </button>
      ))}
    </div>
  )
}

export default function PixelMap() {
  const canvasAreaRef = useRef(null) // wrapper div — PNG export (html-to-image) จับทั้งก้อน (เดี่ยวหรือ compare grid)
  const svgRef = useRef(null)        // <svg> เดี่ยว หรือ panel แรกใน compare grid — export SVG/คัดลอก HTML

  const [geojson, setGeojson] = useState(null)
  useEffect(() => {
    loadDistrictGeoJSON().then(setGeojson).catch(err => console.error('[pixel-map] geojson load failed:', err))
  }, [])

  // ช่วงเวลา — ตัวกรองมาตรฐานเดียวกับหน้าอื่น (ปีงบ ติ๊กได้หลายปี / รายเดือน / ช่วงวันที่) กรอง hierarchy (นับเคสทุกระดับ) ทั้งหน้า
  // ปีงบใช้คอลัมน์ fiscal_year (ตัวเลขเท่าเดิม) ; รายเดือน/ช่วงวันที่ใช้ received_date
  const { state: filterState, getDateRange } = useFilter()
  const dateRange = getDateRange()
  const [yearOptions, setYearOptions] = useState([])
  useEffect(() => {
    getAvailableFiscalYears('drug_incidents').then(setYearOptions).catch(() => {})
  }, [])
  const hierarchyFilter = useMemo(() => (
    filterState.mode === 'fiscal'
      ? { fiscalYears: filterState.fiscalYears ?? [] }
      : { from: dateRange?.from ?? null, to: dateRange?.to ?? null }
  ), [filterState.mode, filterState.fiscalYears, dateRange])
  const hierarchyFilterKey = JSON.stringify(hierarchyFilter) // key คงที่สำหรับ effect (object ใหม่ทุกครั้งที่ memo คำนวณ)
  const periodLabel = describeDateFilterLong(filterState)

  // hierarchy เดียว: เขต→แขวง→ชุมชน (meta/centroid/count) — ฐานของ tree และตัวเลขทุกระดับ ; คำนวณใหม่เมื่อเปลี่ยนช่วงเวลา
  // (ข้อมูลดิบ cache ไว้แล้ว เปลี่ยนช่วงเวลาไม่ยิง Supabase ใหม่) ; cancelled กันผลรอบเก่ามาทับรอบใหม่ตอนสลับเร็ว ๆ
  const [hierarchy, setHierarchy] = useState({})
  useEffect(() => {
    let cancelled = false
    getCommunityHierarchy(hierarchyFilter)
      .then(tree => { if (!cancelled) setHierarchy(tree) })
      .catch(err => console.error('[pixel-map] hierarchy load failed:', err))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchyFilterKey])

  const {
    mode, setMode,
    checkedDistricts, checkedSubdistricts, checkedCommunities,
    toggleDistrict, toggleSubdistrict, toggleCommunity,
    selectDistricts, clearSelection,
    expandedDistricts, toggleExpanded, expandedSubdistricts, toggleSubExpanded,
    expandDistrict, expandSubdistrict, collapseDistrict, collapseSubdistrict, collapseAll,
    layers, updateLayer, toggleLayerVisible, addDataLayer, addImportedLayer, replaceLayerImport, removeDataLayer, reorderDataLayers,
    compareSlots, addComparePanel, removeComparePanel, toggleCompareSlotDistrict, setCompareSlotDistricts, setCompareSlotColor,
    style, updateStyle,
    labelsConfig, updateLabelsConfig, toggleLabelsVisible, toggleLabelsLevel,
    zoomTransform, setZoomTransform, syncZoom, setSyncZoom, sharedCompareZoom, setSharedCompareZoom, setCompareSlotZoom,
  } = usePixelMapState()

  // โหลด index ขอบเขตแขวง/ชุมชนจริง (BMA) — lookup จะได้ polygon จริง ไม่ตกไปใช้พื้นที่ประมาณ
  const [subdistrictIndex, setSubdistrictIndex] = useState(null)
  const [communityIndex, setCommunityIndex] = useState(null)
  useEffect(() => {
    loadSubdistrictIndex().then(setSubdistrictIndex).catch(err => console.warn('[pixel-map] subdistrict geojson unavailable:', err))
    loadCommunityIndex().then(setCommunityIndex).catch(err => console.warn('[pixel-map] community geojson unavailable:', err))
  }, [])

  // วัดความกว้างจริงของกล่องแผนที่ → ส่งให้ CompareGrid ปรับขนาด panel ให้พอดี ไม่ล้นจนต้องเลื่อนแนวนอน
  // วัด "เฉพาะตอน layout เปลี่ยน" (mount/resize/สลับโหมด/เพิ่ม-ลบ panel/ข้อมูลโหลด) — ไม่วัดทุก render
  // สำคัญ: วัดทุก render จะวนลูปไม่จบ (เลือกเขต → scrollbar แนวตั้งโผล่/หาย → clientWidth แกว่ง → areaWidth แกว่ง) จนแอปแครช
  // ใช้ offsetWidth (ไม่ขึ้นกับ scrollbar แนวตั้ง) + เผื่อ 18px กัน panel ล้นเวลามี scrollbar
  const [showTree, setShowTree] = useState(true) // ซ่อนรายการพื้นที่ด้านซ้ายเพื่อคืนความกว้างให้แผนที่
  const [areaWidth, setAreaWidth] = useState(CANVAS_W)
  const measureArea = useCallback(() => {
    const el = canvasAreaRef.current
    if (!el) return
    const cs = getComputedStyle(el)
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
    const w = Math.max(280, Math.round(el.offsetWidth - pad - 18))
    setAreaWidth(prev => (Math.abs(prev - w) > 3 ? w : prev))
  }, [])
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(measureArea))
    window.addEventListener('resize', measureArea)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measureArea) }
    // showTree: ซ่อน/แสดงรายการพื้นที่ทำให้กล่องแผนที่กว้างขึ้น/แคบลงทันที ต้องวัดใหม่ ไม่งั้นแผนที่ค้างขนาดเดิมจนกว่าจะย่อ-ขยายหน้าต่าง
  }, [measureArea, mode, compareSlots.length, geojson, hierarchy, showTree])

  const dataLayers = useMemo(() => layers.filter(l => l.type === 'data'), [layers])

  // ── data overlay fetch — key เฉพาะ field ที่กระทบ query จริง กัน refetch ตอนแก้แค่สี/opacity ──
  // layer ที่นำเข้าจากไฟล์ (source 'import') ไม่ query Supabase — ใช้ importData ที่อยู่ใน layer เลย (importStamp = ตัวบอกว่าไฟล์เปลี่ยน)
  const dataFetchKey = useMemo(
    () => dataLayers.map(l => `${l.id}:${l.source}:${l.substance}:${l.behavior}:${l.fiscalYear}:${l.bkn}:${l.importStamp ?? ''}`).join('|'),
    [dataLayers]
  )
  const [layerCounts, setLayerCounts] = useState({})
  useEffect(() => {
    let cancelled = false
    Promise.all(dataLayers.map(async (l) => [
      l.id,
      l.source === 'import'
        ? (l.importData ?? { counts: {}, max: 0 })
        : await getDistrictCounts({ source: l.source, substance: l.substance, behavior: l.behavior, fiscalYear: l.fiscalYear, bkn: l.bkn }),
    ]))
      .then(entries => { if (!cancelled) setLayerCounts(Object.fromEntries(entries)) })
      .catch(err => console.error('[pixel-map] data layer fetch failed:', err))
    return () => { cancelled = true }
  }, [dataFetchKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── นำเข้าไฟล์เป็น data overlay — 'new' = สร้าง layer ใหม่, layer id = เปลี่ยนไฟล์ของ layer นั้น ──
  const [importTarget, setImportTarget] = useState(null)
  const handleImportConfirm = useCallback((payload) => {
    if (importTarget && importTarget !== 'new') replaceLayerImport(importTarget, payload)
    else addImportedLayer(payload)
    setImportTarget(null)
  }, [importTarget, addImportedLayer, replaceLayerImport])

  const [fiscalYearsBySource, setFiscalYearsBySource] = useState({})
  useEffect(() => {
    Promise.all(['drug_incidents', 'complaints'].map(async s => [s, await getAvailableFiscalYears(s)]))
      .then(entries => setFiscalYearsBySource(Object.fromEntries(entries)))
      .catch(() => {})
  }, [])

  const districtOptions = useMemo(() => (geojson ? geojson.features.map(f => f.properties.dname).sort() : []), [geojson])

  // max ต่อระดับ (เขต/แขวง/ชุมชน) ของ metric ที่เลือก — คำนวณจาก hierarchy ทั้งหมด ให้ font-size คงที่/แฟร์ทุก panel
  const levelMaxes = useMemo(() => getLevelMaxes(hierarchy, labelsConfig.metric), [hierarchy, labelsConfig.metric])

  // แผง "รายละเอียดพื้นที่": เมาส์ชี้อยู่ → พื้นที่ที่ชี้ ; ไม่ได้ชี้ → พื้นที่ที่คลิกเลือกไว้ ; ไม่ได้เลือก → เขตกลางแผนที่
  // การ์ดในรูป export: ที่คลิกเลือกไว้ ไม่งั้นเขตกลางแผนที่ (ไม่สนเมาส์ชี้ — ทางที่เมาส์ผ่านไปหาปุ่ม export ต้องไม่มีผล)
  // โหมด compare มีหลาย panel หลายจุดกึ่งกลาง จึงไม่มีเขตกลางแผนที่ ใช้เฉพาะชี้/คลิก
  const [hoverArea, setHoverArea] = useState(null)
  const [centerArea, setCenterArea] = useState(null)
  // คลิกเลือกพื้นที่ — แยกช่องของใครของมัน: แผนที่แต่ละ panel มีพื้นที่ที่เลือกไว้เป็นของตัวเอง (key = panel id)
  // คลิกในแผนที่ซ้าย = เปลี่ยนของซ้ายอย่างเดียว ไม่ไปแตะของขวา ; คลิกซ้ำที่เดิม = เอาออก ; โหมดปกติใช้ช่อง 'multi'
  const [pinnedByMap, setPinnedByMap] = useState({})
  const comparing = mode === 'compare'
  const togglePinnedArea = useCallback((area, mapId = 'multi') => setPinnedByMap(prev => (
    { ...prev, [mapId]: sameArea(prev[mapId], area) ? null : area }
  )), [])
  const removePinnedArea = useCallback((mapId) => setPinnedByMap(prev => ({ ...prev, [mapId]: null })), [])
  const clearPinnedArea = useCallback(() => setPinnedByMap(prev => (comparing ? { multi: prev.multi } : { ...prev, multi: null })), [comparing])

  // โหมด compare: พื้นที่ที่คลิกเลือกไว้ของแผนที่แรกที่มี (ซ้าย→ขวา) — แผงรายละเอียดด้านขวา/การ์ด export/Excel ใช้ตัวนี้
  // การเทียบตัวเลขข้ามแผนที่อยู่ในตารางใต้แผนที่ (CompareSummary) ที่เดียว
  const firstComparePin = useMemo(() => {
    const slot = compareSlots.find(s => pinnedByMap[s.id])
    return slot ? { mapId: slot.id, area: pinnedByMap[slot.id] } : null
  }, [compareSlots, pinnedByMap])
  const fallbackArea = comparing ? (firstComparePin?.area ?? null) : (pinnedByMap.multi ?? centerArea)
  const detailArea = hoverArea ?? fallbackArea

  // แผนที่ยืดตามพื้นที่ที่เหลือจริง (คงสัดส่วน 900:700) — เดิมล็อก 900px ตายตัว พอจอไม่กว้างพอกล่องจะถูกบีบจนต้องเลื่อนดู
  const canvasSize = useMemo(() => {
    const w = Math.round(Math.min(CANVAS_MAX_W, Math.max(CANVAS_MIN_W, areaWidth)))
    return { w, h: Math.round(w / CANVAS_RATIO) }
  }, [areaWidth])

  const [panelTab, setPanelTab] = useState('detail')
  const selectionSummary = useMemo(() => [
    checkedDistricts.size && `${checkedDistricts.size} เขต`,
    checkedSubdistricts.size && `${checkedSubdistricts.size} แขวง`,
    checkedCommunities.size && `${checkedCommunities.size} ชุมชน`,
  ].filter(Boolean).join(' · '), [checkedDistricts, checkedSubdistricts, checkedCommunities])

  const [exportFullMap, setExportFullMap] = useState(false)
  const [showExportNumbers, setShowExportNumbers] = useState(true) // โชว์ตัวเลขจำนวนเรื่องของพื้นที่ที่เลือกในภาพ export
  const [showExportDetail, setShowExportDetail] = useState(true)   // แนบการ์ด "รายละเอียดพื้นที่" (พื้นที่ล่าสุดที่ชี้) ลงในภาพ export

  // โหมด export — ใช้ทั้ง multi และ compare: compare ซ่อนแถบเครื่องมือ, ทุกโหมดโชว์ตัวเลขจำนวนเคสของพื้นที่ที่เลือกในรูป
  const [exporting, setExporting] = useState(false)
  const withExportMode = useCallback(async (fn) => {
    setExporting(true)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    try { await fn() } finally { setExporting(false) }
  }, [])

  // ถ้า export "เต็มแผนที่" — reset zoom ทุกจุดเป็น identity ชั่วคราว รอ 2 เฟรมให้ d3-zoom sync กลับเข้า DOM จริง แล้วค่อย capture, restore ทีหลัง
  const withFullMapIfNeeded = useCallback(async (fn) => {
    if (!exportFullMap) return fn()
    const prevMulti = zoomTransform
    const prevShared = sharedCompareZoom
    const prevSlots = compareSlots.map(s => [s.id, s.zoom])
    setZoomTransform(IDENTITY)
    setSharedCompareZoom(IDENTITY)
    prevSlots.forEach(([id]) => setCompareSlotZoom(id, IDENTITY))
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    try {
      await fn()
    } finally {
      setZoomTransform(prevMulti)
      setSharedCompareZoom(prevShared)
      prevSlots.forEach(([id, z]) => setCompareSlotZoom(id, z))
    }
  }, [exportFullMap, zoomTransform, sharedCompareZoom, compareSlots, setZoomTransform, setSharedCompareZoom, setCompareSlotZoom])

  const handleExportPng = useCallback((scale) => {
    if (!canvasAreaRef.current) return
    withExportMode(() => withFullMapIfNeeded(() => exportPng(canvasAreaRef.current, scale, `pixel-map-${scale}x.png`)))
      .catch(err => console.error('[pixel-map] PNG export failed:', err))
  }, [withExportMode, withFullMapIfNeeded])
  const handleExportSvg = useCallback(() => {
    if (!svgRef.current) return
    withExportMode(() => withFullMapIfNeeded(() => { exportSvg(svgRef.current, 'pixel-map.svg') }))
      .catch(err => console.error('[pixel-map] SVG export failed:', err))
  }, [withExportMode, withFullMapIfNeeded])
  // Excel: ข้อมูลรายเขต/แขวง/ชุมชน ตามปีงบที่ติ๊ก + ชีทรายละเอียดของพื้นที่ในแผง (ที่คลิกเลือกไว้ / เขตกลางแผนที่ — ชุดเดียวกับการ์ดในรูป)
  const [excelState, setExcelState] = useState({ busy: false, error: '' })
  const handleExportExcel = useCallback(async () => {
    setExcelState({ busy: true, error: '' })
    try {
      await exportPixelMapExcel({ hierarchy, periodLabel, detailArea: fallbackArea, checkedDistricts, checkedSubdistricts, checkedCommunities })
      setExcelState({ busy: false, error: '' })
    } catch (err) {
      console.error('[pixel-map] Excel export failed:', err)
      setExcelState({ busy: false, error: 'ส่งออก Excel ไม่สำเร็จ ลองใหม่อีกครั้ง' })
    }
  }, [hierarchy, periodLabel, fallbackArea, checkedDistricts, checkedSubdistricts, checkedCommunities])

  const handleCopyEmbed = useCallback(() => {
    if (!svgRef.current) return
    copyEmbedHtml(svgRef.current).catch(err => console.error('[pixel-map] copy embed failed:', err))
  }, [])

  // props ชุดเดียวกันของ StylePanel — ใช้ทั้งแท็บ "ปรับแต่ง" และ "ส่งออก" ต่างกันแค่ prop sections
  const stylePanelProps = {
    style, updateStyle, labelsConfig, updateLabelsConfig, toggleLabelsVisible, toggleLabelsLevel,
    dataLayers, updateLayer, fiscalYearsBySource, onImport: setImportTarget,
    onExportSvg: handleExportSvg, onExportPng: handleExportPng, onCopyEmbed: handleCopyEmbed,
    compareActive: comparing, zoomTransform, onZoomChange: setZoomTransform,
    exportFullMap, setExportFullMap, showExportNumbers, setShowExportNumbers,
    showExportDetail, setShowExportDetail,
    onExportExcel: handleExportExcel, excelBusy: excelState.busy, excelError: excelState.error,
  }

  return (
    // @container — วัดจาก "พื้นที่จริงที่หน้านี้ได้" ไม่ใช่ความกว้างจอ (มี sidebar ของแอปกินไปอีกราว 250px)
    <div className="@container min-h-full bg-slate-100/70 p-4 lg:p-6">
      {/* หัวเรื่อง + สลับโหมด + ช่วงเวลา — รวมของระดับ "ทั้งหน้า" ไว้แถวเดียว ไม่ปนกับเครื่องมือย่อยในแผงข้าง */}
      <header className="mb-4 bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm px-4 lg:px-5 py-3.5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-[19px] font-bold text-slate-900 leading-tight">แผนที่อินโฟกราฟิก · กทม.</h1>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              เลือกพื้นที่ → ปรับรูปแบบ → ส่งออกเป็นภาพหรือ Excel
              {selectionSummary && <span className="text-slate-400"> · {selectionSummary}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* ซ่อนรายการพื้นที่เพื่อคืนความกว้างให้แผนที่ — จอ 14-15" พื้นที่เหลือไม่พอสำหรับ 3 คอลัมน์เต็ม ๆ */}
            {!comparing && <button type="button" onClick={() => setShowTree(v => !v)} title={showTree ? 'ซ่อนรายการพื้นที่' : 'แสดงรายการพื้นที่'}
              className="h-10 px-3 rounded-xl bg-white ring-1 ring-slate-200 text-[13px] font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5">
              {showTree ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
              <span className="hidden sm:inline">{showTree ? 'ซ่อนรายการพื้นที่' : 'รายการพื้นที่'}</span>
            </button>}
            <Seg options={[['multi', 'เลือกพื้นที่'], ['compare', 'เทียบหลายแผนที่']]} value={mode} onChange={setMode} />
            {/* ช่วงเวลา: ปีงบ / รายเดือน / ช่วงวันที่ — กรองจำนวนเคสทุกระดับ (tree/label/hover/แผงรายละเอียด/export) */}
            <DateFilter availableYears={yearOptions} defaultAllYears />
          </div>
        </div>
      </header>

      {/* พื้นที่แคบกว่า 1240px → วางแผงไว้ใต้แผนที่แทนการยัด 3 คอลัมน์ ไม่งั้นแผนที่โดนบีบจนต้องเลื่อนดู */}
      <div className="flex flex-col @[1240px]:flex-row gap-4 items-start relative">
        {/* โหมดเทียบหลายแผนที่เลือกเขตที่หัวแผนที่แต่ละอันอยู่แล้ว ไม่ต้องมีรายการพื้นที่ด้านซ้าย — แผนที่ได้พื้นที่เพิ่มด้วย */}
        {showTree && !comparing && <SelectionTree
          districtOptions={districtOptions} hierarchy={hierarchy}
          checkedDistricts={checkedDistricts} checkedSubdistricts={checkedSubdistricts} checkedCommunities={checkedCommunities}
          toggleDistrict={toggleDistrict} toggleSubdistrict={toggleSubdistrict} toggleCommunity={toggleCommunity}
          expandedDistricts={expandedDistricts} toggleExpanded={toggleExpanded}
          expandedSubdistricts={expandedSubdistricts} toggleSubExpanded={toggleSubExpanded}
          expandDistrict={expandDistrict} expandSubdistrict={expandSubdistrict}
          collapseDistrict={collapseDistrict} collapseSubdistrict={collapseSubdistrict} collapseAll={collapseAll}
          selectDistricts={selectDistricts} clearSelection={clearSelection}
        />}

        <div ref={canvasAreaRef} className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-3 overflow-auto">
          {mode === 'compare' ? (
            <CompareGrid
              compareSlots={compareSlots} layers={layers} layerCounts={layerCounts}
              geojson={geojson} hierarchy={hierarchy} subdistrictIndex={subdistrictIndex} communityIndex={communityIndex}
              levelMaxes={levelMaxes} labelsConfig={labelsConfig}
              style={style} svgRef={svgRef} districtOptions={districtOptions} availableWidth={areaWidth}
              checkedSubdistricts={checkedSubdistricts} checkedCommunities={checkedCommunities}
              toggleSubdistrict={toggleSubdistrict} toggleCommunity={toggleCommunity}
              syncZoom={syncZoom} setSyncZoom={setSyncZoom} sharedCompareZoom={sharedCompareZoom}
              setSharedCompareZoom={setSharedCompareZoom} setCompareSlotZoom={setCompareSlotZoom}
              toggleCompareSlotDistrict={toggleCompareSlotDistrict} setCompareSlotDistricts={setCompareSlotDistricts}
              setCompareSlotColor={setCompareSlotColor}
              addComparePanel={addComparePanel} removeComparePanel={removeComparePanel}
              exporting={exporting} showExportNumbers={showExportNumbers} onAreaHover={setHoverArea}
              onAreaClick={togglePinnedArea} pinnedByMap={pinnedByMap} periodLabel={periodLabel}
              onRemovePin={removePinnedArea} onClearPins={clearPinnedArea}
            />
          ) : (
            <MapCanvas
              ref={svgRef}
              width={canvasSize.w} height={canvasSize.h}
              geojson={geojson} hierarchy={hierarchy} subdistrictIndex={subdistrictIndex} communityIndex={communityIndex}
              checkedDistricts={checkedDistricts} checkedSubdistricts={checkedSubdistricts} checkedCommunities={checkedCommunities}
              layers={layers} layerCounts={layerCounts} levelMaxes={levelMaxes} labelsConfig={labelsConfig}
              style={style} exporting={exporting} showExportNumbers={showExportNumbers}
              zoomTransform={zoomTransform} onZoomChange={setZoomTransform}
              onAreaHover={setHoverArea} onCenterArea={setCenterArea}
              onAreaClick={togglePinnedArea} pinnedArea={pinnedByMap.multi ?? null}
              exportDetailArea={showExportDetail ? fallbackArea : null} periodLabel={periodLabel}
            />
          )}
        </div>

        {/* แผงเครื่องมือขวา — แบ่ง 3 แท็บแทนการวางกอง 7 กล่องซ้อนกัน หาของเจอเร็วกว่าและไม่ต้องเลื่อนยาว */}
        <aside className="w-full @[1240px]:w-[285px] shrink-0 @[1240px]:sticky @[1240px]:top-4 space-y-3">
          <div className="grid grid-cols-3 gap-1 p-1 bg-white rounded-xl ring-1 ring-slate-200 shadow-sm">
            {PANEL_TABS.map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setPanelTab(id)}
                className={`h-9 rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition ${
                  panelTab === id ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                }`}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>

          <div className="space-y-3 @[1240px]:max-h-[calc(100vh-9rem)] @[1240px]:overflow-y-auto @[1240px]:pr-0.5">
            {panelTab === 'detail' && (
              <>
                <AccordionSection title="รายละเอียดพื้นที่" icon={<Info size={14} className="text-slate-400" />} defaultOpen>
                  {/* รายละเอียดพื้นที่เดียวเสมอ — การเทียบข้ามแผนที่ย้ายไปอยู่ตารางใต้แผนที่ (กว้างพอให้อ่านสบาย) */}
                  {/* โหมด compare: "ยกเลิก" เอาออกเฉพาะพื้นที่ที่โชว์อยู่ ไม่ล้างของแผนที่อื่นไปด้วย */}
                  <AreaDetailPanel area={detailArea} pinnedArea={comparing ? firstComparePin?.area : pinnedByMap.multi}
                    onClearPin={comparing ? () => firstComparePin && removePinnedArea(firstComparePin.mapId) : clearPinnedArea}
                    hierarchy={hierarchy} periodLabel={periodLabel} comparing={comparing} />
                </AccordionSection>
                <AccordionSection title="ชุมชนในพื้นที่ที่เลือก" icon={<Users size={14} className="text-slate-400" />} defaultOpen>
                  <CommunityPanel
                    hierarchy={hierarchy} checkedDistricts={checkedDistricts} checkedSubdistricts={checkedSubdistricts}
                    checkedCommunities={checkedCommunities} toggleCommunity={toggleCommunity}
                  />
                </AccordionSection>
              </>
            )}

            {panelTab === 'design' && (
              <>
                <AccordionSection title="เลเยอร์" icon={<LayersIcon size={14} className="text-slate-400" />} defaultOpen>
                  <LayerPanel
                    layers={layers} updateLayer={updateLayer} toggleLayerVisible={toggleLayerVisible}
                    addDataLayer={addDataLayer} onImport={setImportTarget} removeDataLayer={removeDataLayer} reorderDataLayers={reorderDataLayers}
                    labelsConfig={labelsConfig} toggleLabelsLevel={toggleLabelsLevel} updateLabelsConfig={updateLabelsConfig}
                  />
                </AccordionSection>
                <StylePanel sections="design" {...stylePanelProps} />
              </>
            )}

            {panelTab === 'export' && <StylePanel sections="export" {...stylePanelProps} />}
          </div>
        </aside>
      </div>

      <ImportDataModal
        open={importTarget !== null} onClose={() => setImportTarget(null)} onConfirm={handleImportConfirm}
        replacingLabel={importTarget && importTarget !== 'new' ? layers.find(l => l.id === importTarget)?.label : null}
      />
    </div>
  )
}
