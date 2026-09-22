import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  MapContainer, TileLayer, CircleMarker, Popup, Tooltip as MapTooltip,
  GeoJSON, useMap, Pane, Marker,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { buildOuterMask } from "./worldMask.js"
import { escapeHtml } from "../security/escapeHtml.js"

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

function HeatmapLayer({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points || points.length === 0) return
    const heatData = points.filter(p => p.lat && p.lng).map(p => [p.lat, p.lng, 1.0])
    const heat = L.heatLayer(heatData, {
      radius: 35, blur: 18, maxZoom: 18, max: 0.6, minOpacity: 0.45,
      gradient: { 0.0: '#fbbf24', 0.3: '#f97316', 0.5: '#ef4444', 0.7: '#dc2626', 0.85: '#b91c1c', 1.0: '#7f1d1d' },
    })
    heat.addTo(map)
    return () => { map.removeLayer(heat) }
  }, [points, map])
  return null
}

function FlyController({ target }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    const z = target.zoom ?? 16
    // offsetX (px) — เลื่อนจุดศูนย์กลางไปทางขวา ให้เป้าหมายโผล่ทางซ้าย (กันแผงสถิติที่ลอยทับด้านขวาบัง)
    if (target.offsetX) {
      const pt = map.project([target.lat, target.lng], z).add([target.offsetX, 0])
      map.flyTo(map.unproject(pt, z), z, { duration: 1.2 })
    } else {
      map.flyTo([target.lat, target.lng], z, { duration: 1.2 })
    }
  }, [target, map])
  return null
}

// fitBounds ไปเขตที่เลือก (1 เขตหรือหลายเขต → bounds รวม) ; ว่าง → reset กลับมุมมองเริ่มต้น
function DistrictFocus({ districts, dnames }) {
  const map = useMap()
  const key = dnames.join('|')
  useEffect(() => {
    if (!districts) return
    if (!key) { map.flyTo([13.7563, 100.5018], 11, { duration: 1.0 }); return }
    const names = new Set(key.split('|'))
    const feats = districts.features.filter(ft => names.has(ft.properties?.dname))
    if (feats.length) map.flyToBounds(L.geoJSON({ type: 'FeatureCollection', features: feats }).getBounds(), { padding: [40, 40], maxZoom: 14, duration: 1.0 })
  }, [key, districts, map])
  return null
}

// ── cluster แบบ grid (ไม่ใช้ lib เพิ่ม) — จัดกลุ่มจุดที่อยู่ในช่องพิกเซลเดียวกัน ณ zoom ปัจจุบัน ──
//   จุดพิกัดเดียวกัน (ร้องเรียนซ้ำที่เดิม) จะรวมเป็นก้อนเดียวเสมอ = เห็น "จำนวนครั้ง" ทันที
const CLUSTER_CELL = 64
function gridCluster(points, map, zoom, cell = CLUSTER_CELL) {
  const buckets = new Map()
  for (const p of points) {
    const pt = map.project([p.lat, p.lng], zoom)
    const key = `${Math.floor(pt.x / cell)}:${Math.floor(pt.y / cell)}`
    let b = buckets.get(key)
    if (!b) { b = { key, members: [], sLat: 0, sLng: 0, districts: {} }; buckets.set(key, b) }
    b.members.push(p); b.sLat += p.lat; b.sLng += p.lng
    if (p.district) b.districts[p.district] = (b.districts[p.district] || 0) + 1
  }
  const out = []
  for (const b of buckets.values()) {
    const n = b.members.length
    const topDistrict = Object.entries(b.districts).sort((a, c) => c[1] - a[1])[0]?.[0] || ''
    out.push({ id: `${zoom}:${b.key}`, lat: b.sLat / n, lng: b.sLng / n, count: n, members: b.members, topDistrict })
  }
  return out
}
// สี/ขนาดก้อนตามจำนวน — มาก = เข้ม/ใหญ่ (slate → amber → rose)
function clusterStyle(count) {
  const size = Math.min(54, Math.round(26 + Math.log2(count) * 5))
  const bg = count >= 200 ? '#9f1239' : count >= 50 ? '#e11d48' : count >= 10 ? '#d97706' : '#475569'
  return { size, bg }
}
const clusterIconCache = new Map()
function clusterIcon(count) {
  const { size, bg } = clusterStyle(count)
  const k = `${size}|${bg}|${count}`
  let icon = clusterIconCache.get(k)
  if (!icon) {
    icon = L.divIcon({
      className: 'rd-cluster-wrap',
      html: `<div class="rd-cluster" style="width:${size}px;height:${size}px;background:${bg};font-size:${count >= 1000 ? 11 : 12}px">${count.toLocaleString()}</div>`,
      iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    })
    clusterIconCache.set(k, icon)
  }
  return icon
}

