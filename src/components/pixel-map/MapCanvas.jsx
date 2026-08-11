import { forwardRef, useMemo, useRef, useEffect, useImperativeHandle, useCallback, useState, memo } from 'react'
import { select } from 'd3-selection'
import { zoom as d3zoom, zoomIdentity } from 'd3-zoom'
import { districtPathD, buildDotGrid, BKK_BBOX, makeProjection } from '../../utils/pixelMapGeometry'
import { interpolateHex, getContrastText } from '../../utils/pixelMapStyle'
import { nodeMetricValue } from '../../utils/pixelMapData'
import { subKey } from '../../hooks/usePixelMapState'
import { fitToBoundsTransform, estimateLabelBox, layoutLabels, boxOf } from '../../utils/pixelMapZoom'
import ZoomControls from './ZoomControls'

const SUB_MARKER_R = 3
const FONT = "Inter, 'Noto Sans Thai', sans-serif"
const SCALE_EXTENT = [1, 8]
const IDENTITY = { x: 0, y: 0, k: 1 }
const LABEL_DEBOUNCE_MS = 150

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

function fontSizeFor(value, levelMax) {
  if (levelMax <= 0) return 10
  const t = Math.max(0, Math.min(1, value / levelMax))
  return 10 + Math.sqrt(t) * (32 - 10)
}

const NumberLabel = memo(function NumberLabel({ x, y, value, name, parentValue, fontSize, textColor, labelMode, showPill, counterScale, k, dark }) {
  const text = labelMode === 'nameNumber' ? `${name} · ${value.toLocaleString()}`
    : labelMode === 'percent' && parentValue > 0 ? `${Math.round((value / parentValue) * 100)}%`
    : value.toLocaleString()
  const groupTransform = counterScale ? `translate(${x} ${y}) scale(${1 / k}) translate(${-x} ${-y})` : undefined
  const box = showPill ? estimateLabelBox(text, fontSize) : null
  return (
    <g transform={groupTransform} pointerEvents="none">
      {showPill && box && (
        <rect x={x - box.width / 2 - 4} y={y - box.height / 2 - 1} width={box.width + 8} height={box.height + 4}
          rx={999} fill={dark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.9)'} />
      )}
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontWeight={700}
        fontFamily={FONT} fontSize={fontSize} fill={textColor} style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</text>
    </g>
  )
})

