import { forwardRef, useMemo, useRef, useEffect, useImperativeHandle, useCallback, useState, useId, memo } from 'react'
import { select } from 'd3-selection'
import { zoom as d3zoom, zoomIdentity } from 'd3-zoom'
import {
  districtPathD, buildDotGrid, BKK_BBOX, makeProjection,
  ringPathD, featurePathD, lookupSubdistrict, lookupCommunity, communityCellRing,
} from '../../utils/pixelMapGeometry'
import { interpolateHex, getContrastText } from '../../utils/pixelMapStyle'
import { nodeMetricValue } from '../../utils/pixelMapData'
import { subKey, ROSE_DEFAULT } from '../../hooks/usePixelMapState'
import { fitToBoundsTransform, estimateLabelBox, layoutLabels, boxOf } from '../../utils/pixelMapZoom'
import { TILE_SOURCES, visibleTiles } from '../../utils/pixelMapTiles'
import ZoomControls from './ZoomControls'

const FONT = "Inter, 'Noto Sans Thai', sans-serif"
const SCALE_EXTENT = [1, 24] // ซูมเข้าได้ลึกถึงระดับถนน (tile รองรับถึง z18)
const IDENTITY = { x: 0, y: 0, k: 1 }
const EMPTY_SET = new Set()

// ธีมพื้นแผนที่ — 'map' เลียนแบบหน้าแผนที่จริง (IncidentMap): นอกเขตเทาเข้มแบบ outer mask, ตัวเขตขาว, เส้นขอบน้ำเงินกรม
const THEMES = {
  map: { bg: '#4b5563', land: '#ffffff', border: '#1e3a8a', borderWidth: 2.4, title: '#f8fafc', caption: '#e2e8f0' },
  light: { bg: '#ffffff', land: null, border: '#94a3b8', borderWidth: 1.4, title: '#0f172a', caption: '#64748b' },
  dark: { bg: '#0f172a', land: null, border: '#475569', borderWidth: 1.4, title: '#f8fafc', caption: '#94a3b8' },
  clear: { bg: 'transparent', land: null, border: '#1e3a8a', borderWidth: 2.4, title: '#0f172a', caption: '#64748b' }, // พื้นหลังใส เหลือแต่เส้นขอบทึบ
}
// hover: ฟ้าอ่อน + ขอบน้ำเงินสด ตามพฤติกรรม mouseover ของ IncidentMap
const HOVER_FILL = '#3b82f6'
const HOVER_STROKE = '#1d4ed8'
const FOCUS_LAND = '#e2e8f0' // สีพื้นของเขตในโหมดโฟกัสเมื่อไม่ได้เปิดภาพแผนที่
const FOCUS_DISTRICT_FILL_OPACITY = 0.22 // ระบายเขตที่เลือกแบบจางๆ ให้ยังเห็นภาพแผนที่/แขวงที่ทับอยู่ข้างบน
const AREA_FILL_OPACITY = 0.28 // แขวง/ชุมชน — ข้างในใสจางๆ (เห็นแผนที่ทะลุ) ขอบทึบสีเข้ม
const DISTRICT_NAME_SIZE = { sm: 10, md: 13, lg: 16 }
const SUBDISTRICT_NAME_SIZE = { sm: 9.5, md: 12, lg: 14.5 }
const COMMUNITY_NAME_SIZE = { sm: 9, md: 11, lg: 13 }

function Dot({ shape, x, y, size, fill, opacity }) {
  const r = size / 2
  const common = { fill, opacity }
  if (shape === 'square') return <rect x={x - r} y={y - r} width={size} height={size} {...common} />
  if (shape === 'diamond') return <rect x={x - r} y={y - r} width={size} height={size} transform={`rotate(45 ${x} ${y})`} {...common} />
  if (shape === 'triangle') {
    const pts = [[x, y - r], [x + r, y + r], [x - r, y + r]].map(p => p.join(',')).join(' ')
    return <polygon points={pts} {...common} />
  }
  return <circle cx={x} cy={y} r={r} {...common} />
}

function DistrictDotLayer({ dots, shape, dotSize, opacity, colorOf }) {
  return (
    <g>
      {dots.map((d, i) => {
        const fill = colorOf(d.district)
        if (!fill) return null
        return <Dot key={i} shape={shape} x={d.x} y={d.y} size={dotSize} fill={fill} opacity={opacity} />
      })}
    </g>
  )
}
function DistrictFillLayer({ districtPaths, opacity, colorOf }) {
  return (
    <g opacity={opacity}>
      {districtPaths.map(f => {
        const fill = colorOf(f.dname)
        if (!fill) return null
        return <path key={f.dcode} d={f.d} fill={fill} />
      })}
    </g>
  )
}

// centroid โดยประมาณ (ค่าเฉลี่ยจุดของ ring นอก) — พอสำหรับตำแหน่งตัวเลข ไม่ต้องแม่นระดับ area-centroid
function polygonCentroid(feature, project) {
  const ring = feature.geometry.coordinates[0]
  let sx = 0, sy = 0
  for (const [lng, lat] of ring) { const [x, y] = project([lng, lat]); sx += x; sy += y }
  return { x: sx / ring.length, y: sy / ring.length }
}

// ชื่อพื้นที่ (เขต/แขวง/ชุมชน) — คงขนาดเดิมบนจอเสมอ (counter-scale ทุกระดับซูม)
// pill = พื้นหลังทึบใต้ข้อความ, ถ้าไม่เปิด pill ใช้ halo (stroke สีพื้นใต้ตัวอักษร + paint-order) ให้อ่านออกบนภาพแผนที่ — ติดไปกับ SVG export ด้วย
const PlaceNameLabel = memo(function PlaceNameLabel({ x, y, text, fontSize, fill, halo, showPill, k }) {
  const box = showPill ? estimateLabelBox(text, fontSize) : null
  return (
    <g transform={`translate(${x} ${y}) scale(${1 / k}) translate(${-x} ${-y})`} pointerEvents="none">
      {box && (
        <rect x={x - box.width / 2 - 4} y={y - box.height / 2 - 1} width={box.width + 8} height={box.height + 4}
          rx={999} fill={halo} opacity={0.9} />
      )}
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
        fontFamily={FONT} fontSize={fontSize} fontWeight={600} fill={fill}
        stroke={showPill ? 'none' : halo} strokeWidth={3} strokeLinejoin="round" style={{ paintOrder: 'stroke' }}>{text}</text>
    </g>
  )
})

