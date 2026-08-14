import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import { Layers as LayersIcon } from 'lucide-react'
import { loadDistrictGeoJSON, loadSubdistrictIndex, loadCommunityIndex } from '../utils/pixelMapGeometry'
import { getDistrictCounts, getCommunityHierarchy, getAvailableFiscalYears, getLevelMaxes } from '../utils/pixelMapData'
import { exportSvg, exportPng, copyEmbedHtml } from '../utils/pixelMapExport'
import { usePixelMapState } from '../hooks/usePixelMapState'
import SelectionTree from '../components/pixel-map/SelectionTree'
import LayerPanel from '../components/pixel-map/LayerPanel'
import StylePanel from '../components/pixel-map/StylePanel'
import MapCanvas from '../components/pixel-map/MapCanvas'
import CompareGrid from '../components/pixel-map/CompareGrid'
import AccordionSection from '../components/pixel-map/AccordionSection'

const CANVAS_W = 900
const CANVAS_H = 700
const IDENTITY = { x: 0, y: 0, k: 1 }

export default function PixelMap() {
  const canvasAreaRef = useRef(null) // wrapper div — PNG export (html-to-image) จับทั้งก้อน (เดี่ยวหรือ compare grid)
  const svgRef = useRef(null)        // <svg> เดี่ยว หรือ panel แรกใน compare grid — export SVG/คัดลอก HTML

  // วัดความกว้างจริงของกล่องแผนที่ → ส่งให้ CompareGrid ปรับขนาด panel ให้พอดี ไม่ล้นจนต้องเลื่อนแนวนอน
  // วัดทุก render (useLayoutEffect ไม่มี deps) + ตอน resize — จับได้ทั้งตอนแผงข้างโหลดเสร็จ/สลับโหมด โดยไม่พึ่ง ResizeObserver
  // guard >2px กันวนลูป (panel พอดีกล่องเสมอจึงไม่มี scrollbar มาป้อนกลับ)
  const [areaWidth, setAreaWidth] = useState(CANVAS_W)
  const measureArea = useCallback(() => {
    const el = canvasAreaRef.current
    if (!el) return
    const cs = getComputedStyle(el)
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
    const w = Math.max(280, Math.round(el.clientWidth - pad - 2))
    setAreaWidth(prev => (Math.abs(prev - w) > 2 ? w : prev))
  }, [])
  useLayoutEffect(measureArea) // ทุก render
  useEffect(() => {
    const raf = requestAnimationFrame(measureArea)
    window.addEventListener('resize', measureArea)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measureArea) }
  }, [measureArea])

  const [geojson, setGeojson] = useState(null)
  useEffect(() => {
    loadDistrictGeoJSON().then(setGeojson).catch(err => console.error('[pixel-map] geojson load failed:', err))
  }, [])

  // hierarchy เดียว: เขต→แขวง→ชุมชน (meta/centroid/count) — ฐานของ tree และตัวเลขทุกระดับ
  const [hierarchy, setHierarchy] = useState({})
  useEffect(() => {
    getCommunityHierarchy().then(setHierarchy).catch(err => console.error('[pixel-map] hierarchy load failed:', err))
  }, [])

  const {
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
  } = usePixelMapState()

  // โหลด index ขอบเขตแขวง/ชุมชนจริง (BMA) — lookup จะได้ polygon จริง ไม่ตกไปใช้พื้นที่ประมาณ
  const [subdistrictIndex, setSubdistrictIndex] = useState(null)
  const [communityIndex, setCommunityIndex] = useState(null)
  useEffect(() => {
    loadSubdistrictIndex().then(setSubdistrictIndex).catch(err => console.warn('[pixel-map] subdistrict geojson unavailable:', err))
    loadCommunityIndex().then(setCommunityIndex).catch(err => console.warn('[pixel-map] community geojson unavailable:', err))
  }, [])

  const dataLayers = useMemo(() => layers.filter(l => l.type === 'data'), [layers])

  // ── data overlay fetch — key เฉพาะ field ที่กระทบ query จริง กัน refetch ตอนแก้แค่สี/opacity ──
  const dataFetchKey = useMemo(
    () => dataLayers.map(l => `${l.id}:${l.source}:${l.substance}:${l.behavior}:${l.fiscalYear}:${l.bkn}`).join('|'),
    [dataLayers]
  )
  const [layerCounts, setLayerCounts] = useState({})
  useEffect(() => {
    let cancelled = false
    Promise.all(dataLayers.map(async (l) => [l.id, await getDistrictCounts({ source: l.source, substance: l.substance, behavior: l.behavior, fiscalYear: l.fiscalYear, bkn: l.bkn })]))
      .then(entries => { if (!cancelled) setLayerCounts(Object.fromEntries(entries)) })
      .catch(err => console.error('[pixel-map] data layer fetch failed:', err))
    return () => { cancelled = true }
  }, [dataFetchKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const [fiscalYearsBySource, setFiscalYearsBySource] = useState({})
  useEffect(() => {
    Promise.all(['drug_incidents', 'complaints'].map(async s => [s, await getAvailableFiscalYears(s)]))
      .then(entries => setFiscalYearsBySource(Object.fromEntries(entries)))
      .catch(() => {})
  }, [])

  const districtOptions = useMemo(() => (geojson ? geojson.features.map(f => f.properties.dname).sort() : []), [geojson])

  // max ต่อระดับ (เขต/แขวง/ชุมชน) ของ metric ที่เลือก — คำนวณจาก hierarchy ทั้งหมด ให้ font-size คงที่/แฟร์ทุก panel
  const levelMaxes = useMemo(() => getLevelMaxes(hierarchy, labelsConfig.metric), [hierarchy, labelsConfig.metric])

  const [exportFullMap, setExportFullMap] = useState(false)

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
    withFullMapIfNeeded(() => exportPng(canvasAreaRef.current, scale, `pixel-map-${scale}x.png`))
      .catch(err => console.error('[pixel-map] PNG export failed:', err))
  }, [withFullMapIfNeeded])
  const handleExportSvg = useCallback(() => {
    if (!svgRef.current) return
    withFullMapIfNeeded(() => { exportSvg(svgRef.current, 'pixel-map.svg') })
      .catch(err => console.error('[pixel-map] SVG export failed:', err))
  }, [withFullMapIfNeeded])
  const handleCopyEmbed = useCallback(() => {
    if (!svgRef.current) return
    copyEmbedHtml(svgRef.current).catch(err => console.error('[pixel-map] copy embed failed:', err))
  }, [])

  return (
    <div className="min-h-full bg-slate-50 p-4 lg:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Pixel Map Generator · กทม.</h1>
        <p className="text-sm text-slate-500">
          เลือกเขต → แขวง → เปิดตัวเลขที่ต้องการ ซูม/แพนสำรวจ ซ้อน data overlay เปรียบเทียบแบบ compare — export PNG/SVG ใช้ในงานนำเสนอ
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start relative">
        <SelectionTree
          districtOptions={districtOptions} hierarchy={hierarchy}
          mode={mode} setMode={setMode}
          checkedDistricts={checkedDistricts} checkedSubdistricts={checkedSubdistricts} checkedCommunities={checkedCommunities}
          toggleDistrict={toggleDistrict} toggleSubdistrict={toggleSubdistrict} toggleCommunity={toggleCommunity}
          expandedDistricts={expandedDistricts} toggleExpanded={toggleExpanded}
          expandedSubdistricts={expandedSubdistricts} toggleSubExpanded={toggleSubExpanded}
          selectDistricts={selectDistricts} clearSelection={clearSelection}
        />

        <div ref={canvasAreaRef} className="flex-1 min-w-0 bg-white rounded-xl shadow-lg ring-1 ring-slate-200 p-3 overflow-auto">
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
            />
          ) : (
            <MapCanvas
              ref={svgRef}
              width={CANVAS_W} height={CANVAS_H}
              geojson={geojson} hierarchy={hierarchy} subdistrictIndex={subdistrictIndex} communityIndex={communityIndex}
              checkedDistricts={checkedDistricts} checkedSubdistricts={checkedSubdistricts} checkedCommunities={checkedCommunities}
              layers={layers} layerCounts={layerCounts} levelMaxes={levelMaxes} labelsConfig={labelsConfig}
              style={style}
              zoomTransform={zoomTransform} onZoomChange={setZoomTransform}
            />
          )}
        </div>

        <div className="w-full lg:w-[260px] shrink-0 space-y-4">
          <AccordionSection title="Layers" icon={<LayersIcon size={14} className="text-slate-400" />} defaultOpen>
            <LayerPanel
              layers={layers} updateLayer={updateLayer} toggleLayerVisible={toggleLayerVisible}
              addDataLayer={addDataLayer} removeDataLayer={removeDataLayer} reorderDataLayers={reorderDataLayers}
              labelsConfig={labelsConfig} toggleLabelsLevel={toggleLabelsLevel} updateLabelsConfig={updateLabelsConfig}
            />
          </AccordionSection>
          <StylePanel
            style={style} updateStyle={updateStyle}
            labelsConfig={labelsConfig} updateLabelsConfig={updateLabelsConfig}
            toggleLabelsVisible={toggleLabelsVisible} toggleLabelsLevel={toggleLabelsLevel}
            dataLayers={dataLayers} updateLayer={updateLayer} fiscalYearsBySource={fiscalYearsBySource}
            onExportSvg={handleExportSvg} onExportPng={handleExportPng} onCopyEmbed={handleCopyEmbed}
            compareActive={mode === 'compare'}
            zoomTransform={zoomTransform} onZoomChange={setZoomTransform}
            exportFullMap={exportFullMap} setExportFullMap={setExportFullMap}
          />
        </div>
      </div>
    </div>
  )
}
