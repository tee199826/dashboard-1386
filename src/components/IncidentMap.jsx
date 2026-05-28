import { useState, useEffect, useCallback } from 'react'
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
import { buildOuterMask } from '../utils/worldMask'

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
    if (target) map.flyTo([target.lat, target.lng], 16, { duration: 1.5 })
  }, [target, map])
  return null
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
  } catch {}
}

function DefaultSearchPopup({ popup }) {
  return (
    <div style={{ fontFamily: 'Sarabun, sans-serif', minWidth: 210 }}>
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
  onZoomChange = () => {},
  scrollWheelZoom = true,
  className = 'w-full h-full',
}) {
  const [districts, setDistricts] = useState(null)
  const [outerMask, setOuterMask] = useState(null)
  const [zoom, setZoom] = useState(11)

  useEffect(() => {
    fetch('/bangkok-districts.geojson')
      .then(r => r.json())
      .then(data => { setDistricts(data); setOuterMask(buildOuterMask(data)) })
      .catch(err => console.error('[IncidentMap] GeoJSON load failed:', err))
  }, [])

  const handleZoom = useCallback(z => { setZoom(z); onZoomChange(z) }, [onZoomChange])

  const showPoints = viewMode === 'point'
  const showHeatmap = viewMode === 'heatmap'

  return (
    <MapContainer
      center={[13.7563, 100.5018]}
      zoom={11}
      minZoom={10}
      maxZoom={18}
      maxBounds={[[13.49, 100.32], [13.96, 100.94]]}
      maxBoundsViscosity={1.0}
      scrollWheelZoom={scrollWheelZoom}
      className={className}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <ZoomTracker onZoom={handleZoom} />
      <FlyController target={flyTarget} />
      <Pane name="districts-pane" style={{ zIndex: 350 }} />
      <Pane name="markers-pane" style={{ zIndex: 600 }} />

      {outerMask && (
        <GeoJSON key="outer-mask" data={outerMask} pane="districts-pane"
          style={{ fillColor: '#0f172a', fillOpacity: 0.65, weight: 0, interactive: false }} />
      )}

      {districts && (
        <GeoJSON key="district-borders" data={districts} pane="districts-pane"
          style={{ color: '#1e3a8a', weight: 1.8, fillColor: '#3b82f6', fillOpacity: 0.05, opacity: 1 }}
          onEachFeature={(feature, layer) => {
            const name = feature.properties?.dname || 'เขต'
            layer.bindTooltip(name, { sticky: true, className: 'district-tooltip' })
            layer.on({
              mouseover: e => e.target.setStyle({ fillOpacity: 0.20, weight: 3, color: '#1d4ed8' }),
              mouseout: e => e.target.setStyle({ fillOpacity: 0.05, weight: 1.8, color: '#1e3a8a' }),
            })
          }}
        />
      )}

      {districtLayerStyle && districts && (
        <GeoJSON
          key={districtLayerKey}
          data={districts}
          pane="districts-pane"
          style={districtLayerStyle}
          onEachFeature={districtLayerOnEachFeature || undefined}
        />
      )}

      {searchPopup && (
        <Marker position={[searchPopup.lat, searchPopup.lng]} eventHandlers={{ add: e => e.target.openPopup() }}>
          <Popup eventHandlers={{ remove: onSearchPopupClose }}>
            {renderSearchPopup ? renderSearchPopup(searchPopup) : <DefaultSearchPopup popup={searchPopup} />}
          </Popup>
        </Marker>
      )}

      {showPoints && points.map(p => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          pane="markers-pane"
          radius={zoom >= 15 ? 10 : zoom >= 13 ? 7 : 5}
          pathOptions={{ fillColor: getColor(p), fillOpacity: 0.85, color: '#fff', weight: 2 }}
        >
          {renderPopup && <Popup>{renderPopup(p)}<CoordRow lat={p.lat} lng={p.lng} /></Popup>}
          {tooltipText && <MapTooltip>{tooltipText(p)}</MapTooltip>}
        </CircleMarker>
      ))}

      {showHeatmap && <HeatmapLayer points={points} />}
      {showHeatmap && zoom >= 14 && points.map(p => (
        <CircleMarker
          key={'hm-' + p.id}
          center={[p.lat, p.lng]}
          pane="markers-pane"
          radius={zoom >= 16 ? 9 : 6}
          pathOptions={{ fillColor: '#fff', fillOpacity: 0.25, color: '#fff', weight: 1.5, opacity: 0.7 }}
        >
          {renderPopup && <Popup>{renderPopup(p)}<CoordRow lat={p.lat} lng={p.lng} /></Popup>}
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