/**
 * ชั้น cluster — ก้อน (count ≥ 2) วาดเป็น divIcon, จุดเดี่ยววาดบน canvas เหมือนเดิม
 * คลิกก้อน: ถ้าซูมเข้าแล้วยังแยกไม่ออก (พิกัดเดียวกัน) → เปิด popup สรุป ; ไม่งั้นบินเข้าไปที่ก้อน
 */
function ClusterLayer({ points, zoom, getColor, markerRadius, markerRefs, onPointClick, onPointHover, onClusterOpen, activeClusterId }) {
  const map = useMap()
  const clusters = useMemo(() => gridCluster(points, map, zoom), [points, map, zoom])
  // วาดเฉพาะก้อนในกรอบที่มองเห็น (+30% รอบขอบ) — ซูมลึกมีก้อนเป็นพัน ถ้าวาด divIcon ทั้งเมืองจะหนัก DOM
  const [viewBounds, setViewBounds] = useState(() => map.getBounds().pad(0.3))
  useEffect(() => {
    const onMove = () => setViewBounds(map.getBounds().pad(0.3))
    map.on('moveend', onMove)
    return () => map.off('moveend', onMove)
  }, [map])
  const singles = [], multi = []
  for (const c of clusters) {
    if (!viewBounds.contains([c.lat, c.lng])) continue
    ;(c.count === 1 ? singles : multi).push(c)
  }
  return (
    <>
      {singles.map(c => {
        const p = c.members[0]
        return (
          <CircleMarker key={p.id} center={[p.lat, p.lng]} pane="vector-pane" radius={markerRadius}
            pathOptions={{ fillColor: getColor(p), fillOpacity: 0.85, color: '#fff', weight: 2 }}
            eventHandlers={{
              add: (e) => { markerRefs.current.add(e.target); e.target.bringToFront() },
              remove: (e) => markerRefs.current.delete(e.target),
              click: () => onPointClick(p), mouseover: () => onPointHover(p), mouseout: () => onPointHover(null),
            }} />
        )
      })}
      {multi.map(c => (
        <Marker key={c.id} position={[c.lat, c.lng]} icon={clusterIcon(c.count)} zIndexOffset={activeClusterId === c.id ? 1000 : c.count}
          eventHandlers={{
            click: () => {
              const b = L.latLngBounds(c.members.map(m => [m.lat, m.lng]))
              const fitZoom = map.getBoundsZoom(b, false, L.point(60, 60))
              if (fitZoom >= 17 || map.getZoom() >= 16) onClusterOpen(c)
              else map.flyToBounds(b, { padding: [60, 60], maxZoom: 17, duration: 0.6 })
            },
          }}>
          <MapTooltip direction="top" offset={[0, -clusterStyle(c.count).size / 2]} opacity={0.95}>
            <span style={{ fontWeight: 700 }}>{c.count.toLocaleString()} ครั้ง</span>{c.topDistrict ? ` · ${c.topDistrict}` : ''}
            <span style={{ color: '#94a3b8' }}> · คลิกเพื่อ{map.getZoom() >= 16 ? 'ดูสรุป' : 'ซูม'}</span>
          </MapTooltip>
        </Marker>
      ))}
    </>
  )
}

function ZoomTracker({ onZoom }) {
  const map = useMap()
  useEffect(() => {
    const handler = () => onZoom(map.getZoom())
    map.on('zoomend', handler)
    return () => map.off('zoomend', handler)
  }, [map, onZoom])
  return null
}

function CoordRow({ lat, lng }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1800) }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        fallback(text); done()
      })
    } else {
      fallback(text); done()
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingTop: 5, marginTop: 5, borderTop: '1px solid #e2e8f0' }}>
      <span style={{ color: '#94a3b8', fontSize: 10, whiteSpace: 'nowrap' }}>พิกัด:</span>
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', flex: 1 }}>
        {lat.toFixed(6)}, {lng.toFixed(6)}
      </span>
      <button
        onClick={handleCopy}
        style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 4, border: `1px solid ${copied ? '#10b981' : '#cbd5e1'}`,
          background: copied ? '#ecfdf5' : '#f8fafc', color: copied ? '#059669' : '#64748b',
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s', fontFamily: 'inherit',
        }}
      >
        {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}
      </button>
    </div>
  )
}

function fallback(text) {
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  } catch { /* clipboard fallback ล้มเหลว — เงียบ */ }
}

