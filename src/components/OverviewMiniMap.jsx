import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const BEHAVIOR_COLORS = { 'เสพ': '#3B82F6', 'ค้า': '#EF4444', 'เสพ/ค้า': '#F59E0B', 'ผลิต': '#8B5CF6' }

export default function OverviewMiniMap({ points }) {
  return (
    <MapContainer
      center={[13.75, 100.5]}
      zoom={10}
      style={{ height: 280, width: '100%', borderRadius: '0.75rem', zIndex: 0 }}
      scrollWheelZoom={false}
      zoomControl={false}
      dragging={false}
      doubleClickZoom={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" opacity={0.8} />
      {points.map((p, i) => {
        const behavior = String(p.behaviors || '').split(',')[0]?.trim()
        return (
          <CircleMarker
            key={i}
            center={[p.lat, p.lng]}
            radius={3}
            pathOptions={{ color: 'none', fillColor: BEHAVIOR_COLORS[behavior] || '#6366F1', fillOpacity: 0.75 }}
          />
        )
      })}
    </MapContainer>
  )
}