const PixelMapCanvas = forwardRef(function PixelMapCanvas({
  width, height, geojson, hierarchy, subdistrictIndex, communityIndex,
  checkedDistricts, checkedSubdistricts, checkedCommunities = EMPTY_SET,
  layers, layerCounts, labelsConfig, style, panelLabel, exporting = false, showExportNumbers = true,
  zoomTransform, onZoomChange,
}, ref) {
  const theme = THEMES[style.background] ?? THEMES.map
  const bg = theme.bg
  // ธีม 'clear' (พื้นหลังใส) — ปิดภาพแผนที่เสมอ ให้พื้นหลังโปร่งจริง เหลือแต่เส้นขอบ
  const tilesEnabled = !!TILE_SOURCES[style.tileSource] && style.background !== 'clear'
  // land = ฐานเทียบ contrast + สี halo ของชื่อพื้นที่ (ไม่ใช่สีพื้นที่วาดจริง ซึ่งใช้ theme.land) —
  // พื้นหลังใสยังต้องอ่านชื่อออก จึงเทียบกับขาว (ตัวอักษรเข้ม + halo ขาว) แทนโปร่งใส
  const land = (tilesEnabled ? '#ffffff' : theme.land) ?? (bg === 'transparent' ? '#ffffff' : bg)
  // land = สีพื้นของ "ตัวเขต" ใช้เป็นสี halo/ตัวเทียบ contrast ของชื่อพื้นที่ — เปิดภาพแผนที่แล้วพื้นในเขตสว่าง จึงเทียบกับขาว
  const borderStroke = theme.border
  const titleFill = theme.title
  const captionFill = theme.caption

  const { project, unproject } = useMemo(() => makeProjection(BKK_BBOX, width, height, 24), [width, height])

  const [districtLayer, subdistrictLayer, ...dataLayers] = layers
  const t = zoomTransform ?? IDENTITY

  // ── d3-zoom binding — svgInternalRef คือตัวจริงที่ forward ออกไปให้ export ใช้ (ผ่าน useImperativeHandle) ──
  const svgInternalRef = useRef(null)
  const zoomBehaviorRef = useRef(null)
  const lastAppliedRef = useRef(t)
  useImperativeHandle(ref, () => svgInternalRef.current)

  // onZoomChange เปลี่ยน reference ได้ (เช่น multi ↔ compare, หรือ syncZoom toggle เปลี่ยน setter) แต่ effect ผูก listener แค่ครั้งเดียวตอน mount
  // (deps แค่ width/height) — ต้องอ่านผ่าน ref เสมอ ไม่งั้น handler จะค้าง callback อันเก่า (stale closure) หลัง toggle sync
  const onZoomChangeRef = useRef(onZoomChange)
  useEffect(() => { onZoomChangeRef.current = onZoomChange })

  useEffect(() => {
    const el = svgInternalRef.current
    if (!el) return
    // coalesce zoom → หนึ่ง setState ต่อเฟรม (rAF) : wheel/drag ยิง event ถี่กว่า 60fps ได้
    // ถ้า setState ทุก event เฟรมเดียวจะ re-render ซ้ำหลายรอบเปล่า ๆ = หน่วง ; เก็บ transform ล่าสุดแล้วแจ้งเฟรมละครั้ง
    let rafId = 0, pending = null
    const flush = () => { rafId = 0; if (pending) onZoomChangeRef.current?.(pending) }
    const behavior = d3zoom().scaleExtent(SCALE_EXTENT).on('zoom', (e) => {
      lastAppliedRef.current = e.transform
      pending = { x: e.transform.x, y: e.transform.y, k: e.transform.k }
      if (!rafId) rafId = requestAnimationFrame(flush)
    })
    zoomBehaviorRef.current = behavior
    const sel = select(el)
    sel.call(behavior)
    sel.call(behavior.transform, zoomIdentity.translate(t.x, t.y).scale(t.k))
    // ctrl+click รีเซ็ต — d3-zoom เองจัดการ wheel/drag/pinch/dblclick ให้แล้ว
    const handleClick = (e) => { if (e.ctrlKey) sel.call(behavior.transform, zoomIdentity) }
    el.addEventListener('click', handleClick)
    return () => { if (rafId) cancelAnimationFrame(rafId); sel.on('.zoom', null); el.removeEventListener('click', handleClick) }
  }, [width, height]) // eslint-disable-line react-hooks/exhaustive-deps

  // transform เปลี่ยนจากภายนอก (ปุ่ม/reset/auto-fit/sync compare) → sync เข้า d3 internal state; กันลูปด้วย lastAppliedRef
  useEffect(() => {
    if (!zoomBehaviorRef.current || !svgInternalRef.current) return
    if (t.x === lastAppliedRef.current.x && t.y === lastAppliedRef.current.y && t.k === lastAppliedRef.current.k) return
    lastAppliedRef.current = t
    select(svgInternalRef.current).call(zoomBehaviorRef.current.transform, zoomIdentity.translate(t.x, t.y).scale(t.k))
  }, [t.x, t.y, t.k]) // eslint-disable-line react-hooks/exhaustive-deps

  const [hover, setHover] = useState(null) // { dname, x, y } — x/y เป็น px ในกรอบ svg สำหรับวาง tooltip

  // throttle ด้วย requestAnimationFrame แทน debounce 150ms — label placement (cull + collision) อัปเดต
  // "ทุกเฟรม" ระหว่างซูม/แพน จึงตามการเคลื่อนไหวแบบเรียลไทม์ ลื่นขึ้น (เดิมรอ 150ms หลังหยุดถึงค่อยขยับ = หน่วง/กระตุก)
  const [debouncedT, setDebouncedT] = useState(t)
  const labelRafRef = useRef(0)
  useEffect(() => {
    cancelAnimationFrame(labelRafRef.current)
    labelRafRef.current = requestAnimationFrame(() => setDebouncedT(t))
    return () => cancelAnimationFrame(labelRafRef.current)
  }, [t.x, t.y, t.k]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyTransform = useCallback((next) => {
    if (!zoomBehaviorRef.current || !svgInternalRef.current) return
    select(svgInternalRef.current).call(zoomBehaviorRef.current.transform, zoomIdentity.translate(next.x, next.y).scale(next.k))
  }, [])
  const zoomIn = useCallback(() => zoomBehaviorRef.current && select(svgInternalRef.current).call(zoomBehaviorRef.current.scaleBy, 1.4), [])
  const zoomOut = useCallback(() => zoomBehaviorRef.current && select(svgInternalRef.current).call(zoomBehaviorRef.current.scaleBy, 1 / 1.4), [])
  const resetZoom = useCallback(() => applyTransform(IDENTITY), [applyTransform])
  // รวม bbox ของ "ทุก" เขตที่ติ๊ก ไม่ใช่แค่ตัวแรก — เขตที่เลือกอาจกระจายคนละมุมกรุงเทพ ต้อง fit รวมกันไม่ใช่ซูมเข้าเขตเดียว
  // นับรวมชุมชนที่ติ๊กด้วย — ไม่งั้นติ๊กชุมชนแล้ว auto-fit เด้งไปเฉพาะกรอบเขต ชุมชนอาจหลุดนอกจอ
  const centerOnSelected = useCallback(() => {
    if (!geojson) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    const addPoint = ([x, y]) => {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
    for (const feature of geojson.features) {
      if (!checkedDistricts.has(feature.properties.dname)) continue
      for (const [lng, lat] of feature.geometry.coordinates[0]) addPoint(project([lng, lat]))
    }
    for (const key of checkedCommunities) {
      const [district, sub, name] = key.split('|')
      const c = hierarchy[district]?.subdistricts?.[sub]?.communities?.[name]
      if (c) addPoint(project([c.lng, c.lat]))
    }
    for (const key of checkedSubdistricts) {
      const [district, sub] = key.split('|')
      const centroid = hierarchy[district]?.subdistricts?.[sub]?.centroid
      if (centroid) addPoint(project([centroid.lng, centroid.lat]))
    }
    if (minX === Infinity) return
    // padding ตามสัดส่วนกรอบ (เดิม fix 40px) — panel เล็กใน compare จะได้ไม่โดนเว้นขอบกินพื้นที่จนแผนที่จิ๋ว
    const padding = Math.max(16, Math.round(Math.min(width, height) * 0.08))
    applyTransform(fitToBoundsTransform({ minX, maxX, minY, maxY }, width, height, { padding, scaleExtent: SCALE_EXTENT }))
  }, [geojson, checkedDistricts, checkedSubdistricts, checkedCommunities, hierarchy, project, width, height, applyTransform])

  // auto-fit เมื่อเปลี่ยนพื้นที่ที่ติ๊ก (ถ้าเปิด toggle)
  // ผูก effect กับ "ค่า" ของ selection (string) ไม่ใช่ reference ของ Set — โหมด compare สร้าง Set ใหม่ทุก render
  // ถ้าผูกกับ Set ตรงๆ effect จะรันทุก render → auto-fit → zoom เปลี่ยน → re-render → วนไม่จบ (Maximum update depth)
  const selectionKey = [...checkedDistricts].sort().join(',') + '~' + [...checkedSubdistricts].sort().join(',') + '~' + [...checkedCommunities].sort().join(',')
  useEffect(() => {
    if (style.autoFitOnSelection) centerOnSelected()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, style.autoFitOnSelection])

  // path string ของทุกเขตคำนวณครั้งเดียว ใช้ซ้ำทั้ง border pass / fill pass (เดิมคำนวณซ้ำ 2 รอบ)
  const districtPaths = useMemo(() => {
    if (!geojson) return []
    return geojson.features.map(f => ({ dcode: f.properties.dcode, dname: f.properties.dname, d: districtPathD(f, project) }))
  }, [geojson, project])

  // ── โฟกัสพื้นที่ที่เลือก — ตัดทุกอย่างนอกเขตที่เลือกออก เหลือเฉพาะรูปทรงของเขตนั้น (ส่วนที่ติ๊กเป็นสีทึบ) ──
  // นับเขตแม่ของแขวง/ชุมชนที่ติ๊กด้วย — ติ๊กแค่แขวงก็ต้องเห็นรูปเขตที่แขวงนั้นอยู่
  const focusDistricts = useMemo(() => {
    const set = new Set(checkedDistricts)
    for (const key of checkedSubdistricts) set.add(key.split('|')[0])
    for (const key of checkedCommunities) set.add(key.split('|')[0])
    return set
  }, [checkedDistricts, checkedSubdistricts, checkedCommunities])

  const focusActive = style.focusSelection && focusDistricts.size > 0
  const visibleDistrictPaths = useMemo(
    () => (focusActive ? districtPaths.filter(f => focusDistricts.has(f.dname)) : districtPaths),
    [focusActive, districtPaths, focusDistricts])
  const clipId = `focus-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}` // ต้องไม่ซ้ำข้าม panel ใน compare grid
  const clipUrl = focusActive ? `url(#${clipId})` : undefined

  // centroid ของทุกเขตแยกจาก value — centroid ไม่ขึ้นกับ metric จึงไม่ต้องคำนวณใหม่ทุกครั้งที่สลับ metric
  const districtCentroids = useMemo(() => {
    if (!geojson) return {}
    const out = {}
    for (const f of geojson.features) out[f.properties.dname] = polygonCentroid(f, project)
    return out
  }, [geojson, project])

  const dotGrid = useMemo(() => {
    if (!geojson || !dataLayers.some(l => l.visible)) return null
    return buildDotGrid(geojson, { width, height, spacing: style.spacing, padding: 24 })
  }, [geojson, dataLayers, style.spacing, width, height])

  // แขวงที่ติ๊กเท่านั้น (ไม่รับ zoom-out fallback — ต่างจากชุมชนโดยตั้งใจ)
  // กรอบใช้ขอบเขตแขวงจริงจาก bangkok-subdistricts.geojson ถ้าหาเจอ — ไม่เจอค่อยตกไปใช้ค่าประมาณจากจุดในแขวง
  // เขต (ขอบเขต BMA) index ตามชื่อ — ใช้เป็น "กรอบ" ตัดพื้นที่แขวง/ชุมชนที่ไม่มี polygon จริง ให้ได้พื้นที่จริงไม่ใช่วงกลม
  const districtFeatureByName = useMemo(() => {
    const m = new Map()
    if (geojson) for (const f of geojson.features) m.set(f.properties.dname, f)
    return m
  }, [geojson])

  const firstRingPts = (feature, proj) =>
    (feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates]).flat()[0].map(proj)

  const subdistrictShapes = useMemo(() => {
    const out = []
    for (const key of checkedSubdistricts) {
      const [district, sub] = key.split('|')
      const node = hierarchy[district]?.subdistricts?.[sub]
      if (!node) continue
      const feature = lookupSubdistrict(subdistrictIndex, district, sub)
      let d, pts, approx = false
      if (feature) {
        d = featurePathD(feature, project)
        pts = firstRingPts(feature, project)
      } else {
        // ไม่มี polygon แขวงจริง → แบ่งพื้นที่ "เขต" ตามจุดกึ่งกลางแขวงที่ใกล้ที่สุด (Voronoi ตัดในขอบเขตเขต) = พื้นที่จริง ไม่ใช่วงกลม
        const distFeature = districtFeatureByName.get(district)
        const sibs = Object.entries(hierarchy[district]?.subdistricts ?? {})
          .filter(([n, v]) => n !== sub && v.centroid).map(([, v]) => v.centroid)
        const ring = (distFeature && node.centroid) ? communityCellRing(distFeature, node.centroid, sibs) : null
        if (ring) { d = ringPathD(ring, project); pts = ring.map(project) }
        else if (distFeature) { d = featurePathD(distFeature, project); pts = firstRingPts(distFeature, project) }
        else continue
        approx = true
      }
      const xs = pts.map(p => p[0]); const ys = pts.map(p => p[1])
      out.push({
        key, dname: district, text: sub, value: nodeMetricValue(node.meta, labelsConfig.metric),
        count: nodeMetricValue(node.meta, 'count'),
        x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2,
        bottom: Math.max(...ys), d, approx,
      })
    }
    return out
  }, [checkedSubdistricts, hierarchy, subdistrictIndex, districtFeatureByName, labelsConfig.metric, project])

  // zoom-out: เขตที่ติ๊กแต่ไม่ได้ drill-in แขวงไหนเลย → รวมทุกแขวงของเขตนั้นเข้า scope ชุมชนด้วย (ระดับแขวงไม่รับ fallback นี้)
  const communitySubKeys = useMemo(() => {
    const keys = new Set(checkedSubdistricts)
    for (const c of checkedCommunities) { const [d, s] = c.split('|'); keys.add(subKey(d, s)) } // ชุมชนที่ติ๊กในเขตที่ยังไม่ได้ติ๊ก ก็ต้องมีตัวเลขของตัวเอง
    const drilled = new Set([...checkedSubdistricts].map(k => k.split('|')[0]))
    for (const d of checkedDistricts) {
      if (drilled.has(d)) continue
      for (const sub of Object.keys(hierarchy[d]?.subdistricts || {})) keys.add(subKey(d, sub))
    }
    return keys
  }, [checkedDistricts, checkedSubdistricts, checkedCommunities, hierarchy])

  const communityCandidates = useMemo(() => {
    const out = []
    for (const key of communitySubKeys) {
      const [district, sub] = key.split('|')
      const node = hierarchy[district]?.subdistricts?.[sub]
      if (!node) continue
      for (const [name, c] of Object.entries(node.communities)) {
        const [x, y] = project([c.lng, c.lat])
        out.push({ key: `${key}|${name}`, dname: district, text: name, value: nodeMetricValue(c, labelsConfig.metric), x, y })
      }
    }
    return out
  }, [communitySubKeys, hierarchy, labelsConfig.metric, project])

  // ── label = "ชื่อพื้นที่" ล้วน ไม่มีตัวเลขแล้ว ──
  // เขต: ตาม labelsConfig.districtNames (ปิด/ที่เลือก/ทุกเขต) — แขวง/ชุมชน: ที่ติ๊กไว้ (+ ชุมชนใน scope เมื่อซูม k≥4)
  // วางทีละระดับ เขต→แขวง→ชุมชน ส่งกล่องที่วางแล้วให้รอบถัดไปกันทับข้ามระดับ ใช้ debouncedT ไม่ใช่ t สด (กันคำนวณทุก tick)
  const nameSizeOf = (table) => table[labelsConfig.districtNameSize] ?? table.md

  const placedDistrictNames = useMemo(() => {
    const nameMode = labelsConfig.districtNames
    if (nameMode === 'off') return []
    const names = nameMode === 'all' ? visibleDistrictPaths.map(p => p.dname) : [...checkedDistricts]
    const fontSize = nameSizeOf(DISTRICT_NAME_SIZE)
    const candidates = []
    for (const dname of names) {
      const pos = districtCentroids[dname]
      if (!pos) continue
      candidates.push({
        key: `d:${dname}`, dname, text: dname, fontSize,
        value: nodeMetricValue(hierarchy[dname]?.meta, labelsConfig.metric),
        x: pos.x, y: pos.y,
      })
    }
    // โหมด 'ทุกเขต' ต้องตัดตัวที่ทับกันไม่งั้นรก — แต่โหมด 'ที่เลือก' ผู้ใช้ติ๊กเอง ต้องเห็นครบ
    return layoutLabels(candidates, {
      transform: debouncedT, width, height, maxCount: Infinity, collide: nameMode === 'all',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelsConfig.districtNames, labelsConfig.districtNameSize, labelsConfig.metric, visibleDistrictPaths, districtCentroids, checkedDistricts, hierarchy, debouncedT, width, height])

  // ชื่อแขวงวางใต้ขอบล่างของกรอบแขวง
  const placedSubdistrictNames = useMemo(() => {
    if (!labelsConfig.visible || !labelsConfig.levels.has('subdistrict') || subdistrictShapes.length === 0) return []
    const fontSize = nameSizeOf(SUBDISTRICT_NAME_SIZE)
    const shifted = subdistrictShapes.map(p => ({ ...p, fontSize, y: p.bottom + (fontSize * 0.9) / debouncedT.k }))
    return layoutLabels(shifted, {
      transform: debouncedT, width, height, maxCount: Infinity, collide: false,
      existingBoxes: placedDistrictNames.map(boxOf),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelsConfig.visible, labelsConfig.levels, labelsConfig.districtNameSize, subdistrictShapes, placedDistrictNames, debouncedT, width, height])

  // ── ชุมชนที่ติ๊ก — แสดงเสมอ ไม่ขึ้นกับ labelsConfig.visible และไม่ต้องซูมถึง k=4 ──
  // มีขอบเขตจริงในไฟล์ 201 ชุมชน → ระบายเป็นพื้นที่, ไม่มี → ใช้หมุดที่ centroid ของจุดเหตุการณ์เหมือนเดิม
  const checkedCommunityPoints = useMemo(() => {
    const out = []
    for (const key of checkedCommunities) {
      const [district, sub, name] = key.split('|')
      const c = hierarchy[district]?.subdistricts?.[sub]?.communities?.[name]
      if (!c) continue
      const feature = lookupCommunity(communityIndex, district, sub, name)
      const [px, py] = project([c.lng, c.lat])
      let d, pts, approx = false
      if (feature) {
        d = featurePathD(feature, project)
        pts = (feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates])
          .flat()[0].map(pt => project(pt))
      } else {
        // ไม่มี polygon ชุมชนในไฟล์ → แบ่งพื้นที่ "แขวง" (หรือ "เขต" ถ้าแขวงก็ไม่มี) ตามชุมชนที่ใกล้ที่สุด = พื้นที่จริง ไม่ใช่วงกลม
        const subFeature = lookupSubdistrict(subdistrictIndex, district, sub)
        const bound = subFeature ?? districtFeatureByName.get(district)
        const siblings = Object.entries(hierarchy[district]?.subdistricts?.[sub]?.communities ?? {})
          .filter(([n]) => n !== name).map(([, v]) => v)
        const ring = bound ? communityCellRing(bound, c, siblings) : null
        if (ring) { d = ringPathD(ring, project); pts = ring.map(pt => project(pt)) }
        else if (bound) { d = featurePathD(bound, project); pts = firstRingPts(bound, project) }
        else continue
        approx = true
      }
      const xs = pts.map(p => p[0]); const ys = pts.map(p => p[1])
      const x = pts.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : px
      const y = pts.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : py
      const bottom = pts.length ? Math.max(...ys) : py
      out.push({ key, dname: district, text: name, x, y, bottom, d, approx, value: nodeMetricValue(c, labelsConfig.metric), count: nodeMetricValue(c, 'count') })
    }
    return out
  }, [checkedCommunities, hierarchy, communityIndex, subdistrictIndex, districtFeatureByName, project, labelsConfig.metric])

  // ชื่อชุมชน = ที่ติ๊ก (collide=false — เลือกเองต้องเห็นครบ) + ที่เหลือใน scope เมื่อซูมลึกพอและเปิด level ชุมชน
  const placedCommunityNames = useMemo(() => {
    const fontSize = nameSizeOf(COMMUNITY_NAME_SIZE)
    const dy = (fontSize * 0.9) / debouncedT.k
    const placedChecked = checkedCommunityPoints.length === 0 ? [] : layoutLabels(
      // มีขอบเขต → วางชื่อใต้ขอบล่างของรูป, ไม่มี → วางใต้หมุด
      checkedCommunityPoints.map(c => ({ ...c, fontSize, y: c.bottom + dy })),
      { transform: debouncedT, width, height, maxCount: Infinity, collide: false },
    )
    if (!labelsConfig.visible || !labelsConfig.levels.has('community') || debouncedT.k < 4) return placedChecked
    const rest = communityCandidates
      .filter(c => !checkedCommunities.has(c.key) && c.value > 0)
      .map(c => ({ ...c, fontSize, y: c.y + dy }))
    const placedRest = layoutLabels(rest, {
      transform: debouncedT, width, height, maxCount: 40,
      existingBoxes: [...placedDistrictNames, ...placedSubdistrictNames, ...placedChecked].map(boxOf),
    })
    return [...placedChecked, ...placedRest]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedCommunityPoints, communityCandidates, checkedCommunities, labelsConfig.visible, labelsConfig.levels,
    labelsConfig.districtNameSize, placedDistrictNames, placedSubdistrictNames, debouncedT, width, height])

  // ── ตัวเลขจำนวนเคสของ "พื้นที่ที่เลือก" — โชว์เฉพาะตอน export ให้ติดไปในรูป (ชุมชน > แขวง > เขต ตามระดับที่ลึกสุดที่ติ๊ก)
  // ระดับที่ลึกกว่าอยู่บนสุด ; ตำแหน่งอิงจากรูปทรง/centroid เดียวกับป้ายชื่อ ; ค่า = จำนวนเคส (metric 'count')
  const exportNumbers = useMemo(() => {
    if (!exporting || !showExportNumbers) return []
    const out = []
    for (const dname of checkedDistricts) {
      const pos = districtCentroids[dname]
      if (pos) out.push({ key: `n:d:${dname}`, x: pos.x, y: pos.y, label: dname, count: nodeMetricValue(hierarchy[dname]?.meta, 'count') })
    }
    for (const s of subdistrictShapes) out.push({ key: `n:s:${s.key}`, x: s.x, y: s.y, label: s.text, count: s.count })
    for (const c of checkedCommunityPoints) out.push({ key: `n:c:${c.key}`, x: c.x, y: c.y, label: c.text, count: c.count })
    return out
  }, [exporting, showExportNumbers, checkedDistricts, districtCentroids, hierarchy, subdistrictShapes, checkedCommunityPoints])

  // จัดตำแหน่งป้าย export ในพิกัด "จอ" + กันชน — ถ้าจุดฐานทับกัน เลื่อนขึ้น/ลงทีละก้อนจนไม่ทับ (โชว์ครบทุกอันไม่ให้ซ่อนกัน)
  const placedExportNumbers = useMemo(() => {
    if (!exporting || exportNumbers.length === 0) return []
    const H = 34, GAP = 5
    const items = exportNumbers.map(p => {
      const countText = `${p.count.toLocaleString()} เรื่อง`
      const w = Math.max(p.label.length, countText.length + 1) * 7.2 + 18
      return { ...p, sx: p.x * t.k + t.x, sy: p.y * t.k + t.y, w, h: H }
    })
    const boxes = []
    const hit = (b) => boxes.some(o => !(b.right < o.left || b.left > o.right || b.bottom < o.top || b.top > o.bottom))
    const placed = []
    for (const it of items) {
      let cy = it.sy
      for (const step of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
        const y = it.sy + step * (H + GAP)
        if (!hit({ left: it.sx - it.w / 2, right: it.sx + it.w / 2, top: y - H / 2, bottom: y + H / 2 })) { cy = y; break }
      }
      boxes.push({ left: it.sx - it.w / 2, right: it.sx + it.w / 2, top: cy - H / 2, bottom: cy + H / 2 })
      placed.push({ ...it, sy: cy })
    }
    return placed
  }, [exporting, exportNumbers, t.x, t.y, t.k])

  // ── basemap: tile ของ OpenStreetMap ตามกรอบที่มองเห็น + ระดับซูมปัจจุบัน (ใช้ debouncedT กันโหลดรัวตอนลาก) ──
  const tileLayer = useMemo(() => {
    const src = tilesEnabled ? TILE_SOURCES[style.tileSource] : null
    if (!src) return null
    const { tiles } = visibleTiles({ project, unproject, width, height, transform: debouncedT })
    return tiles.length === 0 ? null : { tiles, url: src.url, attribution: src.attribution }
  }, [tilesEnabled, style.tileSource, project, unproject, width, height, debouncedT])

  // mask นอกเขต กทม. — สี่เหลี่ยมใหญ่เจาะรูด้วย ring ของทุกเขต (evenodd) เทียบเท่า buildOuterMask ของแผนที่ leaflet
  const outerMaskD = useMemo(() => {
    if (districtPaths.length === 0) return null
    const far = 1e5
    return `M${-far},${-far}L${far},${-far}L${far},${far}L${-far},${far}Z ` + districtPaths.map(f => f.d).join(' ')
  }, [districtPaths])

  // hover เขต — ตำแหน่ง tooltip คำนวณจาก bounding rect ของ svg (offsetX/Y ของ path ใน SVG เชื่อถือไม่ได้ข้ามเบราว์เซอร์)
  const districtPathById = useMemo(() => Object.fromEntries(districtPaths.map(f => [f.dname, f.d])), [districtPaths])
  // จำนวนเคสของเขต = ผลรวมของ data overlay ที่เปิดอยู่ (ถ้ามี) ไม่งั้นใช้จำนวนเหตุการณ์ทั้งหมดจาก hierarchy
  const hoverCountOf = useCallback((dname) => {
    const activeLayer = dataLayers.find(l => l.visible && layerCounts[l.id]?.counts)
    if (activeLayer) return layerCounts[activeLayer.id].counts[dname] ?? 0
    return nodeMetricValue(hierarchy[dname]?.meta, 'count')
  }, [dataLayers, layerCounts, hierarchy])

  // hover ทั่วไป — level = 'district' | 'subdistrict' | 'community' ; dname ใช้ไฮไลต์เขต, label = ชื่อที่โชว์
  const posOf = useCallback((e) => {
    const rect = svgInternalRef.current?.getBoundingClientRect()
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null
  }, [])
  const handleHoverMove = useCallback((dname) => (e) => {
    const pos = posOf(e); if (!pos) return
    setHover({ level: 'district', dname, label: dname, count: hoverCountOf(dname), ...pos })
  }, [posOf, hoverCountOf])
  const handleAreaHover = useCallback((level, dname, label, count) => (e) => {
    const pos = posOf(e); if (!pos) return
    setHover({ level, dname, label, count, ...pos })
  }, [posOf])


  // ── เลเยอร์รูปทรง (พื้น/เส้นขอบ/พื้นที่เลือก/hover zone) — memo แยกจาก transform ──
  // เดิม strokeWidth ผูกกับ t.k ทำให้ทุก path ต้อง diff attribute ใหม่ทุกเฟรมที่ซูม = หน่วง
  // เปลี่ยนมาใช้ vector-effect="non-scaling-stroke" (เส้นคงความหนาบนจอเองโดยไม่ต้องหาร /t.k)
  // → เลเยอร์พวกนี้ไม่ผูกกับ t อีก จึง memo ได้ ; ตอนซูม/แพน React ข้ามไปเลย เหลือแค่ transform + ป้าย/tile ที่อัปเดต
  const hasTiles = !!tileLayer

  const basemapFills = useMemo(() => (
    <>
      {hasTiles && outerMaskD && !focusActive && (
        <path d={outerMaskD} fillRule="evenodd" fill="#0f172a" opacity={0.65} pointerEvents="none" />
      )}
      {(theme.land || focusActive) && !hasTiles && (
        <g fill={focusActive ? FOCUS_LAND : theme.land}>
          {visibleDistrictPaths.map(f => <path key={f.dcode} d={f.d} />)}
        </g>
      )}
      {hasTiles && (
        <g fill={HOVER_FILL} opacity={0.05} pointerEvents="none">
          {visibleDistrictPaths.map(f => <path key={f.dcode} d={f.d} />)}
        </g>
      )}
    </>
  ), [hasTiles, outerMaskD, focusActive, theme.land, visibleDistrictPaths])

  const borderLayer = useMemo(() => {
    if (!style.showBorders) return null
    return (
      <>
        <g fill="none" stroke="#ffffff" strokeWidth={theme.borderWidth + 2.5} strokeLinejoin="round" strokeOpacity={0.75}>
          {visibleDistrictPaths.map(f => <path key={f.dcode} d={f.d} vectorEffect="non-scaling-stroke" />)}
        </g>
        <g fill="none" stroke={borderStroke} strokeWidth={theme.borderWidth} strokeLinejoin="round">
          {visibleDistrictPaths.map(f => <path key={f.dcode} d={f.d} vectorEffect="non-scaling-stroke" />)}
        </g>
      </>
    )
  }, [style.showBorders, theme.borderWidth, borderStroke, visibleDistrictPaths])

  const selectedFill = useMemo(() => {
    if (!districtLayer.visible) return null
    return (
      <g fill={districtLayer.color} fillOpacity={FOCUS_DISTRICT_FILL_OPACITY}
        stroke={districtLayer.color} strokeLinejoin="round"
        opacity={districtLayer.opacity / 100} pointerEvents="none">
        {visibleDistrictPaths.map(f => (checkedDistricts.has(f.dname)
          ? <path key={f.dcode} d={f.d} strokeWidth={3} vectorEffect="non-scaling-stroke" /> : null))}
      </g>
    )
  }, [districtLayer.visible, districtLayer.color, districtLayer.opacity, visibleDistrictPaths, checkedDistricts])

  const dataOverlay = useMemo(() => (
    dataLayers.map(layer => {
      if (!layer.visible) return null
      const res = layerCounts[layer.id]
      if (!res || !res.counts) return null
      const opacity = layer.opacity / 100
      const colorOf = d => {
        const c = res.counts[d] ?? 0
        if (c <= 0) return null
        const tt = res.max > 0 ? c / res.max : 0
        return interpolateHex(layer.colorFrom, layer.colorTo, tt)
      }
      return style.displayMode === 'fill'
        ? <DistrictFillLayer key={layer.id} districtPaths={districtPaths} opacity={opacity} colorOf={colorOf} />
        : <DistrictDotLayer key={layer.id} dots={dotGrid?.dots ?? []} shape={style.shape} dotSize={style.dotSize} opacity={opacity} colorOf={colorOf} />
    })
  ), [dataLayers, layerCounts, style.displayMode, districtPaths, dotGrid, style.shape, style.dotSize])

  const subdistrictFill = useMemo(() => {
    if (!subdistrictLayer.visible || subdistrictShapes.length === 0) return null
    return (
      <g fill={subdistrictLayer.color} fillOpacity={AREA_FILL_OPACITY} stroke={subdistrictLayer.color}
        strokeLinejoin="round" opacity={subdistrictLayer.opacity / 100} pointerEvents="none">
        {subdistrictShapes.map(s => (s.d ? <path key={s.key} d={s.d} strokeWidth={2.4} vectorEffect="non-scaling-stroke" /> : null))}
      </g>
    )
  }, [subdistrictLayer.visible, subdistrictLayer.color, subdistrictLayer.opacity, subdistrictShapes])

  const communityFill = useMemo(() => {
    if (checkedCommunityPoints.length === 0) return null
    const color = labelsConfig.communityColor ?? ROSE_DEFAULT
    return (
      <g fill={color} fillOpacity={AREA_FILL_OPACITY} stroke={color} strokeLinejoin="round" pointerEvents="none">
        {checkedCommunityPoints.map(p => (p.d ? <path key={p.key} d={p.d} strokeWidth={2.2} vectorEffect="non-scaling-stroke" /> : null))}
      </g>
    )
  }, [checkedCommunityPoints, labelsConfig.communityColor])

  const hoverZones = useMemo(() => (
    <>
      <g fill="transparent" stroke="none">
        {visibleDistrictPaths.map(f => (
          <path key={f.dcode} d={f.d} onMouseMove={handleHoverMove(f.dname)} onMouseLeave={() => setHover(null)} />
        ))}
      </g>
      <g fill="transparent" stroke="none">
        {subdistrictShapes.map(s => (s.d
          ? <path key={s.key} d={s.d} onMouseMove={handleAreaHover('subdistrict', s.dname, s.text, s.count)} onMouseLeave={() => setHover(null)} />
          : null))}
      </g>
      <g fill="transparent" stroke="none">
        {checkedCommunityPoints.map(p => (p.d
          ? <path key={p.key} d={p.d} onMouseMove={handleAreaHover('community', p.dname, p.text, p.count)} onMouseLeave={() => setHover(null)} />
          : null))}
      </g>
    </>
  ), [visibleDistrictPaths, subdistrictShapes, checkedCommunityPoints, handleHoverMove, handleAreaHover])

  // พื้นหลังใต้ตัวอักษร = สีพื้นที่จริงที่ตัวอักษรทับอยู่ (ใช้เทียบ contrast + สี halo)
  const backgroundColorFor = () => (focusActive && !tileLayer ? FOCUS_LAND : land)

  return (
    <div className="relative" style={{ width, height }}>
      <svg ref={svgInternalRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg">
        <rect x={0} y={0} width={width} height={height} fill={bg} />

        {focusActive && (
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              {visibleDistrictPaths.map(f => <path key={f.dcode} d={f.d} />)}
            </clipPath>
          </defs>
        )}

        <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
          {/* พื้น + ภาพแผนที่ — โหมดโฟกัสจะ clip ทั้งก้อนให้เหลือเฉพาะรูปทรงของเขตที่เลือก */}
          <g clipPath={clipUrl}>
            {tileLayer && tileLayer.tiles.map(tile => (
              <image key={tile.key} href={tileLayer.url(tile.z, tile.x, tile.y)} crossOrigin="anonymous"
                x={tile.px} y={tile.py} width={tile.pw} height={tile.ph} preserveAspectRatio="none" />
            ))}
            {basemapFills}
          </g>

          {/* Layer 1: เส้นขอบเขต (cased line: halo ขาว + เส้นสี) — memo, non-scaling-stroke */}
          {borderLayer}
          {/* เขตที่ติ๊ก — ระบายสีจาง + กรอบสี */}
          {selectedFill}

          {/* Layer 3+: data overlay — บนเขต ใต้ชื่อพื้นที่ */}
          <g clipPath={clipUrl}>{dataOverlay}</g>

          {/* Layer 2: แขวง / ชุมชน — ข้างในใส ขอบทึบ */}
          {subdistrictFill}
          {communityFill}

          {/* hover: ไฮไลต์เขตใต้เมาส์ (live) แล้วโซนรับ event (memo) — วางท้ายสุดให้จับ event ได้ทั้งพื้นที่ */}
          {hover && (
            <path d={districtPathById[hover.dname]} fill={HOVER_FILL} fillOpacity={0.2}
              stroke={HOVER_STROKE} strokeWidth={3} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          )}
          {hoverZones}

          {/* ชื่อพื้นที่ เขต/แขวง/ชุมชน — วาดบนสุด (อัปเดตตาม debouncedT/zoom) */}
          <g opacity={labelsConfig.opacity / 100}>
            {[...placedDistrictNames, ...placedSubdistrictNames, ...placedCommunityNames].map(p => {
              const areaColor = backgroundColorFor()
              return (
                <PlaceNameLabel key={p.key} x={p.x} y={p.y} text={p.text} fontSize={p.fontSize} k={t.k}
                  showPill={labelsConfig.showPill}
                  fill={labelsConfig.textColor !== 'auto' ? labelsConfig.textColor : getContrastText(areaColor)} halo={areaColor} />
              )
            })}
          </g>

        </g>

        {/* ป้ายพื้นที่ที่เลือก (เฉพาะตอน export) — พิกัดจอ + กันชนแล้ว : พิลดำ ชื่อ (ขาว) + จำนวนเคส (ส้ม) */}
        {placedExportNumbers.map(p => (
          <g key={p.key} pointerEvents="none">
            <rect x={p.sx - p.w / 2} y={p.sy - 17} width={p.w} height={34} rx={7} fill="rgba(15,23,42,0.92)" />
            <text x={p.sx} y={p.sy - 7} textAnchor="middle" dominantBaseline="central"
              fontFamily={FONT} fontSize={12} fontWeight={700} fill="#ffffff">{p.label}</text>
            <text x={p.sx} y={p.sy + 8} textAnchor="middle" dominantBaseline="central"
              fontFamily={FONT} fontSize={11} fill="#e2e8f0" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <tspan fontWeight={800} fill="#fb923c">{p.count.toLocaleString()}</tspan> เรื่อง
            </text>
          </g>
        ))}

        {/* เครดิตแหล่งภาพแผนที่ — ต้องแสดงตามเงื่อนไขการใช้ tile ของ OpenStreetMap */}
        {tileLayer && (
          <text x={width - 6} y={height - 6} textAnchor="end" fontSize={9} fontFamily={FONT} fill="#334155" opacity={0.85}>
            {tileLayer.attribution}
          </text>
        )}
        {panelLabel && (
          <text x={width / 2} y={22} textAnchor="middle" fontSize={13} fontWeight={600} fontFamily={FONT} fill={titleFill}>{panelLabel}</text>
        )}
        {/* panelLabel === '' = โหมด panel ที่มีหัวข้อ HTML ครอบนอกอยู่แล้ว จึงไม่วาด figure title/caption ซ้ำ */}
        {panelLabel == null && (style.title || style.caption) && (
          <g textAnchor="middle" fontFamily={FONT}>
            {style.title && <text x={width / 2} y={height - (style.caption ? 44 : 26)} fontSize={20} fontWeight={700} fill={titleFill}>{style.title}</text>}
            {style.caption && <text x={width / 2} y={height - 18} fontSize={12} fill={captionFill}>{style.caption}</text>}
          </g>
        )}
      </svg>
      {/* tooltip ชื่อเขต + จำนวนเคสตามเมาส์ — พิลดำหางล่าง เหมือน .district-tooltip ของแผนที่ leaflet */}
      {hover && (
        <div className="absolute pointer-events-none z-10 -translate-x-1/2 -translate-y-full"
          style={{ left: hover.x, top: hover.y - 10 }}>
          <div className="rounded-md bg-slate-900/90 px-2.5 py-1 text-white whitespace-nowrap shadow-lg text-center">
            <div className="text-xs font-semibold">
              {hover.level === 'subdistrict' && <span className="text-slate-400 font-normal">แขวง </span>}
              {hover.level === 'community' && <span className="text-slate-400 font-normal">ชุมชน </span>}
              {hover.level === 'district' ? hover.label : hover.label.replace(/^(แขวง|ชุมชน)\s*/, '')}
            </div>
            <div className="text-[11px] text-slate-200">
              <span className="font-bold text-amber-300 tabular-nums">{(hover.count ?? 0).toLocaleString()}</span> เรื่อง
            </div>
          </div>
          <div className="mx-auto h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-slate-900/90" />
        </div>
      )}
      {style.showZoomControls && (
        <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} onCenter={centerOnSelected} />
      )}
    </div>
  )
})

export default PixelMapCanvas