function DefaultSearchPopup({ popup }) {
  return (
    <div style={{ minWidth: 210 }}>
      <div style={{ fontWeight: 700, fontSize: 14, borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 8 }}>
        📍 {popup.label}
      </div>
      {popup.subdistrict && (
        <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
          <span style={{ color: '#64748b' }}>แขวง</span>
          <span style={{ fontWeight: 600 }}>{popup.subdistrict}</span>
        </div>
      )}
      {popup.district && (
        <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
          <span style={{ color: '#64748b' }}>เขต</span>
          <span style={{ fontWeight: 600 }}>{popup.district}</span>
        </div>
      )}
      {popup.count != null && (
        <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
          <span style={{ color: '#64748b' }}>พบทั้งหมด</span>
          <span style={{ fontWeight: 700, color: '#dc2626' }}>{popup.count} เรื่อง</span>
        </div>
      )}
    </div>
  )
}

/**
 * Shared reusable incident map component.
 * Handles all Leaflet rendering — GeoJSON district borders, outer mask,
 * point markers, heatmap, optional extra district layer, search popup.
 */
export default function IncidentMap({
  points = [],
  getColor,
  renderPopup,
  tooltipText,
  viewMode = 'point',
  flyTarget = null,
  searchPopup = null,
  onSearchPopupClose = () => {},
  renderSearchPopup = null,
  districtLayerKey = '',
  districtLayerStyle = null,
  districtLayerOnEachFeature = null,
  onDistrictClick = null,
  highlightDistrict = null,   // string | string[] — เขตที่เลือก (highlight + fit bounds)
  onZoomChange = () => {},
  scrollWheelZoom = true,
  mini = false,            // mini-map: ปิด interaction (compare modal)
  permanentDistrictLabels = false,   // true = เปิด tooltip ชื่อเขตค้างไว้ตลอด (ใช้ตอน capture ภาพส่งออก)
  cluster = false,                   // true = รวมกลุ่มจุดใกล้กัน (grid cluster) ในโหมด point
  renderClusterPopup = null,         // (cluster) => ReactNode — popup สรุปก้อน (เขต/แขวง/ชุมชน/พฤติการณ์)
  className = 'w-full h-full',
}) {
  const [districts, setDistricts] = useState(null)
  const [outerMask, setOuterMask] = useState(null)
  const [zoom, setZoom] = useState(11)
  // popup/tooltip ของจุด — ใช้ตัวเดียวร่วมกันทุกจุด (เดิม bind Popup+Tooltip ต่อ marker → 15k จุด = 30k layer object
  // + SVG node ต่อจุด ทำให้หน้า /radar ค้าง 4–5 วิ) ; marker วาดบน canvas ผ่าน preferCanvas
  const [activePoint, setActivePoint] = useState(null)
  const [hoverPoint, setHoverPoint] = useState(null)
  // popup ก้อน cluster — เก็บพร้อม points/zoom ตอนเปิด ; ชุดจุดหรือ zoom เปลี่ยน = ก้อนเดิมไม่มีแล้ว → ถือว่าปิด (derive แทน effect)
  const [activeClusterRaw, setActiveClusterRaw] = useState(null)
  const setActiveCluster = useCallback((c) => setActiveClusterRaw(c ? { cluster: c, points, zoom } : null), [points, zoom])
  const activeCluster = activeClusterRaw && activeClusterRaw.points === points && activeClusterRaw.zoom === zoom ? activeClusterRaw.cluster : null
  const highlightList = useMemo(() => Array.isArray(highlightDistrict) ? highlightDistrict.filter(Boolean) : highlightDistrict ? [highlightDistrict] : [], [highlightDistrict])
  // canvas เดียววาดตามลำดับที่ add — layer เขตที่มาทีหลัง (geojson โหลด async/สลับโหมด) จะทับจุดและแย่ง hit-test
  // → เก็บ instance ของจุดไว้ แล้ว bringToFront ทุกครั้งที่ layer เขตถูกเพิ่ม
  const markerRefs = useRef(new Set())
  const searchMarkerRef = useRef(null)   // Marker ของ popup ค้นหา/พื้นที่ (ดูสถานะ popup ตอน remove)
  const raiseMarkers = useCallback(() => { for (const m of markerRefs.current) m.bringToFront() }, [])
  const districtLayerEvents = useMemo(() => ({ add: raiseMarkers }), [raiseMarkers])

  useEffect(() => {
    fetch('/bangkok-districts.geojson')
      .then(r => r.json())
      .then(data => { setDistricts(data); setOuterMask(buildOuterMask(data)) })
      .catch(err => console.error('[IncidentMap] GeoJSON load failed:', err))
  }, [])

  const handleZoom = useCallback(z => { setZoom(z); onZoomChange(z) }, [onZoomChange])

  const showPoints = viewMode === 'point'
  const showHeatmap = viewMode === 'heatmap'

  // marker list memo — ไม่ผูกกับ hover/active state : hover ทีหนึ่งไม่ต้อง re-render 15k marker
  // (setState จาก useState มี identity คงที่ จึงใส่ใน closure ได้โดยไม่ต้องอยู่ใน deps)
  const markerRadius = zoom >= 15 ? 10 : zoom >= 13 ? 7 : 5
  const useCluster = showPoints && cluster
  const pointMarkers = useMemo(() => (showPoints && !cluster) ? points.map(p => (
    <CircleMarker
      key={p.id}
      center={[p.lat, p.lng]}
      pane="vector-pane"
      radius={markerRadius}
      pathOptions={{ fillColor: getColor(p), fillOpacity: 0.85, color: '#fff', weight: 2 }}
      eventHandlers={{
        add: (e) => { markerRefs.current.add(e.target); e.target.bringToFront() },
        remove: (e) => markerRefs.current.delete(e.target),
        click: () => setActivePoint(p), mouseover: () => setHoverPoint(p), mouseout: () => setHoverPoint(null),
      }}
    />
  )) : null, [showPoints, cluster, points, markerRadius, getColor])
  const heatRadius = zoom >= 16 ? 9 : 6
  const heatMarkers = useMemo(() => (showHeatmap && zoom >= 14) ? points.map(p => (
    <CircleMarker
      key={'hm-' + p.id}
      center={[p.lat, p.lng]}
      pane="vector-pane"
      radius={heatRadius}
      pathOptions={{ fillColor: '#fff', fillOpacity: 0.25, color: '#fff', weight: 1.5, opacity: 0.7 }}
      eventHandlers={{
        add: (e) => { markerRefs.current.add(e.target); e.target.bringToFront() },
        remove: (e) => markerRefs.current.delete(e.target),
        click: () => setActivePoint(p),
      }}
    />
  )) : null, [showHeatmap, zoom, points, heatRadius])
  // ชุดจุดเปลี่ยน (กรองใหม่) → แสดง popup เฉพาะเมื่อจุดนั้นยังอยู่ในชุดปัจจุบัน (ไม่ค้าง popup ของจุดที่ถูกกรองออก)
  const active = activePoint && points.includes(activePoint) ? activePoint : null
  const pointPopup = active && renderPopup && (
    <Popup position={[active.lat, active.lng]} eventHandlers={{ remove: () => setActivePoint(null) }}
      autoPanPaddingTopLeft={[20, 80]} autoPanPaddingBottomRight={[20, 60]}>
      {renderPopup(active)}<CoordRow lat={active.lat} lng={active.lng} />
    </Popup>
  )
  const clusterPopup = useCluster && activeCluster && renderClusterPopup && (
    <Popup position={[activeCluster.lat, activeCluster.lng]} eventHandlers={{ remove: () => setActiveCluster(null) }}
      autoPanPaddingTopLeft={[20, 80]} autoPanPaddingBottomRight={[20, 60]} maxWidth={320}>
      {renderClusterPopup(activeCluster)}
    </Popup>
  )

  return (
    <MapContainer
      center={[13.7563, 100.5018]}
      zoom={11}
      preferCanvas
      minZoom={10}
      maxZoom={18}
      maxBounds={[[13.49, 100.32], [13.96, 100.94]]}
      maxBoundsViscosity={1.0}
      scrollWheelZoom={mini ? false : scrollWheelZoom}
      dragging={!mini}
      zoomControl={!mini}
      doubleClickZoom={!mini}
      attributionControl={!mini}
      className={className}
    >
      {/* Esri World Light Gray — พื้นเทาอ่อนสะอาดแบบเดิม (แทน CARTO light_all ที่บังคับ API key แล้ว = ขึ้น "API KEY REQUIRED") ; base = พื้น, reference = ชื่อสถานที่ */}
      <TileLayer
        attribution='Tiles &copy; Esri'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        crossOrigin="anonymous"
      />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        crossOrigin="anonymous"
        pane="tilePane"
      />
      <ZoomTracker onZoom={handleZoom} />
      <FlyController target={flyTarget} />
      <DistrictFocus districts={districts} dnames={highlightList} />
      {/* vector ทั้งหมด (เขต/mask/จุด) อยู่ pane เดียว = canvas เดียว — ถ้าแยก pane จะได้ canvas ซ้อนกัน
          และ canvas บน (จุด) จะกิน click/hover ของเขตข้างล่างทั้งหมด (Leaflet hit-test ต่อ canvas) */}
      <Pane name="vector-pane" style={{ zIndex: 450 }} />

      {outerMask && (
        <GeoJSON key="outer-mask" data={outerMask} pane="vector-pane" eventHandlers={districtLayerEvents}
          style={{ fillColor: '#0f172a', fillOpacity: 0.65, weight: 0, interactive: false }} />
      )}

      {districts && (
        <GeoJSON key={`district-borders-${permanentDistrictLabels}`} data={districts} pane="vector-pane" eventHandlers={districtLayerEvents}
          style={{ color: '#1e3a8a', weight: 1.8, fillColor: '#3b82f6', fillOpacity: 0.05, opacity: 1 }}
          onEachFeature={(feature, layer) => {
            const name = feature.properties?.dname || 'เขต'
            if (permanentDistrictLabels) {
              layer.bindTooltip(escapeHtml(name), { permanent: true, direction: 'center', className: 'district-tooltip-permanent', interactive: false })
            } else {
              layer.bindTooltip(escapeHtml(name), { sticky: true, className: 'district-tooltip' })
            }
            layer.on({
              mouseover: e => e.target.setStyle({ fillOpacity: 0.20, weight: 3, color: '#1d4ed8' }),
              mouseout: e => e.target.setStyle({ fillOpacity: 0.05, weight: 1.8, color: '#1e3a8a' }),
              ...(onDistrictClick ? { click: () => onDistrictClick(name) } : {}),
            })
          }}
        />
      )}

      {districtLayerStyle && districts && (
        <GeoJSON
          key={districtLayerKey}
          data={districts}
          pane="vector-pane"
          eventHandlers={districtLayerEvents}
          style={districtLayerStyle}
          onEachFeature={districtLayerOnEachFeature || undefined}
        />
      )}

      {/* highlight เขตที่เลือก (rose) — เลือกได้หลายเขต */}
      {highlightList.length > 0 && districts && (() => {
        const names = new Set(highlightList)
        const feats = districts.features.filter(ft => names.has(ft.properties?.dname))
        return feats.length ? (
          <GeoJSON key={`hl-${highlightList.join('|')}`} data={{ type: 'FeatureCollection', features: feats }} pane="vector-pane" interactive={false} eventHandlers={districtLayerEvents}
            style={{ color: '#be123c', weight: 3, fillColor: '#fb7185', fillOpacity: 0.18, opacity: 1 }} />
        ) : null
      })()}

      {searchPopup && (
        <Marker position={[searchPopup.lat, searchPopup.lng]}
          eventHandlers={{ add: e => { searchMarkerRef.current = e.target; e.target.openPopup() }, remove: () => { searchMarkerRef.current = null } }}>
          {/* ปิดเมื่อผู้ใช้ปิด popup จริง — เช็คหลัง 1 tick เพราะ StrictMode (dev) unmount/mount ซ้ำ ทำให้ remove ยิงทั้งที่ popup กลับมาเปิดทันที */}
          <Popup eventHandlers={{ remove: () => setTimeout(() => { const m = searchMarkerRef.current; if (!m || !m._map || !m.isPopupOpen()) onSearchPopupClose() }, 0) }}
            autoPanPaddingTopLeft={[20, 110]} autoPanPaddingBottomRight={[searchPopup.padRight ?? 20, 60]}>
            {renderSearchPopup ? renderSearchPopup(searchPopup) : <DefaultSearchPopup popup={searchPopup} />}
          </Popup>
        </Marker>
      )}

      {pointMarkers}
      {useCluster && (
        <ClusterLayer points={points} zoom={zoom} getColor={getColor} markerRadius={markerRadius} markerRefs={markerRefs}
          onPointClick={setActivePoint} onPointHover={setHoverPoint} onClusterOpen={setActiveCluster} activeClusterId={activeCluster?.id} />
      )}

      {showHeatmap && <HeatmapLayer points={points} />}
      {heatMarkers}

      {(showPoints || (showHeatmap && zoom >= 14)) && pointPopup}
      {clusterPopup}
      {showPoints && tooltipText && hoverPoint && !active && (
        <MapTooltip position={[hoverPoint.lat, hoverPoint.lng]} offset={[0, -8]} direction="top">{tooltipText(hoverPoint)}</MapTooltip>
      )}
    </MapContainer>
  )
}