const PixelMapCanvas = forwardRef(function PixelMapCanvas({
  width, height, geojson, hierarchy,
  checkedDistricts, checkedSubdistricts,
  layers, layerCounts, levelMaxes, labelsConfig, style, panelLabel,
  zoomTransform, onZoomChange,
}, ref) {
  const dark = style.background === 'dark'
  const bg = dark ? '#0f172a' : '#ffffff'
  const borderStroke = dark ? '#334155' : '#cbd5e1'
  const titleFill = dark ? '#f8fafc' : '#0f172a'
  const captionFill = dark ? '#94a3b8' : '#64748b'

  const project = useMemo(() => makeProjection(BKK_BBOX, width, height, 24).project, [width, height])

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
    const behavior = d3zoom().scaleExtent(SCALE_EXTENT).on('zoom', (e) => {
      lastAppliedRef.current = e.transform
      onZoomChangeRef.current?.({ x: e.transform.x, y: e.transform.y, k: e.transform.k })
    })
    zoomBehaviorRef.current = behavior
    const sel = select(el)
    sel.call(behavior)
    sel.call(behavior.transform, zoomIdentity.translate(t.x, t.y).scale(t.k))
    // ctrl+click รีเซ็ต — d3-zoom เองจัดการ wheel/drag/pinch/dblclick ให้แล้ว
    const handleClick = (e) => { if (e.ctrlKey) sel.call(behavior.transform, zoomIdentity) }
    el.addEventListener('click', handleClick)
    return () => { sel.on('.zoom', null); el.removeEventListener('click', handleClick) }
  }, [width, height]) // eslint-disable-line react-hooks/exhaustive-deps

  // transform เปลี่ยนจากภายนอก (ปุ่ม/reset/auto-fit/sync compare) → sync เข้า d3 internal state; กันลูปด้วย lastAppliedRef
  useEffect(() => {
    if (!zoomBehaviorRef.current || !svgInternalRef.current) return
    if (t.x === lastAppliedRef.current.x && t.y === lastAppliedRef.current.y && t.k === lastAppliedRef.current.k) return
    lastAppliedRef.current = t
    select(svgInternalRef.current).call(zoomBehaviorRef.current.transform, zoomIdentity.translate(t.x, t.y).scale(t.k))
  }, [t.x, t.y, t.k]) // eslint-disable-line react-hooks/exhaustive-deps

  // debounce เฉพาะ input ของ label placement (viewport cull + collision) — <g transform> ของแผนที่เองยังใช้ t สดเพื่อความลื่น
  const [debouncedT, setDebouncedT] = useState(t)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedT(t), LABEL_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [t.x, t.y, t.k]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyTransform = useCallback((next) => {
    if (!zoomBehaviorRef.current || !svgInternalRef.current) return
    select(svgInternalRef.current).call(zoomBehaviorRef.current.transform, zoomIdentity.translate(next.x, next.y).scale(next.k))
  }, [])
  const zoomIn = useCallback(() => zoomBehaviorRef.current && select(svgInternalRef.current).call(zoomBehaviorRef.current.scaleBy, 1.4), [])
  const zoomOut = useCallback(() => zoomBehaviorRef.current && select(svgInternalRef.current).call(zoomBehaviorRef.current.scaleBy, 1 / 1.4), [])
  const resetZoom = useCallback(() => applyTransform(IDENTITY), [applyTransform])
  // รวม bbox ของ "ทุก" เขตที่ติ๊ก ไม่ใช่แค่ตัวแรก — เขตที่เลือกอาจกระจายคนละมุมกรุงเทพ ต้อง fit รวมกันไม่ใช่ซูมเข้าเขตเดียว
  const centerOnSelected = useCallback(() => {
    if (!geojson || checkedDistricts.size === 0) return
    const features = geojson.features.filter(f => checkedDistricts.has(f.properties.dname))
    if (features.length === 0) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const feature of features) {
      for (const [lng, lat] of feature.geometry.coordinates[0]) {
        const [x, y] = project([lng, lat])
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      }
    }
    applyTransform(fitToBoundsTransform({ minX, maxX, minY, maxY }, width, height, { scaleExtent: SCALE_EXTENT }))
  }, [geojson, checkedDistricts, project, width, height, applyTransform])

  // auto-fit เมื่อเปลี่ยนพื้นที่ที่ติ๊ก (ถ้าเปิด toggle)
  useEffect(() => {
    if (style.autoFitOnSelection) centerOnSelected()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedDistricts])

  // path string ของทุกเขตคำนวณครั้งเดียว ใช้ซ้ำทั้ง border pass / fill pass (เดิมคำนวณซ้ำ 2 รอบ)
  const districtPaths = useMemo(() => {
    if (!geojson) return []
    return geojson.features.map(f => ({ dcode: f.properties.dcode, dname: f.properties.dname, d: districtPathD(f, project) }))
  }, [geojson, project])

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

  // ตัวเลขแสดงเฉพาะพื้นที่ที่ "ติ๊ก" เท่านั้นทุกระดับ (ไม่ใช่ทั้ง 50 เขตเสมอแบบเดิม) — กันความรกเวลาเปิด labels แล้วเจอเลขทั้งเมือง
  const districtCandidates = useMemo(() => {
    const out = []
    for (const dname of checkedDistricts) {
      const meta = hierarchy[dname]?.meta
      const value = nodeMetricValue(meta, labelsConfig.metric)
      if (value <= 0) continue
      const pos = districtCentroids[dname]
      if (!pos) continue
      out.push({ key: dname, name: dname, value, parentValue: 0, x: pos.x, y: pos.y })
    }
    return out
  }, [checkedDistricts, districtCentroids, hierarchy, labelsConfig.metric])

  // แขวงที่ติ๊กเท่านั้น (ไม่รับ zoom-out fallback — ต่างจากชุมชนโดยตั้งใจ)
  const subdistrictCandidates = useMemo(() => {
    const out = []
    for (const key of checkedSubdistricts) {
      const [district, sub] = key.split('|')
      const node = hierarchy[district]?.subdistricts?.[sub]
      if (!node?.centroid) continue
      const value = nodeMetricValue(node.meta, labelsConfig.metric)
      if (value <= 0) continue
      const parentValue = nodeMetricValue(hierarchy[district]?.meta, labelsConfig.metric)
      const [x, y] = project([node.centroid.lng, node.centroid.lat])
      out.push({ key, name: sub, value, parentValue, x, y })
    }
    return out
  }, [checkedSubdistricts, hierarchy, labelsConfig.metric, project])

  // zoom-out: เขตที่ติ๊กแต่ไม่ได้ drill-in แขวงไหนเลย → รวมทุกแขวงของเขตนั้นเข้า scope ชุมชนด้วย (ระดับแขวงไม่รับ fallback นี้)
  const communitySubKeys = useMemo(() => {
    const keys = new Set(checkedSubdistricts)
    const drilled = new Set([...checkedSubdistricts].map(k => k.split('|')[0]))
    for (const d of checkedDistricts) {
      if (drilled.has(d)) continue
      for (const sub of Object.keys(hierarchy[d]?.subdistricts || {})) keys.add(subKey(d, sub))
    }
    return keys
  }, [checkedDistricts, checkedSubdistricts, hierarchy])

  const communityCandidates = useMemo(() => {
    const out = []
    for (const key of communitySubKeys) {
      const [district, sub] = key.split('|')
      const node = hierarchy[district]?.subdistricts?.[sub]
      if (!node) continue
      const parentValue = nodeMetricValue(hierarchy[district]?.meta, labelsConfig.metric)
      for (const [name, c] of Object.entries(node.communities)) {
        const value = nodeMetricValue(c, labelsConfig.metric)
        if (value <= 0) continue
        const [x, y] = project([c.lng, c.lat])
        out.push({ key: `${key}|${name}`, name, value, parentValue, x, y })
      }
    }
    return out
  }, [communitySubKeys, hierarchy, labelsConfig.metric, project])

  // ขนาดตัวอักษรจริงบน SVG attribute (ใช้ตอน render, ยังไม่คูณ k เพราะ text อยู่ใน <g scale(k)> อยู่แล้ว)
  // vs ขนาดที่ "จะเห็นจริงบนจอ" (ใช้ตอนประเมิน collision เท่านั้น, อิง debouncedT.k) — สอง mode ต่างกัน:
  //  - default (ไม่ counter-scale): text ถูก scale ไปกับ <g> ด้วย → บนจอจริง = svgFontSize * k
  //  - counterScaleLabels: มี wrapper scale(1/k) หักล้าง → บนจอจริง = svgFontSize คงที่ไม่ว่าจะซูมแค่ไหน
  const resolveFontSize = (autoSize) => (labelsConfig.labelSize === 'fixed12' ? 12 : labelsConfig.labelSize === 'fixed16' ? 16 : autoSize)
  const buildLabelCandidates = (list, levelMax) => list.map(c => {
    const svgFontSize = resolveFontSize(fontSizeFor(c.value, levelMax))
    const screenFontSize = labelsConfig.counterScaleLabels ? svgFontSize : svgFontSize * debouncedT.k
    return { ...c, text: String(c.value), svgFontSize, fontSize: screenFontSize }
  })

  // zoom-adaptive: เขต — ถ้าเปิดและอยู่ใน levels เสมอ; แขวงเมื่อ k≥2; ชุมชนเมื่อ k≥4 — สะสม ไม่ใช่ exclusive
  // แยกจาก layers[].visible โดยตั้งใจ (ปิด fill เขตได้ แต่ยังเห็นเลขเขตได้ถ้าเปิด labels)
  // 3 pass เรียงกัน แต่ละ pass ส่งกล่องที่วางไปแล้วให้ pass ถัดไปกันชนข้าม level ด้วย — ใช้ debouncedT ไม่ใช่ t สด (Issue 1: กันคำนวณทุก tick)
  const placedDistrict = useMemo(() => {
    if (!labelsConfig.visible || !labelsConfig.levels.has('district')) return []
    return layoutLabels(buildLabelCandidates(districtCandidates, levelMaxes.district), { transform: debouncedT, width, height, maxCount: Infinity })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelsConfig.visible, labelsConfig.levels, districtCandidates, levelMaxes.district, labelsConfig.labelSize, labelsConfig.counterScaleLabels, debouncedT, width, height])

  const placedSubdistrict = useMemo(() => {
    if (!labelsConfig.visible || !labelsConfig.levels.has('subdistrict') || debouncedT.k < 2) return []
    return layoutLabels(buildLabelCandidates(subdistrictCandidates, levelMaxes.subdistrict), {
      transform: debouncedT, width, height, maxCount: 20, existingBoxes: placedDistrict.map(boxOf),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelsConfig.visible, labelsConfig.levels, subdistrictCandidates, levelMaxes.subdistrict, labelsConfig.labelSize, labelsConfig.counterScaleLabels, debouncedT, width, height, placedDistrict])

  const placedCommunity = useMemo(() => {
    if (!labelsConfig.visible || !labelsConfig.levels.has('community') || debouncedT.k < 4) return []
    return layoutLabels(buildLabelCandidates(communityCandidates, levelMaxes.community), {
      transform: debouncedT, width, height, maxCount: 20, existingBoxes: [...placedDistrict, ...placedSubdistrict].map(boxOf),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelsConfig.visible, labelsConfig.levels, communityCandidates, levelMaxes.community, labelsConfig.labelSize, labelsConfig.counterScaleLabels, debouncedT, width, height, placedDistrict, placedSubdistrict])

  const backgroundColorFor = (dname) => (districtLayer.visible && checkedDistricts.has(dname) ? districtLayer.color : bg)
  const textColorFor = (dname) => (labelsConfig.textColor !== 'auto' ? labelsConfig.textColor : getContrastText(backgroundColorFor(dname)))

  return (
    <div className="relative" style={{ width, height }}>
      <svg ref={svgInternalRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg">
        <rect x={0} y={0} width={width} height={height} fill={bg} />

        <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
          {/* Layer 1: เขต — outline เสมอ, fill เฉพาะที่ติ๊ก */}
          {style.showBorders && (
            <g fill="none" stroke={borderStroke} strokeWidth={1 / t.k}>
              {districtPaths.map(f => <path key={f.dcode} d={f.d} />)}
            </g>
          )}
          {districtLayer.visible && (
            <g opacity={districtLayer.opacity / 100}>
              {districtPaths.map(f => {
                if (!checkedDistricts.has(f.dname)) return null
                return <path key={f.dcode} d={f.d} fill={districtLayer.color} />
              })}
            </g>
          )}

          {/* Layer 3+: data overlay — วาดบน เขต แต่ใต้ตัวเลข */}
          {dataLayers.map(layer => {
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
          })}

          {/* Layer 2: แขวง — marker กลาง zone (ไม่มี polygon) */}
          {subdistrictLayer.visible && (
            <g opacity={subdistrictLayer.opacity / 100} fill={subdistrictLayer.color}>
              {placedSubdistrict.map(p => <circle key={p.key} cx={p.x} cy={p.y} r={SUB_MARKER_R / t.k} />)}
            </g>
          )}

          {/* ตัวเลข เขต + แขวง + ชุมชน — คุมด้วย labelsConfig ล้วน แยกจาก layers[].visible ข้างบน */}
          <g opacity={labelsConfig.opacity / 100}>
            {[...placedDistrict, ...placedSubdistrict, ...placedCommunity].map(p => (
              <NumberLabel key={p.key} x={p.x} y={p.y} value={p.value} name={p.name} parentValue={p.parentValue}
                fontSize={p.svgFontSize}
                textColor={textColorFor(p.key.split('|')[0])} labelMode={labelsConfig.labelMode}
                showPill={labelsConfig.showPill} counterScale={labelsConfig.counterScaleLabels} k={t.k} dark={dark} />
            ))}
          </g>
        </g>

        {panelLabel && (
          <text x={width / 2} y={22} textAnchor="middle" fontSize={13} fontWeight={600} fontFamily={FONT} fill={titleFill}>{panelLabel}</text>
        )}
        {!panelLabel && (style.title || style.caption) && (
          <g textAnchor="middle" fontFamily={FONT}>
            {style.title && <text x={width / 2} y={height - (style.caption ? 44 : 26)} fontSize={20} fontWeight={700} fill={titleFill}>{style.title}</text>}
            {style.caption && <text x={width / 2} y={height - 18} fontSize={12} fill={captionFill}>{style.caption}</text>}
          </g>
        )}
      </svg>
      {style.showZoomControls && (
        <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} onCenter={centerOnSelected} />
      )}
    </div>
  )
})

export default PixelMapCanvas
